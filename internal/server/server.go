// HTTP server with chi router, middleware, and CORS.
package server

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/samyn92/agentops-console/internal/handlers"
	"github.com/samyn92/agentops-console/internal/k8s"
	"github.com/samyn92/agentops-console/internal/multiplexer"
)

// Config holds server configuration.
type Config struct {
	Addr   string // listen address, e.g. ":8080"
	Dev    bool   // development mode (relaxed CORS)
	WebDir string // path to static web assets (empty = no static serving)
}

// Server is the console backend HTTP server.
type Server struct {
	cfg  Config
	http *http.Server
}

// New creates a new server with all routes configured.
func New(cfg Config, k8sClient *k8s.Client, mux *multiplexer.Multiplexer) *Server {
	r := chi.NewRouter()

	// ── Middleware ──
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// CORS
	corsOpts := cors.Options{
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Requested-With"},
		AllowCredentials: true,
		MaxAge:           300,
	}
	if cfg.Dev {
		corsOpts.AllowedOrigins = []string{"*"}
	}
	r.Use(cors.Handler(corsOpts))

	// ── Handlers ──
	h := handlers.New(k8sClient, mux)

	r.Route("/api/v1", func(r chi.Router) {
		// Global SSE (no timeout — long-lived connection)
		r.Group(func(r chi.Router) {
			r.Get("/events", mux.ServeGlobalSSE)
			r.Get("/watch", h.WatchResources)
		})

		// REST endpoints (with timeout)
		r.Group(func(r chi.Router) {
			r.Use(chimw.Timeout(60 * time.Second))

			// Agents
			r.Get("/agents", h.ListAgents)
			r.Get("/agents/{ns}/{name}", h.GetAgent)
			r.Get("/agents/{ns}/{name}/status", h.GetAgentStatus)

			// Agent conversation (proxied to agent runtime — sessionless)
			r.Post("/agents/{ns}/{name}/prompt", h.AgentPrompt)
			r.Post("/agents/{ns}/{name}/stream", h.AgentPromptStream)
			r.Post("/agents/{ns}/{name}/steer", h.AgentSteer)
			r.Delete("/agents/{ns}/{name}/abort", h.AgentAbort)

			// Agent live config (proxied to agent runtime)
			r.Get("/agents/{ns}/{name}/working-memory", h.AgentGetWorkingMemory)
			r.Post("/agents/{ns}/{name}/memory/extract", h.AgentMemoryExtract)

			// Interactive control (proxied to agent runtime)
			r.Post("/agents/{ns}/{name}/permission/{pid}/reply", h.ReplyToPermission)
			r.Post("/agents/{ns}/{name}/question/{qid}/reply", h.ReplyToQuestion)

			// Agent memory (proxied to Engram)
			r.Get("/agents/{ns}/{name}/memory/enabled", h.MemoryEnabled)
			r.Get("/agents/{ns}/{name}/memory/observations", h.ListMemoryObservations)
			r.Get("/agents/{ns}/{name}/memory/observations/{obsId}", h.GetMemoryObservation)
			r.Post("/agents/{ns}/{name}/memory/observations", h.CreateMemoryObservation)
			r.Patch("/agents/{ns}/{name}/memory/observations/{obsId}", h.UpdateMemoryObservation)
			r.Delete("/agents/{ns}/{name}/memory/observations/{obsId}", h.DeleteMemoryObservation)
			r.Get("/agents/{ns}/{name}/memory/search", h.SearchMemory)
			r.Get("/agents/{ns}/{name}/memory/context", h.GetMemoryContext)
			r.Get("/agents/{ns}/{name}/memory/stats", h.GetMemoryStats)
			r.Get("/agents/{ns}/{name}/memory/sessions", h.ListMemorySessions)
			r.Get("/agents/{ns}/{name}/memory/timeline", h.GetMemoryTimeline)

			// Agent Runs
			r.Get("/agentruns", h.ListAgentRuns)
			r.Get("/agentruns/{ns}/{name}", h.GetAgentRun)
			r.Post("/agentruns", h.CreateAgentRun)

			// Channels
			r.Get("/channels", h.ListChannels)
			r.Get("/channels/{ns}/{name}", h.GetChannel)

			// Agent Tools
			r.Get("/agenttools", h.ListAgentTools)
			r.Get("/agenttools/{ns}/{name}", h.GetAgentTool)

			// Agent Resources
			r.Get("/agentresources", h.ListAgentResources)
			r.Get("/agentresources/{ns}/{name}", h.GetAgentResource)
			r.Get("/agents/{ns}/{name}/resources", h.ListAgentResourcesForAgent)

			// Resource browsing (proxy to GitHub/GitLab APIs)
			r.Get("/agents/{ns}/{name}/resources/{resName}/files", h.BrowseResourceFiles)
			r.Get("/agents/{ns}/{name}/resources/{resName}/files/content", h.BrowseResourceFileContent)
			r.Get("/agents/{ns}/{name}/resources/{resName}/commits", h.BrowseResourceCommits)
			r.Get("/agents/{ns}/{name}/resources/{resName}/branches", h.BrowseResourceBranches)
			r.Get("/agents/{ns}/{name}/resources/{resName}/mergerequests", h.BrowseResourceMergeRequests)
			r.Get("/agents/{ns}/{name}/resources/{resName}/issues", h.BrowseResourceIssues)

			// Traces (proxy to Tempo)
			r.Get("/traces", h.SearchTraces)
			r.Get("/traces/{traceID}", h.GetTrace)

			// Kubernetes (legacy — kept for backward compatibility)
			r.Get("/kubernetes/namespaces", h.ListNamespaces)
			r.Get("/kubernetes/namespaces/{ns}/pods", h.ListPods)

			// Kubernetes resource browser (enhanced)
			r.Get("/kubernetes/browse/namespaces", h.ListNamespacesEnhanced)
			r.Get("/kubernetes/browse/namespaces/{ns}/summary", h.ListNamespaceResourceSummary)
			r.Get("/kubernetes/browse/namespaces/{ns}/pods", h.ListPodsEnhanced)
			r.Get("/kubernetes/browse/namespaces/{ns}/deployments", h.ListDeployments)
			r.Get("/kubernetes/browse/namespaces/{ns}/statefulsets", h.ListStatefulSets)
			r.Get("/kubernetes/browse/namespaces/{ns}/daemonsets", h.ListDaemonSets)
			r.Get("/kubernetes/browse/namespaces/{ns}/jobs", h.ListJobs)
			r.Get("/kubernetes/browse/namespaces/{ns}/cronjobs", h.ListCronJobs)
			r.Get("/kubernetes/browse/namespaces/{ns}/services", h.ListServicesK8s)
			r.Get("/kubernetes/browse/namespaces/{ns}/ingresses", h.ListIngresses)
			r.Get("/kubernetes/browse/namespaces/{ns}/configmaps", h.ListConfigMaps)
			r.Get("/kubernetes/browse/namespaces/{ns}/secrets", h.ListSecretsMetadata)
			r.Get("/kubernetes/browse/namespaces/{ns}/events", h.ListEventsK8s)
		})
	})

	// Health check (outside /api/v1)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Static files (SPA fallback)
	if cfg.WebDir != "" {
		staticHandler := http.FileServer(http.Dir(cfg.WebDir))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			// Try static file first
			path := filepath.Join(cfg.WebDir, filepath.Clean(r.URL.Path))
			if _, err := os.Stat(path); err == nil {
				http.StripPrefix("/", staticHandler).ServeHTTP(w, r)
				return
			}
			// Fall back to index.html for SPA client-side routing
			http.ServeFile(w, r, filepath.Join(cfg.WebDir, "index.html"))
		})
	}

	return &Server{
		cfg: cfg,
		http: &http.Server{
			Addr:         cfg.Addr,
			Handler:      r,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 0, // disabled for SSE
			IdleTimeout:  120 * time.Second,
		},
	}
}

// Start begins listening. Blocks until the server stops.
func (s *Server) Start() error {
	slog.Info("HTTP server listening", "addr", s.cfg.Addr)
	return s.http.ListenAndServe()
}

// Shutdown gracefully stops the server.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}
