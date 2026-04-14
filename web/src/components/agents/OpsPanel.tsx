// OpsPanel — full-canvas operations view for orchestrator agents.
// Third tab in OrchestratorDetailView: [Chat] [Ops] [Agent]
// Shows fleet overview, delegation tree with recursive drilldown,
// delegation history, and aggregate token/cost economics.
import { Show, For, createSignal, createMemo, createResource } from 'solid-js';
import { selectedAgent, agentList, getDelegationTargetsFor, getAgentRuntimeStatus, agentHealth } from '../../stores/agents';
import {
  getWorkerAgentsFor,
  getAgentConcurrency,
  getAgentRuns,
  getRunsDelegatedBy,
  getDelegationGroupsBy,
} from '../../stores/runs';
import { agents as agentsAPI, memory as memoryAPI } from '../../lib/api';
import { showTraceDetail } from '../../stores/view';
import { relativeTime, formatTokens, formatCost } from '../../lib/format';
import RunPhaseIcon from '../shared/RunPhaseIcon';
import type { AgentResponse, AgentCRD, AgentRunResponse, RuntimeStatus, MemoryStats } from '../../types';

// ── Main Panel ──

export default function OpsPanel() {
  const agent = () => selectedAgent();
  const agentName = () => agent()?.name ?? '';
  const agentNs = () => agent()?.namespace ?? 'agents';

  // Lifted selection state — only one detail card open at a time across the whole tree
  const [selectedTreeNode, setSelectedTreeNode] = createSignal<string | null>(null);
  const toggleTreeNode = (name: string) => {
    setSelectedTreeNode(prev => prev === name ? null : name);
  };

  // Direct workers (from delegation history)
  const workerNames = createMemo(() => getWorkerAgentsFor(agentName()));

  // Delegation targets (potential workers)
  const targets = createMemo(() => getDelegationTargetsFor(agentName(), agentNs()));

  // All delegated runs (for summary stats)
  const delegatedRuns = createMemo(() => getRunsDelegatedBy(agentName()));

  const totalActiveRuns = createMemo(() =>
    delegatedRuns().filter(r => {
      const p = r.status?.phase;
      return p === 'Running' || p === 'Pending' || p === 'Queued';
    }).length
  );

  const totalSucceeded = createMemo(() =>
    delegatedRuns().filter(r => r.status?.phase === 'Succeeded').length
  );

  const totalFailed = createMemo(() =>
    delegatedRuns().filter(r => r.status?.phase === 'Failed').length
  );

  const totalDelegations = () => delegatedRuns().length;

  // Aggregate token/cost stats across all delegated runs
  const aggregateStats = createMemo(() => {
    let totalTokens = 0;
    let totalCost = 0;
    for (const r of delegatedRuns()) {
      if (r.status?.tokensUsed) totalTokens += r.status.tokensUsed;
      if (r.status?.cost) totalCost += r.status.cost;
    }
    return { totalTokens, totalCost };
  });

  // Delegation groups for history
  const delegationGroups = createMemo(() => getDelegationGroupsBy(agentName()));

  return (
    <div class="h-full overflow-y-auto overscroll-contain">
      <div class="max-w-4xl mx-auto px-6 py-5 space-y-6">

        {/* ── Fleet Summary Strip ── */}
        <div class="rounded-xl border border-border bg-surface overflow-hidden">
          <div class="px-4 py-3 border-b border-border-subtle">
            <div class="flex items-center gap-3">
              <h3 class="text-xs font-semibold text-text uppercase tracking-wider">Fleet Overview</h3>
              <span class="flex-1" />
              <Show when={totalActiveRuns() > 0}>
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-accent/15 text-accent border border-accent/25 animate-pulse">
                  {totalActiveRuns()} active
                </span>
              </Show>
              <span class="text-[11px] font-mono text-text-muted tabular-nums">
                {workerNames().length} used / {targets().length} available
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div class="grid grid-cols-5 gap-px bg-border-subtle">
            <FleetStat label="Delegations" value={totalDelegations()} />
            <FleetStat label="Active" value={totalActiveRuns()} accent={totalActiveRuns() > 0} />
            <FleetStat label="Succeeded" value={totalSucceeded()} success={totalSucceeded() > 0} />
            <FleetStat label="Failed" value={totalFailed()} error={totalFailed() > 0} />
            <FleetStat
              label="Tokens"
              value={aggregateStats().totalTokens > 0 ? formatTokens(aggregateStats().totalTokens) : '\u2014'}
            />
          </div>

          <Show when={aggregateStats().totalCost > 0}>
            <div class="px-4 py-2 border-t border-border-subtle text-[11px] text-text-muted">
              Total cost: <span class="font-mono text-text-secondary">{formatCost(aggregateStats().totalCost)}</span>
            </div>
          </Show>
        </div>

        {/* ── Delegation Tree ── */}
        <div class="rounded-xl border border-border bg-surface overflow-hidden">
          <div class="px-4 py-3 border-b border-border-subtle">
            <h3 class="text-xs font-semibold text-text uppercase tracking-wider">Delegation Tree</h3>
          </div>

          <div class="px-3 py-2 space-y-0.5">
            {/* Active workers (used in delegation history) */}
            <Show when={workerNames().length > 0}>
              <For each={workerNames()}>
                {(name) => (
                  <AgentTreeNode
                    name={name}
                    namespace={agentNs()}
                    depth={0}
                    parentName={agentName()}
                    selectedNode={selectedTreeNode()}
                    onSelectNode={toggleTreeNode}
                  />
                )}
              </For>
            </Show>

            {/* Standby workers (available but unused) */}
            <Show when={targets().filter(t => !workerNames().includes(t.name)).length > 0}>
              <div class="pt-3 mt-3 border-t border-border-subtle">
                <span class="text-[10px] text-text-muted font-medium uppercase tracking-wider px-2">Standby</span>
                <div class="mt-1.5 space-y-0.5">
                  <For each={targets().filter(t => !workerNames().includes(t.name))}>
                    {(target) => <StandbyNode agent={target} />}
                  </For>
                </div>
              </div>
            </Show>

            {/* Empty state */}
            <Show when={workerNames().length === 0 && targets().length === 0}>
              <div class="flex flex-col items-center justify-center py-8 text-center">
                <p class="text-sm text-text-muted">No delegation targets discovered.</p>
                <p class="text-xs text-text-muted/70 mt-1">Add agents to this orchestrator's team roster to enable delegation.</p>
              </div>
            </Show>
          </div>
        </div>

        {/* ── Recent Delegated Runs ── */}
        <Show when={delegatedRuns().length > 0}>
          <div class="rounded-xl border border-border bg-surface overflow-hidden">
            <div class="px-4 py-3 border-b border-border-subtle">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-semibold text-text uppercase tracking-wider">Delegation History</h3>
                <span class="flex-1" />
                <span class="text-[11px] font-mono text-text-muted">{delegatedRuns().length} runs</span>
              </div>
            </div>
            <div class="max-h-[400px] overflow-y-auto">
              <div class="px-2 py-1.5 space-y-0.5">
                <For each={delegatedRuns().slice(0, 30)}>
                  {(run) => <DelegationRunRow run={run} />}
                </For>
              </div>
            </div>
          </div>
        </Show>

      </div>
    </div>
  );
}

// ── Fleet Stat Cell ──

function FleetStat(props: { label: string; value: string | number; accent?: boolean; success?: boolean; error?: boolean }) {
  const valueClass = () => {
    if (props.accent) return 'text-accent';
    if (props.success) return 'text-success';
    if (props.error) return 'text-error';
    return 'text-text';
  };
  return (
    <div class="flex flex-col items-center py-3 px-2 bg-surface">
      <span class={`text-sm font-mono font-semibold tabular-nums ${valueClass()}`}>
        {props.value}
      </span>
      <span class="text-[9px] text-text-muted uppercase tracking-wider mt-1">{props.label}</span>
    </div>
  );
}

// ── Delegation Run Row ──

function DelegationRunRow(props: { run: AgentRunResponse }) {
  const run = () => props.run;
  const isRunning = () => run().status?.phase === 'Running';

  const duration = createMemo(() => {
    if (!run().status?.startTime || !run().status?.completionTime) return null;
    const ms = new Date(run().status!.completionTime!).getTime() - new Date(run().status!.startTime!).getTime();
    const sec = ms / 1000;
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  });

  return (
    <div class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] hover:bg-surface-hover transition-colors ${
      isRunning() ? 'bg-accent/5' : ''
    }`}>
      <RunPhaseIcon phase={run().status?.phase} />
      <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary border border-border-subtle flex-shrink-0 font-mono">
        {run().spec.agentRef}
      </span>
      <span class="text-text-secondary truncate flex-1" title={run().spec.prompt}>
        {run().spec.prompt?.slice(0, 80) || run().metadata.name}
      </span>
      <Show when={run().status?.tokensUsed}>
        <span class="text-[10px] font-mono text-text-muted flex-shrink-0">{formatTokens(run().status!.tokensUsed!)}</span>
      </Show>
      <Show when={duration()}>
        <span class="text-[10px] font-mono text-text-muted flex-shrink-0">{duration()}</span>
      </Show>
      <Show when={run().status?.traceID}>
        <button
          class="text-[10px] font-mono text-info hover:text-info/80 transition-colors flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            showTraceDetail(run().status!.traceID!);
          }}
        >
          trace
        </button>
      </Show>
      <span class="text-[10px] text-text-muted flex-shrink-0">{relativeTime(run().metadata.creationTimestamp)}</span>
    </div>
  );
}

// ── Agent Tree Node (recursive, expandable) ──

function AgentTreeNode(props: {
  name: string;
  namespace: string;
  depth: number;
  parentName: string;
  selectedNode: string | null;
  onSelectNode: (name: string) => void;
  /** Ancestor names for cycle detection */
  ancestors?: Set<string>;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const detailOpen = () => props.selectedNode === props.name;

  const agentInfo = createMemo(() => {
    const list = agentList() ?? [];
    return list.find(a => a.name === props.name);
  });

  // Full CRD (lazy-loaded on detail open)
  const [crd] = createResource(
    () => detailOpen() ? agentInfo() : null,
    async (info) => {
      if (!info) return null;
      try { return await agentsAPI.get(info.namespace, info.name) as AgentCRD; }
      catch { return null; }
    },
  );

  // Memory stats (lazy-loaded)
  const [memStats] = createResource(
    () => detailOpen() && agentInfo() ? { ns: agentInfo()!.namespace, name: agentInfo()!.name } : null,
    async (params) => {
      if (!params) return null;
      try { return await memoryAPI.stats(params.ns, params.name) as MemoryStats; }
      catch { return null; }
    },
  );

  // Runtime health
  const health = () => {
    const info = agentInfo();
    if (!info) return null;
    const key = `${info.namespace}/${info.name}`;
    return agentHealth()[key];
  };

  const runtimeStatus = (): RuntimeStatus | null => health()?.status ?? null;
  const isReachable = () => health()?.reachable ?? false;
  const isBusy = () => runtimeStatus()?.busy ?? false;

  const concurrency = () => getAgentConcurrency(props.name);
  const isActive = () => concurrency().running > 0 || concurrency().queued > 0;

  const recentRuns = createMemo(() => getAgentRuns(props.name, 10));

  const successRate = createMemo(() => {
    const runs = recentRuns();
    const ok = runs.filter(r => r.status?.phase === 'Succeeded').length;
    const fail = runs.filter(r => r.status?.phase === 'Failed').length;
    const total = ok + fail;
    if (total === 0) return null;
    return Math.round((ok / total) * 100);
  });

  // Cycle detection: build ancestor set for children
  const ancestorSet = createMemo(() => {
    const s = new Set(props.ancestors ?? []);
    s.add(props.name);
    return s;
  });

  const childWorkers = createMemo(() => {
    const children = getWorkerAgentsFor(props.name);
    // Filter out ancestors to prevent infinite recursion
    return children.filter(c => !ancestorSet().has(c));
  });
  const hasChildren = () => childWorkers().length > 0;

  const latestRun = () => recentRuns()[0] ?? null;

  // Phase sparkline (last 8 runs)
  const sparkline = createMemo(() => {
    return recentRuns().slice(0, 8).reverse().map(r => r.status?.phase ?? 'Unknown');
  });

  const statusColor = () => {
    if (isBusy()) return 'bg-accent shadow-[0_0_6px_rgba(var(--accent-rgb,59,130,246),0.4)]';
    if (isActive()) return 'bg-accent';
    if (isReachable()) return 'bg-success';
    return 'bg-text-muted/40';
  };

  const statusLabel = () => {
    if (isBusy()) return 'Busy';
    if (isActive()) return `${concurrency().running}r`;
    if (isReachable()) return 'Idle';
    return 'Off';
  };

  const statusLabelColor = () => {
    if (isBusy()) return 'text-accent font-bold';
    if (isActive()) return 'text-accent';
    if (isReachable()) return 'text-success';
    return 'text-text-muted';
  };

  const indent = () => props.depth * 20;

  return (
    <div>
      {/* Main node row — entire row is clickable to toggle detail */}
      <div
        class={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors hover:bg-surface-hover cursor-pointer ${
          detailOpen() ? 'bg-surface-hover' : ''
        }`}
        style={{ 'padding-left': `${8 + indent()}px` }}
        onClick={() => props.onSelectNode(props.name)}
      >
        {/* Tree connector */}
        <Show when={props.depth > 0}>
          <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0 -ml-1" viewBox="0 0 12 12">
            <path d="M2 0 L2 6 L10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </Show>

        {/* Expand children toggle */}
        <Show when={hasChildren()} fallback={<span class="w-4 flex-shrink-0" />}>
          <button
            class="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-muted hover:text-text transition-colors rounded"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded()); }}
          >
            <svg
              class={`w-3 h-3 transition-transform duration-150 ${expanded() ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </Show>

        {/* Status dot */}
        <div class={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-300 ${statusColor()} ${isBusy() ? 'animate-pulse' : ''}`} />

        {/* Agent name */}
        <span class={`text-xs font-semibold truncate transition-colors ${detailOpen() ? 'text-accent' : 'text-text'}`}>
          {props.name}
        </span>

        {/* Mode badge */}
        <Show when={agentInfo()?.mode}>
          <span class={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-medium ${
            agentInfo()!.mode === 'daemon'
              ? 'bg-info/10 text-info border border-info/15'
              : 'bg-surface-3 text-text-secondary border border-border-subtle'
          }`}>
            {agentInfo()!.mode}
          </span>
        </Show>

        {/* Status label */}
        <span class={`text-[10px] font-mono flex-shrink-0 ${statusLabelColor()}`}>
          {statusLabel()}
        </span>

        {/* Run sparkline */}
        <Show when={sparkline().length > 0}>
          <div class="flex items-center gap-0.5 flex-shrink-0 ml-auto">
            <For each={sparkline()}>
              {(phase) => (
                <div class={`w-1.5 h-4 rounded-sm ${
                  phase === 'Succeeded' ? 'bg-success/70'
                  : phase === 'Failed' ? 'bg-error/70'
                  : phase === 'Running' ? 'bg-accent/70'
                  : 'bg-text-muted/15'
                }`} />
              )}
            </For>
          </div>
        </Show>

        {/* Concurrency */}
        <Show when={isActive()}>
          <span class="text-[10px] font-mono text-accent flex-shrink-0">
            {concurrency().running}<span class="text-text-muted">r</span>
            <Show when={concurrency().queued > 0}>
              +{concurrency().queued}<span class="text-text-muted">q</span>
            </Show>
          </span>
        </Show>

        {/* Success rate */}
        <Show when={successRate() !== null && !isActive()}>
          <span class={`text-[10px] font-mono font-medium flex-shrink-0 ${
            successRate()! >= 80 ? 'text-success' : successRate()! >= 50 ? 'text-warning' : 'text-error'
          }`}>
            {successRate()}%
          </span>
        </Show>

        {/* Model */}
        <Show when={agentInfo()?.model}>
          <span class="text-[9px] font-mono text-text-muted truncate max-w-[120px] flex-shrink-0">
            {agentInfo()!.model!.split('/').pop()}
          </span>
        </Show>

        {/* Latest run time */}
        <Show when={latestRun()}>
          <span class="text-[10px] text-text-muted flex-shrink-0">
            {relativeTime(latestRun()!.metadata.creationTimestamp)}
          </span>
        </Show>
      </div>

      {/* Detail expansion (inline enrichment) — guarded against null agentInfo */}
      <Show when={detailOpen() && agentInfo()}>
        <AgentDetailCard
          name={props.name}
          agentInfo={agentInfo()!}
          crd={crd() ?? undefined}
          runtimeStatus={runtimeStatus()}
          memStats={memStats() ?? undefined}
          recentRuns={recentRuns()}
          successRate={successRate()}
          concurrency={concurrency()}
          depth={props.depth}
        />
      </Show>

      {/* Child workers (recursive) */}
      <Show when={expanded() && hasChildren()}>
        <For each={childWorkers()}>
          {(childName) => (
            <AgentTreeNode
              name={childName}
              namespace={props.namespace}
              depth={props.depth + 1}
              parentName={props.name}
              selectedNode={props.selectedNode}
              onSelectNode={props.onSelectNode}
              ancestors={ancestorSet()}
            />
          )}
        </For>
      </Show>
    </div>
  );
}

// ── Agent Detail Card (rich inline expansion) ──

function AgentDetailCard(props: {
  name: string;
  agentInfo: AgentResponse;
  crd?: AgentCRD;
  runtimeStatus: RuntimeStatus | null;
  memStats?: MemoryStats;
  recentRuns: AgentRunResponse[];
  successRate: number | null;
  concurrency: { running: number; queued: number };
  depth: number;
}) {
  const indent = () => props.depth * 20 + 28;
  const rs = () => props.runtimeStatus;
  const spec = () => props.crd?.spec;

  // Token economics from recent runs
  const tokenStats = createMemo(() => {
    let totalTokens = 0;
    let totalCost = 0;
    for (const r of props.recentRuns) {
      if (r.status?.tokensUsed) totalTokens += r.status.tokensUsed;
      if (r.status?.cost) totalCost += r.status.cost;
    }
    return { totalTokens, totalCost, runCount: props.recentRuns.length };
  });

  return (
    <div
      class="mx-2 mb-2 rounded-lg bg-surface-2 border border-border-subtle overflow-hidden"
      style={{ 'margin-left': `${8 + indent()}px` }}
    >
      {/* Stats grid */}
      <div class="grid grid-cols-4 gap-px bg-border-subtle">
        <MiniStat label="Messages" value={rs()?.messages ?? '\u2014'} />
        <MiniStat label="Turns" value={rs()?.turns ?? '\u2014'} />
        <MiniStat label="Steps" value={rs()?.steps ?? '\u2014'} />
        <MiniStat
          label="Memory"
          value={props.memStats ? props.memStats.total_observations : '\u2014'}
          accent={props.memStats != null && props.memStats.total_observations > 0}
        />
      </div>

      {/* Token economics row */}
      <Show when={tokenStats().totalTokens > 0}>
        <div class="flex items-center gap-3 px-3 py-2 border-t border-border-subtle text-[10px] text-text-muted">
          <span>
            <span class="font-mono text-text-secondary">{formatTokens(tokenStats().totalTokens)}</span> tokens
          </span>
          <Show when={tokenStats().totalCost > 0}>
            <span>
              <span class="font-mono text-text-secondary">{formatCost(tokenStats().totalCost)}</span>
            </span>
          </Show>
          <span>{tokenStats().runCount} runs</span>
        </div>
      </Show>

      {/* Config summary */}
      <Show when={spec()}>
        <div class="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-t border-border-subtle text-[10px]">
          <Show when={spec()!.model}>
            <span class="text-text-muted">Model: <span class="font-mono text-text-secondary">{spec()!.model!.split('/').pop()}</span></span>
          </Show>
          <Show when={spec()!.maxSteps}>
            <span class="text-text-muted">Steps: <span class="font-mono text-text-secondary">{spec()!.maxSteps}</span></span>
          </Show>
          <Show when={spec()!.timeout}>
            <span class="text-text-muted">Timeout: <span class="font-mono text-text-secondary">{spec()!.timeout}</span></span>
          </Show>
          <Show when={spec()!.concurrency?.maxRuns}>
            <span class="text-text-muted">Concurrency: <span class="font-mono text-text-secondary">{spec()!.concurrency!.maxRuns}</span></span>
          </Show>
          <Show when={spec()!.delegation?.strategy}>
            <span class="text-text-muted">Delegation:
              <span class={`font-mono font-medium ml-0.5 ${
                spec()!.delegation!.strategy === 'proactive' ? 'text-accent' :
                spec()!.delegation!.strategy === 'conservative' ? 'text-info' : 'text-warning'
              }`}>{spec()!.delegation!.strategy}</span>
            </span>
          </Show>
        </div>
      </Show>

      {/* Tools summary */}
      <Show when={spec() && ((spec()!.builtinTools?.length ?? 0) + (spec()!.tools?.length ?? 0)) > 0}>
        <div class="flex flex-wrap gap-1.5 px-3 py-2 border-t border-border-subtle">
          <For each={spec()!.builtinTools ?? []}>
            {(tool) => (
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-surface-3 text-text-secondary border border-border-subtle">
                {tool}
              </span>
            )}
          </For>
          <For each={spec()!.tools ?? []}>
            {(tool) => (
              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-info/10 text-info border border-info/15">
                {tool.name}
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Recent runs feed (compact) */}
      <Show when={props.recentRuns.length > 0}>
        <div class="border-t border-border-subtle">
          <div class="px-3 py-1.5 flex items-center gap-1.5">
            <span class="text-[9px] text-text-muted font-medium uppercase tracking-wider">Recent Runs</span>
          </div>
          <div class="pb-1.5 px-1.5 space-y-0.5 max-h-[160px] overflow-y-auto">
            <For each={props.recentRuns.slice(0, 5)}>
              {(run) => <CompactRunRow run={run} />}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Mini Stat Cell ──

function MiniStat(props: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div class="flex flex-col items-center py-2.5 px-1 bg-surface">
      <span class={`text-sm font-mono font-semibold tabular-nums ${props.accent ? 'text-accent' : 'text-text'}`}>
        {props.value}
      </span>
      <span class="text-[9px] text-text-muted uppercase tracking-wider mt-0.5">{props.label}</span>
    </div>
  );
}

// ── Compact Run Row ──

function CompactRunRow(props: { run: AgentRunResponse }) {
  const run = () => props.run;
  const isRunning = () => run().status?.phase === 'Running';

  const duration = createMemo(() => {
    if (!run().status?.startTime || !run().status?.completionTime) return null;
    const ms = new Date(run().status!.completionTime!).getTime() - new Date(run().status!.startTime!).getTime();
    const sec = ms / 1000;
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  });

  return (
    <div class={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] hover:bg-surface-hover transition-colors ${
      isRunning() ? 'bg-accent/5' : ''
    }`}>
      <RunPhaseIcon phase={run().status?.phase} />
      <span class="text-text-secondary truncate flex-1" title={run().spec.prompt}>
        {run().spec.prompt?.slice(0, 60) || run().metadata.name}
      </span>
      <Show when={run().status?.tokensUsed}>
        <span class="text-[9px] font-mono text-text-muted flex-shrink-0">{formatTokens(run().status!.tokensUsed!)}</span>
      </Show>
      <Show when={duration()}>
        <span class="text-[9px] font-mono text-text-muted flex-shrink-0">{duration()}</span>
      </Show>
      <Show when={run().status?.traceID}>
        <button
          class="text-[9px] font-mono text-info hover:text-info/80 transition-colors flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            showTraceDetail(run().status!.traceID!);
          }}
        >
          trace
        </button>
      </Show>
      <span class="text-[9px] text-text-muted flex-shrink-0">{relativeTime(run().metadata.creationTimestamp)}</span>
    </div>
  );
}

// ── Standby Node (available but unused targets) ──

function StandbyNode(props: { agent: AgentResponse }) {
  const a = () => props.agent;

  return (
    <div class="flex items-center gap-2.5 px-2 py-2 rounded-lg text-[11px] hover:bg-surface-hover transition-colors">
      <div class="w-2.5 h-2.5 rounded-full bg-text-muted/30 flex-shrink-0" />
      <span class="text-text-secondary font-medium truncate">{a().name}</span>
      <span class="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted border border-border-subtle flex-shrink-0">{a().mode}</span>
      <Show when={a().model}>
        <span class="text-[9px] font-mono text-text-muted flex-shrink-0">{a().model!.split('/').pop()}</span>
      </Show>
    </div>
  );
}
