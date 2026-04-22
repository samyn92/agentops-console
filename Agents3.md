# Agents in the AgentOps Console

This document provides developer-facing documentation for agent-related functionality in the AgentOps Console. The console is a Go Backend-for-Frontend (BFF) + SolidJS Progressive Web App that provides a unified interface for managing, monitoring, and interacting with agents in the AgentOps platform.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Console-Agent Interaction](#console-agent-interaction)
4. [Agent Management UI](#agent-management-ui)
5. [FEP/SSE Streaming](#fepsse-streaming)
6. [Key API Endpoints](#key-api-endpoints)
7. [Advanced Features](#advanced-features)
8. [Development](#development)

---

## Overview

The AgentOps Console provides a centralized web interface for managing agents deployed in a Kubernetes cluster. Agents are defined as custom resources (`Agent` CRDs) and can operate in two modes:

- **Daemon Mode**: Long-running agents that maintain persistent connections, handle streaming conversations, and can delegate tasks to other agents.
- **Task Mode**: Ephemeral agents that execute single prompts and complete, typically used for delegated subtasks.

The console enables users to:
- Browse and select agents across namespaces
- Engage in real-time streaming conversations
- Monitor agent health and runtime status
- Manage agent memory (observations, search, context)
- View delegation flows and task distribution
- Inspect traces and debugging information

---

## Architecture

```
┌─────────────────┐      HTTP/WebSocket      ┌──────────────────┐
│   Browser (PWA) │◄────────────────────────►│  Go BFF (chi)    │
│   SolidJS 1.9   │      SSE /events         │   :8080          │
└─────────────────┘                          └────────┬─────────┘
                                                      │
          ┌──────────────────────────────────────────┼──────────┐
          │                                          │          │
          ▼                                          ▼          ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐
│  Agent Runtimes  │  │ agentops-memory  │  │   Tempo      │  │  Kubernetes │
│   (port 4096)    │  │   (port 7437)    │  │  (port 3200) │  │     API     │
└──────────────────┘  └──────────────────┘  └──────────────┘  └─────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **BFF** | Go 1.23 + chi router | API gateway, request proxying, SSE multiplexer |
| **Frontend** | SolidJS 1.9 + Vite 7 | Reactive UI with fine-grained reactivity |
| **Multiplexer** | Go channels | Fans out agent events to all connected browsers |
| **K8s Client** | controller-runtime | CRD watching, resource management |

---

## Console-Agent Interaction

The console interacts with agents through the Go BFF, which acts as a unified API gateway. The BFF proxies requests to various backend services while providing a consistent REST API to the frontend.

### Service Proxy Architecture

```
Console BFF
    │
    ├──► Agent Runtimes (prompt, stream, steer, abort, working memory)
    │    Route: /api/v1/agents/{ns}/{name}/...
    │
    ├──► agentops-memory (observations, search, context, timeline)
    │    Route: /api/v1/agents/{ns}/{name}/memory/...
    │
    ├──► Tempo (distributed traces)
    │    Route: /api/v1/traces/...
    │
    └──► Kubernetes API (CRDs, pods, deployments, events)
         Route: /api/v1/kubernetes/...
```

### Agent Service URL Resolution

Agent runtimes are discovered via Kubernetes DNS:

```
{name}.{namespace}.svc:4096
```

For development, the `AGENT_URL_OVERRIDE` environment variable can bypass cluster DNS.

### Health Polling

The console polls daemon agents every 5 seconds via the `/status` endpoint to determine reachability:

```typescript
// web/src/stores/agents.ts
const HEALTH_POLL_INTERVAL = 5000;

async function pollAgentHealth(agent: AgentResponse): Promise<AgentHealth> {
  try {
    const status = await agentsAPI.status(agent.namespace, agent.name);
    return { reachable: true, status };
  } catch {
    return { reachable: false, status: null };
  }
}
```

Task agents have no long-running pod and return a synthetic status:

```go
// internal/handlers/handlers.go
if agent.Spec.Mode == "task" {
    writeJSON(w, http.StatusOK, map[string]any{
        "mode":   "task",
        "status": "ready",
    })
    return
}
```

---

## Agent Management UI

### Agent Selection & Persistence

The console maintains agent selection state with localStorage persistence:

```typescript
// web/src/stores/agents.ts
const STORAGE_KEY = 'agentops:selectedAgent';

// Persist selection across page reloads
createEffect(() => {
  const agent = selectedAgent();
  if (agent) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agent));
  }
});
```

### UI Components

| Component | Path | Purpose |
|-----------|------|---------|
| `AgentPanel.tsx` | `web/src/components/agents/` | Main agent detail view for daemon agents |
| `AgentDetail.tsx` | `web/src/components/agents/` | Legacy agent detail wrapper |
| `AgentInspector.tsx` | `web/src/components/agents/` | Deep inspection of agent state |
| `OpsPanel.tsx` | `web/src/components/agents/` | Operations view for orchestrators with delegation |
| `TaskAgentView.tsx` | `web/src/components/agents/` | Specialized view for task agents |
| `OrchestratorDetailView.tsx` | `web/src/components/agents/` | Orchestrator-specific details |

### Agent Panel Sections

The `AgentPanel` provides a unified view for daemon agents:

1. **Hero Header** - Live runtime stats, model info, context budget
2. **System Prompt** - Collapsible markdown display
3. **Resource Bindings** - Bound resources with badges
4. **Tools** - Built-in and OCI tools
5. **Memory Section** - Recent observations, search, stats

### Delegation Targets

Orchestrator agents can delegate to a configured team. The console filters valid delegation targets:

```typescript
// web/src/stores/agents.ts
export function getDelegationTargetsFor(callerName: string, callerNs: string): AgentResponse[] {
  const caller = agents.find((a) => a.name === callerName && a.namespace === callerNs);
  const team = caller?.delegation?.team ?? [];
  const teamSet = new Set(team);

  return agents.filter((a) => {
    if (a.namespace !== callerNs) return false;
    return teamSet.has(a.name);
  });
}
```

---

## FEP/SSE Streaming

The console uses Server-Sent Events (SSE) for real-time agent communication via the **Fantasy Event Protocol (FEP)**.

### FEP Event Types

```go
// internal/fep/types.go
const (
    // Agent lifecycle
    EventAgentStart  = "agent_start"
    EventAgentFinish = "agent_finish"
    EventAgentError  = "agent_error"

    // Step lifecycle
    EventStepStart  = "step_start"
    EventStepFinish = "step_finish"

    // Text streaming
    EventTextStart = "text_start"
    EventTextDelta = "text_delta"
    EventTextEnd   = "text_end"

    // Reasoning streaming
    EventReasoningStart = "reasoning_start"
    EventReasoningDelta = "reasoning_delta"
    EventReasoningEnd   = "reasoning_end"

    // Tool execution
    EventToolCall   = "tool_call"
    EventToolResult = "tool_result"

    // Delegation
    EventDelegationFanOut       = "delegation.fan_out"
    EventDelegationRunCompleted = "delegation.run_completed"
    EventDelegationAllCompleted = "delegation.all_completed"

    // Bidirectional control
    EventPermissionAsked = "permission_asked"
    EventQuestionAsked   = "question_asked"
)
```

### SSE Multiplexer

The multiplexer manages agent connections and fans out events to browser clients:

```go
// internal/multiplexer/multiplexer.go
type Multiplexer struct {
    k8sClient *k8s.Client
    eventC    chan EnvelopedEvent
    agents    map[AgentKey]*AgentConn
    clients   map[string]chan EnvelopedEvent
}
```

### Global SSE Endpoint

All browser clients connect to `/api/v1/events` for real-time updates:

```typescript
// web/src/lib/api.ts
export function connectGlobalSSE(
  onEvent: (eventType: string, data: unknown) => void,
  onError?: (error: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE}/events`);
  
  for (const type of ['connected', 'agent.event', 'resource.changed', 'heartbeat']) {
    es.addEventListener(type, (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      onEvent(type, data);
    });
  }
  
  return es;
}
```

### Streaming Prompt Flow

```
User Input
    │
    ▼
POST /api/v1/agents/{ns}/{name}/stream
    │
    ├──► BFF receives request
    │
    ├──► BFF proxies to agent runtime /prompt/stream
    │
    ├──► Agent runtime streams FEP events via SSE
    │
    ├──► BFF relays to direct client + multiplexer
    │
    └──► Multiplexer fans out to all connected browsers
```

### Chat Store State Machine

The chat store uses SolidJS `createStore` with `produce` for granular reactivity:

```typescript
// web/src/stores/chat.ts
interface AgentChatState {
  msgStore: ReturnType<typeof createStore<MessageStore>>;
  streaming: ReturnType<typeof createSignal<boolean>>;
  currentStep: ReturnType<typeof createSignal<number>>;
  totalUsage: ReturnType<typeof createSignal<Usage | null>>;
  pendingPermission: ReturnType<typeof createSignal<PendingPermissionState | null>>;
  pendingQuestion: ReturnType<typeof createSignal<PendingQuestionState | null>>;
  // ... more state
}
```

---

## Key API Endpoints

### Agent Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | List all agents |
| GET | `/api/v1/agents/{ns}/{name}` | Get agent CRD |
| GET | `/api/v1/agents/{ns}/{name}/config` | Get runtime config from ConfigMap |
| GET | `/api/v1/agents/{ns}/{name}/status` | Get agent health/status |

### Conversation (Sessionless)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/{ns}/{name}/prompt` | Non-streaming prompt |
| POST | `/api/v1/agents/{ns}/{name}/stream` | Streaming prompt (SSE) |
| POST | `/api/v1/agents/{ns}/{name}/steer` | Mid-execution steering |
| DELETE | `/api/v1/agents/{ns}/{name}/abort` | Abort generation |
| GET | `/api/v1/agents/{ns}/{name}/working-memory` | Get working memory |

### Interactive Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/{ns}/{name}/permission/{pid}/reply` | Reply to permission request |
| POST | `/api/v1/agents/{ns}/{name}/question/{qid}/reply` | Reply to question |

### Memory (agentops-memory proxy)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/{ns}/{name}/memory/enabled` | Check memory configuration |
| GET | `/api/v1/agents/{ns}/{name}/memory/observations` | List recent observations |
| POST | `/api/v1/agents/{ns}/{name}/memory/observations` | Create observation |
| GET | `/api/v1/agents/{ns}/{name}/memory/search?q={query}` | Full-text search |
| GET | `/api/v1/agents/{ns}/{name}/memory/context` | Get recent context |
| GET | `/api/v1/agents/{ns}/{name}/memory/stats` | Memory statistics |
| GET | `/api/v1/agents/{ns}/{name}/memory/timeline` | Timeline around observation |
| POST | `/api/v1/agents/{ns}/{name}/memory/extract` | AI-assisted memory extraction |

### CRD Browsing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agentruns` | List AgentRun CRs |
| GET | `/api/v1/channels` | List Channel CRs |
| GET | `/api/v1/agenttools` | List AgentTool CRs |
| GET | `/api/v1/agentresources` | List AgentResource CRs |

### Resource Browsing (Git repositories)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/files` | Browse files |
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/files/content` | Get file content |
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/commits` | Browse commits |
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/branches` | List branches |
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/mergerequests` | List MRs/PRs |
| GET | `/api/v1/agents/{ns}/{name}/resources/{res}/issues` | List issues |

### Streaming

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/events` | Global SSE stream (multiplexer) |
| GET | `/api/v1/watch` | K8s resource change events |

---

## Advanced Features

### Memory Management

The console integrates with `agentops-memory` for agent memory:

- **Observations**: Structured facts, decisions, discoveries stored by agents
- **Search**: Full-text BM25 search across all agent memories
- **Context Injection**: Relevant memories automatically injected into prompts
- **Timeline**: Chronological view around specific observations
- **AI Extraction**: Use the agent's model to extract structured observations from conversation

```typescript
// Create observation from console
await memory.createObservation(ns, name, {
  type: 'discovery',
  title: 'API Pattern Found',
  content: 'The service uses optimistic concurrency...',
  tags: ['api', 'pattern'],
});
```

### Delegation & Fan-Out

Orchestrator agents can delegate tasks to team members:

```go
// FEP delegation events
EventDelegationFanOut       = "delegation.fan_out"       // Parent delegates to children
EventDelegationRunCompleted = "delegation.run_completed" // Child run finished
EventDelegationAllCompleted = "delegation.all_completed" // All children done
EventDelegationTimeout      = "delegation.timeout"       // Timeout waiting for children
```

The multiplexer synthesizes `delegation.run_completed` events from AgentRun CRD transitions to ensure delegation progress reaches the UI even when the parent agent's stream has closed.

### Bidirectional Control

Agents can request user interaction during execution:

1. **Permission Requests**: Tool execution requiring approval
   ```go
   EventPermissionAsked   // Agent asks for permission
   EventPermissionReplied // User responds (once/always/deny)
   ```

2. **Questions**: Interactive Q&A with options
   ```go
   EventQuestionAsked   // Agent asks questions
   EventQuestionReplied // User provides answers
   ```

### Resource Context

Users can attach file context to prompts from bound resources:

```typescript
// web/src/stores/resources.ts
interface ResourceContext {
  resourceName: string;
  resourceType: string;
  path: string;
  ref?: string;
  content?: string;
}
```

Context is sent with streaming prompts:

```typescript
streamPrompt(ns, name, prompt, onEvent, signal, contextItems);
```

### Tracing Integration

The console proxies to Tempo for distributed trace viewing:

```typescript
// Search traces for an agent
const results = await traces.search({
  agentName: 'my-agent',
  limit: 20,
  start: Date.now() - 3600000,
});
```

W3C trace context is propagated to agent runtimes for end-to-end tracing.

---

## Development

### Dev Workflow

Use the justfile recipes for development:

```bash
# Hot-reload BFF (Vite stays running)
just --justfile clusters/local_k3s/deploy/justfile con-reload

# Tail BFF logs
just con-logs

# Tail Vite logs
just con-vite-logs

# Interactive shell into console pod
just con-shell
```

### Access URLs

| URL | Purpose |
|-----|---------|
| `http://localhost:30173` | Vite dev server (HMR + proxies `/api/v1` to BFF) |
| `http://localhost:30080` | Go BFF directly |

### CLI Flags

```bash
./console --addr :8080 --namespace agents --dev --web-dir ./dist
```

| Flag | Default | Description |
|------|---------|-------------|
| `--addr` | `:8080` | BFF listen address |
| `--namespace` | `""` (all) | Restrict to single namespace |
| `--dev` | `false` | Dev mode: relaxed CORS, debug logging |
| `--web-dir` | `""` | Path to built SPA assets |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AGENT_URL_OVERRIDE` | Override agent runtime base URL |
| `ENGRAM_URL_OVERRIDE` | Override agentops-memory URL |
| `TEMPO_URL` | Override Tempo query URL |

---

## Related Documentation

- [AGENTS.md](./AGENTS.md) - Root-level agent documentation
- [README.md](./README.md) - Console setup and architecture
- [agentops-core](https://github.com/samyn92/agentops-core) - Operator and CRD definitions
- [agentops-runtime](https://github.com/samyn92/agentops-runtime) - Agent runtime implementation
- [agentops-memory](https://github.com/samyn92/agentops-memory) - Memory service
