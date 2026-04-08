// HTTP handlers for the console backend API.
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/samyn92/agentops-console/internal/k8s"
	"github.com/samyn92/agentops-console/internal/multiplexer"
)

// Handlers holds all HTTP handler methods.
type Handlers struct {
	k8s *k8s.Client
	mux *multiplexer.Multiplexer
}

// New creates a new Handlers instance.
func New(k8sClient *k8s.Client, mux *multiplexer.Multiplexer) *Handlers {
	return &Handlers{
		k8s: k8sClient,
		mux: mux,
	}
}

// ── Agent endpoints ──

func (h *Handlers) ListAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := h.k8s.ListAgents(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agents: %s", err)
		return
	}

	type agentResponse struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Mode      string `json:"mode"`
		Model     string `json:"model"`
		Image     string `json:"image"`
		Phase     string `json:"phase"`
		Ready     int32  `json:"readyReplicas"`
	}

	resp := make([]agentResponse, 0, len(agents.Items))
	for _, a := range agents.Items {
		resp = append(resp, agentResponse{
			Name:      a.Name,
			Namespace: a.Namespace,
			Mode:      string(a.Spec.Mode),
			Model:     a.Spec.Model,
			Image:     a.Spec.Image,
			Phase:     string(a.Status.Phase),
			Ready:     a.Status.ReadyReplicas,
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) GetAgent(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	writeJSON(w, http.StatusOK, agent)
}

func (h *Handlers) GetAgentStatus(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	// Proxy to agent runtime /status
	url := h.k8s.GetAgentServiceURL(agent)
	resp, err := proxyGET(r.Context(), url+"/status")
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// ── Agent conversation endpoints (proxied to runtime) ──

func (h *Handlers) AgentPrompt(w http.ResponseWriter, r *http.Request) {
	h.proxyToAgent(w, r, "POST", "/prompt", r.Body)
}

func (h *Handlers) AgentSteer(w http.ResponseWriter, r *http.Request) {
	h.proxyToAgent(w, r, "POST", "/steer", r.Body)
}

func (h *Handlers) AgentAbort(w http.ResponseWriter, r *http.Request) {
	h.proxyToAgent(w, r, "DELETE", "/abort", nil)
}

// AgentSetWindowSize proxies a window size change to the agent runtime.
func (h *Handlers) AgentSetWindowSize(w http.ResponseWriter, r *http.Request) {
	h.proxyToAgent(w, r, "PATCH", "/config/window-size", r.Body)
}

// AgentPromptStream proxies a streaming prompt and relays FEP events to the multiplexer.
func (h *Handlers) AgentPromptStream(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	baseURL := h.k8s.GetAgentServiceURL(agent)
	url := fmt.Sprintf("%s/prompt/stream", baseURL)

	// Read the request body so we can forward it
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body: %s", err)
		return
	}

	// Create proxy request
	proxyReq, err := http.NewRequestWithContext(r.Context(), "POST", url, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 0} // no timeout for SSE
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unreachable: %s", err)
		return
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		proxyResponse(w, resp)
		return
	}

	// Set SSE headers on our response
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	// Relay SSE events: write to client AND fan out to multiplexer
	agentKey := multiplexer.AgentKey{Namespace: ns, Name: name}
	eventC := h.mux.GetEventChannel()

	scanner := newSSEScanner(resp.Body)
	for scanner.Scan() {
		data := scanner.Data()
		if data == "" {
			continue
		}

		// Write to the direct client
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()

		// Also relay to multiplexer for other global SSE clients
		var evt struct {
			Type string `json:"type"`
		}
		if json.Unmarshal([]byte(data), &evt) == nil {
			var fepEvt map[string]any
			json.Unmarshal([]byte(data), &fepEvt)

			select {
			case eventC <- multiplexer.EnvelopedEvent{
				Agent:     agentKey,
				EventType: "agent.event",
			}:
			default:
			}
		}
	}

	resp.Body.Close()
}

// ── Interactive control ──

func (h *Handlers) ReplyToPermission(w http.ResponseWriter, r *http.Request) {
	pid := chi.URLParam(r, "pid")
	h.proxyToAgent(w, r, "POST", fmt.Sprintf("/permission/%s/reply", pid), r.Body)
}

func (h *Handlers) ReplyToQuestion(w http.ResponseWriter, r *http.Request) {
	qid := chi.URLParam(r, "qid")
	h.proxyToAgent(w, r, "POST", fmt.Sprintf("/question/%s/reply", qid), r.Body)
}

// ── AgentRun endpoints ──

func (h *Handlers) ListAgentRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.k8s.ListAgentRuns(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent runs: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, runs.Items)
}

func (h *Handlers) GetAgentRun(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	run, err := h.k8s.GetAgentRun(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent run not found: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h *Handlers) CreateAgentRun(w http.ResponseWriter, r *http.Request) {
	// Handled by creating an AgentRun CR
	writeError(w, http.StatusNotImplemented, "not yet implemented")
}

// ── Channel endpoints ──

func (h *Handlers) ListChannels(w http.ResponseWriter, r *http.Request) {
	channels, err := h.k8s.ListChannels(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list channels: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, channels.Items)
}

func (h *Handlers) GetChannel(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	ch, err := h.k8s.GetChannel(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, ch)
}

// ── MCP Server endpoints ──

func (h *Handlers) ListMCPServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.k8s.ListMCPServers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list MCP servers: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, servers.Items)
}

func (h *Handlers) GetMCPServer(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	mcp, err := h.k8s.GetMCPServer(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "MCP server not found: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, mcp)
}

// ── Kubernetes resource endpoints ──

func (h *Handlers) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	nsList, err := h.k8s.ListNamespaces(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list namespaces: %s", err)
		return
	}

	type nsInfo struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	}

	resp := make([]nsInfo, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		resp = append(resp, nsInfo{
			Name:   ns.Name,
			Status: string(ns.Status.Phase),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handlers) ListPods(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")

	pods, err := h.k8s.ListPods(r.Context(), ns)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list pods: %s", err)
		return
	}

	type podInfo struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Phase     string `json:"phase"`
		Ready     string `json:"ready"`
		Node      string `json:"node"`
	}

	resp := make([]podInfo, 0, len(pods.Items))
	for _, p := range pods.Items {
		readyCount := 0
		for _, cs := range p.Status.ContainerStatuses {
			if cs.Ready {
				readyCount++
			}
		}
		resp = append(resp, podInfo{
			Name:      p.Name,
			Namespace: p.Namespace,
			Phase:     string(p.Status.Phase),
			Ready:     fmt.Sprintf("%d/%d", readyCount, len(p.Spec.Containers)),
			Node:      p.Spec.NodeName,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// ── K8s resource watch (SSE) ──

func (h *Handlers) WatchResources(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	unsubscribe := h.k8s.Watcher().Subscribe(func(event k8s.ResourceEvent) {
		data, err := json.Marshal(map[string]string{
			"type":         string(event.Type),
			"resourceKind": event.ResourceKind,
			"namespace":    event.Namespace,
			"name":         event.Name,
		})
		if err != nil {
			return
		}
		fmt.Fprintf(w, "event: resource.changed\ndata: %s\n\n", data)
		flusher.Flush()
	})
	defer unsubscribe()

	// Send connected event
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	// Block until client disconnects
	<-r.Context().Done()
}

// ── Memory (Engram) endpoints ──

// MemoryEnabled checks if an agent has memory configured.
func (h *Handlers) MemoryEnabled(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	enabled := agent.Spec.Memory != nil && agent.Spec.Memory.ServerRef != ""
	project := name
	if agent.Spec.Memory != nil && agent.Spec.Memory.Project != "" {
		project = agent.Spec.Memory.Project
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"enabled": enabled,
		"project": project,
	})
}

// ListMemoryObservations returns recent observations for an agent from Engram.
func (h *Handlers) ListMemoryObservations(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		extra["limit"] = limit
	}
	if obsType := r.URL.Query().Get("type"); obsType != "" {
		extra["type"] = obsType
	}
	if scope := r.URL.Query().Get("scope"); scope != "" {
		extra["scope"] = scope
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/observations/recent", nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// GetMemoryObservation returns a single observation by ID from Engram.
func (h *Handlers) GetMemoryObservation(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")
	obsID := chi.URLParam(r, "obsId")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", fmt.Sprintf("/observations/%s", obsID), nil, nil)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// CreateMemoryObservation creates a new observation in Engram for an agent.
// The request body should contain: { type, title, content, tags?, scope?, topic_key? }
// session_id and project are injected automatically.
func (h *Handlers) CreateMemoryObservation(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	// Read body, decode, inject project, re-encode
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read body: %s", err)
		return
	}

	var obs map[string]any
	if err := json.Unmarshal(body, &obs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: %s", err)
		return
	}

	// Inject project (scoped to agent name)
	project := name
	if agent.Spec.Memory != nil && agent.Spec.Memory.Project != "" {
		project = agent.Spec.Memory.Project
	}
	obs["project"] = project

	// session_id is optional — Engram needs it for observations, but the agent runtime
	// manages sessions. For user-created observations ("Remember this"), we can use
	// a synthetic session ID or let Engram handle it.
	if _, ok := obs["session_id"]; !ok {
		obs["session_id"] = fmt.Sprintf("console-%s-%s", ns, name)
	}

	encoded, _ := json.Marshal(obs)

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "POST", "/observations", strings.NewReader(string(encoded)), nil)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// UpdateMemoryObservation updates an observation by ID in Engram.
func (h *Handlers) UpdateMemoryObservation(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")
	obsID := chi.URLParam(r, "obsId")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "PATCH", fmt.Sprintf("/observations/%s", obsID), r.Body, nil)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// DeleteMemoryObservation deletes an observation by ID from Engram.
func (h *Handlers) DeleteMemoryObservation(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")
	obsID := chi.URLParam(r, "obsId")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if hard := r.URL.Query().Get("hard"); hard == "true" {
		extra["hard"] = "true"
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "DELETE", fmt.Sprintf("/observations/%s", obsID), nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// SearchMemory searches observations in Engram for an agent.
func (h *Handlers) SearchMemory(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if q := r.URL.Query().Get("q"); q != "" {
		extra["q"] = q
	}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		extra["limit"] = limit
	}
	if obsType := r.URL.Query().Get("type"); obsType != "" {
		extra["type"] = obsType
	}
	if scope := r.URL.Query().Get("scope"); scope != "" {
		extra["scope"] = scope
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/search", nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// GetMemoryContext returns the recent memory context for an agent from Engram.
func (h *Handlers) GetMemoryContext(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if scope := r.URL.Query().Get("scope"); scope != "" {
		extra["scope"] = scope
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/context", nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// GetMemoryStats returns memory statistics from Engram.
func (h *Handlers) GetMemoryStats(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/stats", nil, nil)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// ListMemorySessions returns recent Engram sessions (work periods) for an agent.
func (h *Handlers) ListMemorySessions(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		extra["limit"] = limit
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/sessions/recent", nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// GetMemoryTimeline returns chronological context around an observation.
func (h *Handlers) GetMemoryTimeline(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	extra := map[string]string{}
	if obsID := r.URL.Query().Get("observation_id"); obsID != "" {
		extra["observation_id"] = obsID
	}
	if before := r.URL.Query().Get("before"); before != "" {
		extra["before"] = before
	}
	if after := r.URL.Query().Get("after"); after != "" {
		extra["after"] = after
	}

	resp, err := proxyToEngram(r.Context(), h.k8s, agent, "GET", "/timeline", nil, extra)
	if err != nil {
		writeError(w, http.StatusBadGateway, "engram unreachable: %s", err)
		return
	}
	defer resp.Body.Close()
	proxyResponse(w, resp)
}

// ── Agent proxy helper ──

func (h *Handlers) proxyToAgent(w http.ResponseWriter, r *http.Request, method, path string, body io.Reader) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	baseURL := h.k8s.GetAgentServiceURL(agent)
	url := baseURL + path

	proxyReq, err := http.NewRequestWithContext(r.Context(), method, url, body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}
	if body != nil {
		proxyReq.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "agent unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	proxyResponse(w, resp)
}

// ── SSE scanner ──

type sseScanner struct {
	body io.ReadCloser
	buf  []byte
	data string
}

func newSSEScanner(body io.ReadCloser) *sseScanner {
	return &sseScanner{body: body}
}

func (s *sseScanner) Scan() bool {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.body.Read(buf)
		if n > 0 {
			s.buf = append(s.buf, buf[:n]...)
			// Look for complete SSE frames
			for {
				idx := bytes.Index(s.buf, []byte("\n\n"))
				if idx < 0 {
					break
				}
				frame := string(s.buf[:idx])
				s.buf = s.buf[idx+2:]

				// Extract data line
				for _, line := range strings.Split(frame, "\n") {
					if len(line) > 6 && line[:6] == "data: " {
						s.data = line[6:]
						return true
					}
				}
			}
		}
		if err != nil {
			return false
		}
	}
}

func (s *sseScanner) Data() string {
	return s.data
}

// ── Response helpers ──

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func proxyGET(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	return http.DefaultClient.Do(req)
}

func proxyResponse(w http.ResponseWriter, resp *http.Response) {
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
