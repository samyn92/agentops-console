// SSE multiplexer: fans FEP events from all agent connections into browser clients.
package multiplexer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/samyn92/agentops-console/internal/fep"
	"github.com/samyn92/agentops-console/internal/k8s"
	agentsv1alpha1 "github.com/samyn92/agentops-core/api/v1alpha1"
)

// Multiplexer manages agent SSE connections and fans out events to browser clients.
type Multiplexer struct {
	k8sClient *k8s.Client
	eventC    chan EnvelopedEvent

	mu      sync.RWMutex
	agents  map[AgentKey]*AgentConn
	clients map[string]chan EnvelopedEvent // clientId -> channel
	nextID  int
}

// New creates a new SSE multiplexer.
func New(k8sClient *k8s.Client) *Multiplexer {
	return &Multiplexer{
		k8sClient: k8sClient,
		eventC:    make(chan EnvelopedEvent, 512),
		agents:    make(map[AgentKey]*AgentConn),
		clients:   make(map[string]chan EnvelopedEvent),
	}
}

// Start begins watching for agent CRD changes and distributing events.
func (m *Multiplexer) Start(ctx context.Context) {
	// Subscribe to K8s watcher for agent CRD changes
	unsubscribe := m.k8sClient.Watcher().Subscribe(func(event k8s.ResourceEvent) {
		switch event.ResourceKind {
		case "Agent":
			switch event.Type {
			case k8s.EventAdded, k8s.EventModified:
				m.ensureAgentConn(ctx, event.Namespace, event.Name)
			case k8s.EventDeleted:
				m.removeAgentConn(event.Namespace, event.Name)
			}
		case "AgentRun":
			// Synthesize delegation events from AgentRun phase transitions.
			// This ensures delegation progress reaches the browser even when
			// the parent agent's per-prompt SSE stream has already closed.
			if event.Type == k8s.EventModified {
				m.handleAgentRunUpdate(event)
			}
		default:
			// Forward other resource events to clients as resource.changed
			m.broadcastResourceEvent(event)
			return
		}
		// Also broadcast as resource.changed so UI can refresh lists
		m.broadcastResourceEvent(event)
	})

	// Fan-out loop: read from central event channel, write to all clients
	go func() {
		defer unsubscribe()
		for {
			select {
			case <-ctx.Done():
				return
			case evt := <-m.eventC:
				m.broadcast(evt)
			}
		}
	}()

	// Heartbeat loop
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.broadcast(EnvelopedEvent{
					EventType: "heartbeat",
					Event:     fep.Event{Type: "heartbeat"},
				})
			}
		}
	}()

	slog.Info("multiplexer started")
}

// Subscribe adds a browser client and returns a channel + unsubscribe func.
func (m *Multiplexer) Subscribe() (string, <-chan EnvelopedEvent, func()) {
	m.mu.Lock()
	m.nextID++
	id := fmt.Sprintf("client-%d", m.nextID)
	ch := make(chan EnvelopedEvent, 256)
	m.clients[id] = ch
	m.mu.Unlock()

	slog.Info("SSE client connected", "id", id)

	return id, ch, func() {
		m.mu.Lock()
		delete(m.clients, id)
		close(ch)
		m.mu.Unlock()
		slog.Info("SSE client disconnected", "id", id)
	}
}

// GetEventChannel returns the central event channel for external producers (e.g., stream proxy).
func (m *Multiplexer) GetEventChannel() chan<- EnvelopedEvent {
	return m.eventC
}

func (m *Multiplexer) broadcast(evt EnvelopedEvent) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for id, ch := range m.clients {
		select {
		case ch <- evt:
		default:
			slog.Warn("client channel full, dropping event", "client", id, "type", evt.EventType)
		}
	}
}

func (m *Multiplexer) broadcastResourceEvent(event k8s.ResourceEvent) {
	evt := EnvelopedEvent{
		EventType: "resource.changed",
		Event: fep.Event{
			Type:      "resource.changed",
			SessionID: string(event.Type), // reuse SessionID field for the K8s event type (ADDED/MODIFIED/DELETED)
			ToolName:  event.ResourceKind, // reuse ToolName field for the resource kind
			ID:        event.Namespace + "/" + event.Name,
		},
	}
	m.broadcast(evt)
}

// handleAgentRunUpdate synthesizes delegation.run_completed FEP events when
// an AgentRun transitions to a terminal phase (Succeeded/Failed). This ensures
// delegation progress reaches the browser via the global SSE multiplexer even
// when the parent agent's per-prompt stream has already closed and the runtime's
// DelegationWatcher.emitFEP silently drops events (emitter is nil).
func (m *Multiplexer) handleAgentRunUpdate(event k8s.ResourceEvent) {
	run, ok := event.Resource.(*agentsv1alpha1.AgentRun)
	if !ok || run == nil {
		return
	}

	// Only care about agent-sourced runs (delegations) in terminal phases
	if run.Spec.Source != agentsv1alpha1.AgentRunSourceAgent {
		return
	}
	phase := run.Status.Phase
	if phase != agentsv1alpha1.AgentRunPhaseSucceeded && phase != agentsv1alpha1.AgentRunPhaseFailed {
		return
	}

	// Calculate duration from start to completion
	duration := ""
	if run.Status.StartTime != nil && run.Status.CompletionTime != nil {
		duration = run.Status.CompletionTime.Time.Sub(run.Status.StartTime.Time).String()
	}

	// Build a delegation.run_completed event as raw JSON so all fields survive
	delegationEvt := map[string]any{
		"type":       fep.EventDelegationRunCompleted,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"runName":    run.Name,
		"childAgent": run.Spec.AgentRef,
		"phase":      string(phase),
		"duration":   duration,
		// groupId is not available from K8s — the frontend matches by runName too
		"groupId": "",
	}
	raw, err := json.Marshal(delegationEvt)
	if err != nil {
		slog.Error("failed to marshal delegation event", "error", err)
		return
	}

	// Emit to the parent agent's SSE clients
	parentAgent := run.Spec.SourceRef
	if parentAgent == "" {
		return
	}
	agentKey := AgentKey{Namespace: event.Namespace, Name: parentAgent}

	slog.Info("synthesizing delegation.run_completed from AgentRun status",
		"run", run.Name,
		"childAgent", run.Spec.AgentRef,
		"parentAgent", parentAgent,
		"phase", string(phase),
	)

	select {
	case m.eventC <- EnvelopedEvent{
		Agent:     agentKey,
		EventType: "agent.event",
		Event:     fep.Event{Type: fep.EventDelegationRunCompleted},
		RawEvent:  json.RawMessage(raw),
	}:
	default:
		slog.Warn("event channel full, dropping synthesized delegation event",
			"run", run.Name)
	}
}

func (m *Multiplexer) ensureAgentConn(ctx context.Context, namespace, name string) {
	key := AgentKey{Namespace: namespace, Name: name}

	m.mu.Lock()
	if _, ok := m.agents[key]; ok {
		m.mu.Unlock()
		return // already connected
	}

	// Look up agent to get service URL
	agent, err := m.k8sClient.GetAgent(ctx, namespace, name)
	if err != nil {
		m.mu.Unlock()
		slog.Warn("failed to get agent for connection", "agent", key, "error", err)
		return
	}

	// Only connect to daemon agents that are Running
	if agent.Spec.Mode != "daemon" || string(agent.Status.Phase) != "Running" {
		m.mu.Unlock()
		return
	}

	url := m.k8sClient.GetAgentServiceURL(agent)
	conn := NewAgentConn(key, url, m.eventC)
	m.agents[key] = conn
	m.mu.Unlock()

	conn.Start(ctx)
	slog.Info("agent connection started", "agent", key, "url", url)
}

func (m *Multiplexer) removeAgentConn(namespace, name string) {
	key := AgentKey{Namespace: namespace, Name: name}

	m.mu.Lock()
	conn, ok := m.agents[key]
	if ok {
		delete(m.agents, key)
	}
	m.mu.Unlock()

	if ok {
		conn.Stop()
		slog.Info("agent connection removed", "agent", key)
	}
}

// ServeGlobalSSE handles the global SSE endpoint for browser clients.
func (m *Multiplexer) ServeGlobalSSE(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	clientID, ch, unsub := m.Subscribe()
	defer unsub()

	// Send connected event
	writeSSE(w, flusher, "connected", map[string]string{"clientId": clientID})

	// Send current agent status
	m.mu.RLock()
	for key, conn := range m.agents {
		status := "offline"
		if conn.IsOnline() {
			status = "online"
		}
		writeSSE(w, flusher, "agent.status", map[string]any{
			"namespace": key.Namespace,
			"name":      key.Name,
			"status":    status,
		})
	}
	m.mu.RUnlock()

	// Stream events
	for {
		select {
		case <-r.Context().Done():
			return
		case evt, ok := <-ch:
			if !ok {
				return
			}
			// Wrap in envelope format.
			// Use RawEvent (original JSON) when available to preserve
			// delegation-specific fields that fep.Event doesn't model.
			var eventPayload any
			if len(evt.RawEvent) > 0 {
				eventPayload = evt.RawEvent
			} else {
				eventPayload = evt.Event
			}
			envelope := map[string]any{
				"agent": map[string]string{
					"namespace": evt.Agent.Namespace,
					"name":      evt.Agent.Name,
				},
				"event": eventPayload,
			}
			writeSSE(w, flusher, evt.EventType, envelope)
		}
	}
}

func writeSSE(w http.ResponseWriter, f http.Flusher, event string, data any) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
	f.Flush()
}
