// TracesPanel — global trace browsing via Tempo with delegation tree.
// Shows recent traces across all agents, grouped into a delegation tree:
// parent traces are top-level, child (delegated) traces are nested underneath.
// Clicking a trace opens the full TraceDetailView in the center stage.
import { createSignal, createResource, createMemo, Show, For } from 'solid-js';
import { traces as tracesAPI } from '../../lib/api';
import { showTraceDetail } from '../../stores/view';
import type { TraceSearchResult } from '../../types';
import Spinner from '../shared/Spinner';
import { relativeTime } from '../../lib/format';

// ── Tree node type ──

interface TraceTreeNode {
  trace: TraceSearchResult;
  children: TraceTreeNode[];
}

export default function TracesPanel() {
  const [refetchTrigger, setRefetchTrigger] = createSignal(0);

  // Fetch recent traces globally (no agent filter)
  const [traceResults, { refetch }] = createResource(
    () => refetchTrigger(),
    async () => {
      try {
        return await tracesAPI.search({ limit: 50 });
      } catch {
        return { traces: [] };
      }
    },
  );

  // Build delegation tree from flat trace list.
  // Traces with parentTraceID are nested under their parent.
  // Orphaned children (parent not in results) stay at root level.
  const traceTree = createMemo((): TraceTreeNode[] => {
    const traces = traceResults()?.traces ?? [];
    if (traces.length === 0) return [];

    // Index all traces by their traceID
    const byID = new Map<string, TraceTreeNode>();
    for (const t of traces) {
      byID.set(t.traceID, { trace: t, children: [] });
    }

    const roots: TraceTreeNode[] = [];

    for (const t of traces) {
      const node = byID.get(t.traceID)!;
      if (t.parentTraceID && byID.has(t.parentTraceID)) {
        // Attach as child of parent
        byID.get(t.parentTraceID)!.children.push(node);
      } else {
        // Root-level (either no parent, or parent not in search results)
        roots.push(node);
      }
    }

    // Sort roots newest-first (Tempo already returns newest first, but be safe)
    roots.sort((a, b) => {
      const aT = parseInt(a.trace.startTimeUnixNano || '0');
      const bT = parseInt(b.trace.startTimeUnixNano || '0');
      return bT - aT;
    });

    // Sort children within each parent by start time (oldest first = execution order)
    for (const node of byID.values()) {
      if (node.children.length > 1) {
        node.children.sort((a, b) => {
          const aT = parseInt(a.trace.startTimeUnixNano || '0');
          const bT = parseInt(b.trace.startTimeUnixNano || '0');
          return aT - bT;
        });
      }
    }

    return roots;
  });

  return (
    <div class="flex flex-col h-full">
      {/* Header with refresh */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
        <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
        <span class="text-xs font-medium text-text-secondary flex-1">Traces</span>
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
            when={traceTree().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                <svg class="w-8 h-8 text-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
                <p class="text-xs text-text-muted">
                  No traces yet. Traces appear after agents send their first prompts.
                </p>
              </div>
            }
          >
            <div class="flex flex-col gap-0.5 p-1.5">
              <For each={traceTree()}>
                {(node) => <TraceTreeItem node={node} depth={0} />}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

// ── Tree item (recursive) ──

function TraceTreeItem(props: { node: TraceTreeNode; depth: number }) {
  return (
    <>
      <TraceListItem
        trace={props.node.trace}
        depth={props.depth}
        hasChildren={props.node.children.length > 0}
        onClick={() => showTraceDetail(props.node.trace.traceID)}
      />
      <For each={props.node.children}>
        {(child) => <TraceTreeItem node={child} depth={props.depth + 1} />}
      </For>
    </>
  );
}

// ── Trace list item ──

function TraceListItem(props: {
  trace: TraceSearchResult;
  depth: number;
  hasChildren: boolean;
  onClick: () => void;
}) {
  const startTime = () => {
    if (!props.trace.startTimeUnixNano) return '';
    const ms = parseInt(props.trace.startTimeUnixNano) / 1_000_000;
    return new Date(ms).toISOString();
  };

  const duration = () => {
    if (props.trace.durationMs) return formatDuration(props.trace.durationMs);
    return '';
  };

  // Extract attributes from spanSets or spanSet
  const getAttr = (key: string): string | undefined => {
    for (const ss of props.trace.spanSets ?? []) {
      for (const span of ss.spans ?? []) {
        for (const attr of span.attributes ?? []) {
          if (attr.key === key && attr.value?.stringValue) {
            return attr.value.stringValue;
          }
        }
      }
    }
    const ss = props.trace.spanSet;
    if (ss?.spans) {
      for (const span of ss.spans) {
        for (const attr of span.attributes ?? []) {
          if (attr.key === key && attr.value?.stringValue) {
            return attr.value.stringValue;
          }
        }
      }
    }
    return undefined;
  };

  // Use BFF-enriched childAgent first, then fall back to spanSet agent.name
  const agentName = () =>
    props.trace.childAgent || getAttr('agent.name') || props.trace.rootServiceName || 'unknown';
  const agentMode = () => getAttr('agent.mode');
  const isTask = () => agentMode() === 'task';
  const isDelegated = () => !!props.trace.parentTraceID;
  const isChild = () => props.depth > 0;

  // Indentation: 16px per depth level
  const indent = () => props.depth * 16;

  return (
    <button
      class="w-full text-left rounded-lg hover:bg-surface-hover transition-colors border border-transparent hover:border-border-subtle group"
      style={{ "padding-left": `${6 + indent()}px` }}
      classList={{
        'py-2 pr-2.5': true,
      }}
      onClick={props.onClick}
    >
      <div class="flex items-center gap-1.5">
        {/* Tree connector for child nodes */}
        <Show when={isChild()}>
          <svg class="w-3 h-3 text-text-muted/40 flex-shrink-0" viewBox="0 0 12 12">
            <path d="M2 0 L2 6 L10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </Show>

        {/* Mode indicator dot */}
        <div
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          classList={{
            'bg-warning': isTask(),
            'bg-accent': !isTask() && !isDelegated(),
            'bg-accent': !isTask(),
          }}
        />

        {/* Agent name */}
        <span
          class="text-xs font-mono font-medium truncate flex-1"
          classList={{
            'text-text': !isChild(),
            'text-text-secondary': isChild(),
          }}
        >
          {agentName()}
        </span>

        {/* Duration */}
        <Show when={duration()}>
          <span class="text-[10px] font-mono text-text-muted">{duration()}</span>
        </Show>
      </div>

      {/* Second row: badges + trace ID + time */}
      <div
        class="flex items-center gap-1.5 mt-0.5"
        style={{ "margin-left": isChild() ? '18px' : '12px' }}
      >
        <Show when={isTask()}>
          <span class="text-[9px] px-1 py-0 rounded bg-warning/10 text-warning border border-warning/20 font-medium">task</span>
        </Show>
        <Show when={isDelegated() && !isChild()}>
          <span class="text-[9px] px-1 py-0 rounded bg-accent/10 text-accent border border-accent/20 font-medium">delegated</span>
        </Show>
        <Show when={props.trace.runSource === 'console'}>
          <span class="text-[9px] px-1 py-0 rounded bg-surface-hover text-text-muted border border-border-subtle font-medium">console</span>
        </Show>
        <Show when={props.trace.runSource === 'channel'}>
          <span class="text-[9px] px-1 py-0 rounded bg-surface-hover text-text-muted border border-border-subtle font-medium">channel</span>
        </Show>
        <Show when={props.trace.runSource === 'schedule'}>
          <span class="text-[9px] px-1 py-0 rounded bg-surface-hover text-text-muted border border-border-subtle font-medium">schedule</span>
        </Show>
        <span class="text-[10px] font-mono text-text-muted/50 truncate">{props.trace.traceID.slice(0, 8)}</span>
        <span class="flex-1" />
        <Show when={startTime()}>
          <span class="text-[10px] text-text-muted">{relativeTime(startTime())}</span>
        </Show>
      </div>

      {/* Parent agent attribution for child nodes */}
      <Show when={isDelegated() && props.trace.parentAgent && !isChild()}>
        <div class="flex items-center gap-1 mt-0.5 ml-3">
          <svg class="w-2.5 h-2.5 text-text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12" />
          </svg>
          <span class="text-[9px] text-text-muted/60 font-mono">from {props.trace.parentAgent}</span>
        </div>
      </Show>
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
