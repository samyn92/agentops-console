// REST + SSE client for the console backend API.
import type {
  FEPEvent,
  AgentEventEnvelope,
  AgentResponse,
  AgentCRD,
  AgentRunResponse,
  ChannelResponse,
  AgentToolResponse,
  AgentResourceBinding,
  ResourceContext,
  RuntimeMessage,
  GitFile,
  GitCommit,
  GitBranch,
  GitMergeRequest,
  GitIssue,
  NamespaceInfo,
  PodInfo,
  K8sNamespace,
  K8sNamespaceSummary,
  K8sPod,
  K8sDeployment,
  K8sStatefulSet,
  K8sDaemonSet,
  K8sJob,
  K8sCronJob,
  K8sService,
  K8sIngress,
  K8sConfigMap,
  K8sSecret,
  K8sEvent,
  MemoryEnabledResponse,
  MemoryObservation,
  MemorySearchResult,
  MemorySession,
  MemoryContext,
  MemoryStats,
  TempoTraceResponse,
  TempoSearchResponse,
} from '../types';

const BASE = '/api/v1';

// ── Generic fetch helpers ──

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

// ── Agents ──

export const agents = {
  list: () => get<AgentResponse[]>('/agents'),
  get: (ns: string, name: string) => get<AgentCRD>(`/agents/${ns}/${name}`),
  status: (ns: string, name: string) => get<Record<string, unknown>>(`/agents/${ns}/${name}/status`),
};

// ── Agent conversation (sessionless — one conversation per agent) ──

export const conversation = {
  /** Non-streaming prompt */
  prompt: (ns: string, name: string, prompt: string) =>
    post<{ output: string; model: string }>(`/agents/${ns}/${name}/prompt`, { prompt }),

  /** Mid-execution steering */
  steer: (ns: string, name: string, message: string) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/steer`, { message }),

  /** Abort generation */
  abort: (ns: string, name: string) =>
    del<{ ok: boolean }>(`/agents/${ns}/${name}/abort`),

  /** Set sliding window size (live — no pod restart needed) */
  setWindowSize: (ns: string, name: string, size: number) =>
    patch<{ ok: boolean; window_size: number; messages: number }>(`/agents/${ns}/${name}/config/window-size`, { size }),

  /** Clear working memory (drops all messages, resets turn counter) */
  clearWorkingMemory: (ns: string, name: string) =>
    del<{ ok: boolean; window_size: number; messages: number }>(`/agents/${ns}/${name}/working-memory`),

  /** Get working memory messages (the current sliding window contents) */
  getWorkingMemory: (ns: string, name: string) =>
    get<RuntimeMessage[]>(`/agents/${ns}/${name}/working-memory`),
};

// ── Streaming prompt (returns ReadableStream for SSE) ──

export async function streamPrompt(
  ns: string,
  name: string,
  prompt: string,
  onEvent: (event: FEPEvent) => void,
  signal?: AbortSignal,
  context?: ResourceContext[],
): Promise<void> {
  const body: Record<string, unknown> = { prompt };
  if (context && context.length > 0) {
    body.context = context;
  }

  const res = await fetch(`${BASE}/agents/${ns}/${name}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data) {
          try {
            const event = JSON.parse(data) as FEPEvent;
            onEvent(event);
          } catch {
            // Skip malformed frames
          }
        }
      }
    }
  }
}

// ── Agent Runs ──

export const agentRuns = {
  list: () => get<AgentRunResponse[]>('/agentruns'),
  get: (ns: string, name: string) => get<AgentRunResponse>(`/agentruns/${ns}/${name}`),
  create: (params: {
    agentRef: string;
    prompt: string;
    sourceRef?: string;
    git?: {
      resourceRef: string;
      branch: string;
      baseBranch?: string;
    };
  }) => post<AgentRunResponse>('/agentruns', params),
};

// ── Channels ──

export const channels = {
  list: () => get<ChannelResponse[]>('/channels'),
  get: (ns: string, name: string) => get<ChannelResponse>(`/channels/${ns}/${name}`),
};

// ── Agent Tools ──

export const agentTools = {
  list: () => get<AgentToolResponse[]>('/agenttools'),
  get: (ns: string, name: string) => get<AgentToolResponse>(`/agenttools/${ns}/${name}`),
};

// ── Agent Resources ──

export const agentResources = {
  /** List all AgentResource CRs */
  list: () => get<unknown[]>('/agentresources'),

  /** Get a specific AgentResource CR */
  getResource: (ns: string, name: string) => get<unknown>(`/agentresources/${ns}/${name}`),

  /** List resources bound to a specific agent (enriched with binding metadata) */
  forAgent: (ns: string, agentName: string) =>
    get<AgentResourceBinding[]>(`/agents/${ns}/${agentName}/resources`),

  /** Browse files/tree for a browsable resource */
  files: (ns: string, agentName: string, resName: string, path?: string, ref?: string) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (ref) params.set('ref', ref);
    return get<GitFile[]>(`/agents/${ns}/${agentName}/resources/${resName}/files?${params}`);
  },

  /** Get file content */
  fileContent: (ns: string, agentName: string, resName: string, path: string, ref?: string) => {
    const params = new URLSearchParams({ path });
    if (ref) params.set('ref', ref);
    return get<unknown>(`/agents/${ns}/${agentName}/resources/${resName}/files/content?${params}`);
  },

  /** Browse commits */
  commits: (ns: string, agentName: string, resName: string, ref?: string, path?: string, page?: number) => {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (path) params.set('path', path);
    if (page) params.set('page', String(page));
    return get<GitCommit[]>(`/agents/${ns}/${agentName}/resources/${resName}/commits?${params}`);
  },

  /** Browse branches */
  branches: (ns: string, agentName: string, resName: string, page?: number) => {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    return get<GitBranch[]>(`/agents/${ns}/${agentName}/resources/${resName}/branches?${params}`);
  },

  /** Browse merge requests / pull requests */
  mergeRequests: (ns: string, agentName: string, resName: string, state?: string, page?: number) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (page) params.set('page', String(page));
    return get<GitMergeRequest[]>(`/agents/${ns}/${agentName}/resources/${resName}/mergerequests?${params}`);
  },

  /** Browse issues */
  issues: (ns: string, agentName: string, resName: string, state?: string, page?: number) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (page) params.set('page', String(page));
    return get<GitIssue[]>(`/agents/${ns}/${agentName}/resources/${resName}/issues?${params}`);
  },
};

// ── Kubernetes ──

export const kubernetes = {
  namespaces: () => get<NamespaceInfo[]>('/kubernetes/namespaces'),
  pods: (ns: string) => get<PodInfo[]>(`/kubernetes/namespaces/${ns}/pods`),
};

// ── Kubernetes Resource Browser ──

export const kubernetesBrowse = {
  namespaces: () => get<K8sNamespace[]>('/kubernetes/browse/namespaces'),
  namespaceSummary: (ns: string) => get<K8sNamespaceSummary>(`/kubernetes/browse/namespaces/${ns}/summary`),
  pods: (ns: string) => get<K8sPod[]>(`/kubernetes/browse/namespaces/${ns}/pods`),
  deployments: (ns: string) => get<K8sDeployment[]>(`/kubernetes/browse/namespaces/${ns}/deployments`),
  statefulsets: (ns: string) => get<K8sStatefulSet[]>(`/kubernetes/browse/namespaces/${ns}/statefulsets`),
  daemonsets: (ns: string) => get<K8sDaemonSet[]>(`/kubernetes/browse/namespaces/${ns}/daemonsets`),
  jobs: (ns: string) => get<K8sJob[]>(`/kubernetes/browse/namespaces/${ns}/jobs`),
  cronjobs: (ns: string) => get<K8sCronJob[]>(`/kubernetes/browse/namespaces/${ns}/cronjobs`),
  services: (ns: string) => get<K8sService[]>(`/kubernetes/browse/namespaces/${ns}/services`),
  ingresses: (ns: string) => get<K8sIngress[]>(`/kubernetes/browse/namespaces/${ns}/ingresses`),
  configmaps: (ns: string) => get<K8sConfigMap[]>(`/kubernetes/browse/namespaces/${ns}/configmaps`),
  secrets: (ns: string) => get<K8sSecret[]>(`/kubernetes/browse/namespaces/${ns}/secrets`),
  events: (ns: string) => get<K8sEvent[]>(`/kubernetes/browse/namespaces/${ns}/events`),
};

// ── Permission / Question replies ──

export const control = {
  replyPermission: (ns: string, name: string, permId: string, response: string) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/permission/${permId}/reply`, { response }),

  replyQuestion: (ns: string, name: string, qId: string, answers: string[][]) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/question/${qId}/reply`, { answers }),
};

// ── Memory (Engram) ──

export const memory = {
  /** Check if memory is enabled for an agent */
  enabled: (ns: string, name: string) =>
    get<MemoryEnabledResponse>(`/agents/${ns}/${name}/memory/enabled`),

  /** List recent observations for an agent */
  listObservations: (ns: string, name: string, opts?: { limit?: number; type?: string; scope?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.type) params.set('type', opts.type);
    if (opts?.scope) params.set('scope', opts.scope);
    const qs = params.toString();
    return get<MemoryObservation[]>(`/agents/${ns}/${name}/memory/observations${qs ? `?${qs}` : ''}`);
  },

  /** Get full observation by ID */
  getObservation: (ns: string, name: string, id: number) =>
    get<MemoryObservation>(`/agents/${ns}/${name}/memory/observations/${id}`),

  /** Create a new observation ("Remember this") */
  createObservation: (ns: string, name: string, obs: {
    type: string;
    title: string;
    content: string;
    tags?: string[];
    scope?: string;
    topic_key?: string;
  }) => post<MemoryObservation>(`/agents/${ns}/${name}/memory/observations`, obs),

  /** Update an observation */
  updateObservation: (ns: string, name: string, id: number, updates: {
    title?: string;
    content?: string;
    type?: string;
    scope?: string;
    topic_key?: string;
  }) => patch<MemoryObservation>(`/agents/${ns}/${name}/memory/observations/${id}`, updates),

  /** Delete an observation */
  deleteObservation: (ns: string, name: string, id: number, hard?: boolean) =>
    del<{ ok: boolean }>(`/agents/${ns}/${name}/memory/observations/${id}${hard ? '?hard=true' : ''}`),

  /** Full-text search across agent memories */
  search: (ns: string, name: string, query: string, opts?: { limit?: number; type?: string }) => {
    const params = new URLSearchParams({ q: query });
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.type) params.set('type', opts.type);
    return get<MemorySearchResult[]>(`/agents/${ns}/${name}/memory/search?${params.toString()}`);
  },

  /** Get recent context (sessions + observations) */
  context: (ns: string, name: string) =>
    get<MemoryContext>(`/agents/${ns}/${name}/memory/context`),

  /** Get memory stats */
  stats: (ns: string, name: string) =>
    get<MemoryStats>(`/agents/${ns}/${name}/memory/stats`),

  /** List recent Engram sessions (work periods) */
  sessions: (ns: string, name: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return get<MemorySession[]>(`/agents/${ns}/${name}/memory/sessions${qs}`);
  },

  /** Timeline around a specific observation */
  timeline: (ns: string, name: string, observationId: number, opts?: { before?: number; after?: number }) => {
    const params = new URLSearchParams({ observation_id: String(observationId) });
    if (opts?.before) params.set('before', String(opts.before));
    if (opts?.after) params.set('after', String(opts.after));
    return get<MemoryObservation[]>(`/agents/${ns}/${name}/memory/timeline?${params.toString()}`);
  },

  /** AI-assisted extraction: sends working memory to agent's model, returns structured observation */
  extract: (ns: string, name: string, opts?: { focus?: string; type?: string }) =>
    post<{ type: string; title: string; content: string; tags: string[] }>(
      `/agents/${ns}/${name}/memory/extract`,
      opts ?? {},
    ),
};

// ── Traces (Tempo proxy) ──

export const traces = {
  /** Get a single trace by ID from Tempo */
  get: (traceID: string) =>
    get<TempoTraceResponse>(`/traces/${traceID}`),

  /** Search traces with agent-scoped filters.
   *  Uses Tempo's TraceQL search API.
   *  @param agentName - filter by agent.name resource attribute
   *  @param limit - max number of results (default 20)
   *  @param start - start time as unix seconds
   *  @param end - end time as unix seconds
   */
  search: (opts?: { agentName?: string; limit?: number; start?: number; end?: number }) => {
    const params = new URLSearchParams();
    // Build a TraceQL query scoped to the agent
    if (opts?.agentName) {
      params.set('q', `{ resource.service.name = "${opts.agentName}" }`);
    }
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.start) params.set('start', String(opts.start));
    if (opts?.end) params.set('end', String(opts.end));
    const qs = params.toString();
    return get<TempoSearchResponse>(`/traces${qs ? `?${qs}` : ''}`);
  },
};

// ── Global SSE connection ──

export function connectGlobalSSE(
  onEvent: (eventType: string, data: unknown) => void,
  onError?: (error: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE}/events`);

  // Named event types from the multiplexer
  for (const type of [
    'connected',
    'agent.event',
    'resource.changed',
    'heartbeat',
  ]) {
    es.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(type, data);
      } catch {
        onEvent(type, e.data);
      }
    });
  }

  if (onError) {
    es.onerror = onError;
  }

  return es;
}
