// Tempo trace proxy — proxies trace queries to Grafana Tempo's HTTP API.
// Resolves the Tempo URL from TEMPO_URL env var or falls back to in-cluster DNS.
package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	// defaultTempoURL is the in-cluster Tempo HTTP query API endpoint.
	defaultTempoURL = "http://tempo.observability.svc.cluster.local:3200"
)

// tempoBaseURL returns the Tempo HTTP API base URL.
func tempoBaseURL() string {
	if u := os.Getenv("TEMPO_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return defaultTempoURL
}

// GetTrace proxies a single trace lookup to Tempo.
// GET /api/v1/traces/{traceID} → Tempo GET /api/traces/{traceID}
func (h *Handlers) GetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := chi.URLParam(r, "traceID")
	if traceID == "" {
		writeError(w, http.StatusBadRequest, "traceID is required")
		return
	}

	tempoURL := fmt.Sprintf("%s/api/traces/%s", tempoBaseURL(), traceID)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, tempoURL, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}
	// Request JSON format (Tempo supports both protobuf and JSON)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "tempo unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	proxyResponse(w, resp)
}

// SearchTraces proxies a trace search to Tempo.
// GET /api/v1/traces?q=...&tags=...&limit=...&start=...&end=...
// → Tempo GET /api/search?q=...&tags=...&limit=...&start=...&end=...
//
// The console frontend uses agent-scoped queries like:
//
//	tags=agent.name=fantasy-test&limit=20
func (h *Handlers) SearchTraces(w http.ResponseWriter, r *http.Request) {
	// Forward all query parameters to Tempo's search API
	tempoURL := fmt.Sprintf("%s/api/search", tempoBaseURL())

	// Pass through query string as-is — Tempo understands the same params
	if qs := r.URL.RawQuery; qs != "" {
		tempoURL = fmt.Sprintf("%s?%s", tempoURL, qs)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, tempoURL, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "tempo unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	// For search, we need to ensure the response is JSON even if Tempo returns something else
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
