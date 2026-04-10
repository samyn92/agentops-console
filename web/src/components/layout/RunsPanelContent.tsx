// RunsPanelContent — global runs activity feed.
// Always shows ALL runs across all agents, sorted newest-first.
// Purely global — no agent-specific pinning or reordering.
// Selected run gets accent-border highlight; clicking opens RunDetailView in center.
import { For, Show } from 'solid-js';
import {
  filteredRuns,
  allRuns,
  runFilter,
  setRunFilter,
  selectedRunKey,
  selectRun,
  clearRunSelection,
  getRunSource,
  type RunFilter as RunFilterType,
  type RunSource,
} from '../../stores/runs';
import { selectAgent } from '../../stores/agents';
import { getResourceForge, getResourceRepoName } from '../../stores/resources';
import { showRunDetail, clearCenterOverlay } from '../../stores/view';
import { relativeTime } from '../../lib/format';
import RunPhaseIcon from '../shared/RunPhaseIcon';

export default function RunsPanelContent() {
  return (
    <div class="flex flex-col h-full">
      {/* Filter tabs */}
      <div class="flex gap-0.5 px-2 py-1.5 border-b border-border bg-surface-2/30">
        <FilterTab value="all" current={runFilter()} label="All" count={(allRuns() ?? []).length} />
        <FilterTab value="active" current={runFilter()} label="Active" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Running' || r.status?.phase === 'Pending' || r.status?.phase === 'Queued').length} />
        <FilterTab value="completed" current={runFilter()} label="Done" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Succeeded').length} />
        <FilterTab value="failed" current={runFilter()} label="Failed" count={(allRuns() ?? []).filter(r => r.status?.phase === 'Failed').length} />
      </div>

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
          <div class="run-card-list p-2">
            <For each={filteredRuns()}>
              {(run) => {
                const key = () => `${run.metadata.namespace}/${run.metadata.name}`;
                const isSelected = () => selectedRunKey() === key();
                const source = () => getRunSource(run);
                const hasGit = () => !!run.status?.branch || !!run.spec.git;
                const isRunning = () => run.status?.phase === 'Running';
                const isFailed = () => run.status?.phase === 'Failed';
                const forge = () => getResourceForge(run.spec.git?.resourceRef);
                const repoName = () => getResourceRepoName(run.spec.git?.resourceRef);

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
                        selectAgent(run.metadata.namespace, run.spec.agentRef);
                        selectRun(run.metadata.namespace, run.metadata.name);
                        showRunDetail();
                      }
                    }}
                  >
                    {/* Forge watermark */}
                    <Show when={forge()}>
                      <ForgeWatermark forge={forge()!} />
                    </Show>

                    {/* Row 1 (Header): Source/forge icon + Git branch tag (or run name) + commits + phase icon */}
                    <div class="flex items-center gap-1.5">
                      <Show
                        when={hasGit() && forge()}
                        fallback={<SourceIcon source={source()} />}
                      >
                        <ForgeIcon forge={forge()!} />
                      </Show>
                      <Show
                        when={hasGit() && run.status?.branch}
                        fallback={
                          <span class="run-card__title truncate flex-1">{run.metadata.name}</span>
                        }
                      >
                        <span class={`run-card__branch-tag ${forge() === 'gitlab' ? 'run-card__branch-tag--gitlab' : forge() === 'github' ? 'run-card__branch-tag--github' : ''}`}>
                          <svg class="run-card__branch-tag-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                          </svg>
                          <span class="run-card__branch-tag-text">
                            <Show when={repoName()}>
                              <span class="run-card__branch-tag-repo">{repoName()}</span>
                            </Show>
                            <span class="run-card__branch-tag-branch">{run.status!.branch}</span>
                          </span>
                        </span>
                        <span class="flex-1" />
                      </Show>
                      <Show when={run.status?.commits}>
                        <span class="run-card__commits-inline">{run.status!.commits}</span>
                      </Show>
                      <RunPhaseIcon phase={run.status?.phase} />
                    </div>

                    {/* Row 2 (Description): Prompt preview — main content area */}
                    <Show when={run.spec.prompt}>
                      <p class="run-card__prompt">{run.spec.prompt}</p>
                    </Show>

                    {/* Row 3 (Footer): Run name + timestamp */}
                    <div class="run-card__meta">
                      <span class="truncate">{run.metadata.name}</span>
                      <span class="run-card__time">{relativeTime(run.metadata.creationTimestamp)}</span>
                    </div>
                  </button>
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

/** Forge icon (GitHub/GitLab) shown left of the branch tag */
function ForgeIcon(props: { forge: 'github' | 'gitlab' | 'git' }) {
  return (
    <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
      <Show when={props.forge === 'github'}>
        <svg class="w-[18px] h-[18px] text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'gitlab'}>
        <svg class="w-[18px] h-[18px] text-[#FC6D26]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'git'}>
        <svg class="w-[18px] h-[18px] text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
        </svg>
      </Show>
    </span>
  );
}

/** Subtle forge logo watermark in the bottom-right corner of run cards */
function ForgeWatermark(props: { forge: 'github' | 'gitlab' | 'git' }) {
  return (
    <div class={`run-card__watermark run-card__watermark--${props.forge}`}>
      <Show when={props.forge === 'github'}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'gitlab'}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'git'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
        </svg>
      </Show>
    </div>
  );
}
