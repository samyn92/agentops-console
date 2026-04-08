// Engram memory proxy — resolves per-agent Engram URL from the Agent CR and proxies
// HTTP requests to the Engram REST API.
package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	agentsv1alpha1 "github.com/samyn92/agenticops-core/api/v1alpha1"

	"github.com/samyn92/agentops-console/internal/k8s"
)

// engramDefaultPort is the default port Engram serves on.
const engramDefaultPort = 7437

// resolveEngramURL determines the Engram HTTP URL for an agent by reading spec.memory.serverRef.
// Resolution order:
//  1. ENGRAM_URL_OVERRIDE env var (dev mode)
//  2. Look up AgentTool CR by serverRef name → use status.serviceURL if available
//  3. Fallback: http://{serverRef}.{ns}.svc:7437 (for manually deployed Engram)
//
// Returns ("", "") if the agent has no memory configured.
func resolveEngramURL(ctx context.Context, k8sClient *k8s.Client, agent *agentsv1alpha1.Agent) (engramURL string, project string) {
	if agent.Spec.Memory == nil || agent.Spec.Memory.ServerRef == "" {
		return "", ""
	}

	serverRef := agent.Spec.Memory.ServerRef
	ns := agent.Namespace

	project = agent.Spec.Memory.Project
	if project == "" {
		project = agent.Name
	}

	// Dev override
	if override := os.Getenv("ENGRAM_URL_OVERRIDE"); override != "" {
		return override, project
	}

	// Try AgentTool CR lookup
	tool, err := k8sClient.GetAgentTool(ctx, ns, serverRef)
	if err == nil && tool != nil && tool.Status.ServiceURL != "" {
		slog.Debug("resolved engram URL from AgentTool CR", "serverRef", serverRef, "url", tool.Status.ServiceURL)
		return tool.Status.ServiceURL, project
	}

	// Also try in the agents namespace if the agent is elsewhere
	if ns != "agents" {
		tool, err = k8sClient.GetAgentTool(ctx, "agents", serverRef)
		if err == nil && tool != nil && tool.Status.ServiceURL != "" {
			slog.Debug("resolved engram URL from AgentTool CR (agents namespace)", "serverRef", serverRef, "url", tool.Status.ServiceURL)
			return tool.Status.ServiceURL, project
		}
	}

	// Fallback: assume manually deployed service
	url := fmt.Sprintf("http://%s.%s.svc:%d", serverRef, ns, engramDefaultPort)
	slog.Debug("resolved engram URL via fallback", "serverRef", serverRef, "url", url)
	return url, project
}

// engramClient is a reusable HTTP client for Engram requests.
var engramClient = &http.Client{Timeout: 15 * time.Second}

// proxyToEngram proxies a request to the Engram REST API for a specific agent.
// It resolves the Engram URL, adds the project query parameter, and forwards the request.
func proxyToEngram(
	ctx context.Context,
	k8sClient *k8s.Client,
	agent *agentsv1alpha1.Agent,
	method string,
	engramPath string,
	body io.Reader,
	extraQuery map[string]string,
) (*http.Response, error) {
	engramURL, project := resolveEngramURL(ctx, k8sClient, agent)
	if engramURL == "" {
		return nil, fmt.Errorf("agent %s/%s has no memory configured", agent.Namespace, agent.Name)
	}

	// Build URL with query parameters
	url := engramURL + engramPath

	params := []string{}
	// Add project param for endpoints that scope by project
	needsProject := strings.HasSuffix(engramPath, "/recent") ||
		engramPath == "/search" ||
		engramPath == "/context" ||
		engramPath == "/stats"
	if needsProject && project != "" {
		params = append(params, fmt.Sprintf("project=%s", project))
	}
	for k, v := range extraQuery {
		params = append(params, fmt.Sprintf("%s=%s", k, v))
	}
	if len(params) > 0 {
		url += "?" + strings.Join(params, "&")
	}

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	slog.Debug("proxying to engram", "method", method, "url", url)
	return engramClient.Do(req)
}
