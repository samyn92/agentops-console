// TracesPanel — global trace browsing via Tempo with delegation tree.
// Shows recent traces across all agents, grouped into a delegation tree:
// parent traces are top-level, child (delegated) traces are nested underneath.
// Clicking a trace opens the full TraceDetailView in the center stage.
import { createSignal, createResource, createMemo, Show, For } from 'solid-js';
import { traces as tracesAPI } from '../../lib/api';
import { showTraceDetail, selectedTraceForDetail } from '../../stores/view';
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
  const [traceResults] = createResource(
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
        byID.get(t.parentTraceID)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Sort roots newest-first
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
          class="p-1 rounded-md hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          onClick={() => { setRefetchTrigger((n) => n + 1); }}
          title="Refresh traces"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <Show when={traceResults.loading}>
          <div class="flex items-center justify-center py-12">
            <Spinner size="sm" />
          </div>
        </Show>

        <Show when={!traceResults.loading}>
          <Show
            when={traceTree().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
                <svg class="w-8 h-8 text-text-muted/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                </svg>
                <p class="text-xs text-text-muted">
                  No traces yet. Traces appear after agents process their first prompts.
                </p>
              </div>
            }
          >
            <div class="flex flex-col p-1.5 gap-px">
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

  const agentName = () =>
    props.trace.childAgent || getAttr('agent.name') || props.trace.rootServiceName || 'unknown';
  const agentMode = () => getAttr('agent.mode');
  const isTask = () => agentMode() === 'task';
  const isDelegated = () => !!props.trace.parentTraceID;
  const isChild = () => props.depth > 0;
  const isActive = () => selectedTraceForDetail() === props.trace.traceID;

  const indent = () => props.depth * 16;

  return (
    <button
      class={`trace-list-item w-full text-left transition-all duration-150 ${
        isActive()
          ? 'trace-list-item--active'
          : 'hover:bg-surface-hover/60'
      }`}
      style={{ "padding-left": `${4 + indent()}px` }}
      classList={{
        'py-2.5 pr-4': true,
      }}
      onClick={props.onClick}
    >
      {/* Row 1: connector + dot + name + duration */}
      <div class="flex items-center gap-1.5">
        {/* Tree connector for child nodes */}
        <Show when={isChild()}>
          <svg class="w-3 h-3 text-text-muted/30 flex-shrink-0" viewBox="0 0 12 12">
            <path d="M2 0 L2 6 L10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </Show>

        {/* Mode indicator dot */}
        <div class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isTask() ? 'bg-warning' : 'bg-accent'}`} />

        {/* Agent name */}
        <span class={`text-xs font-medium truncate flex-1 ${
          isActive() ? 'text-text' : isChild() ? 'text-text-secondary' : 'text-text'
        }`}>
          {agentName()}
        </span>

        {/* Duration — right-aligned */}
        <Show when={duration()}>
          <span class={`text-[10px] font-mono tabular-nums flex-shrink-0 ml-auto ${
            isActive() ? 'text-text-secondary' : 'text-text-muted'
          }`}>
            {duration()}
          </span>
        </Show>
      </div>

      {/* Row 2: badges + trace ID + time */}
      <div
        class="flex items-center gap-1 mt-1"
        style={{ "margin-left": isChild() ? '18px' : '12px' }}
      >
        <Show when={isTask()}>
          <span class="trace-badge trace-badge--task">task</span>
        </Show>
        <Show when={isDelegated() && !isChild()}>
          <span class="trace-badge trace-badge--delegated">delegated</span>
        </Show>
        <Show when={props.trace.runSource === 'console'}>
          <span class="trace-badge">console</span>
        </Show>
        <Show when={props.trace.runSource === 'channel'}>
          <span class="trace-badge">channel</span>
        </Show>
        <Show when={props.trace.runSource === 'schedule'}>
          <span class="trace-badge">schedule</span>
        </Show>
        <span class="text-[10px] font-mono text-text-muted/40 truncate">{props.trace.traceID.slice(0, 8)}</span>
        <span class="flex-1" />
        <Show when={startTime()}>
          <span class="text-[10px] text-text-muted tabular-nums">{relativeTime(startTime())}</span>
        </Show>
      </div>

      {/* Parent agent attribution for orphaned delegated traces */}
      <Show when={isDelegated() && props.trace.parentAgent && !isChild()}>
        <div class="flex items-center gap-1 mt-0.5" style={{ "margin-left": '12px' }}>
          <svg class="w-2.5 h-2.5 text-text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12" />
          </svg>
          <span class="text-[9px] text-text-muted/50 font-mono">from {props.trace.parentAgent}</span>
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
