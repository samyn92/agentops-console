// AgentResource handlers — list/get resources + proxy to GitHub/GitLab APIs for browsing.
package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	agentsv1alpha1 "github.com/samyn92/agenticops-core/api/v1alpha1"
)

// ── AgentResource CRUD ──

func (h *Handlers) ListAgentResources(w http.ResponseWriter, r *http.Request) {
	resources, err := h.k8s.ListAgentResources(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent resources: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, resources.Items)
}

func (h *Handlers) GetAgentResource(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	res, err := h.k8s.GetAgentResource(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent resource not found: %s", err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ListAgentResourcesForAgent returns the resources bound to a specific agent.
func (h *Handlers) ListAgentResourcesForAgent(w http.ResponseWriter, r *http.Request) {
	ns := chi.URLParam(r, "ns")
	name := chi.URLParam(r, "name")

	agent, err := h.k8s.GetAgent(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found: %s", err)
		return
	}

	resources, err := h.k8s.ListAgentResourcesForAgent(r.Context(), agent)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list resources for agent: %s", err)
		return
	}

	// Build response with binding metadata
	type resourceWithBinding struct {
		Name        string `json:"name"`
		Namespace   string `json:"namespace"`
		Kind        string `json:"kind"`
		DisplayName string `json:"displayName"`
		Description string `json:"description,omitempty"`
		Phase       string `json:"phase"`
		ReadOnly    bool   `json:"readOnly"`
		AutoContext bool   `json:"autoContext"`
		// Kind-specific config (flattened for frontend)
		GitHub         *agentsv1alpha1.GitHubResourceConfig      `json:"github,omitempty"`
		GitHubOrg      *agentsv1alpha1.GitHubOrgResourceConfig   `json:"githubOrg,omitempty"`
		GitLab         *agentsv1alpha1.GitLabResourceConfig      `json:"gitlab,omitempty"`
		GitLabGroup    *agentsv1alpha1.GitLabGroupResourceConfig `json:"gitlabGroup,omitempty"`
		HasCredentials bool                                      `json:"hasCredentials"`
	}

	// Build binding lookup
	bindingMap := make(map[string]agentsv1alpha1.AgentResourceBinding, len(agent.Spec.ResourceBindings))
	for _, b := range agent.Spec.ResourceBindings {
		bindingMap[b.Name] = b
	}

	resp := make([]resourceWithBinding, 0, len(resources))
	for _, res := range resources {
		binding := bindingMap[res.Name]
		entry := resourceWithBinding{
			Name:           res.Name,
			Namespace:      res.Namespace,
			Kind:           string(res.Spec.Kind),
			DisplayName:    res.Spec.DisplayName,
			Description:    res.Spec.Description,
			Phase:          string(res.Status.Phase),
			ReadOnly:       binding.ReadOnly,
			AutoContext:    binding.AutoContext,
			GitHub:         res.Spec.GitHub,
			GitHubOrg:      res.Spec.GitHubOrg,
			GitLab:         res.Spec.GitLab,
			GitLabGroup:    res.Spec.GitLabGroup,
			HasCredentials: res.Spec.Credentials != nil,
		}
		resp = append(resp, entry)
	}

	writeJSON(w, http.StatusOK, resp)
}

// ── Git Forge Proxy Endpoints ──
// These proxy requests to GitHub/GitLab APIs using credentials from the AgentResource's secret.

// BrowseResourceFiles proxies a file/tree browse request.
// GET /agents/{ns}/{name}/resources/{resName}/files?path=&ref=
func (h *Handlers) BrowseResourceFiles(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	path := r.URL.Query().Get("path")
	ref := r.URL.Query().Get("ref")

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/contents/%s?ref=%s",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo,
			url.PathEscape(path), url.QueryEscape(refOrDefault(ref, res.Spec.GitHub.DefaultBranch)),
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/repository/tree?path=%s&ref=%s&per_page=100",
			projectID, url.QueryEscape(path), url.QueryEscape(refOrDefault(ref, res.Spec.GitLab.DefaultBranch)),
		))
	default:
		writeError(w, http.StatusBadRequest, "file browsing not supported for kind %s", res.Spec.Kind)
	}
}

// BrowseResourceFileContent returns the content of a specific file.
// GET /agents/{ns}/{name}/resources/{resName}/files/content?path=&ref=
func (h *Handlers) BrowseResourceFileContent(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	path := r.URL.Query().Get("path")
	ref := r.URL.Query().Get("ref")

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/contents/%s?ref=%s",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo,
			url.PathEscape(path), url.QueryEscape(refOrDefault(ref, res.Spec.GitHub.DefaultBranch)),
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/repository/files/%s?ref=%s",
			projectID, url.PathEscape(path), url.QueryEscape(refOrDefault(ref, res.Spec.GitLab.DefaultBranch)),
		))
	default:
		writeError(w, http.StatusBadRequest, "file content not supported for kind %s", res.Spec.Kind)
	}
}

// BrowseResourceCommits proxies commit listing.
// GET /agents/{ns}/{name}/resources/{resName}/commits?ref=&path=&page=
func (h *Handlers) BrowseResourceCommits(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	ref := r.URL.Query().Get("ref")
	path := r.URL.Query().Get("path")
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		q := fmt.Sprintf("sha=%s&per_page=30&page=%s",
			url.QueryEscape(refOrDefault(ref, res.Spec.GitHub.DefaultBranch)), page)
		if path != "" {
			q += "&path=" + url.QueryEscape(path)
		}
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/commits?%s",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo, q,
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		q := fmt.Sprintf("ref_name=%s&per_page=30&page=%s",
			url.QueryEscape(refOrDefault(ref, res.Spec.GitLab.DefaultBranch)), page)
		if path != "" {
			q += "&path=" + url.QueryEscape(path)
		}
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/repository/commits?%s",
			projectID, q,
		))
	default:
		writeError(w, http.StatusBadRequest, "commit browsing not supported for kind %s", res.Spec.Kind)
	}
}

// BrowseResourceBranches proxies branch listing.
// GET /agents/{ns}/{name}/resources/{resName}/branches?page=
func (h *Handlers) BrowseResourceBranches(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/branches?per_page=30&page=%s",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo, page,
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/repository/branches?per_page=30&page=%s",
			projectID, page,
		))
	default:
		writeError(w, http.StatusBadRequest, "branch browsing not supported for kind %s", res.Spec.Kind)
	}
}

// BrowseResourceMergeRequests proxies MR/PR listing.
// GET /agents/{ns}/{name}/resources/{resName}/mergerequests?state=&page=
func (h *Handlers) BrowseResourceMergeRequests(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	state := r.URL.Query().Get("state")
	if state == "" {
		state = "open"
	}
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		// GitHub uses "open"/"closed"/"all"
		ghState := state
		if state == "merged" {
			ghState = "closed" // GitHub doesn't have "merged" state, we filter client-side
		}
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/pulls?state=%s&per_page=30&page=%s&sort=updated&direction=desc",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo, ghState, page,
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		// GitLab uses "opened"/"closed"/"merged"/"all"
		glState := state
		if state == "open" {
			glState = "opened"
		}
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/merge_requests?state=%s&per_page=30&page=%s&order_by=updated_at",
			projectID, glState, page,
		))
	default:
		writeError(w, http.StatusBadRequest, "merge request browsing not supported for kind %s", res.Spec.Kind)
	}
}

// BrowseResourceIssues proxies issue listing.
// GET /agents/{ns}/{name}/resources/{resName}/issues?state=&page=
func (h *Handlers) BrowseResourceIssues(w http.ResponseWriter, r *http.Request) {
	res, token, err := h.resolveResourceAndToken(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%s", err)
		return
	}

	state := r.URL.Query().Get("state")
	if state == "" {
		state = "open"
	}
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}

	switch res.Spec.Kind {
	case agentsv1alpha1.AgentResourceKindGitHubRepo:
		h.proxyGitHubAPI(w, r, token, res.Spec.GitHub, fmt.Sprintf(
			"/repos/%s/%s/issues?state=%s&per_page=30&page=%s&sort=updated&direction=desc",
			res.Spec.GitHub.Owner, res.Spec.GitHub.Repo, state, page,
		))
	case agentsv1alpha1.AgentResourceKindGitLabProject:
		projectID := url.PathEscape(res.Spec.GitLab.Project)
		glState := state
		if state == "open" {
			glState = "opened"
		}
		h.proxyGitLabAPI(w, r, token, res.Spec.GitLab.BaseURL, fmt.Sprintf(
			"/api/v4/projects/%s/issues?state=%s&per_page=30&page=%s&order_by=updated_at",
			projectID, glState, page,
		))
	default:
		writeError(w, http.StatusBadRequest, "issue browsing not supported for kind %s", res.Spec.Kind)
	}
}

// ── Helpers ──

// resolveResourceAndToken gets the AgentResource and its API token from the K8s secret.
func (h *Handlers) resolveResourceAndToken(r *http.Request) (*agentsv1alpha1.AgentResource, string, error) {
	ns := chi.URLParam(r, "ns")
	resName := chi.URLParam(r, "resName")

	res, err := h.k8s.GetAgentResource(r.Context(), ns, resName)
	if err != nil {
		return nil, "", fmt.Errorf("resource not found: %w", err)
	}

	if res.Status.Phase != agentsv1alpha1.AgentResourcePhaseReady {
		return nil, "", fmt.Errorf("resource %s is not ready (phase: %s)", resName, res.Status.Phase)
	}

	token, err := h.k8s.GetAgentResourceCredentials(r.Context(), ns, res)
	if err != nil {
		slog.Warn("no credentials for resource, proceeding without auth", "resource", resName, "error", err)
		token = ""
	}

	return res, token, nil
}

func (h *Handlers) proxyGitHubAPI(w http.ResponseWriter, r *http.Request, token string, cfg *agentsv1alpha1.GitHubResourceConfig, path string) {
	baseURL := "https://api.github.com"
	if cfg != nil && cfg.APIURL != "" {
		baseURL = strings.TrimRight(cfg.APIURL, "/")
	}

	apiURL := baseURL + path
	req, err := http.NewRequestWithContext(r.Context(), "GET", apiURL, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "GitHub API unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	// Forward the response as-is
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (h *Handlers) proxyGitLabAPI(w http.ResponseWriter, r *http.Request, token string, baseURL string, path string) {
	apiURL := strings.TrimRight(baseURL, "/") + path
	req, err := http.NewRequestWithContext(r.Context(), "GET", apiURL, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request: %s", err)
		return
	}

	if token != "" {
		req.Header.Set("PRIVATE-TOKEN", token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "GitLab API unreachable: %s", err)
		return
	}
	defer resp.Body.Close()

	// Forward the response as-is
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func refOrDefault(ref, defaultBranch string) string {
	if ref != "" {
		return ref
	}
	if defaultBranch != "" {
		return defaultBranch
	}
	return "main"
}

// Suppress unused import warning for json (used in future enrichment)
var _ = json.Marshal
