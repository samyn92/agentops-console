// REST + SSE client for the console backend API.
import type {
  FEPEvent,
  AgentEventEnvelope,
  AgentResponse,
  AgentRunResponse,
  ChannelResponse,
  MCPServerResponse,
  Session,
  RuntimeMessage,
  NamespaceInfo,
  PodInfo,
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

// ── Agents ──

export const agents = {
  list: () => get<AgentResponse[]>('/agents'),
  get: (ns: string, name: string) => get<AgentResponse>(`/agents/${ns}/${name}`),
  status: (ns: string, name: string) => get<Record<string, unknown>>(`/agents/${ns}/${name}/status`),
};

// ── Sessions (proxied to agent runtime) ──

export const sessions = {
  list: (ns: string, name: string) =>
    get<Session[]>(`/agents/${ns}/${name}/sessions`),

  create: (ns: string, name: string, title?: string) =>
    post<{ id: string; title: string }>(`/agents/${ns}/${name}/sessions`, { title }),

  get: (ns: string, name: string, id: string) =>
    get<Session>(`/agents/${ns}/${name}/sessions/${id}`),

  delete: (ns: string, name: string, id: string) =>
    del<{ ok: boolean }>(`/agents/${ns}/${name}/sessions/${id}`),

  messages: (ns: string, name: string, id: string) =>
    get<RuntimeMessage[]>(`/agents/${ns}/${name}/sessions/${id}/messages`),

  prompt: (ns: string, name: string, id: string, prompt: string) =>
    post<{ output: string; model: string }>(`/agents/${ns}/${name}/sessions/${id}/prompt`, { prompt }),

  steer: (ns: string, name: string, id: string, message: string) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/sessions/${id}/steer`, { message }),

  abort: (ns: string, name: string, id: string) =>
    del<{ ok: boolean }>(`/agents/${ns}/${name}/sessions/${id}/abort`),
};

// ── Streaming prompt (returns ReadableStream for SSE) ──

export async function streamPrompt(
  ns: string,
  name: string,
  sessionId: string,
  prompt: string,
  onEvent: (event: FEPEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/agents/${ns}/${name}/sessions/${sessionId}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ prompt }),
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
};

// ── Channels ──

export const channels = {
  list: () => get<ChannelResponse[]>('/channels'),
  get: (ns: string, name: string) => get<ChannelResponse>(`/channels/${ns}/${name}`),
};

// ── MCP Servers ──

export const mcpServers = {
  list: () => get<MCPServerResponse[]>('/mcpservers'),
  get: (ns: string, name: string) => get<MCPServerResponse>(`/mcpservers/${ns}/${name}`),
};

// ── Kubernetes ──

export const kubernetes = {
  namespaces: () => get<NamespaceInfo[]>('/kubernetes/namespaces'),
  pods: (ns: string) => get<PodInfo[]>(`/kubernetes/namespaces/${ns}/pods`),
};

// ── Permission / Question replies ──

export const control = {
  replyPermission: (ns: string, name: string, sessionId: string, permId: string, response: string) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/sessions/${sessionId}/permission/${permId}/reply`, { response }),

  replyQuestion: (ns: string, name: string, sessionId: string, qId: string, answers: string[][]) =>
    post<{ ok: boolean }>(`/agents/${ns}/${name}/sessions/${sessionId}/question/${qId}/reply`, { answers }),
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
    'agent.online',
    'agent.offline',
    'agent.status',
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
