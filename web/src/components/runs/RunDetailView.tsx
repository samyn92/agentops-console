// RunDetailView — full center-panel body for a selected AgentRun.
// Header is rendered by MainApp. This component shows the scrollable content:
// stats, source, timestamps, git workspace, prompt, output, error.
import { createResource, Show, createMemo } from 'solid-js';
import { agentRuns } from '../../lib/api';
import { selectedRunKey, getRunSource, type RunSource } from '../../stores/runs';
import { getResourceForge, getResourceRepoName } from '../../stores/resources';
import Spinner from '../shared/Spinner';
import Markdown from '../shared/Markdown';
import {
  formatTokens,
  formatDateTime,
  formatCost,
} from '../../lib/format';

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
        <div class="flex-1 flex items-center justify-center px-4">
          <p class="text-sm text-error">Failed to load run details</p>
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
                    {(() => {
                      const forge = () => getResourceForge(spec().git?.resourceRef);
                      const repoName = () => getResourceRepoName(spec().git?.resourceRef);
                      const forgeClass = () => {
                        const f = forge();
                        if (f === 'gitlab') return 'git-workspace-detail--gitlab';
                        if (f === 'github') return 'git-workspace-detail--github';
                        return '';
                      };

                      return (
                        <div class="space-y-2">
                          <div class="section-header">
                            <span class="section-label">Git Workspace</span>
                          </div>
                          <div class={`git-workspace-detail ${forgeClass()}`}>
                            {/* Single row: forge icon + branch tag (optionally clickable) + commits */}
                            <div class="git-workspace__primary">
                              {/* Forge icon */}
                              <Show when={forge()}>
                                <span class="git-workspace__forge-icon">
                                  <Show when={forge() === 'github'}>
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                  </Show>
                                  <Show when={forge() === 'gitlab'}>
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
                                    </svg>
                                  </Show>
                                  <Show when={forge() === 'git'}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                                    </svg>
                                  </Show>
                                </span>
                              </Show>

                              {/* Branch tag — clickable link when PR/MR exists, plain span otherwise */}
                              <Show when={status()?.branch}>
                                <Show
                                  when={status()?.pullRequestURL}
                                  fallback={
                                    <span class={`run-card__branch-tag run-card__branch-tag--lg ${forge() === 'gitlab' ? 'run-card__branch-tag--gitlab' : forge() === 'github' ? 'run-card__branch-tag--github' : ''}`}>
                                      <svg class="run-card__branch-tag-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                                      </svg>
                                      <span class="run-card__branch-tag-text">
                                        <Show when={repoName()}>
                                          <span class="run-card__branch-tag-repo" style="font-size: 10px;">{repoName()}</span>
                                        </Show>
                                        <span class="run-card__branch-tag-branch" style="font-size: 13px;">{status()!.branch}</span>
                                      </span>
                                    </span>
                                  }
                                >
                                  <a
                                    href={status()!.pullRequestURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class={`run-card__branch-tag run-card__branch-tag--lg run-card__branch-tag--link ${forge() === 'gitlab' ? 'run-card__branch-tag--gitlab' : forge() === 'github' ? 'run-card__branch-tag--github' : ''}`}
                                  >
                                    <svg class="run-card__branch-tag-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 16px; height: 16px;">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    <span class="run-card__branch-tag-text">
                                      <Show when={repoName()}>
                                        <span class="run-card__branch-tag-repo" style="font-size: 10px;">{repoName()}</span>
                                      </Show>
                                      <span class="run-card__branch-tag-branch" style="font-size: 13px;">{status()!.branch}</span>
                                    </span>
                                    <svg class="run-card__branch-tag-extlink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                </Show>
                              </Show>

                              {/* Spacer */}
                              <span class="flex-1" />

                              {/* Base branch */}
                              <Show when={spec().git?.baseBranch}>
                                <div class="git-workspace__base-branch">
                                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <span class="git-workspace__base-branch-name">{spec().git!.baseBranch}</span>
                                </div>
                              </Show>

                              {/* Commits count */}
                              <Show when={status()?.commits !== undefined && status()?.commits !== 0}>
                                <span class="git-commits-badge">{status()!.commits} commits</span>
                              </Show>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Show>

                  {/* ── Prompt ── */}
                  <div class="space-y-2">
                    <div class="section-header">
                      <span class="section-label">Prompt</span>
                    </div>
                    <div class="bg-surface-2 rounded-xl p-4 border border-border-subtle leading-relaxed">
                      <Markdown content={spec().prompt} />
                    </div>
                  </div>

                  {/* ── Output ── */}
                  <Show when={status()?.output}>
                    <div class="space-y-2">
                      <div class="section-header">
                        <span class="section-label">Output</span>
                      </div>
                      <div class="bg-surface-2 rounded-xl p-4 border border-border-subtle leading-relaxed">
                        <Markdown content={status()!.output!} />
                      </div>
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
