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
  getRunDelegationGroup,
  delegationGroups,
  type RunFilter as RunFilterType,
  type RunSource,
} from '../../stores/runs';
import { selectAgent } from '../../stores/agents';
import { getResourceForge, getResourceRepoName } from '../../stores/resources';
import { showRunDetail, clearCenterOverlay } from '../../stores/view';
import { relativeTime } from '../../lib/format';
import RunPhaseIcon from '../shared/RunPhaseIcon';
import { Tabs } from '@ark-ui/solid/tabs';
import { ForgeIcon, ForgeWatermark, SourceIcon, PlayIcon, GitBranchIcon, HamburgerIcon } from '../shared/Icons';

export default function RunsPanelContent() {
  return (
    <div class="flex flex-col h-full">
      {/* Filter tabs */}
      <Tabs.Root
        value={runFilter()}
        onValueChange={(details) => setRunFilter(details.value as RunFilterType)}
      >
        <Tabs.List class="flex gap-0.5 px-2 py-1.5 border-b border-border bg-surface-2/30">
          <Tabs.Trigger value="all" class="px-2.5 py-1 text-[11px] rounded-lg transition-colors data-[selected]:bg-surface-hover data-[selected]:text-text data-[selected]:font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover/50">
            All <span class="ml-1 opacity-60">{(allRuns() ?? []).length || ''}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="active" class="px-2.5 py-1 text-[11px] rounded-lg transition-colors data-[selected]:bg-surface-hover data-[selected]:text-text data-[selected]:font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover/50">
            Active <span class="ml-1 opacity-60">{(allRuns() ?? []).filter(r => r.status?.phase === 'Running' || r.status?.phase === 'Pending' || r.status?.phase === 'Queued').length || ''}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="completed" class="px-2.5 py-1 text-[11px] rounded-lg transition-colors data-[selected]:bg-surface-hover data-[selected]:text-text data-[selected]:font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover/50">
            Done <span class="ml-1 opacity-60">{(allRuns() ?? []).filter(r => r.status?.phase === 'Succeeded').length || ''}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="failed" class="px-2.5 py-1 text-[11px] rounded-lg transition-colors data-[selected]:bg-surface-hover data-[selected]:text-text data-[selected]:font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover/50">
            Failed <span class="ml-1 opacity-60">{(allRuns() ?? []).filter(r => r.status?.phase === 'Failed').length || ''}</span>
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      {/* Run list */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={filteredRuns().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
              <PlayIcon class="w-8 h-8 text-text-muted mb-2" />
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
                const groupId = () => getRunDelegationGroup(run);

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
                          <GitBranchIcon class="run-card__branch-tag-icon" />
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

                    {/* Row 3 (Footer): Run name + delegation group badge + timestamp */}
                    <div class="run-card__meta">
                      <span class="truncate">{run.metadata.name}</span>
                      <Show when={groupId()}>
                        <span class="inline-flex items-center gap-0.5 px-1 py-0 text-[9px] font-mono rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0" title={`Delegation group ${groupId()}`}>
                          <HamburgerIcon class="w-2 h-2" />
                          {groupId()}
                        </span>
                      </Show>
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

