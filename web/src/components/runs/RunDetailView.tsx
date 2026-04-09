// RunDetailView — full center-panel view for a selected AgentRun.
// Displayed when the user clicks a run card in the right panel.
// Shows header, prompt, output, git workspace, tool calls, tokens/cost,
// source info, and error details in a spacious, scrollable layout.
import { createResource, Show, createMemo } from 'solid-js';
import { agentRuns } from '../../lib/api';
import { selectedRunKey, clearRunSelection, getRunSource, type RunSource } from '../../stores/runs';
import { clearCenterOverlay } from '../../stores/view';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import {
  formatTokens,
  formatDateTime,
  formatCost,
  relativeTime,
  phaseVariant,
} from '../../lib/format';
import type { AgentRunResponse } from '../../types';

interface RunDetailViewProps {
  class?: string;
}

export default function RunDetailView(props: RunDetailViewProps) {
  // Parse the selected run key (namespace/name)
  const runRef = createMemo(() => {
    const key = selectedRunKey();
    if (!key) return null;
    const idx = key.indexOf('/');
    if (idx === -1) return null;
    return { ns: key.slice(0, idx), name: key.slice(idx + 1) };
  });

  const [run] = createResource(
    runRef,
    (ref) => {
      if (!ref) return undefined;
      return agentRuns.get(ref.ns, ref.name);
    },
  );

  function handleBack() {
    clearRunSelection();
    clearCenterOverlay();
  }

  return (
    <div class={`flex flex-col ${props.class || ''}`}>
      {/* Loading state */}
      <Show when={run.loading}>
        <div class="flex-1 flex items-center justify-center">
          <Spinner size="md" />
        </div>
      </Show>

      {/* Error state */}
      <Show when={run.error}>
        <div class="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <p class="text-sm text-error">Failed to load run details</p>
          <button
            class="text-xs text-text-muted hover:text-text transition-colors"
            onClick={handleBack}
          >
            Back
          </button>
        </div>
      </Show>

      {/* No run selected */}
      <Show when={!runRef()}>
        <div class="flex-1 flex items-center justify-center">
          <p class="text-sm text-text-muted">No run selected</p>
        </div>
      </Show>

      {/* Run content */}
      <Show when={run()}>
        {(data) => {
          const meta = () => data().metadata;
          const spec = () => data().spec;
          const status = () => data().status;
          const source = (): RunSource => getRunSource(data());
          const hasGit = () => !!status()?.branch || !!spec().git;
          const duration = createMemo(() => {
            const s = status()?.startTime;
            const c = status()?.completionTime;
            if (!s || !c) return null;
            const ms = new Date(c).getTime() - new Date(s).getTime();
            if (ms < 1000) return `${ms}ms`;
            const secs = Math.floor(ms / 1000);
            if (secs < 60) return `${secs}s`;
            const mins = Math.floor(secs / 60);
            const remSecs = secs % 60;
            return `${mins}m ${remSecs}s`;
          });

          return (
            <>
              {/* ── Sticky Header ── */}
              <div class="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0">
                <button
                  class="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-text"
                  onClick={handleBack}
                  title="Back to agent view"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div class="flex-1 min-w-0">
                  <h2 class="text-sm font-semibold text-text font-mono truncate">{meta().name}</h2>
                  <div class="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    <span>{meta().namespace}</span>
                    <span class="text-border">|</span>
                    <span>{spec().agentRef}</span>
                    <span class="text-border">|</span>
                    <span>{relativeTime(meta().creationTimestamp)}</span>
                  </div>
                </div>
                <Badge variant={phaseVariant(status()?.phase)} dot>
                  {status()?.phase || 'Unknown'}
                </Badge>
              </div>

              {/* ── Scrollable Body ── */}
              <div class="flex-1 overflow-y-auto">
                <div class="max-w-3xl mx-auto px-6 py-6 space-y-6">

                  {/* ── Stats Row ── */}
                  <div class="flex flex-wrap gap-4">
                    <Show when={status()?.model}>
                      <StatCard label="Model" value={status()!.model!} />
                    </Show>
                    <Show when={status()?.tokensUsed}>
                      <StatCard label="Tokens" value={formatTokens(status()!.tokensUsed!)} />
                    </Show>
                    <Show when={status()?.toolCalls}>
                      <StatCard label="Tool Calls" value={String(status()!.toolCalls)} />
                    </Show>
                    <Show when={status()?.cost}>
                      <StatCard label="Cost" value={formatCost(status()!.cost!)} />
                    </Show>
                    <Show when={duration()}>
                      <StatCard label="Duration" value={duration()!} />
                    </Show>
                  </div>

                  {/* ── Source ── */}
                  <Show when={spec().source}>
                    <div class="flex items-center gap-2 text-xs text-text-muted">
                      <SourceBadge source={source()} />
                      <span>
                        {spec().source}
                        <Show when={spec().sourceRef}>
                          <span class="text-text-secondary font-mono"> / {spec().sourceRef}</span>
                        </Show>
                      </span>
                    </div>
                  </Show>

                  {/* ── Timestamps ── */}
                  <Show when={status()?.startTime || status()?.completionTime}>
                    <div class="flex gap-6 text-xs text-text-muted">
                      <Show when={status()?.startTime}>
                        <div>
                          <span class="text-text-muted">Started</span>
                          <p class="text-text-secondary font-mono mt-0.5">{formatDateTime(status()!.startTime!)}</p>
                        </div>
                      </Show>
                      <Show when={status()?.completionTime}>
                        <div>
                          <span class="text-text-muted">Completed</span>
                          <p class="text-text-secondary font-mono mt-0.5">{formatDateTime(status()!.completionTime!)}</p>
                        </div>
                      </Show>
                    </div>
                  </Show>

                  {/* ── Git Workspace ── */}
                  <Show when={hasGit()}>
                    <div class="space-y-2">
                      <div class="section-header">
                        <span class="section-label">Git Workspace</span>
                      </div>
                      <div class="git-workspace-detail">
                        <div class="flex flex-wrap gap-3">
                          <Show when={status()?.branch}>
                            <div class="flex items-center gap-1.5">
                              <svg class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                              </svg>
                              <span class="git-branch-badge">{status()!.branch}</span>
                            </div>
                          </Show>
                          <Show when={spec().git?.baseBranch}>
                            <div class="flex items-center gap-1.5 text-xs text-text-muted">
                              <span>base:</span>
                              <span class="font-mono text-text-secondary">{spec().git!.baseBranch}</span>
                            </div>
                          </Show>
                          <Show when={status()?.commits !== undefined && status()?.commits !== 0}>
                            <span class="git-commits-badge">{status()!.commits} commits</span>
                          </Show>
                        </div>
                        <Show when={status()?.pullRequestURL}>
                          <div class="mt-3 flex items-center gap-2">
                            <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <a
                              href={status()!.pullRequestURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-xs text-accent hover:underline font-mono"
                            >
                              {status()!.pullRequestURL!.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </Show>

                  {/* ── Prompt ── */}
                  <div class="space-y-2">
                    <div class="section-header">
                      <span class="section-label">Prompt</span>
                    </div>
                    <pre class="text-sm text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded-xl p-4 border border-border-subtle leading-relaxed">
                      {spec().prompt}
                    </pre>
                  </div>

                  {/* ── Output ── */}
                  <Show when={status()?.output}>
                    <div class="space-y-2">
                      <div class="section-header">
                        <span class="section-label">Output</span>
                      </div>
                      <pre class="text-sm text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded-xl p-4 border border-border-subtle max-h-[500px] overflow-y-auto leading-relaxed">
                        {status()!.output}
                      </pre>
                    </div>
                  </Show>

                  {/* ── Error ── */}
                  <Show when={status()?.error}>
                    <div class="space-y-2">
                      <div class="section-header">
                        <span class="section-label text-error">Error</span>
                      </div>
                      <pre class="text-sm text-error font-mono whitespace-pre-wrap bg-error/5 rounded-xl p-4 border border-error/20 leading-relaxed">
                        {status()!.error}
                      </pre>
                    </div>
                  </Show>

                </div>
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}

// ── Sub-components ──

function StatCard(props: { label: string; value: string }) {
  return (
    <div class="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle min-w-[80px]">
      <span class="text-[10px] text-text-muted uppercase tracking-wider">{props.label}</span>
      <span class="text-xs text-text font-mono font-medium">{props.value}</span>
    </div>
  );
}

function SourceBadge(props: { source: RunSource }) {
  const color = () => {
    switch (props.source) {
      case 'channel': return 'text-warning';
      case 'agent': return 'text-info';
      case 'schedule': return 'text-text-muted';
      default: return 'text-text-muted/50';
    }
  };

  return (
    <span class={`flex-shrink-0 ${color()}`}>
      <Show when={props.source === 'channel'}>
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
        </svg>
      </Show>
      <Show when={props.source === 'agent'}>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5" />
        </svg>
      </Show>
      <Show when={props.source === 'schedule'}>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Show>
      <Show when={props.source === 'unknown'}>
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Show>
    </span>
  );
}
