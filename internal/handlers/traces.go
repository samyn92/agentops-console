// Tempo trace proxy — proxies trace queries to Grafana Tempo's HTTP API.
// Resolves the Tempo URL from TEMPO_URL env var or falls back to in-cluster DNS.
//
// The GetTrace handler transforms Tempo's OTLP response into a Jaeger-like
// structure that the frontend expects.
package handlers

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
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

// GetTrace fetches a single trace from Tempo and transforms the OTLP response
// into a Jaeger-like format the frontend can render.
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
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "tempo unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		proxyResponse(w, resp)
		return
	}

	// Parse the OTLP response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to read tempo response: %s", err)
		return
	}

	var otlp otlpTraceResponse
	if err := json.Unmarshal(body, &otlp); err != nil {
		writeError(w, http.StatusBadGateway, "failed to parse tempo response: %s", err)
		return
	}

	// Transform OTLP → Jaeger-like format
	jaeger := transformOTLPToJaeger(traceID, &otlp)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jaeger)
}

// SearchTraces proxies a trace search to Tempo.
// GET /api/v1/traces?q=...&tags=...&limit=...&start=...&end=...
// → Tempo GET /api/search?q=...&tags=...&limit=...&start=...&end=...
func (h *Handlers) SearchTraces(w http.ResponseWriter, r *http.Request) {
	tempoURL := fmt.Sprintf("%s/api/search", tempoBaseURL())

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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ────────────────────────────────────────────────────────────────────
// OTLP → Jaeger transformation
// ────────────────────────────────────────────────────────────────────

// OTLP response types (subset of what Tempo returns)

type otlpTraceResponse struct {
	Batches []otlpBatch `json:"batches"`
}

type otlpBatch struct {
	Resource   otlpResource    `json:"resource"`
	ScopeSpans []otlpScopeSpan `json:"scopeSpans"`
}

type otlpResource struct {
	Attributes []otlpAttribute `json:"attributes"`
}

type otlpScopeSpan struct {
	Scope otlpScope  `json:"scope"`
	Spans []otlpSpan `json:"spans"`
}

type otlpScope struct {
	Name string `json:"name"`
}

type otlpSpan struct {
	TraceID           string          `json:"traceId"`
	SpanID            string          `json:"spanId"`
	ParentSpanID      string          `json:"parentSpanId"`
	Name              string          `json:"name"`
	Kind              string          `json:"kind"`
	StartTimeUnixNano string          `json:"startTimeUnixNano"`
	EndTimeUnixNano   string          `json:"endTimeUnixNano"`
	Attributes        []otlpAttribute `json:"attributes"`
	Status            otlpStatus      `json:"status"`
	Events            []otlpEvent     `json:"events"`
}

type otlpAttribute struct {
	Key   string        `json:"key"`
	Value otlpAttrValue `json:"value"`
}

type otlpAttrValue struct {
	StringValue string  `json:"stringValue,omitempty"`
	IntValue    string  `json:"intValue,omitempty"`
	BoolValue   bool    `json:"boolValue,omitempty"`
	DoubleValue float64 `json:"doubleValue,omitempty"`
}

type otlpStatus struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

type otlpEvent struct {
	TimeUnixNano string          `json:"timeUnixNano"`
	Name         string          `json:"name"`
	Attributes   []otlpAttribute `json:"attributes"`
}

// Jaeger-like output types (what the frontend expects)

type jaegerResponse struct {
	Data []jaegerTrace `json:"data"`
}

type jaegerTrace struct {
	TraceID   string                   `json:"traceID"`
	Spans     []jaegerSpan             `json:"spans"`
	Processes map[string]jaegerProcess `json:"processes"`
}

type jaegerSpan struct {
	TraceID       string        `json:"traceID"`
	SpanID        string        `json:"spanID"`
	ParentSpanID  string        `json:"parentSpanID,omitempty"`
	OperationName string        `json:"operationName"`
	ServiceName   string        `json:"serviceName,omitempty"`
	StartTime     int64         `json:"startTime"` // microseconds since epoch
	Duration      int64         `json:"duration"`  // microseconds
	Tags          []jaegerTag   `json:"tags,omitempty"`
	Logs          []jaegerLog   `json:"logs,omitempty"`
	Status        *jaegerStatus `json:"status,omitempty"`
	ProcessID     string        `json:"processID"`
}

type jaegerTag struct {
	Key   string      `json:"key"`
	Type  string      `json:"type"`
	Value interface{} `json:"value"`
}

type jaegerLog struct {
	Timestamp int64       `json:"timestamp"`
	Fields    []jaegerTag `json:"fields"`
}

type jaegerStatus struct {
	Code    int    `json:"code"`
	Message string `json:"message,omitempty"`
}

type jaegerProcess struct {
	ServiceName string      `json:"serviceName"`
	Tags        []jaegerTag `json:"tags,omitempty"`
}

func transformOTLPToJaeger(traceID string, otlp *otlpTraceResponse) *jaegerResponse {
	trace := jaegerTrace{
		TraceID:   traceID,
		Spans:     make([]jaegerSpan, 0),
		Processes: make(map[string]jaegerProcess),
	}

	for batchIdx, batch := range otlp.Batches {
		// Extract service name from resource attributes
		processID := fmt.Sprintf("p%d", batchIdx+1)
		serviceName := "unknown"
		var processTags []jaegerTag

		for _, attr := range batch.Resource.Attributes {
			if attr.Key == "service.name" {
				serviceName = attrString(attr.Value)
			}
			processTags = append(processTags, otlpAttrToTag(attr))
		}

		trace.Processes[processID] = jaegerProcess{
			ServiceName: serviceName,
			Tags:        processTags,
		}

		for _, scopeSpan := range batch.ScopeSpans {
			for _, span := range scopeSpan.Spans {
				startNano, _ := strconv.ParseInt(span.StartTimeUnixNano, 10, 64)
				endNano, _ := strconv.ParseInt(span.EndTimeUnixNano, 10, 64)
				startMicro := startNano / 1000
				durationMicro := (endNano - startNano) / 1000
				if durationMicro < 0 {
					durationMicro = 0
				}

				js := jaegerSpan{
					TraceID:       traceID,
					SpanID:        base64ToHex(span.SpanID),
					ParentSpanID:  base64ToHex(span.ParentSpanID),
					OperationName: span.Name,
					ServiceName:   serviceName,
					StartTime:     startMicro,
					Duration:      durationMicro,
					ProcessID:     processID,
				}

				// Convert attributes to tags
				for _, attr := range span.Attributes {
					js.Tags = append(js.Tags, otlpAttrToTag(attr))
				}

				// Convert status
				if span.Status.Code != "" {
					code := 0
					switch span.Status.Code {
					case "STATUS_CODE_OK":
						code = 1
					case "STATUS_CODE_ERROR":
						code = 2
					}
					js.Status = &jaegerStatus{
						Code:    code,
						Message: span.Status.Message,
					}
				}

				// Convert events to logs
				for _, evt := range span.Events {
					evtNano, _ := strconv.ParseInt(evt.TimeUnixNano, 10, 64)
					log := jaegerLog{
						Timestamp: evtNano / 1000,
						Fields:    []jaegerTag{{Key: "event", Type: "string", Value: evt.Name}},
					}
					for _, attr := range evt.Attributes {
						log.Fields = append(log.Fields, otlpAttrToTag(attr))
					}
					js.Logs = append(js.Logs, log)
				}

				trace.Spans = append(trace.Spans, js)
			}
		}
	}

	return &jaegerResponse{
		Data: []jaegerTrace{trace},
	}
}

func otlpAttrToTag(attr otlpAttribute) jaegerTag {
	v := attr.Value
	if v.StringValue != "" {
		return jaegerTag{Key: attr.Key, Type: "string", Value: v.StringValue}
	}
	if v.IntValue != "" {
		n, _ := strconv.ParseInt(v.IntValue, 10, 64)
		return jaegerTag{Key: attr.Key, Type: "int64", Value: n}
	}
	if v.BoolValue {
		return jaegerTag{Key: attr.Key, Type: "bool", Value: v.BoolValue}
	}
	if v.DoubleValue != 0 && !math.IsNaN(v.DoubleValue) {
		return jaegerTag{Key: attr.Key, Type: "float64", Value: v.DoubleValue}
	}
	return jaegerTag{Key: attr.Key, Type: "string", Value: ""}
}

func attrString(v otlpAttrValue) string {
	if v.StringValue != "" {
		return v.StringValue
	}
	if v.IntValue != "" {
		return v.IntValue
	}
	return fmt.Sprintf("%v", v.BoolValue)
}

// base64ToHex converts a base64-encoded ID (from OTLP JSON) to a hex string
// (Jaeger convention). Returns empty string if input is empty or decode fails.
func base64ToHex(b64 string) string {
	if b64 == "" {
		return ""
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		// If it's already hex or not valid base64, return as-is
		return b64
	}
	return hex.EncodeToString(raw)
}
