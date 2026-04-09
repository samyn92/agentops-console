// Runs store — reactive AgentRun state with global view, pinned agent runs, and delegation map.
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

/** Runs for the currently selected agent (agentRef OR sourceRef matches).
 *  Used for the center stage TaskAgentView / context display.
 */
const contextualRuns = createMemo<AgentRunResponse[]>(() => {
  const runs = allRuns() ?? [];
  const agent = selectedAgent();

  if (!agent) return runs;
  return runs.filter(
    (r) => r.spec.agentRef === agent.name || r.spec.sourceRef === agent.name,
  );
});

/** Global runs sorted with pinned (selected agent) runs at the top.
 *  The right panel always shows all runs, but selected agent's runs are promoted.
 *  Both sections are sorted newest-first by creationTimestamp.
 */
const globalRunsSorted = createMemo<AgentRunResponse[]>(() => {
  const runs = allRuns() ?? [];
  const agent = selectedAgent();

  if (!agent) return sortNewestFirst(runs);

  // Partition: pinned (related to selected agent) vs rest
  const pinned: AgentRunResponse[] = [];
  const rest: AgentRunResponse[] = [];

  for (const r of runs) {
    if (r.spec.agentRef === agent.name || r.spec.sourceRef === agent.name) {
      pinned.push(r);
    } else {
      rest.push(r);
    }
  }

  return [...sortNewestFirst(pinned), ...sortNewestFirst(rest)];
});

/** Is a run pinned (belongs to the selected agent)? */
export function isRunPinned(run: AgentRunResponse): boolean {
  const agent = selectedAgent();
  if (!agent) return false;
  return run.spec.agentRef === agent.name || run.spec.sourceRef === agent.name;
}

/** Count of pinned runs for the selected agent. */
const pinnedRunCount = createMemo(() => {
  const agent = selectedAgent();
  if (!agent) return 0;
  const runs = allRuns() ?? [];
  return runs.filter(
    (r) => r.spec.agentRef === agent.name || r.spec.sourceRef === agent.name,
  ).length;
});

/** Runs filtered by phase filter, applied on top of the global sorted list. */
const filteredRuns = createMemo<AgentRunResponse[]>(() => {
  const runs = globalRunsSorted();
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

// ── Delegation Map ──
// Maps daemon agent names to the task agent names they have delegated to.
// Built from run history: if a run has source="agent" and sourceRef="daemon-x"
// and agentRef="task-y", then daemon-x delegates to task-y.

const delegationMap = createMemo<Record<string, string[]>>(() => {
  const runs = allRuns() ?? [];
  const map: Record<string, Set<string>> = {};

  for (const run of runs) {
    if (run.spec.source === 'agent' && run.spec.sourceRef) {
      const daemon = run.spec.sourceRef;
      const task = run.spec.agentRef;
      if (!map[daemon]) map[daemon] = new Set();
      map[daemon].add(task);
    }
  }

  // Convert Sets to Arrays
  const result: Record<string, string[]> = {};
  for (const [daemon, tasks] of Object.entries(map)) {
    result[daemon] = Array.from(tasks);
  }
  return result;
});

export function getDelegationMap(): Record<string, string[]> {
  return delegationMap();
}

// ── Helpers ──

function sortNewestFirst(runs: AgentRunResponse[]): AgentRunResponse[] {
  return [...runs].sort((a, b) => {
    const ta = new Date(a.metadata.creationTimestamp).getTime();
    const tb = new Date(b.metadata.creationTimestamp).getTime();
    return tb - ta;
  });
}

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
    case 'channel': return 'bolt';
    case 'agent': return 'brain';
    case 'schedule': return 'clock';
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
  globalRunsSorted,
  filteredRuns,
  runFilter,
  setRunFilter,
  selectedRunKey,
  setSelectedRunKey,
  activeRunCount,
  contextActiveRunCount,
  pinnedRunCount,
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
