// TracesPanel — global trace browsing via Tempo.
// Shows recent traces across all agents, sorted newest-first.
// Clicking a trace opens the full TraceDetailView in the center stage.
import { createSignal, createResource, Show, For } from 'solid-js';
import { traces as tracesAPI } from '../../lib/api';
import { showTraceDetail } from '../../stores/view';
import type { TraceSearchResult } from '../../types';
import Spinner from '../shared/Spinner';
import { relativeTime } from '../../lib/format';

export default function TracesPanel() {
  const [refetchTrigger, setRefetchTrigger] = createSignal(0);

  // Fetch recent traces globally (no agent filter)
  const [traceResults, { refetch }] = createResource(
    () => refetchTrigger(),
    async () => {
      try {
        return await tracesAPI.search({ limit: 30 });
      } catch {
        return { traces: [] };
      }
    },
  );

  return (
    <div class="flex flex-col h-full">
      {/* Header with refresh */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
        <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
        <span class="text-xs font-medium text-text-secondary flex-1">All Traces</span>
        <button
          class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          onClick={() => { setRefetchTrigger((n) => n + 1); }}
          title="Refresh traces"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <Show when={traceResults.loading}>
          <div class="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        </Show>

        <Show when={!traceResults.loading}>
          <Show
            when={(traceResults()?.traces?.length ?? 0) > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                <svg class="w-8 h-8 text-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
                <p class="text-xs text-text-muted">
                  No traces yet. Traces appear after Tempo is deployed and agents send their first prompts.
                </p>
              </div>
            }
          >
            <div class="flex flex-col gap-0.5 p-1.5">
              <For each={traceResults()!.traces}>
                {(trace) => (
                  <TraceListItem
                    trace={trace}
                    onClick={() => showTraceDetail(trace.traceID)}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

// ── Trace list item ──

function TraceListItem(props: { trace: TraceSearchResult; onClick: () => void }) {
  const startTime = () => {
    if (!props.trace.startTimeUnixNano) return '';
    const ms = parseInt(props.trace.startTimeUnixNano) / 1_000_000;
    return new Date(ms).toISOString();
  };

  const duration = () => {
    if (props.trace.durationMs) return formatDuration(props.trace.durationMs);
    return '';
  };

  const rootName = () => props.trace.rootTraceName || 'agent.prompt';
  const agentName = () => props.trace.rootServiceName || '';

  return (
    <button
      class="w-full text-left px-2.5 py-2 rounded-lg hover:bg-surface-hover transition-colors border border-transparent hover:border-border-subtle group"
      onClick={props.onClick}
    >
      <div class="flex items-center gap-2">
        {/* Trace icon */}
        <div class="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
        <span class="text-xs font-mono text-text truncate flex-1">{rootName()}</span>
        <Show when={duration()}>
          <span class="text-[10px] font-mono text-text-muted">{duration()}</span>
        </Show>
      </div>
      <div class="flex items-center gap-2 mt-0.5 ml-3.5">
        <Show when={agentName()}>
          <span class="text-[10px] text-text-secondary truncate">{agentName()}</span>
          <span class="text-[10px] text-text-muted/40">|</span>
        </Show>
        <span class="text-[10px] font-mono text-text-muted/60 truncate">{props.trace.traceID.slice(0, 16)}...</span>
        <span class="flex-1" />
        <Show when={startTime()}>
          <span class="text-[10px] text-text-muted">{relativeTime(startTime())}</span>
        </Show>
      </div>
    </button>
  );
}

// ── Helpers ──

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
