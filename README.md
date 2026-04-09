# AgentOps Console

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.26-00ADD8.svg)](https://go.dev/)
[![SolidJS](https://img.shields.io/badge/SolidJS-1.9-4f88c6.svg)](https://www.solidjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)](https://www.typescriptlang.org/)

Web console for [AgentOps](https://github.com/samyn92/agentops-core) — a Go Backend-for-Frontend (BFF) proxying Kubernetes and agent runtime APIs, paired with a SolidJS Progressive Web App. Connects to agents via the Fantasy Event Protocol (FEP) over Server-Sent Events for real-time streaming.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Fantasy Event Protocol (FEP)](#fantasy-event-protocol-fep)
- [Project Structure](#project-structure)
- [Development](#development)
- [Related Projects](#related-projects)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
Browser (SolidJS PWA)
  |
  +-- REST API (/api/v1/*)
  +-- Global SSE (/api/v1/events)         <-- persistent, multiplexed
  +-- Per-prompt SSE (/api/v1/.../stream)  <-- per-prompt, FEP events
  |
  v
Go BFF Server (:8080)
  |
  +-- chi router + CORS + middleware
  +-- SSE Multiplexer
  |     +-- K8s Watcher (informer-backed, 5 CRD types)
  |     +-- Agent health polling (10s intervals)
  |     +-- Fan-out to browser clients
  |
  +-- Agent Proxy
  |     +-- Session/prompt proxying to runtime HTTP API
  |     +-- Permission + question reply forwarding
  |     +-- FEP stream relay (runtime -> multiplexer -> browser)
  |
  +-- Git Forge Proxy
  |     +-- GitHub API (token from K8s Secret)
  |     +-- GitLab API (token from K8s Secret)
  |
  +-- Engram Proxy
        +-- Memory observations CRUD
        +-- Search, context, timeline, stats
        +-- AI-assisted memory extraction
  |
  v
Agent Runtimes (:4096)         Kubernetes API           Engram (:7437)
  /prompt/stream (FEP SSE)      CRDs via informers       Memory REST API
  /permission/{pid}/reply        Pods, Deployments        Observations, sessions
  /question/{qid}/reply          Secrets (forge tokens)   Search, timeline
```

### BFF Pattern

The Go server holds no domain logic. It proxies and aggregates:

- All prompt/control requests forwarded to agent runtimes
- Git forge API calls authenticated with credentials from K8s Secrets
- Engram memory operations proxied with automatic project scoping
- CRD data served from the informer cache (no direct API server polling)
- Real-time events from multiple agents multiplexed into a single SSE stream

---

## Features

### Agent Management

Agent list with status indicators (CRD phase + live SSE online/offline), model info, mode badges (daemon/task), ready replicas, and active run concurrency. Full spec detail view showing providers, tools, MCP servers, system prompt, storage, and network policy.

### Chat

Per-conversation streaming chat with FEP SSE. Text is rendered progressively using `requestAnimationFrame` to decouple bursty SSE from render cadence. Supports reasoning blocks (expandable thinking display), markdown with syntax highlighting, and source references.

One conversation per agent (no session sidebar). Background conversations continue streaming when switching between agents.

### Tool Cards

12 specialized renderers dispatched by `metadata.ui` hint from the runtime:

| UI Hint | Component | Renders |
|---------|-----------|---------|
| `terminal` | TerminalCard | Bash output |
| `diff` | DiffCard | Edit operations (unified/split view) |
| `code` | CodeCard | Read with syntax highlighting |
| `file-tree` | FileTreeCard | ls, glob results |
| `file-created` | FileCreatedCard | Write operations |
| `search-results` | SearchResultsCard | Grep results |
| `web-fetch` | WebFetchCard | Fetch output |
| `agent-run` | AgentRunCard | run_agent orchestration |
| `kubernetes-resources` | KubernetesCard | kubectl MCP tools |
| `helm-release` | HelmCard | Helm MCP tools |
| --- | GenericCard | Fallback |

Cards are collapsible with configurable per-tool expansion defaults.

### Permission Gates

When agents require approval (e.g., bash commands), the runtime emits `permission_asked` via FEP. The console shows a dialog with the tool input preview and three options:

- **Allow Once** --- permit this invocation
- **Always Allow** --- permanently allow this tool for the session
- **Deny** --- block the call

### Interactive Questions

Agents can ask structured questions via the `question` tool. The console renders single/multi-select option panels with free-text fallback. Replies are sent via REST and injected into the agent's execution flow.

### Memory Management

Full Engram memory UI for agents with `spec.memory` configured:

- Browse and search observations (facts, summaries, decisions, patterns)
- Create observations manually ("Remember this") or via AI-assisted extraction from conversations
- Edit and delete observations with soft/hard delete
- View memory sessions, timeline, and usage statistics
- Adjust working memory window size (persists to the Agent CR)
- Clear working memory for fresh conversations

### Resource Browsers

Unified resource panel with drill-down navigation:

- **Git Forge Browser** --- file tree, commits, branches, MRs/PRs, issues for GitHub and GitLab repos bound to the agent. Proxied through the BFF with token auth.
- **Kubernetes Browser** --- namespace selection, 12 resource types (pods, deployments, statefulsets, daemonsets, jobs, cronjobs, services, ingresses, configmaps, secrets, events), resource summaries with rich metadata.
- **MCP Browser** --- view MCP servers and their available tools.

Selected resources (files, commits, K8s objects, etc.) appear as chips in the composer and are sent as `ResourceContext[]` with the next prompt for per-turn context injection.

### AgentRuns

Right panel showing AgentRun CRs with filtering (all/active/completed/failed), source icons (channel/agent/schedule), cost display, duration, output preview. Auto-polls for active runs.

### Context Window Gauge

The composer shows a visual gauge of context window utilization (input tokens / model max). Color-coded green/yellow/red with known context windows for 30+ models across Anthropic, OpenAI, Google, and Mistral.

### Theming

Dual theme engine:

- **Vercel** --- neutral zinc surfaces with accent on interactive elements
- **Material You** --- full Material 3 tonal palette with 9 scheme variants (Tonal Spot, Neutral, Vibrant, Expressive, Fidelity, Content, Monochrome, Rainbow, Fruit Salad)

12 accent color presets + custom picker. Dark/light/system modes. All applied as CSS custom properties via `@material/material-color-utilities`.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Cycle agents |
| `Cmd/Ctrl+N` | New conversation |
| `Cmd/Ctrl+1` | Toggle agent panel |
| `Cmd/Ctrl+3` | Toggle runs panel |
| `Cmd/Ctrl+,` | Settings |
| `Enter` | Send prompt |
| `Shift+Enter` | Newline |
| `Esc` | Stop generation |

### PWA

Full Progressive Web App with standalone display mode, Workbox service worker (NetworkFirst for API, CacheFirst for assets), and Apple-specific meta tags for home screen installation.

---

## Prerequisites

- Kubernetes cluster with [agentops-core](https://github.com/samyn92/agentops-core) operator installed
- At least one Agent CR deployed
- `kubectl` configured with cluster access
- **For development:**
  - Go **1.26**
  - Node.js (for the frontend)

---

## Quick Start

### Development (two terminals)

```sh
# Terminal 1: Go BFF (proxies to in-cluster agents)
go run ./cmd/console/ --dev --namespace agents

# Terminal 2: Vite dev server (hot reload, proxies /api/v1 to :8080)
cd web && npm install && npm run dev
```

### Production (single binary)

```sh
cd web && npm install && npm run build
go build -o console ./cmd/console/
./console --web-dir ./web/dist --addr :8080
```

---

## Installation

### Helm (recommended)

```sh
helm install agentops-console helm/agentops-console \
  --namespace agent-system --create-namespace \
  --set console.namespace=agents
```

With Ingress:

```sh
helm install agentops-console helm/agentops-console \
  --namespace agent-system --create-namespace \
  --set console.namespace=agents \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=console.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

### Container image

```
ghcr.io/samyn92/agentops-console:<version>
ghcr.io/samyn92/agentops-console:latest
```

### Uninstall

```sh
helm uninstall agentops-console -n agent-system
```

---

## Configuration

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--addr` | `:8080` | HTTP listen address |
| `--namespace` | (all) | Restrict to a single namespace |
| `--dev` | `false` | Development mode (relaxed CORS, debug logging) |
| `--web-dir` | `""` | Path to built frontend static assets |
| `--kubeconfig` | (auto) | Path to kubeconfig (inherited from controller-runtime) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ENGRAM_URL_OVERRIDE` | Override Engram URL resolution (dev mode) |
| `AGENT_URL_OVERRIDE` | Override agent service URL resolution (dev mode) |

### Helm Values

Key Helm values (see [`helm/agentops-console/values.yaml`](helm/agentops-console/values.yaml) for the full reference):

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | `ghcr.io/samyn92/agentops-console` | Container image |
| `console.namespace` | `""` (all) | Restrict to a namespace |
| `console.dev` | `false` | Enable dev mode |
| `rbac.create` | `true` | Create RBAC resources |
| `ingress.enabled` | `false` | Enable Ingress |
| `autoscaling.enabled` | `false` | Enable HPA |
| `resources.requests.memory` | `128Mi` | Memory request |
| `resources.limits.memory` | `256Mi` | Memory limit |

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### SSE Streams

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/events` | Global multiplexed SSE (persistent connection) |
| `GET` | `/watch` | K8s resource change events |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents` | List all agents |
| `GET` | `/agents/{ns}/{name}` | Get agent detail |
| `GET` | `/agents/{ns}/{name}/status` | Get runtime status (proxied) |

### Conversation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agents/{ns}/{name}/prompt` | Send prompt (non-streaming) |
| `POST` | `/agents/{ns}/{name}/stream` | Send prompt (SSE streaming) |
| `POST` | `/agents/{ns}/{name}/steer` | Steer mid-execution |
| `DELETE` | `/agents/{ns}/{name}/abort` | Abort current generation |

### Interactive Control

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agents/{ns}/{name}/permission/{pid}/reply` | Reply to permission gate |
| `POST` | `/agents/{ns}/{name}/question/{qid}/reply` | Reply to question |

### Memory (Engram)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents/{ns}/{name}/memory/enabled` | Check if memory is configured |
| `GET` | `/agents/{ns}/{name}/memory/observations` | List observations |
| `GET` | `/agents/{ns}/{name}/memory/observations/{id}` | Get observation |
| `POST` | `/agents/{ns}/{name}/memory/observations` | Create observation |
| `PATCH` | `/agents/{ns}/{name}/memory/observations/{id}` | Update observation |
| `DELETE` | `/agents/{ns}/{name}/memory/observations/{id}` | Delete observation |
| `GET` | `/agents/{ns}/{name}/memory/search` | Search observations |
| `GET` | `/agents/{ns}/{name}/memory/context` | Get recent context |
| `GET` | `/agents/{ns}/{name}/memory/stats` | Memory statistics |
| `GET` | `/agents/{ns}/{name}/memory/sessions` | List sessions |
| `GET` | `/agents/{ns}/{name}/memory/timeline` | Chronological timeline |
| `POST` | `/agents/{ns}/{name}/memory/extract` | AI-assisted extraction |

### Working Memory

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents/{ns}/{name}/working-memory` | Get sliding window messages |
| `DELETE` | `/agents/{ns}/{name}/working-memory` | Clear conversation window |
| `PATCH` | `/agents/{ns}/{name}/config/window-size` | Set window size |

### AgentRuns, Channels, Tools

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentruns` | List runs |
| `GET` | `/agentruns/{ns}/{name}` | Get run |
| `POST` | `/agentruns` | Create run |
| `GET` | `/channels` | List channels |
| `GET` | `/channels/{ns}/{name}` | Get channel |
| `GET` | `/agenttools` | List tools |
| `GET` | `/agenttools/{ns}/{name}` | Get tool |

### Resources

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentresources` | List all resources |
| `GET` | `/agentresources/{ns}/{name}` | Get resource |
| `GET` | `/agents/{ns}/{name}/resources` | Resources bound to agent |
| `GET` | `/agents/{ns}/{name}/resources/{res}/files` | Browse files (forge proxy) |
| `GET` | `/agents/{ns}/{name}/resources/{res}/files/content` | File content |
| `GET` | `/agents/{ns}/{name}/resources/{res}/commits` | Commits |
| `GET` | `/agents/{ns}/{name}/resources/{res}/branches` | Branches |
| `GET` | `/agents/{ns}/{name}/resources/{res}/mergerequests` | MRs/PRs |
| `GET` | `/agents/{ns}/{name}/resources/{res}/issues` | Issues |

### Kubernetes Browser

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/kubernetes/browse/namespaces` | List namespaces |
| `GET` | `/kubernetes/browse/namespaces/{ns}/summary` | Namespace resource counts |
| `GET` | `/kubernetes/browse/namespaces/{ns}/{kind}` | List resources by kind |

Supported kinds: `pods`, `deployments`, `statefulsets`, `daemonsets`, `jobs`, `cronjobs`, `services`, `ingresses`, `configmaps`, `secrets`, `events`.

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check (outside `/api/v1`) |

---

## Fantasy Event Protocol (FEP)

The console communicates with agent runtimes using FEP over Server-Sent Events. Key event types:

| Event | Direction | Description |
|-------|-----------|-------------|
| `agent_start` | Runtime -> Console | Prompt execution started |
| `text_delta` | Runtime -> Console | Streaming text chunk |
| `reasoning_delta` | Runtime -> Console | Streaming reasoning chunk |
| `tool_call` / `tool_result` | Runtime -> Console | Tool invocation and result |
| `tool_input_delta` | Runtime -> Console | Streaming tool input |
| `permission_asked` | Runtime -> Console | Agent requests approval |
| `permission_replied` | Console -> Runtime | User's permission response |
| `question_asked` | Runtime -> Console | Agent asks a question |
| `question_replied` | Console -> Runtime | User's answer |
| `stream_finish` | Runtime -> Console | Step complete (with usage stats) |
| `agent_finish` | Runtime -> Console | Execution complete |
| `agent_error` | Runtime -> Console | Execution failed |
| `session_status` | Runtime -> Console | Session state (idle/busy/waiting) |

Full type definitions in [`internal/fep/types.go`](internal/fep/types.go) and [`web/src/types/fep.ts`](web/src/types/fep.ts).

---

## Project Structure

```
agentops-console/
  cmd/
    console/
      main.go                    # Entrypoint — flags, signal handling, startup
  internal/
    server/
      server.go                  # chi router, middleware, CORS, route registration
    handlers/
      handlers.go                # Agent, run, channel, tool, K8s endpoints
      agentresources.go          # Resource catalog + GitHub/GitLab forge proxy
      engram.go                  # Engram memory proxy (URL resolution, project scoping)
      kubernetes.go              # Enhanced K8s resource browser (12 resource types)
    k8s/
      client.go                  # controller-runtime client + informer cache
      watcher.go                 # CRD event watcher with subscriber pattern
    multiplexer/
      multiplexer.go             # SSE fan-out to browser clients
      agent_conn.go              # Per-agent SSE connection with backoff
    fep/
      types.go                   # Fantasy Event Protocol type definitions
  web/
    src/
      App.tsx                    # SolidJS router (/ and /settings)
      pages/
        MainApp.tsx              # Main layout (agent panel + chat + runs)
        SettingsPage.tsx         # Theme, keyboard, preferences
      components/
        agents/                  # Agent list, detail, status badges
        chat/                    # ChatView, Composer, MessageBubble, streaming
        tools/                   # 11 specialized tool card renderers
        resources/               # Git forge, K8s, MCP resource browsers
        runs/                    # AgentRun list with filtering
        layout/                  # App shell, sidebars, panels
        shared/                  # Reusable UI components
      stores/                    # SolidJS reactive stores
        agents.ts                #   Agent list + selection
        chat.ts                  #   Conversations, messages, streaming state
        events.ts                #   SSE connection management
        memory.ts                #   Engram memory state
        resources.ts             #   Resource browser state
        runs.ts                  #   AgentRun state
        settings.ts              #   User preferences
        view.ts                  #   Panel visibility, layout
      lib/
        api.ts                   # HTTP client (fetch wrappers)
        theme.ts                 # Material You / Vercel theme engine
        keyboard.ts              # Keyboard shortcut registration
        format.ts                # Token, duration, cost formatting
        detect.ts                # Platform detection
      types/                     # TypeScript type definitions
    vite.config.ts               # Vite + SolidJS + Tailwind + PWA config
    package.json                 # Frontend dependencies
  helm/
    agentops-console/            # Helm chart
      Chart.yaml
      values.yaml
      templates/                 # Deployment, Service, Ingress, RBAC, HPA
  go.mod                         # Go module (chi, controller-runtime)
```

---

## Development

### Tech Stack

**Backend:**
- Go 1.26 with [chi](https://github.com/go-chi/chi) router
- [controller-runtime](https://pkg.go.dev/sigs.k8s.io/controller-runtime) v0.21 for informer-cached K8s client
- Watches 5 CRD types (Agent, AgentRun, Channel, AgentTool, AgentResource)
- SSE multiplexer with per-agent health-check connections and exponential backoff

**Frontend:**
- [SolidJS](https://www.solidjs.com/) 1.9 with TypeScript 5.9
- [Vite](https://vite.dev/) 7.2 with Tailwind CSS v4
- [highlight.js](https://highlightjs.org/) for syntax highlighting, [marked](https://marked.js.org/) for markdown
- [@material/material-color-utilities](https://github.com/nicehash/material-color-utilities) for Material You theming
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for service worker and offline support

### Running locally

```sh
# Terminal 1: Backend
go run ./cmd/console/ --dev --namespace agents

# Terminal 2: Frontend (hot reload)
cd web && npm install && npm run dev
```

The Vite dev server proxies `/api/v1` requests to `localhost:8080`.

### Building

```sh
# Frontend
cd web && npm run build     # outputs to web/dist/

# Backend
go build -o console ./cmd/console/

# Combined
./console --web-dir ./web/dist --addr :8080
```

### Frontend commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build locally |

---

## Related Projects

| Repository | Description |
|------------|-------------|
| [agentops-core](https://github.com/samyn92/agentops-core) | Kubernetes operator (CRDs, controllers, webhooks) |
| [agentops-runtime](https://github.com/samyn92/agentops-runtime) | Agent runtime (Fantasy SDK + Engram memory) |
| [agent-channels](https://github.com/samyn92/agent-channels) | Channel bridge images (Telegram, Slack, GitLab, etc.) |
| [agent-tools](https://github.com/samyn92/agent-tools) | OCI tool/agent packaging CLI + tool packages |
| [Engram](https://github.com/samyn92/engram) | Shared memory server (fork) |
| [Charm Fantasy SDK](https://github.com/charmbracelet/fantasy) | AI agent framework |

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Install dependencies:
   ```sh
   # Backend
   go mod download
   # Frontend
   cd web && npm install
   ```
4. Run the dev servers and verify your changes
5. Ensure the frontend builds cleanly (`cd web && npm run build`)
6. Ensure the backend compiles (`go build ./...`)
7. Commit your changes and open a Pull Request

---

## License

Apache 2.0
