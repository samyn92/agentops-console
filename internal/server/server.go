// HTTP server with chi router, middleware, and CORS.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
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
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
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

			// Sessions (proxied to agent runtime)
			r.Get("/agents/{ns}/{name}/sessions", h.ListSessions)
			r.Post("/agents/{ns}/{name}/sessions", h.CreateSession)
			r.Get("/agents/{ns}/{name}/sessions/{id}", h.GetSession)
			r.Delete("/agents/{ns}/{name}/sessions/{id}", h.DeleteSession)
			r.Post("/agents/{ns}/{name}/sessions/{id}/prompt", h.SessionPrompt)
			r.Post("/agents/{ns}/{name}/sessions/{id}/stream", h.SessionPromptStream)
			r.Post("/agents/{ns}/{name}/sessions/{id}/steer", h.SessionSteer)
			r.Delete("/agents/{ns}/{name}/sessions/{id}/abort", h.SessionAbort)

			// Interactive control (proxied to agent runtime)
			r.Post("/agents/{ns}/{name}/sessions/{id}/permission/{pid}/reply", h.ReplyToPermission)
			r.Post("/agents/{ns}/{name}/sessions/{id}/question/{qid}/reply", h.ReplyToQuestion)

			// Agent Runs
			r.Get("/agentruns", h.ListAgentRuns)
			r.Get("/agentruns/{ns}/{name}", h.GetAgentRun)
			r.Post("/agentruns", h.CreateAgentRun)

			// Channels
			r.Get("/channels", h.ListChannels)
			r.Get("/channels/{ns}/{name}", h.GetChannel)

			// MCP Servers
			r.Get("/mcpservers", h.ListMCPServers)
			r.Get("/mcpservers/{ns}/{name}", h.GetMCPServer)

			// Kubernetes
			r.Get("/kubernetes/namespaces", h.ListNamespaces)
			r.Get("/kubernetes/namespaces/{ns}/pods", h.ListPods)
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
			// Try static file first, fall back to index.html for SPA routing
			http.StripPrefix("/", staticHandler).ServeHTTP(w, r)
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

// WriteSSE is a helper for writing SSE events.
func WriteSSE(w http.ResponseWriter, event string, data []byte) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}
