// Agent list store — tracks agents from the K8s API with live status from SSE.
import { createSignal, createResource, createEffect } from 'solid-js';
import { agents as agentsAPI } from '../lib/api';
import { agentStatuses, onResourceChanged } from './events';
import type { AgentResponse } from '../types';

export type AgentSelection = {
  namespace: string;
  name: string;
};

// ── Persistence ──

const STORAGE_KEY = 'agentops:selectedAgent';

function loadPersistedAgent(): AgentSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.namespace === 'string' && typeof parsed.name === 'string') {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

// ── State ──

const [selectedAgent, setSelectedAgent] = createSignal<AgentSelection | null>(loadPersistedAgent());
const [refetchTrigger, setRefetchTrigger] = createSignal(0);

// Persist agent selection to localStorage
createEffect(() => {
  const agent = selectedAgent();
  if (agent) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agent));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
});

// Fetch agents from API (refetches on trigger change)
const [agentList, { refetch: refetchAgents }] = createResource(
  refetchTrigger,
  async () => {
    try {
      return await agentsAPI.list();
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      return [];
    }
  },
);

// Auto-refetch when K8s resources change
onResourceChanged(() => {
  setRefetchTrigger((n) => n + 1);
});

// ── Public API ──

export { agentList, selectedAgent, setSelectedAgent, refetchAgents };

/** Get the combined status for an agent (phase from CRD + online from SSE). */
export function getAgentStatus(ns: string, name: string) {
  const key = `${ns}/${name}`;
  const sseStatus = agentStatuses()[key];
  const agent = agentList()?.find((a) => a.namespace === ns && a.name === name);
  const phase = agent?.phase || 'Unknown';

  // Online if SSE reports online, OR if the CRD phase indicates the agent is running
  const isOnline = sseStatus === 'online' || phase === 'Running';

  return {
    phase,
    sseStatus: sseStatus || 'unknown',
    isOnline,
    image: agent?.image || '',
    model: agent?.model || '',
  };
}

/** Select an agent by namespace/name. */
export function selectAgent(ns: string, name: string) {
  setSelectedAgent({ namespace: ns, name });
}
