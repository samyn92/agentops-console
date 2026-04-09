// RunsPanelContent — global runs activity feed.
// Always shows ALL runs across all agents. When an agent is selected,
// that agent's runs are pinned to the top and visually highlighted.
// This is the single source of truth for execution monitoring.
import { For, Show, createMemo } from 'solid-js';
import {
  filteredRuns,
  allRuns,
  runFilter,
  setRunFilter,
  selectedRunKey,
  selectRun,
  clearRunSelection,
  activeRunCount,
  pinnedRunCount,
  isRunPinned,
  concurrencyInfo,
  getRunSource,
  type RunFilter as RunFilterType,
  type RunSource,
} from '../../stores/runs';
import { selectedAgent } from '../../stores/agents';
import Badge from '../shared/Badge';
import NeuralTrace from '../shared/NeuralTrace';
import { relativeTime, phaseVariant, formatTokens, formatCost, formatDateTime } from '../../lib/format';
import type { AgentRunResponse } from '../../types';

export default function RunsPanelContent() {
  const globalActive = () => activeRunCount();
  const agent = () => selectedAgent();
  const pinCount = () => pinnedRunCount();

  // Detect the boundary between pinned and unpinned runs
  const pinnedBoundaryIndex = createMemo(() => {
    if (!agent()) return -1;
    const runs = filteredRuns();
    for (let i = 0; i < runs.length; i++) {
      if (!isRunPinned(runs[i])) return i;
    }
    return runs.length; // All are pinned
  });

  return (
    <div class="flex flex-col h-full">
      {/* Concurrency gauge (when agent selected and has runs) */}
      <Show when={agent() && concurrencyInfo()}>
        {(info) => (
          <div class="px-3 py-2 border-b border-border bg-surface-2/50">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-text-muted">Slots:</span>
              <div class="flex gap-0.5 flex-1">
                <For each={Array.from({ length: Math.max(info().running + info().queued, info().running + 1) })}>
                  {(_, i) => (
                    <div
                      class={`h-1.5 flex-1 rounded-full ${
                        i() < info().running
                          ? 'bg-success'
                          : i() < info().running + info().queued
                            ? 'bg-warning'
                            : 'bg-border'
                      }`}
                    />
                  )}
                </For>
              </div>
              <span class="text-text-secondary font-mono">
                {info().running}r
                <Show when={info().queued > 0}>
                  <span class="text-warning"> +{info().queued}q</span>
                </Show>
              </span>
            </div>
          </div>
        )}
      </Show>

      {/* Filter tabs */}
      <div class="flex gap-0.5 px-2 py-1.5 border-b border-border bg-surface-2/30">
        <FilterTab value="all" current={runFilter()} label="All" count={(allRuns() ?? []).length} />
        <FilterTab value="active" current={runFilter()} label="Active" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Running' || r.status?.phase === 'Pending' || r.status?.phase === 'Queued').length} />
        <FilterTab value="completed" current={runFilter()} label="Done" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Succeeded').length} />
        <FilterTab value="failed" current={runFilter()} label="Failed" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Failed').length} />
      </div>

      {/* Active runs neural trace */}
      <NeuralTrace active={globalActive() > 0} size="sm" />

      {/* Run list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={filteredRuns().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
              <svg class="w-8 h-8 text-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              <p class="text-xs text-text-muted">
                No {runFilter() !== 'all' ? runFilter() : ''} runs yet.
              </p>
            </div>
          }
        >
          <div class="flex flex-col">
            {/* Pinned section header */}
            <Show when={agent() && pinCount() > 0}>
              <div class="section-header section-header--first">
                <span class="section-label" style={{ color: 'var(--accent)' }}>
                  {agent()!.name} — {pinCount()} runs
                </span>
              </div>
            </Show>

            <For each={filteredRuns()}>
              {(run, index) => {
                const key = () => `${run.metadata.namespace}/${run.metadata.name}`;
                const isSelected = () => selectedRunKey() === key();
                const pinned = () => isRunPinned(run);
                const source = () => getRunSource(run);
                const hasGit = () => !!run.status?.branch || !!run.spec.git;

                // Show separator between pinned and unpinned runs
                const showSeparator = () => {
                  if (!agent()) return false;
                  return index() === pinnedBoundaryIndex() && index() > 0;
                };

                return (
                  <>
                    <Show when={showSeparator()}>
                      <div class="section-header">
                        <span class="section-label">
                          Other Agents
                        </span>
                      </div>
                    </Show>
                    <button
                      class={`w-full text-left px-3 py-2.5 transition-colors border-b border-border-subtle ${
                        isSelected()
                          ? 'bg-accent-muted border-l-2 border-l-accent'
                          : pinned()
                            ? 'bg-accent-muted/20 hover:bg-accent-muted/30 border-l-2 border-l-accent/40'
                            : 'hover:bg-surface-hover border-l-2 border-l-transparent'
                      }`}
                      onClick={() => {
                        if (isSelected()) {
                          clearRunSelection();
                        } else {
                          selectRun(run.metadata.namespace, run.metadata.name);
                        }
                      }}
                    >
                      {/* Row 1: Name + phase badge */}
                      <div class="flex items-center gap-1.5 mb-0.5">
                        <SourceIcon source={source()} />
                        <span class="text-xs font-mono text-text truncate flex-1">
                          {run.metadata.name}
                        </span>
                        <Badge variant={phaseVariant(run.status?.phase)} dot>
                          {run.status?.phase || '?'}
                        </Badge>
                      </div>

                      {/* Git badges row */}
                      <Show when={hasGit()}>
                        <div class="flex items-center gap-1.5 mb-0.5 ml-5">
                          <Show when={run.status?.branch}>
                            <span class="git-branch-badge git-branch-badge--sm">
                              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                              </svg>
                              <span class="truncate max-w-[100px]">{run.status!.branch}</span>
                            </span>
                          </Show>
                          <Show when={run.status?.pullRequestURL}>
                            <a
                              href={run.status!.pullRequestURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="git-pr-badge git-pr-badge--sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                              </svg>
                              <span>MR</span>
                            </a>
                          </Show>
                          <Show when={run.status?.commits}>
                            <span class="git-commits-badge git-commits-badge--sm">
                              {run.status!.commits}c
                            </span>
                          </Show>
                        </div>
                      </Show>

                      {/* Row 2: Agent ref + time */}
                      <div class="flex items-center gap-2 text-[11px] leading-[16px] tracking-[0.5px] text-text-muted">
                        <span class="truncate">{run.spec.agentRef}</span>
                        <Show when={run.status?.model}>
                          <span class="text-text-muted/60">{run.status!.model}</span>
                        </Show>
                        <span class="ml-auto flex-shrink-0">{relativeTime(run.metadata.creationTimestamp)}</span>
                      </div>

                      {/* Row 3: Prompt preview */}
                      <Show when={run.spec.prompt}>
                        <p class="text-[11px] text-text-secondary/70 mt-1 truncate">
                          {run.spec.prompt}
                        </p>
                      </Show>

                      {/* Inline detail when selected */}
                      <Show when={isSelected()}>
                        <div class="mt-2 pt-2 border-t border-border-subtle space-y-1.5">
                          <Show when={run.status?.tokensUsed}>
                            <DetailRow label="Tokens" value={formatTokens(run.status!.tokensUsed!)} />
                          </Show>
                          <Show when={run.status?.toolCalls}>
                            <DetailRow label="Tools" value={String(run.status!.toolCalls)} />
                          </Show>
                          <Show when={run.status?.cost}>
                            <DetailRow label="Cost" value={formatCost(run.status!.cost!)} />
                          </Show>
                          <Show when={run.spec.source}>
                            <DetailRow label="Source" value={`${run.spec.source}${run.spec.sourceRef ? ' / ' + run.spec.sourceRef : ''}`} />
                          </Show>
                          <Show when={run.status?.startTime}>
                            <DetailRow label="Started" value={formatDateTime(run.status!.startTime!)} />
                          </Show>
                          <Show when={run.status?.completionTime}>
                            <DetailRow label="Completed" value={formatDateTime(run.status!.completionTime!)} />
                          </Show>

                          {/* Git workspace details in expanded view */}
                          <Show when={hasGit()}>
                            <div class="mt-1.5 pt-1.5 border-t border-border-subtle">
                              <div class="flex items-center gap-1.5 mb-1">
                                <svg class="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                                </svg>
                                <span class="text-[10px] font-medium text-accent">Git</span>
                              </div>
                              <Show when={run.status?.branch}>
                                <DetailRow label="Branch" value={run.status!.branch!} />
                              </Show>
                              <Show when={run.spec.git?.baseBranch}>
                                <DetailRow label="Base" value={run.spec.git!.baseBranch!} />
                              </Show>
                              <Show when={run.status?.commits !== undefined && run.status?.commits !== 0}>
                                <DetailRow label="Commits" value={String(run.status!.commits)} />
                              </Show>
                              <Show when={run.status?.pullRequestURL}>
                                <div class="flex items-center gap-2 text-[11px]">
                                  <span class="text-text-muted w-16 flex-shrink-0">MR</span>
                                  <a
                                    href={run.status!.pullRequestURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-accent hover:underline font-mono truncate text-[11px]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {run.status!.pullRequestURL!.replace(/^https?:\/\//, '')}
                                  </a>
                                </div>
                              </Show>
                            </div>
                          </Show>

                          <Show when={run.status?.output}>
                            <div class="mt-1">
                              <span class="text-[10px] text-text-muted">Output</span>
                              <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded-lg p-1.5 mt-0.5 max-h-32 overflow-y-auto border border-border-subtle">
                                {run.status!.output}
                              </pre>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </button>
                  </>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── Sub-components ──

function FilterTab(props: { value: RunFilterType; current: RunFilterType; label: string; count: number }) {
  return (
    <button
      class={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
        props.current === props.value
          ? 'bg-surface-hover text-text font-medium'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover/50'
      }`}
      onClick={() => setRunFilter(props.value)}
    >
      {props.label}
      <Show when={props.count > 0}>
        <span class="ml-1 opacity-60">{props.count}</span>
      </Show>
    </button>
  );
}

function SourceIcon(props: { source: RunSource }) {
  const title = () => {
    switch (props.source) {
      case 'channel': return 'From channel';
      case 'agent': return 'Agent delegation';
      case 'schedule': return 'Scheduled';
      default: return 'Manual';
    }
  };

  return (
    <span class="flex-shrink-0 w-4 h-4 flex items-center justify-center" title={title()}>
      <Show when={props.source === 'channel'}>
        <svg class="w-3 h-3 text-warning" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
        </svg>
      </Show>
      <Show when={props.source === 'agent'}>
        <svg class="w-3 h-3 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5" />
        </svg>
      </Show>
      <Show when={props.source === 'schedule'}>
        <svg class="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Show>
      <Show when={props.source === 'unknown'}>
        <svg class="w-3 h-3 text-text-muted/50" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Show>
    </span>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-center gap-2 text-[11px]">
      <span class="text-text-muted w-16 flex-shrink-0">{props.label}</span>
      <span class="text-text-secondary font-mono truncate">{props.value}</span>
    </div>
  );
}
