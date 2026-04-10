# agentops-console

## Architecture

Go Backend-for-Frontend (BFF) + SolidJS Progressive Web App.

- **BFF** (`cmd/console/main.go`) — chi router proxying K8s API, Engram, Tempo, and agent runtime pods. SSE multiplexer for real-time Fantasy Event Protocol streaming.
- **Frontend** (`web/`) — SolidJS 1.9 + Vite 7 + Tailwind 4 PWA.

### External Service Dependencies

The BFF proxies to these services (resolved via cluster DNS in dev):

| Service | DNS / Env Override | Port | Purpose |
|---------|-------------------|------|---------|
| Agent runtimes | `{name}.{ns}.svc:4096` / `AGENT_URL_OVERRIDE` | 4096 | Prompt, stream, steer, abort, working memory |
| Engram | `engram.agents.svc:7437` / `ENGRAM_URL_OVERRIDE` | 7437 | Memory observations, search, context, timeline |
| Tempo | `tempo.observability.svc:3200` / `TEMPO_URL` | 3200 | Distributed traces |
| Kubernetes API | In-cluster ServiceAccount | 443 | CRDs, pods, deployments, events |

### Key Routes (`internal/server/server.go`)

All REST under `/api/v1`:
- `/agents` — list, get, status
- `/agents/{ns}/{name}/prompt|stream|steer|abort` — proxy to agent runtime
- `/agents/{ns}/{name}/memory/*` — proxy to Engram
- `/agentruns` — list, get, create
- `/channels`, `/agenttools`, `/agentresources` — CRD browsing
- `/traces` — proxy to Tempo
- `/kubernetes/browse/*` — K8s resource browser
- `/events`, `/watch` — SSE endpoints

## Development Environment

The console dev pod runs in-cluster. See the root `AGENTS.md` for the full layout.

### Dev Workflow

Use the justfile recipes — the console pod auto-starts both Go BFF and Vite on boot:

```sh
just --justfile clusters/local_k3s/deploy/justfile <recipe>
```

| Recipe | Description |
|--------|-------------|
| `just con-reload` | Hot-reload BFF: kill Go process, rebuild, restart. Vite stays up — no frontend disruption. |
| `just con-logs` | Tail Go BFF logs (follow). |
| `just con-vite-logs` | Tail Vite dev server logs. |
| `just con-shell` | Interactive shell into the console pod. |

### Browser Access

| URL | What |
|-----|------|
| `http://localhost:30173` | Vite dev server (HMR + proxies `/api/v1` to BFF) |
| `http://localhost:30080` | Go BFF directly |

### Frontend changes

Vite watches `web/src/` — HMR is instant, no reload needed.

### Backend changes

Run `just con-reload`. This kills the Go BFF process and restarts it. Vite is the container's main process (PID 1) so it stays alive. The Vite proxy at `/api/v1` reconnects to the new BFF automatically.

### CLI Flags (`cmd/console/main.go`)

| Flag | Default | Purpose |
|------|---------|---------|
| `--addr` | `:8080` | BFF listen address |
| `--namespace` | `""` (all) | Restrict to single namespace |
| `--dev` | `false` | Dev mode: relaxed CORS, debug logging |
| `--web-dir` | `""` | Path to built SPA assets (not used in dev — Vite serves) |

### Images

| Image | Source | Purpose |
|-------|--------|---------|
| `ghcr.io/samyn92/agentops-console` | `Dockerfile` | Production image (multi-stage: Node + Go + Alpine) |
