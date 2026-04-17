// DelegationResultCard — renders a structured delegation result as a rich card.
// Replaces the raw [DELEGATION RESULT] text dump with a scannable card showing
// agent name, status, duration, PR link, branch, tool calls, and collapsible output.
import { Show, For, createSignal, createMemo } from 'solid-js';
import { showTraceDetail } from '../../stores/view';
import Markdown from '../shared/Markdown';
import type { DelegationResultPart } from '../../types';

interface DelegationResultCardProps {
  part: DelegationResultPart;
}

function phaseColor(phase: string): string {
  switch (phase) {
    case 'Succeeded': case 'Completed': return 'text-success';
    case 'Failed': case 'Error': return 'text-error';
    case 'TimedOut': return 'text-warning';
    default: return 'text-text-muted';
  }
}

function phaseIcon(phase: string): string {
  switch (phase) {
    case 'Succeeded': case 'Completed': return '\u2713';
    case 'Failed': case 'Error': return '\u2717';
    case 'TimedOut': return '\u29D6';
    default: return '\u2022';
  }
}

function phaseBg(phase: string): string {
  switch (phase) {
    case 'Succeeded': case 'Completed': return 'border-success/20 bg-gradient-to-br from-success/5 via-emerald-500/3 to-transparent';
    case 'Failed': case 'Error': return 'border-error/20 bg-gradient-to-br from-error/5 via-red-500/3 to-transparent';
    case 'TimedOut': return 'border-warning/20 bg-gradient-to-br from-warning/5 via-amber-500/3 to-transparent';
    default: return 'border-border-subtle bg-surface-2';
  }
}

function headerBg(phase: string): string {
  switch (phase) {
    case 'Succeeded': case 'Completed': return 'bg-gradient-to-r from-success/10 via-emerald-500/6 to-transparent';
    case 'Failed': case 'Error': return 'bg-gradient-to-r from-error/10 via-red-500/6 to-transparent';
    case 'TimedOut': return 'bg-gradient-to-r from-warning/10 via-amber-500/6 to-transparent';
    default: return 'bg-surface/30';
  }
}

/** Extract PR number from URL like https://github.com/user/repo/pull/2 */
function prNumber(url: string): string | null {
  const match = url.match(/\/pull\/(\d+)/);
  if (match) return `#${match[1]}`;
  const mrMatch = url.match(/\/merge_requests\/(\d+)/);
  if (mrMatch) return `!${mrMatch[1]}`;
  return null;
}

/** Extract repo short name from PR URL */
function repoFromURL(url: string): string | null {
  const match = url.match(/(?:github\.com|gitlab\.com)\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

/** Detect forge from URL */
function forgeFromURL(url: string): 'github' | 'gitlab' | null {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab.com')) return 'gitlab';
  return null;
}

function RunResultRow(props: {
  runName: string;
  run: DelegationResultPart['runs'][string];
}) {
  const [expanded, setExpanded] = createSignal(false);
  const r = () => props.run;
  const hasPR = () => !!r().pullRequestURL;
  const hasOutput = () => !!r().output;
  const forge = () => r().pullRequestURL ? forgeFromURL(r().pullRequestURL!) : null;

  return (
    <div class={`rounded-lg border overflow-hidden ${phaseBg(r().phase)}`}>
      {/* Header */}
      <div class={`flex items-center gap-2 px-3 py-2 ${headerBg(r().phase)}`}>
        <span class={`text-sm font-bold ${phaseColor(r().phase)}`}>{phaseIcon(r().phase)}</span>
        <span class="text-xs font-semibold text-text font-mono">{r().agentName}</span>
        <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
          r().phase === 'Succeeded' || r().phase === 'Completed'
            ? 'bg-success/15 text-success'
            : r().phase === 'Failed' || r().phase === 'Error'
              ? 'bg-error/15 text-error'
              : 'bg-warning/15 text-warning'
        }`}>
          {r().phase}
        </span>
        <div class="flex-1" />
        <Show when={r().duration && r().duration !== '0s'}>
          <span class="text-[10px] text-text-muted font-mono">{r().duration}</span>
        </Show>
      </div>

      {/* Body */}
      <div class="px-3 py-2 space-y-2">
        {/* PR + Branch row */}
        <Show when={hasPR() || r().branch}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={hasPR()}>
              <a
                href={r().pullRequestURL}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/8 border border-accent/20 hover:bg-accent/15 transition-colors text-xs font-mono text-accent"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Forge icon */}
                <Show when={forge() === 'github'}>
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                  </svg>
                </Show>
                <Show when={forge() === 'gitlab'}>
                  <svg class="w-3.5 h-3.5 text-[#FC6D26]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
                  </svg>
                </Show>
                <span>{repoFromURL(r().pullRequestURL!) || 'PR'}</span>
                <span class="font-semibold">{prNumber(r().pullRequestURL!) || ''}</span>
                <svg class="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </Show>
            <Show when={r().branch}>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 border border-border-subtle text-[10px] font-mono text-text-secondary">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                </svg>
                {r().branch}
              </span>
            </Show>
            <Show when={r().commits && r().commits! > 0}>
              <span class="text-[10px] text-text-muted">{r().commits} commit{r().commits! > 1 ? 's' : ''}</span>
            </Show>
          </div>
        </Show>

        {/* Stats row */}
        <div class="flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
          <Show when={r().toolCalls > 0}>
            <span class="font-mono">{r().toolCalls} tool calls</span>
          </Show>
          <Show when={r().model}>
            <span class="font-mono">{r().model}</span>
          </Show>
          <Show when={r().traceID}>
            <button
              class="text-accent/70 hover:text-accent transition-colors font-mono"
              onClick={(e) => { e.stopPropagation(); showTraceDetail(r().traceID!); }}
            >
              trace
            </button>
          </Show>
        </div>

        {/* Failure reason */}
        <Show when={r().failureReason}>
          <div class="px-2.5 py-1.5 rounded-md bg-error/5 border border-error/15 text-xs text-error/80 font-mono">
            {r().failureReason}
          </div>
        </Show>

        {/* Collapsible output */}
        <Show when={hasOutput()}>
          <div>
            <button
              class="text-[10px] font-medium text-accent/70 hover:text-accent transition-colors"
              onClick={() => setExpanded(!expanded())}
            >
              {expanded() ? 'Hide output' : 'Show output'}
            </button>
            <Show when={expanded()}>
              <div class="mt-1.5 rounded-lg border border-border-subtle bg-surface-2/80 px-3 py-2 max-h-[30vh] overflow-y-auto">
                <Markdown content={r().output} class="text-xs" />
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

export default function DelegationResultCard(props: DelegationResultCardProps) {
  const part = () => props.part;
  const runEntries = createMemo(() => Object.entries(part().runs));
  const isSingle = () => part().single;

  // For single delegation, extract the one run
  const singleRun = createMemo(() => {
    if (!isSingle()) return null;
    const entries = runEntries();
    if (entries.length === 0) return null;
    return { runName: entries[0][0], run: entries[0][1] };
  });

  // Overall status
  const overallPhase = createMemo(() => {
    if (part().timedOut) return 'TimedOut';
    if (part().failed > 0 && part().succeeded > 0) return 'Partial';
    if (part().failed > 0) return 'Failed';
    return 'Succeeded';
  });

  return (
    <div class="my-2">
      <Show when={isSingle() && singleRun()}>
        {/* Single delegation — just the run card */}
        <RunResultRow runName={singleRun()!.runName} run={singleRun()!.run} />
      </Show>

      <Show when={!isSingle()}>
        {/* Fan-out — group header + individual run cards */}
        <div class={`rounded-lg border overflow-hidden ${
          overallPhase() === 'Succeeded' ? 'border-success/20' :
          overallPhase() === 'Failed' ? 'border-error/20' :
          overallPhase() === 'TimedOut' ? 'border-warning/20' :
          'border-indigo-400/20'
        }`}>
          {/* Group header */}
          <div class={`flex items-center gap-2 px-3 py-2 border-b border-inherit ${
            overallPhase() === 'Succeeded' ? 'bg-gradient-to-r from-success/8 to-transparent' :
            overallPhase() === 'Failed' ? 'bg-gradient-to-r from-error/8 to-transparent' :
            'bg-gradient-to-r from-indigo-500/8 to-transparent'
          }`}>
            <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span class="text-xs font-semibold text-text">Delegation Results</span>
            <span class="text-[10px] text-text-muted font-mono">{part().totalDuration}</span>
            <div class="flex-1" />
            <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              overallPhase() === 'Succeeded' ? 'bg-success/15 text-success' :
              overallPhase() === 'Failed' ? 'bg-error/15 text-error' :
              'bg-warning/15 text-warning'
            }`}>
              {part().succeeded} ok{part().failed > 0 ? ` / ${part().failed} failed` : ''}
            </span>
          </div>

          {/* Run cards */}
          <div class="p-2 space-y-2">
            <For each={runEntries()}>
              {([runName, run]) => <RunResultRow runName={runName} run={run} />}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
