// Runs store — reactive AgentRun state with context-aware filtering and auto-refresh via SSE.
import { createSignal, createResource, createMemo } from 'solid-js';
import { agentRuns } from '../lib/api';
import { selectedAgent } from './agents';
import { onResourceChanged } from './events';
import type { AgentRunResponse } from '../types';

// ── Types ──

export type RunFilter = 'all' | 'active' | 'completed' | 'failed';
export type RunSource = 'channel' | 'agent' | 'schedule' | 'unknown';

// ── State ──

const [runFilter, setRunFilter] = createSignal<RunFilter>('all');
const [selectedRunKey, setSelectedRunKey] = createSignal<string | null>(null);
const [refetchTrigger, setRefetchTrigger] = createSignal(0);

// Fetch all runs
const [allRuns, { refetch: refetchRuns }] = createResource(
  refetchTrigger,
  async () => {
    try {
      return await agentRuns.list();
    } catch (err) {
      console.error('Failed to fetch runs:', err);
      return [];
    }
  },
);

// Auto-refetch when K8s resources change (AgentRun CRD events)
onResourceChanged(() => {
  setRefetchTrigger((n) => n + 1);
});

// Also poll every 10s for active runs (phases like Running/Pending/Queued change frequently)
let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startRunPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    const runs = allRuns();
    if (runs?.some((r) => isActivePhase(r.status?.phase))) {
      setRefetchTrigger((n) => n + 1);
    }
  }, 10_000);
}

export function stopRunPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Derived state ──

/** Runs filtered by the currently selected agent (or all runs if no agent selected).
 *  For daemon agents: shows runs targeting the agent OR triggered by it.
 *  For task agents: shows runs targeting the agent (the task itself).
 */
const contextualRuns = createMemo<AgentRunResponse[]>(() => {
  const runs = allRuns() ?? [];
  const agent = selectedAgent();

  if (!agent) return runs;
  return runs.filter(
    (r) => r.spec.agentRef === agent.name || r.spec.sourceRef === agent.name,
  );
});

/** Runs filtered by both context and phase filter. */
const filteredRuns = createMemo<AgentRunResponse[]>(() => {
  const runs = contextualRuns();
  const filter = runFilter();

  switch (filter) {
    case 'active':
      return runs.filter((r) => isActivePhase(r.status?.phase));
    case 'completed':
      return runs.filter((r) => r.status?.phase === 'Succeeded');
    case 'failed':
      return runs.filter((r) => r.status?.phase === 'Failed');
    default:
      return runs;
  }
});

/** Count of active (non-terminal) runs across all agents. */
const activeRunCount = createMemo(() => {
  const runs = allRuns() ?? [];
  return runs.filter((r) => isActivePhase(r.status?.phase)).length;
});

/** Count of active runs for the currently selected agent. */
const contextActiveRunCount = createMemo(() => {
  return contextualRuns().filter((r) => isActivePhase(r.status?.phase)).length;
});

/** Concurrency info for the selected agent (derived from run counts). */
const concurrencyInfo = createMemo(() => {
  const agent = selectedAgent();
  if (!agent) return null;

  const agentRuns = contextualRuns();
  const running = agentRuns.filter((r) => r.status?.phase === 'Running').length;
  const queued = agentRuns.filter((r) => r.status?.phase === 'Queued').length;

  return { running, queued };
});

// ── Helpers ──

function isActivePhase(phase?: string): boolean {
  return phase === 'Pending' || phase === 'Queued' || phase === 'Running';
}

export function getRunSource(run: AgentRunResponse): RunSource {
  const source = run.spec.source?.toLowerCase();
  if (source === 'channel') return 'channel';
  if (source === 'agent') return 'agent';
  if (source === 'schedule') return 'schedule';
  return 'unknown';
}

export function getRunSourceIcon(source: RunSource): string {
  switch (source) {
    case 'channel': return 'bolt';     // lightning bolt
    case 'agent': return 'brain';      // agent-to-agent
    case 'schedule': return 'clock';   // cron
    default: return 'circle';
  }
}

/** Concurrency info for any agent by name (not just the selected one). */
export function getAgentConcurrency(agentName: string): { running: number; queued: number } {
  const runs = allRuns() ?? [];
  const agentSpecificRuns = runs.filter((r) => r.spec.agentRef === agentName);
  const running = agentSpecificRuns.filter((r) => r.status?.phase === 'Running').length;
  const queued = agentSpecificRuns.filter((r) => r.status?.phase === 'Queued').length;
  return { running, queued };
}

// ── Public API ──

export {
  allRuns,
  contextualRuns,
  filteredRuns,
  runFilter,
  setRunFilter,
  selectedRunKey,
  setSelectedRunKey,
  activeRunCount,
  contextActiveRunCount,
  concurrencyInfo,
  refetchRuns,
};

/** Select a run by namespace/name composite key. */
export function selectRun(ns: string, name: string) {
  setSelectedRunKey(`${ns}/${name}`);
}

/** Clear run selection. */
export function clearRunSelection() {
  setSelectedRunKey(null);
}

/** Force refresh the run list. */
export function refreshRuns() {
  setRefetchTrigger((n) => n + 1);
}
