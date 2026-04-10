// TracesPanel — agent-scoped trace browsing via Tempo.
// Shows recent traces for the selected agent with a compact waterfall view.
import { createSignal, createResource, Show, For, batch } from 'solid-js';
import { selectedAgent } from '../../stores/agents';
import { traces as tracesAPI } from '../../lib/api';
import type { TraceSearchResult, TraceSpan, TempoTraceResponse } from '../../types';
import Spinner from '../shared/Spinner';
import { relativeTime } from '../../lib/format';

export default function TracesPanel() {
  const [selectedTraceID, setSelectedTraceID] = createSignal<string | null>(null);

  // Fetch recent traces for the selected agent
  const [traceResults, { refetch }] = createResource(
    () => selectedAgent()?.name,
    async (agentName) => {
      if (!agentName) return { traces: [] };
      try {
        return await tracesAPI.search({ agentName, limit: 20 });
      } catch {
        return { traces: [] };
      }
    },
  );

  // Fetch trace detail when a trace is selected
  const [traceDetail] = createResource(selectedTraceID, async (traceID) => {
    if (!traceID) return null;
    try {
      return await tracesAPI.get(traceID);
    } catch {
      return null;
    }
  });

  return (
    <div class="flex flex-col h-full">
      {/* Header with title + refresh */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
        <Show
          when={!selectedTraceID()}
          fallback={
            <button
              class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
              onClick={() => setSelectedTraceID(null)}
              title="Back to trace list"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          }
        >
          <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
        </Show>
        <span class="text-xs font-medium text-text-secondary flex-1">
          {selectedTraceID() ? `Trace ${selectedTraceID()!.slice(0, 8)}...` : 'Traces'}
        </span>
        <button
          class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          onClick={() => {
            setSelectedTraceID(null);
            refetch();
          }}
          title="Refresh traces"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <Show
          when={!selectedTraceID()}
          fallback={
            <Show
              when={!traceDetail.loading}
              fallback={
                <div class="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              }
            >
              <TraceWaterfall trace={traceDetail()} traceID={selectedTraceID()!} />
            </Show>
          }
        >
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
                      onClick={() => setSelectedTraceID(trace.traceID)}
                    />
                  )}
                </For>
              </div>
            </Show>
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
        <span class="text-[10px] font-mono text-text-muted/60 truncate">{props.trace.traceID.slice(0, 16)}...</span>
        <span class="flex-1" />
        <Show when={startTime()}>
          <span class="text-[10px] text-text-muted">{relativeTime(startTime())}</span>
        </Show>
      </div>
    </button>
  );
}

// ── Trace waterfall ──

interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
  depth: number;
}

function TraceWaterfall(props: { trace: TempoTraceResponse | null | undefined; traceID: string }) {
  // Parse spans from the Tempo response into a tree
  const spanTree = (): SpanNode[] => {
    const trace = props.trace;
    if (!trace?.data?.[0]) return [];

    const spans = trace.data[0].spans;
    if (!spans || spans.length === 0) return [];

    // Build span map
    const spanMap = new Map<string, SpanNode>();
    for (const span of spans) {
      spanMap.set(span.spanID, { span, children: [], depth: 0 });
    }

    // Build tree
    const roots: SpanNode[] = [];
    for (const node of spanMap.values()) {
      if (node.span.parentSpanID && spanMap.has(node.span.parentSpanID)) {
        spanMap.get(node.span.parentSpanID)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Sort children by startTime
    function sortChildren(node: SpanNode, depth: number) {
      node.depth = depth;
      node.children.sort((a, b) => a.span.startTime - b.span.startTime);
      for (const child of node.children) {
        sortChildren(child, depth + 1);
      }
    }
    for (const root of roots) {
      sortChildren(root, 0);
    }

    return roots;
  };

  // Flatten tree for rendering
  const flatSpans = (): SpanNode[] => {
    const result: SpanNode[] = [];
    function flatten(node: SpanNode) {
      result.push(node);
      for (const child of node.children) {
        flatten(child);
      }
    }
    for (const root of spanTree()) {
      flatten(root);
    }
    return result;
  };

  // Time range for the waterfall bar positions
  const timeRange = () => {
    const spans = flatSpans();
    if (spans.length === 0) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const node of spans) {
      const start = node.span.startTime;
      const end = start + node.span.duration;
      if (start < min) min = start;
      if (end > max) max = end;
    }
    return { min, max: max === min ? max + 1 : max };
  };

  return (
    <div class="px-2 py-2">
      <Show
        when={flatSpans().length > 0}
        fallback={
          <div class="text-xs text-text-muted text-center py-4">
            No spans found for this trace.
          </div>
        }
      >
        <div class="space-y-px">
          <For each={flatSpans()}>
            {(node) => {
              const range = timeRange();
              const totalDuration = range.max - range.min;
              const leftPct = () => ((node.span.startTime - range.min) / totalDuration) * 100;
              const widthPct = () => Math.max(0.5, (node.span.duration / totalDuration) * 100);
              const durationText = () => formatDuration(node.span.duration / 1000); // microseconds to ms
              const isError = () => node.span.status?.code === 2;
              const barColor = () => {
                if (isError()) return 'bg-error';
                const op = node.span.operationName;
                if (op.startsWith('gen_ai.')) return 'bg-info';
                if (op.startsWith('tool.') || op.startsWith('mcp.')) return 'bg-warning';
                if (op.startsWith('engram.')) return 'bg-success/70';
                if (op.startsWith('agent.step')) return 'bg-accent/60';
                return 'bg-accent';
              };

              // Extract key attributes
              const getTag = (key: string) => {
                const tag = node.span.tags?.find((t) => t.key === key);
                return tag?.value as string | undefined;
              };

              const model = () => getTag('gen_ai.request.model') || getTag('gen_ai.response.model');
              const toolName = () => getTag('tool.name');
              const tokens = () => {
                const input = getTag('gen_ai.usage.input_tokens');
                const output = getTag('gen_ai.usage.output_tokens');
                if (input || output) return `${input || '0'}/${output || '0'}`;
                return undefined;
              };

              return (
                <div
                  class="group flex items-center gap-1 py-0.5 hover:bg-surface-hover/50 rounded transition-colors"
                  title={`${node.span.operationName} (${durationText()})`}
                >
                  {/* Span name (indented) */}
                  <div
                    class="flex-shrink-0 text-[10px] font-mono text-text-secondary truncate"
                    style={{ width: '120px', 'padding-left': `${node.depth * 10}px` }}
                  >
                    <span class={isError() ? 'text-error' : ''}>
                      {shortSpanName(node.span.operationName)}
                    </span>
                  </div>

                  {/* Waterfall bar */}
                  <div class="flex-1 h-4 relative min-w-0">
                    <div
                      class={`absolute top-0.5 h-3 rounded-sm ${barColor()} transition-all`}
                      style={{
                        left: `${leftPct()}%`,
                        width: `${widthPct()}%`,
                        'min-width': '2px',
                      }}
                    />
                  </div>

                  {/* Duration */}
                  <span class="flex-shrink-0 text-[9px] font-mono text-text-muted w-12 text-right">
                    {durationText()}
                  </span>
                </div>
              );
            }}
          </For>
        </div>

        {/* Legend */}
        <div class="flex flex-wrap gap-3 mt-3 pt-2 border-t border-border">
          <LegendItem color="bg-accent" label="agent" />
          <LegendItem color="bg-info" label="gen_ai" />
          <LegendItem color="bg-warning" label="tool" />
          <LegendItem color="bg-success/70" label="engram" />
          <LegendItem color="bg-error" label="error" />
        </div>
      </Show>
    </div>
  );
}

function LegendItem(props: { color: string; label: string }) {
  return (
    <div class="flex items-center gap-1">
      <div class={`w-2 h-2 rounded-sm ${props.color}`} />
      <span class="text-[9px] text-text-muted">{props.label}</span>
    </div>
  );
}

// ── Helpers ──

/** Shorten a span operation name for the compact waterfall view */
function shortSpanName(name: string): string {
  // "agent.prompt" → "prompt"
  // "agent.step" → "step"
  // "tool.execute" → the tool name part or "tool"
  // "gen_ai.stream" → "stream"
  // "engram.fetch_context" → "fetch_ctx"
  if (name.startsWith('agent.')) return name.slice(6);
  if (name.startsWith('gen_ai.')) return name.slice(7);
  if (name.startsWith('tool.execute')) return 'tool';
  if (name.startsWith('mcp.call')) return 'mcp';
  if (name.startsWith('engram.')) return name.slice(7);
  return name;
}

/** Format microseconds or milliseconds as a human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
