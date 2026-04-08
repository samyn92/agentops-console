# agentops-console

Web console for [AgentOps](https://github.com/samyn92/agentops-core) — a Go Backend-for-Frontend (BFF) proxying Kubernetes and agent runtime APIs, paired with a SolidJS Progressive Web App. Connects to agents via the Fantasy Event Protocol (FEP) over Server-Sent Events for real-time streaming.

## Architecture

```
Browser (SolidJS PWA)
  │
  ├── REST API (/api/v1/*)
  ├── Global SSE (/api/v1/events)         ← persistent, multiplexed
  └── Per-prompt SSE (/api/v1/.../stream)  ← per-prompt, FEP events
  │
  v
Go BFF Server (:8080)
  │
  ├── chi router + CORS + middleware
  ├── SSE Multiplexer
  │     ├── K8s Watcher (informer-backed, 5 CRD types)
  │     ├── Agent health polling (10s intervals)
  │     └── Fan-out to browser clients
  │
  ├── Agent Proxy
  │     ├── Session/prompt proxying to runtime HTTP API
  │     ├── Permission + question reply forwarding
  │     └── FEP stream relay (runtime -> multiplexer -> browser)
  │
  └── Git Forge Proxy
        ├── GitHub API (token from K8s Secret)
        └── GitLab API (token from K8s Secret)
  │
  v
Agent Runtimes (:4096)         Kubernetes API           Engram (:7437)
  /prompt/stream (FEP SSE)      CRDs via informers       (memory, future)
  /permission/{pid}/reply        Pods, Deployments, ...
  /question/{qid}/reply          Secrets (forge tokens)
```

### BFF Pattern

The Go server never holds domain logic. It proxies and aggregates:

- All prompt/control requests forwarded to agent runtimes
- Git forge API calls authenticated with credentials from K8s Secrets
- CRD data served from the informer cache (no direct API server polling)
- Real-time events from multiple agents multiplexed into a single SSE stream

## Features

### Agent Management

Agent list with status indicators (CRD phase + live SSE online/offline), model info, mode badges (daemon/task), ready replicas, and active run concurrency. Full spec detail view showing providers, tools, MCP servers, system prompt, storage, and network policy.

### Chat

Per-conversation streaming chat with FEP SSE. Text is rendered progressively using `requestAnimationFrame` to decouple bursty SSE from render cadence. Supports reasoning blocks (expandable thinking display), markdown with syntax highlighting, and source references.

One conversation per agent (no session sidebar). Background conversations continue streaming when switching between agents.

### Tool Cards

12 specialized renderers dispatched by `metadata.ui` hint from the runtime:

| UI Hint | Renderer | For |
|---------|----------|-----|
| `terminal` | TerminalCard | bash output |
| `diff` | DiffCard | edit operations (unified/split view) |
| `code` | CodeCard | read with syntax highlighting |
| `file-tree` | FileTreeCard | ls, glob results |
| `file-created` | FileCreatedCard | write operations |
| `search-results` | SearchResultsCard | grep results |
| `web-fetch` | WebFetchCard | fetch output |
| `agent-run` | AgentRunCard | run_agent orchestration |
| `kubernetes-resources` | KubernetesCard | kubectl MCP tools |
| `helm-release` | HelmCard | helm MCP tools |
| — | GenericCard | fallback |

Cards are collapsible with configurable per-tool expansion defaults.

### Permission Gates

When agents require approval (e.g., bash commands), the runtime emits `permission_asked` via FEP. The console shows a dialog with the tool input preview and three options:

- **Allow Once** — permit this invocation
- **Always Allow** — permanently allow this tool for the session
- **Deny** — block the call

### Interactive Questions

Agents can ask structured questions via the `question` tool. The console renders single/multi-select option panels with free-text fallback. Replies are sent via REST and injected into the agent's execution flow.

### Resource Browsers

Unified resource panel with drill-down navigation:

- **Git Forge Browser** — file tree, commits, branches, MRs/PRs, issues for GitHub and GitLab repos bound to the agent. Proxied through the BFF with token auth.
- **Kubernetes Browser** — namespace selection, 12 resource types (pods, deployments, statefulsets, daemonsets, jobs, cronjobs, services, ingresses, configmaps, secrets, events), resource summaries with rich metadata.
- **MCP Browser** — view MCP servers and their available tools.

Selected resources (files, commits, K8s objects, etc.) appear as chips in the composer and are sent as `ResourceContext[]` with the next prompt for per-turn context injection.

### AgentRuns

Right panel showing AgentRun CRs with filtering (all/active/completed/failed), source icons (channel/agent/schedule), cost display, duration, output preview. Auto-polls for active runs.

### Context Window Gauge

The composer shows a visual gauge of context window utilization (input tokens / model max). Color-coded green/yellow/red with known context windows for 30+ models across Anthropic, OpenAI, Google, and Mistral.

### Theming

Dual theme engine:

- **Vercel** — neutral zinc surfaces with accent on interactive elements
- **Material You** — full Material 3 tonal palette with 9 scheme variants (Tonal Spot, Neutral, Vibrant, Expressive, Fidelity, Content, Monochrome, Rainbow, Fruit Salad)

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

## API Routes

| Category | Routes | Description |
|----------|--------|-------------|
| SSE | `GET /events`, `GET /watch` | Global SSE streams (persistent) |
| Agents | `GET /agents`, `GET /agents/{ns}/{name}` | List/get agents |
| Prompts | `POST .../prompt`, `POST .../stream` | Non-streaming and streaming prompts |
| Control | `POST .../steer`, `DELETE .../abort` | Mid-execution steering |
| Interactive | `POST .../permission/{pid}/reply`, `POST .../question/{qid}/reply` | Gate replies |
| AgentRuns | `GET /agentruns`, `POST /agentruns` | List/create runs |
| Channels | `GET /channels` | List channels |
| MCPServers | `GET /mcpservers` | List MCP servers |
| Resources | `GET /agentresources`, `GET .../resources/{name}/files` | Resource catalog + forge proxy |
| K8s Browse | `GET /kubernetes/browse/namespaces/{ns}/{kind}` | Cluster resource browsing |

## Stack

### Backend

- **Go 1.26** with [chi](https://github.com/go-chi/chi) router
- **controller-runtime** v0.21 for informer-cached K8s client
- Watches 5 CRD types (Agent, AgentRun, Channel, MCPServer, AgentResource)
- SSE multiplexer with per-agent health-check connections and exponential backoff

### Frontend

- **SolidJS** 1.9 with **TypeScript** 5.9
- **Vite** 7.2 with Tailwind CSS v4
- **highlight.js** for syntax highlighting, **marked** for markdown
- **@material/material-color-utilities** for Material You theming
- **vite-plugin-pwa** for service worker and offline support

## Running

### Development

```sh
# Terminal 1: Go BFF (proxies to in-cluster agents)
go run ./cmd/console/ --dev --namespace agents

# Terminal 2: Vite dev server (hot reload, proxies /api/v1 to :8080)
cd web && npm install && npm run dev
```

### Production

```sh
cd web && npm run build
go build -o console ./cmd/console/
./console --web-dir ./web/dist --addr :8080
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--addr` | `:8080` | Listen address |
| `--namespace` | (all) | Restrict to single namespace |
| `--dev` | `false` | Relaxed CORS, debug logging |
| `--web-dir` | `web/dist` | Static asset directory |

## Container Image

```
ghcr.io/samyn92/agentops-console:<version>
ghcr.io/samyn92/agentops-console:latest
```

## Related

- [agentops-core](https://github.com/samyn92/agentops-core) — Kubernetes operator
- [agentops-runtime](https://github.com/samyn92/agentops-runtime) — Agent runtime (Fantasy SDK + Engram memory)
- [Engram](https://github.com/samyn92/engram) — Shared memory server (fork)
- [Charm Fantasy SDK](https://github.com/charmbracelet/fantasy) — AI agent framework

## License

Apache 2.0
