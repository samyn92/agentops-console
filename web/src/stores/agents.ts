// Agent list store — tracks agents from the K8s API with live status from SSE.
import { createSignal, createResource } from 'solid-js';
import { agents as agentsAPI } from '../lib/api';
import { agentStatuses, onResourceChanged } from './events';
import type { AgentResponse } from '../types';

export type AgentSelection = {
  namespace: string;
  name: string;
};

// ── State ──

const [selectedAgent, setSelectedAgent] = createSignal<AgentSelection | null>(null);
const [refetchTrigger, setRefetchTrigger] = createSignal(0);

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

  return {
    phase: agent?.phase || 'Unknown',
    sseStatus: sseStatus || 'unknown',
    isOnline: sseStatus === 'online',
    runtime: agent?.runtime || 'unknown',
    model: agent?.model || '',
  };
}

/** Select an agent by namespace/name. */
export function selectAgent(ns: string, name: string) {
  setSelectedAgent({ namespace: ns, name });
}
