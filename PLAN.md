# agentops-console -- Architecture Plan

> Fantasy-native agent operations console.
> No Pi SDK. No pi-web-ui. Pure Fantasy SDK + custom event protocol + SolidJS PWA.

---

## 1. Why Fantasy-Only

Fantasy SDK exposes 20+ streaming callbacks that our current runtime uses 4 of.
The goal is to exploit the full callback surface to build UX that is impossible
with Pi's event model:

- **Tool input streaming** -- watch the LLM compose tool arguments in real-time
- **Reasoning deltas** -- live thinking/chain-of-thought rendering
- **Step-level progress** -- grouped per-step tool execution with usage stats
- **Custom tool metadata** -- tools emit structured UI hints, console renders
  purpose-built components (K8s resource tables, diff viewers, charts)
- **Bidirectional control** -- permissions, questions, steering built into our
  protocol, not borrowed from another framework

We own both sides (runtime + console). No adapter layer. No translation.
One protocol designed for one purpose.

---

## 2. System Architecture

```
                     Browser
                       |
                       v
              +------------------+
              |  SolidJS PWA     |  agentops-console/web/
              |  (Vite+Tailwind) |  speaks FEP (Fantasy Event Protocol)
              +--------+---------+
                       |
                       | REST + SSE (FEP)
                       v
              +------------------+
              |  Console Backend |  agentops-console/cmd/console/
              |  (Go, chi)       |  BFF: auth, K8s client, SSE mux
              +---+---------+----+
                  |         |
        K8s API   |         | HTTP :4096 (FEP)
                  v         v
          +----------+  +-------------------+
          | Operator  |  | Fantasy Runtime   |  agenticops-core/images/agent-runtime-fantasy/
          | (CRDs)    |  | (upgraded)        |  emits full FEP event stream
          +----------+  +-------------------+
```

### Components

| Component | Language | Location | Purpose |
|-----------|----------|----------|---------|
| **Fantasy Runtime** (upgraded) | Go | `agenticops-core/images/agent-runtime-fantasy/` | Agent execution, full FEP SSE stream |
| **Console Backend** | Go | `agentops-console/cmd/console/` | BFF: K8s proxy, SSE multiplexer, session store, REST API |
| **Console Frontend** | TypeScript/SolidJS | `agentops-console/web/` | PWA: chat, management, monitoring |

---

## 3. Fantasy Event Protocol (FEP)

The core innovation. A rich SSE event protocol designed around Fantasy SDK's full
callback surface, extended with bidirectional control and custom UI metadata.

### 3.1 Runtime SSE Endpoint

`POST /prompt/stream` on the Fantasy runtime emits FEP events.

Each SSE frame: `data: {"type": "<event_type>", ...fields}\n\n`

### 3.2 Event Types

#### Agent Lifecycle

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `agent.start` | `{sessionId, prompt}` | `OnAgentStart` | Agent loop begins |
| `agent.finish` | `{sessionId, totalUsage, stepCount}` | `OnAgentFinish` | Agent loop complete |
| `agent.error` | `{sessionId, error, retryable}` | `OnError` | Fatal error |

#### Step Lifecycle

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `step.start` | `{stepNumber, sessionId}` | `OnStepStart` | New agent step begins |
| `step.finish` | `{stepNumber, sessionId, usage, finishReason, toolCallCount}` | `OnStepFinish` | Step complete with per-step stats |

#### Text Streaming

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `text.start` | `{id}` | `OnTextStart` | Text content block opens |
| `text.delta` | `{id, delta}` | `OnTextDelta` | Incremental text token |
| `text.end` | `{id}` | `OnTextEnd` | Text content block closes |

#### Reasoning/Thinking Streaming

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `reasoning.start` | `{id}` | `OnReasoningStart` | Thinking block opens |
| `reasoning.delta` | `{id, delta}` | `OnReasoningDelta` | Thinking token |
| `reasoning.end` | `{id}` | `OnReasoningEnd` | Thinking block closes |

#### Tool Input Streaming (NEW -- Pi cannot do this)

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `tool.input.start` | `{id, toolName}` | `OnToolInputStart` | LLM begins composing tool args |
| `tool.input.delta` | `{id, delta}` | `OnToolInputDelta` | Incremental JSON arg fragment |
| `tool.input.end` | `{id}` | `OnToolInputEnd` | Args fully composed |

#### Tool Execution

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `tool.call` | `{id, toolName, input, providerExecuted}` | `OnToolCall` | Tool call validated and dispatched |
| `tool.result` | `{id, toolName, output, isError, metadata, mediaType?, data?}` | `OnToolResult` | Tool execution complete |

`metadata` is the key field -- arbitrary JSON from `WithResponseMetadata()`.
This drives custom UI rendering (see Section 8).

#### Sources & Warnings

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `source` | `{id, sourceType, url, title}` | `OnSource` | Citation/reference from the model |
| `warnings` | `{warnings[]}` | `OnWarnings` | Provider warnings (e.g., deprecated model) |

#### Stream Finish (per-step LLM call)

| Event | Fields | Fantasy Callback | Purpose |
|-------|--------|------------------|---------|
| `stream.finish` | `{usage, finishReason, providerMetadata}` | `OnStreamFinish` | Single LLM call stats |

#### Bidirectional Control (runtime extensions, not in Fantasy SDK)

| Event | Fields | Direction | Purpose |
|-------|--------|-----------|---------|
| `permission.asked` | `{id, sessionId, toolName, args, description}` | Runtime -> Console | Tool requests approval before running |
| `permission.replied` | `{id, response: "once"\|"always"\|"deny"}` | Console -> Runtime (REST) | User approves/denies |
| `question.asked` | `{id, sessionId, questions[]}` | Runtime -> Console | Agent asks user a question |
| `question.replied` | `{id, answers[]}` | Console -> Runtime (REST) | User answers |
| `session.idle` | `{sessionId}` | Runtime -> Console | No more work pending |
| `session.status` | `{sessionId, status: "idle"\|"busy"\|"waiting"}` | Runtime -> Console | Status change |

### 3.3 Multiplexed SSE (Console Backend)

The console backend connects to each daemon agent's SSE endpoint and
multiplexes into a single global SSE stream for the frontend:

```
Frontend <-- /api/v1/events (single SSE)
                  |
         Backend multiplexer
           /          \
    agent-a:4096    agent-b:4096
    (FEP SSE)      (FEP SSE)
```

Envelope format on the global stream:
```json
{
  "agent": {"namespace": "agents", "name": "assistant"},
  "event": { <FEP event> }
}
```

Named SSE event types on the global stream:
- `agent.event` -- wrapped FEP event for a specific agent
- `agent.online` / `agent.offline` -- agent pod connectivity
- `resource.changed` -- K8s CRD watch event (Agent/Run/Channel/MCP CRUD)
- `heartbeat` -- keepalive (every 15s)

---

## 4. Upgraded Fantasy Runtime

Modifications to `agenticops-core/images/agent-runtime-fantasy/`:

### 4.1 Rich SSE Stream (`main.go`)

Replace the 4-event SSE stream with full FEP using all Fantasy callbacks:

```go
result, usedModel, err := streamWithFallback(ctx, s.cfg, s.bundle, fantasy.AgentStreamCall{
    Prompt:   req.Prompt,
    Messages: s.messages,

    // Agent lifecycle
    OnAgentStart:  func() { emit("agent.start", ...) },
    OnAgentFinish: func(r *fantasy.AgentResult) error { emit("agent.finish", ...); return nil },
    OnStepStart:   func(n int) error { emit("step.start", ...); return nil },
    OnStepFinish:  func(sr fantasy.StepResult) error { emit("step.finish", ...); return nil },

    // Text streaming
    OnTextStart: func(id string) error { emit("text.start", ...); return nil },
    OnTextDelta: func(id, text string) error { emit("text.delta", ...); return nil },
    OnTextEnd:   func(id string) error { emit("text.end", ...); return nil },

    // Reasoning streaming
    OnReasoningStart: func(id string, r fantasy.ReasoningContent) error { emit("reasoning.start", ...); return nil },
    OnReasoningDelta: func(id, text string) error { emit("reasoning.delta", ...); return nil },
    OnReasoningEnd:   func(id string, r fantasy.ReasoningContent) error { emit("reasoning.end", ...); return nil },

    // Tool input streaming (the big UX win)
    OnToolInputStart: func(id, name string) error { emit("tool.input.start", ...); return nil },
    OnToolInputDelta: func(id, delta string) error { emit("tool.input.delta", ...); return nil },
    OnToolInputEnd:   func(id string) error { emit("tool.input.end", ...); return nil },

    // Tool execution
    OnToolCall:   func(tc fantasy.ToolCallContent) error { emit("tool.call", ...); return nil },
    OnToolResult: func(tr fantasy.ToolResultContent) error { emit("tool.result", ...); return nil },

    // Sources, warnings, stream finish
    OnSource:       func(s fantasy.SourceContent) error { emit("source", ...); return nil },
    OnWarnings:     func(w []fantasy.CallWarning) error { emit("warnings", ...); return nil },
    OnStreamFinish: func(u fantasy.Usage, fr fantasy.FinishReason, pm fantasy.ProviderMetadata) error {
        emit("stream.finish", ...); return nil
    },
    OnError: func(err error) { emit("agent.error", ...) },
})
```

### 4.2 Session Management

Add proper session support to the daemon server:

```go
type Session struct {
    ID        string
    Messages  []fantasy.Message
    CreatedAt time.Time
    UpdatedAt time.Time
    Title     string  // auto-generated from first prompt
}

type daemonServer struct {
    sessions   map[string]*Session  // sessionId -> session
    // ...
}
```

New endpoints:
- `POST /sessions` -- create session, returns `{id}`
- `GET /sessions` -- list sessions with metadata
- `GET /sessions/:id` -- get session detail
- `DELETE /sessions/:id` -- delete session
- `POST /sessions/:id/prompt` -- prompt within session context
- `POST /sessions/:id/prompt/stream` -- stream within session context

### 4.3 Permission Hooks

Wrap tools with a permission gate that emits `permission.asked` and blocks
on a Go channel until the console replies:

```go
type permissionGate struct {
    pending   map[string]chan PermissionResponse
    mu        sync.Mutex
    emitEvent func(event FEPEvent)
}

func (g *permissionGate) wrapTool(tool fantasy.AgentTool, requireApproval bool) fantasy.AgentTool {
    if !requireApproval {
        return tool
    }
    return fantasy.NewAgentTool(
        tool.Info().Name,
        tool.Info().Description,
        func(ctx context.Context, input json.RawMessage, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
            // Emit permission.asked
            id := uuid.New().String()
            ch := make(chan PermissionResponse, 1)
            g.mu.Lock()
            g.pending[id] = ch
            g.mu.Unlock()
            g.emitEvent(FEPEvent{Type: "permission.asked", ...})

            // Block until reply or context cancelled
            select {
            case resp := <-ch:
                if resp.Response == "deny" {
                    return fantasy.NewTextErrorResponse("Permission denied by user"), nil
                }
                // Execute original tool
                return tool.Run(ctx, call)
            case <-ctx.Done():
                return fantasy.NewTextErrorResponse("Cancelled"), nil
            }
        },
    )
}
```

New endpoint: `POST /sessions/:id/permission/:permId/reply`

### 4.4 Question Tool

A built-in `question` tool that emits `question.asked` and blocks:

```go
questionTool := fantasy.NewAgentTool("question",
    "Ask the user a question and wait for their response",
    func(ctx context.Context, input QuestionInput, call fantasy.ToolCall) (fantasy.ToolResponse, error) {
        id := uuid.New().String()
        ch := make(chan QuestionResponse, 1)
        // emit question.asked, block on channel
        // ...
    },
)
```

New endpoint: `POST /sessions/:id/question/:qId/reply`

### 4.5 Custom Tool Metadata

Upgrade all built-in tools to emit structured metadata via `WithResponseMetadata`:

```go
// bash tool
result := fantasy.NewTextResponse(stdout)
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":       "terminal",
    "command":  input.Command,
    "exitCode": exitCode,
    "cwd":      cwd,
    "duration": elapsed.Milliseconds(),
})

// edit tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":         "diff",
    "filePath":   input.Path,
    "edits":      input.Edits,
    "replaceAll": input.ReplaceAll,
})

// read tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":       "code",
    "filePath": input.Path,
    "offset":   input.Offset,
    "limit":    input.Limit,
    "language": detectLanguage(input.Path),
})

// glob tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":      "file-tree",
    "pattern": input.Pattern,
    "files":   files,
    "count":   len(files),
})

// grep tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":      "search-results",
    "pattern": input.Pattern,
    "matches": matches,
    "count":   len(matches),
})

// write tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":       "file-created",
    "filePath": input.Path,
    "size":     len(input.Content),
    "language": detectLanguage(input.Path),
})

// fetch tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":         "web-fetch",
    "url":        input.URL,
    "statusCode": statusCode,
    "contentType": contentType,
})

// run_agent tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":        "agent-run",
    "agent":     input.Agent,
    "runName":   run.Name,
    "namespace": ns,
})

// get_agent_run tool
result = fantasy.WithResponseMetadata(result, map[string]any{
    "ui":     "agent-run-status",
    "name":   input.Name,
    "phase":  status.Phase,
    "output": status.Output,
})
```

MCP tools can also emit metadata if the MCP server returns JSON with a
known shape. The gateway proxy can inject metadata based on the MCP server
identity (e.g., kubectl MCP results get `"ui": "kubernetes-resources"`).

### 4.6 Steer and Abort

Add steering support:

```go
mux.HandleFunc("POST /sessions/{id}/steer", srv.handleSteer)
```

The steer message is injected into the session's message list. On the next
tool boundary (after current tool execution completes), the agent sees it
and adjusts course. Implemented via Fantasy's `PrepareStep` callback:

```go
OnStepStart: func(stepNumber int) error {
    // Check for pending steer messages
    if msg := s.popSteerMessage(sessionId); msg != "" {
        // Inject as user message before next LLM call
        session.Messages = append(session.Messages, fantasy.NewUserMessage(msg))
    }
    return nil
},
```

---

## 5. Console Backend (Go BFF)

`agentops-console/cmd/console/`

### 5.1 Responsibilities

1. **SSE Multiplexer** -- Connect to all daemon agent SSE streams, fan out
   to a single global SSE connection per browser client
2. **K8s Proxy** -- Watch Agent/AgentRun/Channel/MCPServer CRs, expose
   REST endpoints for CRUD
3. **Session Proxy** -- Forward session operations to the correct agent runtime
4. **Permission/Question Relay** -- Forward user responses to the correct runtime
5. **AgentRun Manager** -- Create AgentRun CRs, poll task agent results
6. **Resource Browser** -- List K8s namespaces/pods, MCP server metadata

### 5.2 REST API Surface

```
# Global SSE
GET  /api/v1/events                           # multiplexed FEP + resource watch

# Agents
GET  /api/v1/agents                           # list Agent CRs
GET  /api/v1/agents/:ns/:name                 # get Agent CR
GET  /api/v1/agents/:ns/:name/status          # get runtime /status

# Sessions (proxied to runtime)
GET  /api/v1/agents/:ns/:name/sessions               # list
POST /api/v1/agents/:ns/:name/sessions               # create
GET  /api/v1/agents/:ns/:name/sessions/:id            # get
DEL  /api/v1/agents/:ns/:name/sessions/:id            # delete
POST /api/v1/agents/:ns/:name/sessions/:id/prompt     # send prompt (sync)
POST /api/v1/agents/:ns/:name/sessions/:id/stream     # send prompt (SSE)
POST /api/v1/agents/:ns/:name/sessions/:id/steer      # steer mid-execution
POST /api/v1/agents/:ns/:name/sessions/:id/abort      # abort

# Interactive control (proxied to runtime)
POST /api/v1/agents/:ns/:name/sessions/:id/permission/:pid/reply
POST /api/v1/agents/:ns/:name/sessions/:id/question/:qid/reply

# Agent Runs
GET  /api/v1/agentruns                        # list AgentRun CRs
GET  /api/v1/agentruns/:ns/:name              # get AgentRun CR
POST /api/v1/agentruns                        # create AgentRun CR

# Channels
GET  /api/v1/channels                         # list Channel CRs
GET  /api/v1/channels/:ns/:name               # get Channel CR

# MCP Servers
GET  /api/v1/mcpservers                       # list MCPServer CRs
GET  /api/v1/mcpservers/:ns/:name             # get MCPServer CR

# Kubernetes
GET  /api/v1/kubernetes/namespaces            # list with counts
GET  /api/v1/kubernetes/namespaces/:ns/pods   # list pods
```

### 5.3 SSE Multiplexer Design

```go
type Multiplexer struct {
    clients    map[string]chan SSEEnvelope  // clientId -> channel
    agents     map[AgentKey]*agentConn     // agent -> SSE connection
    k8sWatcher *K8sWatcher
}

type agentConn struct {
    key      AgentKey
    url      string       // http://agent.ns.svc:4096
    cancel   context.CancelFunc
    backoff  *ExponentialBackoff
}
```

The multiplexer:
1. Watches Agent CRs via K8s informer
2. For each Running daemon agent, opens SSE to `:4096/prompt/stream` (persistent)
3. Wraps each FEP event in an envelope with agent identity
4. Fans out to all connected browser clients
5. Auto-reconnects with exponential backoff on disconnection
6. Emits `agent.online`/`agent.offline` when connections change

---

## 6. Console Frontend (SolidJS PWA)

`agentops-console/web/`

### 6.1 Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | SolidJS 1.9 | Fine-grained reactivity, no VDOM, signals |
| Build | Vite 7 | Fast HMR, native ESM |
| Styling | Tailwind CSS 4 | Utility-first, JIT, dark mode |
| Components | @kobalte/core | Accessible primitives (dialog, popover, tabs, tooltip) |
| Icons | solid-icons (Lucide + Material) | Tree-shakeable, consistent |
| Markdown | marked + highlight.js | Fast rendering, syntax highlighting |
| Charts | lightweight (uPlot or similar) | Token usage, cost charts |
| PWA | vite-plugin-pwa | Offline shell, installable |

### 6.2 Directory Structure

```
web/
  src/
    app.tsx                     # Root layout, router
    index.tsx                   # Entry point
    index.css                   # Tailwind base + custom properties

    routes/
      chat.tsx                  # Main chat view (default)
      agents.tsx                # Agent management / overview
      runs.tsx                  # AgentRun list and detail
      channels.tsx              # Channel list and detail
      mcpservers.tsx            # MCPServer list and detail
      settings.tsx              # Settings page

    components/
      layout/
        Sidebar.tsx             # Navigation + agent list + session list
        Header.tsx              # Breadcrumb + agent status bar
        MobileDrawer.tsx        # Swipe-to-open drawer (mobile)

      chat/
        ChatView.tsx            # Chat orchestrator (sessions, input, messages)
        MessageList.tsx         # Virtualized message list
        MessageBubble.tsx       # Single message (user or assistant)
        Composer.tsx            # Input area with context pills, send/stop
        StreamingText.tsx       # Progressive text rendering
        ReasoningBlock.tsx      # Collapsible thinking/reasoning panel
        StepIndicator.tsx       # "Step N" progress marker
        ToolInputPreview.tsx    # Live tool argument composition (NEW)
        ToolCallCard.tsx        # Completed tool result card
        PermissionDialog.tsx    # Permission approval prompt
        QuestionPanel.tsx       # Interactive question from agent
        SourceReference.tsx     # Citation/source link

      tools/                    # Tool-specific renderers (driven by metadata.ui)
        TerminalCard.tsx        # bash results (command, output, exit code)
        DiffCard.tsx            # edit results (side-by-side or unified diff)
        CodeCard.tsx            # read results (syntax highlighted, line numbers)
        FileTreeCard.tsx        # glob results (interactive tree)
        SearchResultsCard.tsx   # grep results (matches with context)
        FileCreatedCard.tsx     # write results (new file indicator)
        WebFetchCard.tsx        # fetch results (URL, status, preview)
        AgentRunCard.tsx        # run_agent results (live sub-agent status)
        KubernetesCard.tsx      # kubectl/K8s resource table (from MCP metadata)
        HelmCard.tsx            # helm release status
        GenericCard.tsx         # fallback for unknown ui types

      agents/
        AgentSelector.tsx       # Agent picker with search, status indicators
        AgentDetail.tsx         # Agent info panel (model, tools, MCP, system prompt)
        AgentStatusBadge.tsx    # Online/offline/busy/error badge

      runs/
        RunList.tsx             # AgentRun list with filters
        RunDetail.tsx           # Single run detail (output, cost, duration)

      resources/
        ResourceBrowser.tsx     # K8s namespace/pod browser popover
        MCPBrowser.tsx          # MCP server browser popover
        ContextPill.tsx         # Attached context indicator

      shared/
        Markdown.tsx            # Markdown renderer with syntax highlighting
        Badge.tsx               # Status/category badge
        Spinner.tsx             # Loading spinner
        CostDisplay.tsx         # Token usage and cost breakdown
        EmptyState.tsx          # Empty state illustrations

    stores/
      events.ts                 # Global SSE connection + FEP event dispatch
      agents.ts                 # Agent list, selection, status tracking
      sessions.ts               # Session list, current session, messages
      settings.ts               # Theme, accent color, tool defaults, preferences
      chat.ts                   # Chat state machine (streaming, parts, text buffer)

    lib/
      api.ts                    # REST client (fetch wrappers for all endpoints)
      fep.ts                    # FEP event type definitions + parsers
      theme.ts                  # Theme engine (Vercel / Material You + accent)
      format.ts                 # Formatters (time, cost, tokens, bytes)
      detect.ts                 # Language detection, tool category detection
      keyboard.ts               # Keyboard shortcuts
      mobile.ts                 # Mobile detection, safe areas, gestures

    types/
      index.ts                  # Re-exports
      fep.ts                    # FEP event TypeScript types (mirroring Go)
      api.ts                    # API response types (Agent, Run, Channel, MCP)
      chat.ts                   # Chat message types, tool part types
      context.ts                # Context attachment types
```

### 6.3 FEP TypeScript Types (`types/fep.ts`)

```typescript
// ---- Usage & Metadata ----

export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export type FinishReason =
  | "stop" | "length" | "content-filter"
  | "tool-calls" | "error" | "other" | "unknown"

// ---- Agent Lifecycle ----

export interface AgentStartEvent {
  type: "agent.start"
  sessionId: string
  prompt: string
}

export interface AgentFinishEvent {
  type: "agent.finish"
  sessionId: string
  totalUsage: Usage
  stepCount: number
}

export interface AgentErrorEvent {
  type: "agent.error"
  sessionId: string
  error: string
  retryable: boolean
}

// ---- Step Lifecycle ----

export interface StepStartEvent {
  type: "step.start"
  stepNumber: number
  sessionId: string
}

export interface StepFinishEvent {
  type: "step.finish"
  stepNumber: number
  sessionId: string
  usage: Usage
  finishReason: FinishReason
  toolCallCount: number
}

// ---- Text Streaming ----

export interface TextStartEvent {
  type: "text.start"
  id: string
}

export interface TextDeltaEvent {
  type: "text.delta"
  id: string
  delta: string
}

export interface TextEndEvent {
  type: "text.end"
  id: string
}

// ---- Reasoning Streaming ----

export interface ReasoningStartEvent {
  type: "reasoning.start"
  id: string
}

export interface ReasoningDeltaEvent {
  type: "reasoning.delta"
  id: string
  delta: string
}

export interface ReasoningEndEvent {
  type: "reasoning.end"
  id: string
}

// ---- Tool Input Streaming ----

export interface ToolInputStartEvent {
  type: "tool.input.start"
  id: string
  toolName: string
}

export interface ToolInputDeltaEvent {
  type: "tool.input.delta"
  id: string
  delta: string
}

export interface ToolInputEndEvent {
  type: "tool.input.end"
  id: string
}

// ---- Tool Execution ----

export interface ToolCallEvent {
  type: "tool.call"
  id: string
  toolName: string
  input: string            // JSON string of args
  providerExecuted: boolean
}

export interface ToolMetadata {
  ui?: string              // UI renderer hint
  [key: string]: unknown   // tool-specific structured data
}

export interface ToolResultEvent {
  type: "tool.result"
  id: string
  toolName: string
  output: string
  isError: boolean
  metadata?: ToolMetadata  // the custom UI driver
  mediaType?: string       // for image/media results
  data?: string            // base64 for binary
}

// ---- Sources & Warnings ----

export interface SourceEvent {
  type: "source"
  id: string
  sourceType: "url" | "document"
  url: string
  title: string
}

export interface WarningsEvent {
  type: "warnings"
  warnings: Array<{ message: string }>
}

// ---- Stream Finish ----

export interface StreamFinishEvent {
  type: "stream.finish"
  usage: Usage
  finishReason: FinishReason
}

// ---- Bidirectional Control ----

export interface PermissionAskedEvent {
  type: "permission.asked"
  id: string
  sessionId: string
  toolName: string
  args: string            // JSON
  description: string
}

export interface QuestionAskedEvent {
  type: "question.asked"
  id: string
  sessionId: string
  questions: Array<{
    question: string
    options?: Array<{ label: string; description: string }>
    multiple?: boolean
  }>
}

export interface SessionIdleEvent {
  type: "session.idle"
  sessionId: string
}

export interface SessionStatusEvent {
  type: "session.status"
  sessionId: string
  status: "idle" | "busy" | "waiting"
}

// ---- Union ----

export type FEPEvent =
  | AgentStartEvent | AgentFinishEvent | AgentErrorEvent
  | StepStartEvent | StepFinishEvent
  | TextStartEvent | TextDeltaEvent | TextEndEvent
  | ReasoningStartEvent | ReasoningDeltaEvent | ReasoningEndEvent
  | ToolInputStartEvent | ToolInputDeltaEvent | ToolInputEndEvent
  | ToolCallEvent | ToolResultEvent
  | SourceEvent | WarningsEvent | StreamFinishEvent
  | PermissionAskedEvent | QuestionAskedEvent
  | SessionIdleEvent | SessionStatusEvent

// ---- Global SSE Envelope ----

export interface AgentEventEnvelope {
  agent: { namespace: string; name: string }
  event: FEPEvent
}
```

---

## 7. Chat State Machine (`stores/chat.ts`)

The chat store manages the message assembly pipeline. FEP events arrive
as granular signals; the store assembles them into renderable message parts.

```
FEP Events          Chat Store State              UI Components
──────────          ────────────────              ─────────────

agent.start    -->  streaming = true
                    currentStep = 0

step.start     -->  currentStep++               StepIndicator

text.start     -->  activeText = {id, ""}
text.delta     -->  activeText.content +=       StreamingText (live)
text.end       -->  push to parts[]             MessageBubble (final)

reasoning.start -> activeReasoning = {id, ""}
reasoning.delta -> activeReasoning.content +=   ReasoningBlock (live)
reasoning.end   -> push to parts[]              ReasoningBlock (final)

tool.input.start -> activeToolInput = {id, name, ""}
tool.input.delta -> activeToolInput.args +=     ToolInputPreview (live)
tool.input.end   -> finalize args preview

tool.call      -->  toolParts[id] = {pending}   ToolCallCard (pending)
tool.result    -->  toolParts[id] = {complete}   ToolCallCard (complete)
                    dispatch to typed renderer
                    based on metadata.ui

permission.asked -> pendingPermission = {...}   PermissionDialog
question.asked   -> pendingQuestion = {...}     QuestionPanel

step.finish    -->  stepUsage[step] = usage     StepIndicator (usage)

stream.finish  -->  accumulateUsage(usage)

agent.finish   -->  streaming = false           CostDisplay
                    totalUsage = usage

session.idle   -->  idleDebounce -> done
```

### 7.1 Key Innovation: ToolInputPreview

When `tool.input.start` arrives, the chat renders a live preview card
showing the tool name and the arguments being composed character by character.
As `tool.input.delta` events stream in, the component parses partial JSON
and renders what it can:

```
  +--------------------------------------+
  |  [bash]  composing arguments...      |
  |                                      |
  |  > kubectl get pods -n agen|         |
  |    (cursor blinks)                   |
  +--------------------------------------+
```

When `tool.input.end` fires, the preview transitions to a `tool.call`
pending state (waiting for execution). When `tool.result` arrives, it
becomes a completed ToolCallCard.

This gives users real-time visibility into what the agent is about to do
BEFORE it does it -- which is also where permission gates naturally fit.

---

## 8. Tool-Specific UI Renderers

Each tool emits a `metadata.ui` hint. The `ToolCallCard` component
dispatches to the correct renderer:

```typescript
const renderers: Record<string, Component<ToolCardProps>> = {
  "terminal":           TerminalCard,
  "diff":               DiffCard,
  "code":               CodeCard,
  "file-tree":          FileTreeCard,
  "search-results":     SearchResultsCard,
  "file-created":       FileCreatedCard,
  "web-fetch":          WebFetchCard,
  "agent-run":          AgentRunCard,
  "agent-run-status":   AgentRunCard,
  "kubernetes-resources": KubernetesCard,
  "helm-release":       HelmCard,
}

// In ToolCallCard.tsx:
const Renderer = renderers[metadata?.ui] || GenericCard
return <Renderer {...props} />
```

### 8.1 Renderer Specifications

**TerminalCard** (bash)
- Shows: command string (monospace), exit code badge (green 0, red non-zero)
- Collapsible output with line limit (50 lines default, expand for more)
- Duration badge
- Working directory path if available

**DiffCard** (edit)
- Shows: file path header
- Unified or side-by-side diff view (user toggle in settings)
- Per-edit blocks if multiple edits in one call
- Red/green coloring for deletions/additions

**CodeCard** (read)
- Shows: file path, line range (offset:limit)
- Syntax highlighted code (language auto-detected from extension)
- Line numbers
- Collapsible if > 30 lines

**FileTreeCard** (glob)
- Shows: pattern used, file count
- Tree view with directory nesting
- File type icons
- Collapsible directories

**SearchResultsCard** (grep)
- Shows: pattern, include filter, match count
- Per-file grouped results with line numbers
- Highlighted matching text
- Click to expand context

**FileCreatedCard** (write)
- Shows: file path, size
- Preview of first N lines (syntax highlighted)
- "New file" indicator

**WebFetchCard** (fetch)
- Shows: URL, HTTP status code, content type
- Collapsible response body
- Link to open in browser

**AgentRunCard** (run_agent / get_agent_run)
- Shows: target agent name, run name, phase badge
- Live status updates if run is in progress (poll or watch)
- Output preview when complete

**KubernetesCard** (kubectl MCP results)
- Shows: resource kind, namespace
- Tabular view of resources (name, status, age, etc.)
- Status coloring (Running=green, Pending=yellow, Failed=red)

**HelmCard** (helm MCP results)
- Shows: release name, chart, version, status
- Revision history if available

**GenericCard** (fallback)
- Shows: tool name, raw JSON output
- Collapsible with syntax highlighting

---

## 9. Theme System

Carry forward and refine the dual-theme approach:

### 9.1 Vercel Theme
- Clean, minimal, monochrome with sharp borders
- Geist-inspired typography
- High contrast, information-dense

### 9.2 Material You Theme
- Dynamic color from accent seed using @material/material-color-utilities
- Rounded corners, elevation shadows
- Tonal surfaces (surface1/2/3/4/5)

### 9.3 CSS Custom Properties

```css
:root {
  /* Surfaces */
  --surface-0: ...;    /* page background */
  --surface-1: ...;    /* card background */
  --surface-2: ...;    /* elevated card */
  --surface-3: ...;    /* popover */

  /* Text */
  --text-primary: ...;
  --text-secondary: ...;
  --text-muted: ...;

  /* Accent */
  --accent: ...;
  --accent-hover: ...;
  --accent-text: ...;

  /* Semantic */
  --success: ...;
  --warning: ...;
  --error: ...;
  --info: ...;

  /* Tool category colors */
  --tool-k8s: #326CE5;
  --tool-helm: #0F1689;
  --tool-github: #24292F;
  --tool-gitlab: #FC6D26;
  --tool-terraform: #7B42BC;
  --tool-shell: #4EAA25;
  --tool-file: #E8A838;
  --tool-search: #4285F4;
  --tool-agent: var(--accent);

  /* Sizing */
  --radius-sm: ...;
  --radius-md: ...;
  --radius-lg: ...;
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1)

**Runtime changes** (agenticops-core):
- [ ] Upgrade Fantasy runtime SSE to emit all FEP events
- [ ] Add session management (CRUD, per-session message history)
- [ ] Add `metadata` to all built-in tool responses via `WithResponseMetadata`
- [ ] Add `steer` endpoint
- [ ] Add `abort` per session
- [ ] Test: verify all 20+ events emit correctly with a curl-based test

**Console backend** (agentops-console):
- [ ] Scaffold Go project: cmd/console/main.go, internal/ packages
- [ ] Implement K8s client (controller-runtime cache for CRDs)
- [ ] Implement SSE multiplexer (connect to daemon agents, fan out)
- [ ] Implement REST API: agents, sessions (proxied), agentruns, channels, mcpservers, kubernetes
- [ ] Implement permission/question relay endpoints
- [ ] Dockerfile + Helm chart for deployment
- [ ] Test: deploy on homecluster, verify SSE stream works end-to-end

**Console frontend** (agentops-console):
- [ ] Scaffold Vite + SolidJS + Tailwind project
- [ ] Implement FEP types (types/fep.ts)
- [ ] Implement global SSE store (stores/events.ts)
- [ ] Implement REST API client (lib/api.ts)
- [ ] Implement basic layout (Sidebar, Header)
- [ ] Implement agent list + selector
- [ ] Test: connect to backend, verify agent list renders

### Phase 2: Chat Core (Week 2)

- [ ] Implement chat state machine (stores/chat.ts)
- [ ] Implement Composer with send/stop/steer
- [ ] Implement StreamingText (progressive text rendering)
- [ ] Implement MessageBubble (user + assistant)
- [ ] Implement MessageList (auto-scroll, virtual scroll for large histories)
- [ ] Implement session management UI (create, list, switch, delete)
- [ ] Implement ToolInputPreview (live tool arg composition)
- [ ] Implement basic ToolCallCard with status indicators
- [ ] Test: full chat flow with streaming, tool calls visible

### Phase 3: Rich Tool Renderers (Week 3)

- [ ] Implement TerminalCard (bash)
- [ ] Implement DiffCard (edit) with unified diff viewer
- [ ] Implement CodeCard (read) with syntax highlighting
- [ ] Implement FileTreeCard (glob)
- [ ] Implement SearchResultsCard (grep)
- [ ] Implement FileCreatedCard (write)
- [ ] Implement WebFetchCard (fetch)
- [ ] Implement GenericCard (fallback)
- [ ] Implement ReasoningBlock (collapsible thinking)
- [ ] Implement StepIndicator with per-step usage
- [ ] Implement CostDisplay (total usage breakdown)
- [ ] Test: verify each renderer with real agent interactions

### Phase 4: Interactive Control (Week 3-4)

- [ ] Implement permission gate in Fantasy runtime
- [ ] Implement PermissionDialog in frontend
- [ ] Implement question tool in Fantasy runtime
- [ ] Implement QuestionPanel in frontend
- [ ] Implement steer functionality (input mode switch in Composer)
- [ ] Implement SourceReference component
- [ ] Test: permission flow, question flow, steering flow end-to-end

### Phase 5: Management & Operations (Week 4)

- [ ] Implement AgentDetail panel (model, tools, MCP servers, system prompt)
- [ ] Implement AgentRun list + detail view
- [ ] Implement Channel list + detail view
- [ ] Implement MCPServer list + detail view
- [ ] Implement ResourceBrowser (K8s namespaces/pods)
- [ ] Implement MCPBrowser popover
- [ ] Implement ContextPill for attached resources
- [ ] Implement AgentRunCard (live sub-agent tracking)

### Phase 6: Polish (Week 5)

- [ ] Implement theme system (Vercel + Material You + accent picker)
- [ ] Implement settings page
- [ ] Implement KubernetesCard and HelmCard (for MCP tool results)
- [ ] Mobile PWA: swipe drawer, safe areas, keyboard detection
- [ ] Keyboard shortcuts (Cmd+K agent switch, Cmd+N new session, etc.)
- [ ] Empty states, loading states, error states
- [ ] Performance: virtualized lists, lazy component loading
- [ ] Accessibility: ARIA labels, keyboard navigation, screen reader

### Phase 7: Deployment & Integration

- [ ] Flux kustomization for agentops-console
- [ ] Update operator Flux manifests if needed
- [ ] CI/CD: GitHub Actions for build + push image
- [ ] Update AGENTS.md across all repos

---

## 11. File Manifest

### agentops-console/ (this repo)

```
agentops-console/
  PLAN.md                           # this file
  cmd/
    console/
      main.go                       # entrypoint
  internal/
    server/
      server.go                     # chi router, middleware, CORS
    handlers/
      agents.go                     # Agent CR endpoints
      sessions.go                   # Session proxy endpoints
      agentruns.go                  # AgentRun CR endpoints
      channels.go                   # Channel CR endpoints
      mcpservers.go                 # MCPServer CR endpoints
      kubernetes.go                 # K8s resource endpoints
      events.go                     # Global SSE endpoint
      control.go                    # Permission/question relay
    k8s/
      client.go                     # Controller-runtime client + cache
      watcher.go                    # CRD informer-based watcher
    multiplexer/
      multiplexer.go                # SSE fan-in/fan-out
      agent_conn.go                 # Per-agent SSE connection manager
    fep/
      types.go                      # FEP event Go types
      parse.go                      # SSE frame parser
  web/
    index.html
    vite.config.ts
    tailwind.config.ts
    tsconfig.json
    package.json
    public/
      manifest.json                 # PWA manifest
      icons/                        # PWA icons
    src/
      (see Section 6.2 for full tree)
  Dockerfile                        # Multi-stage: Go build + Vite build
  helm/
    agentops-console/
      Chart.yaml
      values.yaml
      templates/
        deployment.yaml
        service.yaml
        ingress.yaml
  .github/
    workflows/
      ci.yml
      release.yml
```

### agenticops-core changes (separate repo, PRs)

```
images/agent-runtime-fantasy/
  main.go          # Upgraded: full FEP SSE, session mgmt, steer
  session.go       # NEW: session store (in-memory + optional PVC persistence)
  fep.go           # NEW: FEP event types and SSE emitter
  permission.go    # NEW: permission gate hook
  question.go      # NEW: question tool
  tools.go         # Modified: add WithResponseMetadata to all tools
  config.go        # Modified: add permission config fields
```
