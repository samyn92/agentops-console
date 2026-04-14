// AgentPanel — unified Agent tab for daemon (orchestrator) agents.
// Single scrollable page merging: discovery, live runtime stats, delegation,
// memory summary, configuration, tools, resources, system prompt.
// Does NOT show platformProtocol.
import { Show, For, createSignal, createMemo, createResource, createEffect } from 'solid-js';
import { selectedAgent, agentList, getDelegationTargetsFor, getAgentStatus, getAgentRuntimeStatus } from '../../stores/agents';
import {
  getWorkerAgentsFor,
  getDelegationGroupsBy,
  getRunsDelegatedBy,
  getAgentConcurrency,
  getAgentRuns,
  selectRun,
  clearRunSelection,
  selectedRunKey,
  allRuns,
  type DelegationGroupInfo,
} from '../../stores/runs';
import { agents as agentsAPI, agentResources as resourcesAPI } from '../../lib/api';
import { showRunDetail, showTraceDetail, clearCenterOverlay } from '../../stores/view';
import { getResourceForge, getResourceRepoName } from '../../stores/resources';
import { getRunSource } from '../../stores/runs';
import {
  memoryEnabled,
  memoryProject,
  observations,
  observationsLoading,
  fetchObservations,
  memoryStats,
  fetchMemoryStats,
  searchQuery,
  setSearchQuery,
  searchResults,
  searchLoading,
  searchMemory,
  setMemoryView,
  fetchObservationDetail,
  setSelectedObservation,
} from '../../stores/memory';
import { totalUsage, contextBudget } from '../../stores/chat';
import { relativeTime, formatTokens, formatCost, formatDateTime, phaseVariant } from '../../lib/format';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import Markdown from '../shared/Markdown';
import RunPhaseIcon from '../shared/RunPhaseIcon';
import { ForgeIcon, ForgeWatermark, SourceIcon, GitBranchIcon, MonitorIcon, DelegationIcon, BrainIcon, SearchIcon, SparklesIcon, CloseIcon } from '../shared/Icons';
import type { AgentCRD, AgentRunResponse, AgentResponse, AgentResourceBinding, AgentMemoryConfig, AgentResourceRef, AgentResourceRequirements, AgentStorageConfig, RuntimeStatus, MemoryObservation, MemorySearchResult } from '../../types';

// ── Main Component ──

export default function AgentPanel() {
  const agent = () => selectedAgent();
  const agentName = () => agent()?.name ?? '';
  const agentNs = () => agent()?.namespace ?? 'agents';

  const [crd] = createResource(
    () => agent() ? { ns: agent()!.namespace, name: agent()!.name } : null,
    async (params) => {
      if (!params) return null;
      try { return await agentsAPI.get(params.ns, params.name) as AgentCRD; }
      catch { return null; }
    },
  );

  const [resources] = createResource(
    () => agent() ? { ns: agent()!.namespace, name: agent()!.name } : null,
    async (params) => {
      if (!params) return [];
      try { return await resourcesAPI.forAgent(params.ns, params.name); }
      catch { return []; }
    },
  );

  const spec = () => crd()?.spec;
  const runtimeStatus = () => {
    const a = agent();
    if (!a) return null;
    return getAgentRuntimeStatus(a.namespace, a.name);
  };
  const agentStatus = () => {
    const a = agent();
    if (!a) return { phase: '', isOnline: false, model: '', image: '' };
    return getAgentStatus(a.namespace, a.name);
  };
  const hasMemory = () => memoryEnabled();

  // Delegation data
  const workerNames = createMemo(() => getWorkerAgentsFor(agentName()));
  const delegatedRuns = createMemo(() => getRunsDelegatedBy(agentName()));
  const fanOutGroups = createMemo(() => getDelegationGroupsBy(agentName()));
  const delegationTargets = createMemo(() => getDelegationTargetsFor(agentName(), agentNs()));

  const delegationStats = createMemo(() => {
    const runs = delegatedRuns();
    const succeeded = runs.filter(r => r.status?.phase === 'Succeeded').length;
    const failed = runs.filter(r => r.status?.phase === 'Failed').length;
    const active = runs.filter(r => {
      const p = r.status?.phase;
      return p === 'Running' || p === 'Pending' || p === 'Queued';
    }).length;
    let totalTokens = 0;
    for (const r of runs) {
      if (r.status?.tokensUsed) totalTokens += r.status.tokensUsed;
    }
    return { total: runs.length, succeeded, failed, active, totalTokens };
  });

  // Resource counts
  const resourceCounts = createMemo(() => {
    const res = resources() ?? [];
    const git = res.filter((r) => r.kind === 'github-repo' || r.kind === 'gitlab-project' || r.kind === 'git-repo').length;
    const other = res.length - git;
    return { git, other, total: res.length };
  });

  return (
    <div class="h-full overflow-y-auto">
      <Show when={crd.loading}>
        <div class="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      </Show>

      <Show when={crd()}>
        {(data) => (
          <div class="px-6 py-5 space-y-6">

            {/* ═══════════════════════════════════════════════════
                1. HERO HEADER — live runtime stats + context budget
                ═══════════════════════════════════════════════════ */}
            <HeroHeader
              runtimeStatus={runtimeStatus()}
              status={agentStatus()}
              spec={spec()!}
              crd={data()}
            />

            {/* ═══════════════════════════════════════════════════
                2. DELEGATION — team, workers, targets, run feed
                ═══════════════════════════════════════════════════ */}
            <Show when={spec()?.delegation || workerNames().length > 0 || delegatedRuns().length > 0}>
              <DelegationSection
                spec={spec()!}
                workerNames={workerNames()}
                delegationStats={delegationStats()}
                delegationTargets={delegationTargets()}
                fanOutGroups={fanOutGroups()}
                delegatedRuns={delegatedRuns()}
                orchestratorName={agentName()}
              />
            </Show>

            {/* ═══════════════════════════════════════════════════
                4. MEMORY — stats strip + recent observations + search
                ═══════════════════════════════════════════════════ */}
            <Show when={hasMemory()}>
              <MemorySection />
            </Show>

            {/* ═══════════════════════════════════════════════════
                5. CONFIGURATION — model, image, maxSteps, timeout, etc.
                ═══════════════════════════════════════════════════ */}
            <ConfigurationSection spec={spec()!} />

            {/* ═══════════════════════════════════════════════════
                6. TOOLS — builtin + OCI with badges
                ═══════════════════════════════════════════════════ */}
            <Show when={(spec()?.builtinTools?.length || 0) + (spec()?.tools?.length || 0) > 0}>
              <ToolsSection spec={spec()!} />
            </Show>

            {/* ═══════════════════════════════════════════════════
                7. RESOURCES — bindings with badges
                ═══════════════════════════════════════════════════ */}
            <Show when={spec()?.resourceBindings?.length}>
              <ResourceBindingsSection bindings={spec()!.resourceBindings!} resources={resources() ?? []} />
            </Show>

            {/* ═══════════════════════════════════════════════════
                8. SYSTEM PROMPT — collapsible markdown
                ═══════════════════════════════════════════════════ */}
            <Show when={spec()?.systemPrompt}>
              <SystemPromptSection prompt={spec()!.systemPrompt!} />
            </Show>

            {/* ═══════════════════════════════════════════════════
                9. FOOTER — namespace, created date
                ═══════════════════════════════════════════════════ */}
            <div class="pt-4 border-t border-border-subtle flex items-center gap-3 text-[11px] text-text-muted">
              <span>Created {formatDateTime(data().metadata.creationTimestamp)}</span>
              <span class="text-text-muted/40">|</span>
              <span class="font-mono">{data().metadata.namespace}/{data().metadata.name}</span>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 1: Hero Header
// ═══════════════════════════════════════════════════

function HeroHeader(props: {
  runtimeStatus: RuntimeStatus | null;
  status: { phase: string; isOnline: boolean; model: string; image: string };
  spec: import('../../types').AgentSpec;
  crd: AgentCRD;
}) {
  const rs = () => props.runtimeStatus;
  const budget = () => contextBudget();
  const usage = () => totalUsage();

  // Context budget percentage
  const budgetPct = () => {
    const b = budget();
    if (!b) return null;
    const total = b.budget_tokens;
    const used = b.conversation_tokens + b.prompt_tokens;
    if (total <= 0) return null;
    return Math.round((used / total) * 100);
  };

  const budgetColor = () => {
    const pct = budgetPct();
    if (pct === null) return '';
    if (pct >= 90) return 'text-error';
    if (pct >= 70) return 'text-warning';
    return 'text-success';
  };

  return (
    <div class="space-y-3">
      {/* Model + Image */}
      <div class="flex items-center gap-2 flex-wrap text-[11px] text-text-muted">
        <span class="font-mono text-text-secondary">{props.spec.model}</span>
        <Show when={props.spec.image}>
          <span class="text-text-muted/40">|</span>
          <span class="font-mono truncate max-w-[200px]" title={props.spec.image}>{props.spec.image!.split('/').pop()}</span>
        </Show>
      </div>

      {/* Live runtime stat cards */}
      <Show when={rs()}>
        <div class="grid grid-cols-4 gap-2">
          <StatCard
            label="Status"
            value={rs()!.busy ? 'Busy' : 'Idle'}
            variant={rs()!.busy ? 'accent' : undefined}
            pulse={rs()!.busy}
          />
          <StatCard label="Messages" value={String(rs()!.messages ?? 0)} />
          <StatCard label="Turns" value={String(rs()!.turns ?? 0)} />
          <StatCard label="Steps" value={String(rs()!.steps ?? 0)} />
        </div>
      </Show>

      {/* Context budget bar */}
      <Show when={budgetPct() !== null}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle px-3.5 py-2.5 space-y-1.5">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-text-muted">Context Budget</span>
            <span class={`font-mono font-medium ${budgetColor()}`}>
              {budgetPct()}%
            </span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-border overflow-hidden">
            <div
              class={`h-full rounded-full transition-all duration-300 ${
                budgetPct()! >= 90 ? 'bg-error' : budgetPct()! >= 70 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${Math.min(budgetPct()!, 100)}%` }}
            />
          </div>
          <div class="flex items-center gap-3 text-[10px] text-text-muted">
            <Show when={budget()}>
              <span>
                <span class="font-mono text-text-secondary">{formatTokens(budget()!.conversation_tokens + budget()!.prompt_tokens)}</span> / {formatTokens(budget()!.budget_tokens)} tokens
              </span>
            </Show>
            <Show when={usage()}>
              <span class="ml-auto">
                Session: <span class="font-mono text-text-secondary">{formatTokens((usage()!.input_tokens ?? 0) + (usage()!.output_tokens ?? 0))}</span> tok
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

function StatCard(props: { value: string; label: string; variant?: 'accent' | 'success' | 'error'; pulse?: boolean }) {
  const color = () => {
    switch (props.variant) {
      case 'accent': return 'text-accent';
      case 'success': return 'text-success';
      case 'error': return 'text-error';
      default: return 'text-text';
    }
  };
  const bgTint = () => {
    switch (props.variant) {
      case 'accent': return 'bg-accent/4';
      case 'success': return 'bg-success/4';
      case 'error': return 'bg-error/4';
      default: return '';
    }
  };
  return (
    <div class={`rounded-xl bg-surface-2 border border-border-subtle px-3 py-2.5 text-center relative overflow-hidden ${bgTint()}`}>
      <Show when={props.pulse}>
        <div class="absolute inset-0 bg-accent/3 animate-pulse" />
      </Show>
      <div class={`text-lg font-mono font-semibold tabular-nums relative ${color()}`}>{props.value}</div>
      <div class="text-[10px] text-text-muted uppercase tracking-wider relative">{props.label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 2: Delegation
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// SECTION 3: Delegation
// ═══════════════════════════════════════════════════

function DelegationSection(props: {
  spec: import('../../types').AgentSpec;
  workerNames: string[];
  delegationStats: { total: number; succeeded: number; failed: number; active: number; totalTokens: number };
  delegationTargets: AgentResponse[];
  fanOutGroups: DelegationGroupInfo[];
  delegatedRuns: AgentRunResponse[];
  orchestratorName: string;
}) {
  const [inspectedWorker, setInspectedWorker] = createSignal<string | null>(null);

  // Build unified feed (same logic as old DelegationPanel)
  const DELEGATION_GROUP_LABEL = 'agents.agentops.io/delegation-group';

  type FeedItem =
    | { type: 'fanout'; group: DelegationGroupInfo; ts: number }
    | { type: 'run'; run: AgentRunResponse; ts: number };

  const feed = createMemo<FeedItem[]>(() => {
    const runs = props.delegatedRuns;
    const groups = props.fanOutGroups;
    const groupedRunNames = new Set<string>();
    for (const g of groups) {
      for (const r of g.runs) groupedRunNames.add(r.metadata.name);
    }
    const items: FeedItem[] = [];
    for (const g of groups) {
      const ts = Math.max(...g.runs.map(r => new Date(r.metadata.creationTimestamp).getTime()));
      items.push({ type: 'fanout', group: g, ts });
    }
    for (const r of runs) {
      if (groupedRunNames.has(r.metadata.name)) continue;
      items.push({ type: 'run', run: r, ts: new Date(r.metadata.creationTimestamp).getTime() });
    }
    return items.sort((a, b) => b.ts - a.ts);
  });

  const strategyColor = () => {
    switch (props.spec.delegation?.strategy) {
      case 'proactive': return 'bg-accent/8 border-accent/15 text-accent';
      case 'conservative': return 'bg-info/8 border-info/15 text-info';
      case 'manual': return 'bg-warning/8 border-warning/15 text-warning';
      default: return 'bg-surface-3 border-border-subtle text-text-muted';
    }
  };

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Delegation</h3>
        <Show when={props.delegationStats.active > 0}>
          <span class="px-1.5 py-0.5 text-[9px] font-bold bg-accent text-primary-foreground rounded-full animate-pulse">
            {props.delegationStats.active} active
          </span>
        </Show>
      </div>

      {/* Strategy + config pills */}
      <Show when={props.spec.delegation}>
        <div class="flex flex-wrap gap-2">
          <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${strategyColor()}`}>
            <DelegationIcon class="w-3 h-3" />
            {props.spec.delegation!.strategy}
          </span>
          <Show when={props.spec.delegation!.preferParallel}>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-surface-3 border border-border-subtle text-text-secondary">
              Parallel preferred
            </span>
          </Show>
          <Show when={props.spec.delegation!.maxFanOut}>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-surface-3 border border-border-subtle text-text-secondary">
              Fan-out: <span class="font-mono">{props.spec.delegation!.maxFanOut}</span>
            </span>
          </Show>
        </div>
      </Show>

      {/* Stats bar */}
      <Show when={props.delegationStats.total > 0}>
        <div class="flex items-center gap-4 text-[11px]">
          <span class="text-text-muted">{props.delegationStats.total} delegations</span>
          <Show when={props.delegationStats.succeeded > 0}>
            <span class="text-success">{props.delegationStats.succeeded} passed</span>
          </Show>
          <Show when={props.delegationStats.failed > 0}>
            <span class="text-error">{props.delegationStats.failed} failed</span>
          </Show>
          <Show when={props.delegationStats.totalTokens > 0}>
            <span class="text-text-muted font-mono">{formatTokens(props.delegationStats.totalTokens)} tok</span>
          </Show>
        </div>
      </Show>

      {/* Worker chips */}
      <Show when={props.workerNames.length > 0}>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.workerNames}>
            {(name) => <WorkerChip name={name} onInspect={setInspectedWorker} />}
          </For>
        </div>
      </Show>

      {/* Worker detail (inline) */}
      <Show when={inspectedWorker()}>
        {(workerName) => (
          <WorkerDetail name={workerName()} onClose={() => setInspectedWorker(null)} />
        )}
      </Show>

      {/* Delegation targets */}
      <Show when={props.delegationTargets.length > 0}>
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-medium text-text-muted uppercase tracking-wider">Available Agents</span>
            <span class="text-[9px] text-text-muted/50">{props.delegationTargets.length} in scope</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <For each={props.delegationTargets}>
              {(target) => <DelegationTargetCard agent={target} orchestratorName={props.orchestratorName} />}
            </For>
          </div>
        </div>
      </Show>

      {/* Run feed (capped at 15 in the Agent tab — less than the dedicated delegation tab) */}
      <Show when={feed().length > 0}>
        <div class="space-y-1.5">
          <For each={feed().slice(0, 15)}>
            {(item) => (
              <>
                <Show when={item.type === 'fanout' && 'group' in item}>
                  {(_) => {
                    const fi = item as FeedItem & { type: 'fanout'; group: DelegationGroupInfo };
                    return <FanOutGroup group={fi.group} />;
                  }}
                </Show>
                <Show when={item.type === 'run' && 'run' in item}>
                  {(_) => {
                    const ri = item as FeedItem & { type: 'run'; run: AgentRunResponse };
                    return <RunCard run={ri.run} />;
                  }}
                </Show>
              </>
            )}
          </For>
          <Show when={feed().length > 15}>
            <p class="text-[10px] text-text-muted text-center py-2">
              +{feed().length - 15} older delegations
            </p>
          </Show>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={props.workerNames.length === 0 && props.delegatedRuns.length === 0 && !props.spec.delegation}>
        <div class="flex items-center gap-2 py-2 text-[11px] text-text-muted">
          <DelegationIcon class="w-4 h-4 text-text-muted/30" />
          <span>No delegations configured or observed.</span>
        </div>
      </Show>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 4: Memory (inline summary)
// ═══════════════════════════════════════════════════

function MemorySection() {
  const stats = () => memoryStats();
  const obs = () => observations();
  const loading = () => observationsLoading();
  const [localQuery, setLocalQuery] = createSignal('');
  let debounceTimer: number | undefined;

  const isSearching = () => localQuery().trim().length > 0;

  function handleSearchInput(e: InputEvent) {
    const val = (e.target as HTMLInputElement).value;
    setLocalQuery(val);
    clearTimeout(debounceTimer);
    if (val.trim().length >= 2) {
      debounceTimer = window.setTimeout(() => searchMemory(val), 300);
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const val = localQuery();
      if (val.trim()) searchMemory(val);
    }
    if (e.key === 'Escape') {
      setLocalQuery('');
      setSearchQuery('');
    }
  }

  // Observation type metadata
  const TYPE_COLORS: Record<string, string> = {
    decision: 'bg-accent', bugfix: 'bg-error', discovery: 'bg-accent',
    pattern: 'bg-success', architecture: 'bg-info', config: 'bg-warning',
    learning: 'bg-success', preference: 'bg-text-muted/40',
  };

  return (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Memory</h3>
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-info/8 border border-info/12 text-info">
          <BrainIcon class="w-2.5 h-2.5" />
          enabled
        </span>
      </div>

      {/* Stats strip */}
      <Show when={stats()}>
        <div class="flex items-center gap-4 text-[11px] text-text-muted">
          <span><span class="font-mono text-text-secondary">{stats()!.total_observations}</span> memories</span>
          <span><span class="font-mono text-text-secondary">{stats()!.total_sessions}</span> sessions</span>
        </div>
      </Show>

      {/* Inline search */}
      <div class="flex items-center gap-2 px-2.5 py-1.5 bg-surface-2 rounded-lg border border-border-subtle focus-within:border-border-hover transition-colors">
        <SearchIcon class="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        <input
          type="text"
          class="flex-1 bg-transparent text-xs text-text placeholder:text-text-muted outline-none"
          placeholder="Search memories..."
          value={localQuery()}
          onInput={handleSearchInput}
          onKeyDown={handleSearchKeyDown}
        />
        <Show when={searchLoading()}>
          <Spinner size="sm" />
        </Show>
        <Show when={isSearching() && !searchLoading()}>
          <button
            class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
            onClick={() => { setLocalQuery(''); setSearchQuery(''); }}
          >
            <CloseIcon class="w-3 h-3" />
          </button>
        </Show>
      </div>

      {/* Search results */}
      <Show when={isSearching() && searchResults().length > 0}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
          <For each={searchResults().slice(0, 5)}>
            {(result) => (
              <div class="px-3 py-2">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_COLORS[result.type] || 'bg-text-muted/40'}`} />
                  <span class="text-xs font-medium text-text truncate flex-1">{result.title}</span>
                  <span class="text-[10px] text-text-muted/50 flex-shrink-0">#{Math.abs(result.rank).toFixed(1)}</span>
                </div>
                <p class="text-[11px] text-text-secondary/70 line-clamp-1">{result.content.slice(0, 120)}</p>
              </div>
            )}
          </For>
          <Show when={searchResults().length > 5}>
            <div class="px-3 py-1.5 text-[10px] text-text-muted text-center">
              +{searchResults().length - 5} more results
            </div>
          </Show>
        </div>
      </Show>

      {/* Recent observations (when not searching) */}
      <Show when={!isSearching() && obs().length > 0}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
          <For each={obs().slice(0, 5)}>
            {(ob) => (
              <div class="px-3 py-2">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_COLORS[ob.type] || 'bg-text-muted/40'}`} />
                  <span class="text-xs font-medium text-text truncate flex-1">{ob.title}</span>
                  <span class="text-[10px] text-text-muted flex-shrink-0">{relativeTime(ob.created_at)}</span>
                </div>
                <p class="text-[11px] text-text-secondary/70 line-clamp-1">{ob.content.slice(0, 120)}</p>
              </div>
            )}
          </For>
          <Show when={obs().length > 5}>
            <div class="px-3 py-1.5 text-[10px] text-text-muted text-center">
              +{obs().length - 5} older memories
            </div>
          </Show>
        </div>
      </Show>

      <Show when={!isSearching() && !loading() && obs().length === 0}>
        <div class="text-[11px] text-text-muted/60 py-2">No memories yet.</div>
      </Show>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 5: Configuration
// ═══════════════════════════════════════════════════

function ConfigurationSection(props: { spec: import('../../types').AgentSpec }) {
  const spec = () => props.spec;

  return (
    <div class="space-y-2">
      <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Configuration</h3>
      <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
        <Show when={spec().image}>
          <ConfigRow label="Image" value={spec().image!} mono truncate />
        </Show>
        <Show when={spec().maxSteps !== undefined}>
          <ConfigRow label="Max Steps" value={String(spec().maxSteps)} />
        </Show>
        <Show when={spec().timeout}>
          <ConfigRow label="Timeout" value={spec().timeout!} />
        </Show>
        <Show when={spec().temperature !== undefined}>
          <ConfigRow label="Temperature" value={String(spec().temperature)} />
        </Show>
        <Show when={spec().maxOutputTokens !== undefined}>
          <ConfigRow label="Max Output Tokens" value={String(spec().maxOutputTokens)} />
        </Show>
      </div>

      {/* Concurrency */}
      <Show when={spec().concurrency}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
          <Show when={spec().concurrency!.maxRuns}>
            <ConfigRow label="Max Concurrent Runs" value={String(spec().concurrency!.maxRuns)} />
          </Show>
          <Show when={spec().concurrency!.policy}>
            <ConfigRow label="Concurrency Policy">
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-accent/8 border border-accent/12 text-accent">
                {spec().concurrency!.policy}
              </span>
            </ConfigRow>
          </Show>
        </div>
      </Show>

      {/* Providers */}
      <Show when={spec().providers?.length}>
        <div class="flex flex-wrap gap-1.5 mt-2">
          <For each={spec().providers}>
            {(p) => (
              <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-2 border border-border-subtle text-text-secondary">
                {p.name}
              </span>
            )}
          </For>
        </div>
        <Show when={spec().fallbackModels?.length}>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <span class="text-[10px] text-text-muted">Fallback:</span>
            <For each={spec().fallbackModels}>
              {(model) => (
                <span class="text-[10px] font-mono text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle">
                  {model}
                </span>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Memory config */}
      <Show when={spec().memory}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle mt-2">
          <ConfigRow label="Memory Server" value={spec().memory!.serverRef} mono />
          <Show when={spec().memory!.project}>
            <ConfigRow label="Memory Project" value={spec().memory!.project!} mono />
          </Show>
          <Show when={spec().memory!.contextLimit !== undefined}>
            <ConfigRow label="Context Limit" value={`${spec().memory!.contextLimit} entries`} />
          </Show>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-1.5">
          {[
            { label: 'Auto-summarize', enabled: spec().memory!.autoSummarize !== false },
            { label: 'Auto-save', enabled: spec().memory!.autoSave !== false },
            { label: 'Auto-search', enabled: spec().memory!.autoSearch !== false },
          ].map((feat) => (
            <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
              feat.enabled ? 'bg-success/6 border-success/10 text-success' : 'bg-surface-3 border-border-subtle text-text-muted'
            }`}>
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {feat.enabled
                  ? <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                  : <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                }
              </svg>
              {feat.label}
            </span>
          ))}
        </div>
      </Show>

      {/* Environment */}
      <Show when={spec().env && Object.keys(spec().env!).length > 0}>
        <div class="space-y-1.5 mt-2">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-medium text-text-muted uppercase tracking-wider">Environment</span>
            <span class="text-[10px] text-text-muted font-mono">{Object.keys(spec().env!).length} vars</span>
          </div>
          <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle">
            <For each={Object.entries(spec().env!)}>
              {([key, value]) => (
                <div class="flex items-center justify-between gap-4 px-3.5 py-2 min-h-[32px]">
                  <span class="text-[11px] font-mono text-text-muted flex-shrink-0">{key}</span>
                  <span class="text-[11px] font-mono text-text text-right truncate max-w-[200px]">{value}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Storage & Infrastructure */}
      <Show when={spec().storage || spec().resources}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden divide-y divide-border-subtle mt-2">
          <Show when={spec().storage}>
            <ConfigRow label="Storage" value={spec().storage!.size} mono />
            <Show when={spec().storage!.storageClass}>
              <ConfigRow label="Storage Class" value={spec().storage!.storageClass!} mono />
            </Show>
          </Show>
          <Show when={spec().resources?.requests}>
            <ConfigRow label="CPU Request" value={spec().resources!.requests!.cpu || '\u2014'} mono />
            <ConfigRow label="Memory Request" value={spec().resources!.requests!.memory || '\u2014'} mono />
          </Show>
          <Show when={spec().resources?.limits}>
            <ConfigRow label="CPU Limit" value={spec().resources!.limits!.cpu || '\u2014'} mono />
            <ConfigRow label="Memory Limit" value={spec().resources!.limits!.memory || '\u2014'} mono />
          </Show>
        </div>
      </Show>

      {/* Schedule */}
      <Show when={spec().schedule}>
        <div class="rounded-xl bg-surface-2 border border-border-subtle p-3.5 mt-2">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-warning/8 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="min-w-0">
              <span class="text-xs font-mono text-text font-medium">{spec().schedule}</span>
              <Show when={spec().schedulePrompt}>
                <p class="text-[11px] text-text-muted mt-0.5 line-clamp-2">{spec().schedulePrompt}</p>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

function ConfigRow(props: { label: string; value?: string; mono?: boolean; truncate?: boolean; children?: any }) {
  return (
    <div class="flex items-center justify-between gap-4 px-3.5 py-2.5 min-h-[36px]">
      <span class="text-xs text-text-muted flex-shrink-0">{props.label}</span>
      <Show when={props.children} fallback={
        <span class={`text-xs text-text text-right ${props.mono ? 'font-mono' : ''} ${props.truncate ? 'truncate max-w-[260px]' : ''}`}>
          {props.value}
        </span>
      }>
        {props.children}
      </Show>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 6: Tools
// ═══════════════════════════════════════════════════

function ToolsSection(props: { spec: import('../../types').AgentSpec }) {
  const builtinCount = () => props.spec.builtinTools?.length || 0;
  const ociCount = () => props.spec.tools?.length || 0;

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Tools</h3>
        <span class="text-[10px] text-text-muted font-mono">{builtinCount() + ociCount()}</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <For each={props.spec.builtinTools ?? []}>
          {(tool) => (
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-surface-3 border border-border-subtle text-text-secondary">
              <svg class="w-2.5 h-2.5 text-text-muted/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.42 15.17l-5.29-5.29a4 4 0 115.66-5.66l.1.1a1.65 1.65 0 002.34 0l.1-.1a4 4 0 015.66 5.66l-5.29 5.29a2 2 0 01-2.83 0z" />
              </svg>
              {tool}
            </span>
          )}
        </For>
        <For each={props.spec.tools ?? []}>
          {(tool) => (
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-info/8 border border-info/15 text-info">
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              {tool.name}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 7: Resource Bindings
// ═══════════════════════════════════════════════════

function ResourceBindingsSection(props: { bindings: AgentResourceRef[]; resources: AgentResourceBinding[] }) {
  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Resources</h3>
        <span class="text-[10px] text-text-muted font-mono">{props.bindings.length}</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <For each={props.bindings}>
          {(binding) => {
            const detail = props.resources.find(r => r.name === binding.name);
            return (
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-2 border border-border-subtle text-text-secondary">
                <svg class="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {binding.name}
                <Show when={binding.readOnly}>
                  <span class="text-[9px] text-warning/70">RO</span>
                </Show>
                <Show when={binding.autoContext}>
                  <span class="text-[9px] text-info/70">auto</span>
                </Show>
                <Show when={detail?.kind}>
                  <span class="text-[9px] text-text-muted/50">{detail!.kind}</span>
                </Show>
              </span>
            );
          }}
        </For>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SECTION 8: System Prompt
// ═══════════════════════════════════════════════════

function SystemPromptSection(props: { prompt: string }) {
  const [expanded, setExpanded] = createSignal(false);
  const isLong = () => props.prompt.length > 400;

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h3 class="text-[11px] font-semibold text-text-muted uppercase tracking-wider">System Prompt</h3>
        <Show when={isLong()}>
          <button
            class="text-[10px] text-accent hover:text-accent/80 transition-colors"
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? 'Collapse' : 'Expand'}
          </button>
        </Show>
      </div>
      <div
        class={`rounded-xl bg-surface-2 border border-border-subtle p-4 transition-all ${
          !expanded() && isLong() ? 'max-h-[200px] overflow-hidden relative' : ''
        }`}
      >
        <Markdown content={props.prompt} />
        <Show when={!expanded() && isLong()}>
          <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-2 to-transparent rounded-b-xl" />
        </Show>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Shared Sub-components (delegation cards, chips)
// ═══════════════════════════════════════════════════

function WorkerChip(props: { name: string; onInspect: (name: string | null) => void }) {
  const concurrency = () => getAgentConcurrency(props.name);
  const isActive = () => concurrency().running > 0 || concurrency().queued > 0;
  const recentRuns = createMemo(() => getAgentRuns(props.name, 8));

  const successRate = createMemo(() => {
    const runs = recentRuns();
    const ok = runs.filter(r => r.status?.phase === 'Succeeded').length;
    const fail = runs.filter(r => r.status?.phase === 'Failed').length;
    const total = ok + fail;
    if (total === 0) return null;
    return Math.round((ok / total) * 100);
  });

  return (
    <button
      class={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:bg-surface-hover ${
        isActive()
          ? 'bg-accent/5 border-accent/20 text-text'
          : 'bg-surface-2 border-border-subtle text-text-secondary'
      }`}
      onClick={() => props.onInspect(props.name)}
    >
      <span class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isActive() ? 'bg-accent animate-pulse' : 'bg-text-muted/30'
      }`} />
      <span>{props.name}</span>
      <Show when={isActive()}>
        <span class="text-[9px] font-mono text-accent">{concurrency().running}r</span>
      </Show>
      <Show when={successRate() !== null && !isActive()}>
        <span class={`text-[9px] font-mono ${
          successRate()! >= 80 ? 'text-success' : successRate()! >= 50 ? 'text-warning' : 'text-error'
        }`}>{successRate()}%</span>
      </Show>
      <span class="text-[9px] text-text-muted">{recentRuns().length}</span>
    </button>
  );
}

function WorkerDetail(props: { name: string; onClose: () => void }) {
  const agentInfo = createMemo(() => {
    const list = agentList() ?? [];
    return list.find((a) => a.name === props.name) ?? null;
  });

  const [workerCrd] = createResource(
    agentInfo,
    async (info) => {
      if (!info) return null;
      try { return await agentsAPI.get(info.namespace, info.name) as AgentCRD; }
      catch { return null; }
    },
  );

  const concurrency = () => getAgentConcurrency(props.name);

  return (
    <div class="rounded-xl bg-surface-2 border border-border-subtle overflow-hidden">
      <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-subtle">
        <span class="text-xs font-semibold text-text">{props.name}</span>
        <Show when={workerCrd()?.spec?.mode}>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted">{workerCrd()!.spec.mode}</span>
        </Show>
        <span class="flex-1" />
        <button
          class="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          onClick={props.onClose}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="px-3.5 py-3 space-y-2.5">
        <Show when={workerCrd()}>
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
            <Show when={workerCrd()!.spec.model}>
              <span class="text-text-muted">Model: <span class="font-mono text-text-secondary">{workerCrd()!.spec.model}</span></span>
            </Show>
            <Show when={workerCrd()!.spec.maxSteps}>
              <span class="text-text-muted">Steps: <span class="font-mono text-text-secondary">{workerCrd()!.spec.maxSteps}</span></span>
            </Show>
            <Show when={workerCrd()!.spec.timeout}>
              <span class="text-text-muted">Timeout: <span class="font-mono text-text-secondary">{workerCrd()!.spec.timeout}</span></span>
            </Show>
            <Show when={workerCrd()!.spec.concurrency?.maxRuns}>
              <span class="text-text-muted">Concurrency: <span class="font-mono text-text-secondary">{workerCrd()!.spec.concurrency!.maxRuns}</span></span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

function DelegationTargetCard(props: { agent: AgentResponse; orchestratorName: string }) {
  const a = () => props.agent;
  const concurrency = () => getAgentConcurrency(a().name);
  const isActive = () => concurrency().running > 0 || concurrency().queued > 0;
  const recentRuns = createMemo(() => getAgentRuns(a().name, 5));

  const hasDelegated = createMemo(() => {
    const workers = getWorkerAgentsFor(props.orchestratorName);
    return workers.includes(a().name);
  });

  const successRate = createMemo(() => {
    const runs = recentRuns();
    const ok = runs.filter(r => r.status?.phase === 'Succeeded').length;
    const fail = runs.filter(r => r.status?.phase === 'Failed').length;
    const total = ok + fail;
    if (total === 0) return null;
    return Math.round((ok / total) * 100);
  });

  return (
    <div class={`rounded-lg border p-2.5 transition-colors ${
      isActive()
        ? 'bg-accent/3 border-accent/20'
        : hasDelegated()
        ? 'bg-surface-2 border-border-subtle'
        : 'bg-surface border-border-subtle/60'
    }`}>
      <div class="flex items-center gap-1.5 mb-1">
        <span class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isActive() ? 'bg-accent animate-pulse' : hasDelegated() ? 'bg-success/50' : 'bg-text-muted/20'
        }`} />
        <span class="text-[11px] font-semibold text-text truncate">{a().name}</span>
        <span class="text-[9px] px-1 py-px rounded bg-surface-3 text-text-muted flex-shrink-0">{a().mode}</span>
        <span class="flex-1" />
        <Show when={isActive()}>
          <span class="text-[9px] font-mono text-accent">{concurrency().running}r</span>
        </Show>
        <Show when={successRate() !== null && !isActive()}>
          <span class={`text-[9px] font-mono ${
            successRate()! >= 80 ? 'text-success' : successRate()! >= 50 ? 'text-warning' : 'text-error'
          }`}>{successRate()}%</span>
        </Show>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-[9px] font-mono text-text-muted/60">{a().model}</span>
        <span class="flex-1" />
        <Show when={!hasDelegated()}>
          <span class="text-[8px] text-text-muted/40 italic">unused</span>
        </Show>
        <Show when={hasDelegated()}>
          <span class="text-[9px] text-text-muted">{recentRuns().length} runs</span>
        </Show>
      </div>
    </div>
  );
}

function FanOutGroup(props: { group: DelegationGroupInfo }) {
  const g = () => props.group;
  const total = () => g().runs.length;
  const isActive = () => g().activeCount > 0;
  const [expanded, setExpanded] = createSignal(isActive());

  const progressPct = () => {
    const done = g().completedCount + g().failedCount;
    return total() > 0 ? Math.round((done / total()) * 100) : 0;
  };

  return (
    <div class={`rounded-xl border overflow-hidden transition-colors ${
      isActive() ? 'bg-accent/3 border-accent/20' : 'bg-surface-2 border-border-subtle'
    }`}>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded())}
      >
        <svg
          class={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${expanded() ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <DelegationIcon class="w-3 h-3 text-info flex-shrink-0" />
        <span class="text-[11px] font-medium text-text">Fan-out</span>
        <span class="text-[10px] text-text-muted">{total()}</span>

        <div class="w-20 h-1.5 rounded-full bg-border overflow-hidden flex-shrink-0">
          <div
            class={`h-full rounded-full transition-all ${
              g().failedCount > 0 ? 'bg-error' : isActive() ? 'bg-accent' : 'bg-success'
            }`}
            style={{ width: `${progressPct()}%` }}
          />
        </div>

        <span class="flex-1" />
        <div class="flex items-center gap-1 text-[9px] font-mono">
          <Show when={g().completedCount > 0}><span class="text-success">{g().completedCount}</span></Show>
          <Show when={g().failedCount > 0}><span class="text-error">{g().failedCount}</span></Show>
          <Show when={g().activeCount > 0}><span class="text-accent animate-pulse">{g().activeCount}</span></Show>
        </div>
        <span class="text-[10px] text-text-muted flex-shrink-0">{relativeTime(g().createdAt)}</span>
      </button>

      <Show when={expanded()}>
        <div class="border-t border-border-subtle/50 p-1.5 space-y-0.5 run-card-list">
          <For each={g().runs}>
            {(run) => <RunCard run={run} />}
          </For>
        </div>
      </Show>
    </div>
  );
}

function RunCard(props: { run: AgentRunResponse }) {
  const run = () => props.run;
  const key = () => `${run().metadata.namespace}/${run().metadata.name}`;
  const isSelected = () => selectedRunKey() === key();
  const hasGit = () => !!run().status?.branch || !!run().spec.git;
  const isRunning = () => run().status?.phase === 'Running';
  const isFailed = () => run().status?.phase === 'Failed';
  const forge = () => getResourceForge(run().spec.git?.resourceRef);
  const repoName = () => getResourceRepoName(run().spec.git?.resourceRef);

  const duration = createMemo(() => {
    if (!run().status?.startTime || !run().status?.completionTime) return null;
    const ms = new Date(run().status!.completionTime!).getTime() - new Date(run().status!.startTime!).getTime();
    const sec = ms / 1000;
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  });

  const cardClass = () => {
    const classes = ['run-card'];
    if (isSelected()) classes.push('run-card--selected');
    if (isRunning()) classes.push('run-card--running');
    if (isFailed()) classes.push('run-card--failed');
    return classes.join(' ');
  };

  return (
    <button
      class={`w-full text-left ${cardClass()}`}
      onClick={() => {
        if (isSelected()) {
          clearRunSelection();
          clearCenterOverlay();
        } else {
          selectRun(run().metadata.namespace, run().metadata.name);
          showRunDetail();
        }
      }}
    >
      <Show when={forge()}>
        <ForgeWatermark forge={forge()!} />
      </Show>

      <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-semibold text-info/90 flex-shrink-0">{run().spec.agentRef}</span>
        <span class="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
          <Show when={hasGit() && run().status?.branch}>
            <span class={`run-card__branch-tag ${forge() === 'gitlab' ? 'run-card__branch-tag--gitlab' : forge() === 'github' ? 'run-card__branch-tag--github' : ''}`}>
              <GitBranchIcon class="run-card__branch-tag-icon" />
              <span class="run-card__branch-tag-text">
                <Show when={repoName()}>
                  <span class="run-card__branch-tag-repo">{repoName()}</span>
                </Show>
                <span class="run-card__branch-tag-branch">{run().status!.branch}</span>
              </span>
            </span>
          </Show>
        </span>
        <Show when={run().status?.commits}>
          <span class="run-card__commits-inline">{run().status!.commits}</span>
        </Show>
        <Show when={duration()}>
          <span class="text-[9px] font-mono text-text-muted flex-shrink-0">{duration()}</span>
        </Show>
        <RunPhaseIcon phase={run().status?.phase} />
      </div>

      <Show when={run().spec.prompt}>
        <p class="run-card__prompt">{run().spec.prompt}</p>
      </Show>

      <div class="run-card__meta">
        <span class="truncate">{run().metadata.name}</span>
        <Show when={run().status?.traceID}>
          <button
            class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono text-info/70 hover:text-info hover:bg-info/8 transition-colors flex-shrink-0"
            title={`View trace ${run().status!.traceID}`}
            onClick={(e) => {
              e.stopPropagation();
              showTraceDetail(run().status!.traceID!);
            }}
          >
            <MonitorIcon class="w-2.5 h-2.5" />
            trace
          </button>
        </Show>
        <Show when={run().status?.tokensUsed}>
          <span class="text-[9px] font-mono text-text-muted/50 flex-shrink-0">{formatTokens(run().status!.tokensUsed!)}</span>
        </Show>
        <span class="run-card__time">{relativeTime(run().metadata.creationTimestamp)}</span>
      </div>
    </button>
  );
}
