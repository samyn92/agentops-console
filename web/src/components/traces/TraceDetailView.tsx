// TraceDetailView — full center-stage trace waterfall with rich span detail.
// Opens when a trace is clicked from the TracesPanel in the right sidebar.
// Features: span hierarchy waterfall, click-to-inspect span detail with
// GenAI semantic convention attributes (model, provider, tokens, tool names).
import { createSignal, createResource, Show, For, createMemo } from 'solid-js';
import { selectedTraceForDetail, clearCenterOverlay, showTraceDetail } from '../../stores/view';
import { traces as tracesAPI, agentRuns } from '../../lib/api';
import type { TraceSpan, TraceSpanLink, TempoTraceResponse, TraceProcess } from '../../types';
import Spinner from '../shared/Spinner';

interface TraceDetailViewProps {
  class?: string;
}

// ── Span tree node ──
interface SpanNode {
  span: TraceSpan;
  children: SpanNode[];
  depth: number;
}

export default function TraceDetailView(props: TraceDetailViewProps) {
  const [selectedSpanID, setSelectedSpanID] = createSignal<string | null>(null);

  const [trace] = createResource(selectedTraceForDetail, async (traceID) => {
    if (!traceID) return null;
    try {
      return await tracesAPI.get(traceID);
    } catch {
      return null;
    }
  });

  // Build span tree
  const spanTree = createMemo((): SpanNode[] => {
    const data = trace();
    if (!data?.data?.[0]) return [];
    const spans = data.data[0].spans;
    if (!spans || spans.length === 0) return [];

    const spanMap = new Map<string, SpanNode>();
    for (const span of spans) {
      spanMap.set(span.spanID, { span, children: [], depth: 0 });
    }

    const roots: SpanNode[] = [];
    for (const node of spanMap.values()) {
      if (node.span.parentSpanID && spanMap.has(node.span.parentSpanID)) {
        spanMap.get(node.span.parentSpanID)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    function sortChildren(node: SpanNode, depth: number) {
      node.depth = depth;
      node.children.sort((a, b) => a.span.startTime - b.span.startTime);
      for (const child of node.children) sortChildren(child, depth + 1);
    }
    for (const root of roots) sortChildren(root, 0);
    return roots;
  });

  // Flatten tree for rendering
  const flatSpans = createMemo((): SpanNode[] => {
    const result: SpanNode[] = [];
    function flatten(node: SpanNode) {
      result.push(node);
      for (const child of node.children) flatten(child);
    }
    for (const root of spanTree()) flatten(root);
    return result;
  });

  // Time range for waterfall
  const timeRange = createMemo(() => {
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
  });

  // Selected span data
  const selectedSpan = createMemo(() => {
    const id = selectedSpanID();
    if (!id) return null;
    return flatSpans().find((n) => n.span.spanID === id)?.span ?? null;
  });

  // Processes (for resource-level attributes)
  const processes = createMemo(() => {
    return trace()?.data?.[0]?.processes ?? {};
  });

  // Root span summary info
  const rootSummary = createMemo(() => {
    const spans = flatSpans();
    if (spans.length === 0) return null;
    const root = spans[0]?.span;
    if (!root) return null;
    const range = timeRange();
    return {
      totalDuration: (range.max - range.min) / 1000, // microseconds to ms
      spanCount: spans.length,
      model: getTag(root, 'gen_ai.request.model') || getTag(root, 'gen_ai.response.model'),
      provider: getTag(root, 'gen_ai.provider.name'),
      inputTokens: getTag(root, 'gen_ai.usage.input_tokens'),
      outputTokens: getTag(root, 'gen_ai.usage.output_tokens'),
      steps: getTag(root, 'agent.steps'),
      agentName: getTag(root, 'agent.name'),
    };
  });

  // Extract user prompt from the root span's gen_ai.content.prompt event
  const userPrompt = createMemo(() => {
    const spans = flatSpans();
    if (spans.length === 0) return null;
    const root = spans[0]?.span;
    if (!root?.logs) return null;
    for (const log of root.logs) {
      const eventField = log.fields?.find((f) => f.key === 'event');
      if (eventField?.value === 'gen_ai.content.prompt') {
        const promptField = log.fields?.find((f) => f.key === 'gen_ai.prompt');
        if (promptField) return String(promptField.value);
      }
    }
    return null;
  });

  // Extract assistant response from the root span's gen_ai.content.completion event
  const assistantResponse = createMemo(() => {
    const spans = flatSpans();
    if (spans.length === 0) return null;
    const root = spans[0]?.span;
    if (!root?.logs) return null;
    for (const log of root.logs) {
      const eventField = log.fields?.find((f) => f.key === 'event');
      if (eventField?.value === 'gen_ai.content.completion') {
        const completionField = log.fields?.find((f) => f.key === 'gen_ai.completion');
        if (completionField) return String(completionField.value);
      }
    }
    return null;
  });

  // Collect tool calls from the trace for a quick summary
  const toolSummary = createMemo(() => {
    const spans = flatSpans();
    const tools: Array<{ name: string; duration: number; isError: boolean }> = [];
    for (const node of spans) {
      const op = node.span.operationName;
      if (op.startsWith('tool.execute')) {
        const name = getTag(node.span, 'tool.name') || op.replace('tool.execute: ', '') || 'tool';
        tools.push({
          name,
          duration: node.span.duration / 1000,
          isError: node.span.status?.code === 2 || getTag(node.span, 'tool.error') === 'true',
        });
      }
    }
    return tools;
  });

  // Check if this trace was delegated FROM a parent agent (has delegation attributes on root span)
  const delegationInfo = createMemo(() => {
    const spans = flatSpans();
    if (spans.length === 0) return null;
    const root = spans[0]?.span;
    if (!root) return null;

    const parentTraceID = getTag(root, 'delegation.parent_trace_id');
    const parentSpanID = getTag(root, 'delegation.parent_span_id');
    const parentAgent = getTag(root, 'delegation.parent_agent');
    const runName = getTag(root, 'delegation.run_name');

    if (!parentTraceID || !parentAgent) return null;

    return { parentTraceID, parentSpanID, parentAgent, runName };
  });

  // Find spans that delegated TO sub-agents (run_agent tool spans with delegation.child_* attributes)
  // These attributes are set by the runtime on the tool.execute: run_agent span after creating the AgentRun CR.
  const spanDelegationChildren = createMemo(() => {
    const childMap = new Map<string, { agent: string; runName: string; namespace: string }>();
    for (const node of flatSpans()) {
      const childAgent = getTag(node.span, 'delegation.child_agent');
      const childRun = getTag(node.span, 'delegation.child_run');
      const childNs = getTag(node.span, 'delegation.child_namespace');
      if (childAgent && childRun) {
        childMap.set(node.span.spanID, {
          agent: childAgent,
          runName: childRun,
          namespace: childNs || 'agents',
        });
      }
    }
    return childMap;
  });

  // Top-level list of all child delegations (deduped by runName for the banner)
  const delegationChildren = createMemo(() => {
    const children: Array<{ agent: string; runName: string; namespace: string }> = [];
    const seen = new Set<string>();
    for (const child of spanDelegationChildren().values()) {
      if (!seen.has(child.runName)) {
        seen.add(child.runName);
        children.push(child);
      }
    }
    return children;
  });

  return (
    <div class={`flex flex-col ${props.class || ''}`}>
      <Show when={trace.loading}>
        <div class="flex-1 flex items-center justify-center">
          <Spinner size="md" />
        </div>
      </Show>

      <Show when={trace.error}>
        <div class="flex-1 flex items-center justify-center px-4">
          <p class="text-sm text-error">Failed to load trace details</p>
        </div>
      </Show>

      <Show when={!trace.loading && !trace.error && trace()}>
        <div class="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Waterfall + Span list */}
          <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Summary stats */}
            <Show when={rootSummary()}>
              {(summary) => (
                <div class="flex flex-wrap gap-3 px-6 py-3 border-b border-border bg-surface/50">
                  <StatPill label="Duration" value={formatDuration(summary().totalDuration)} />
                  <StatPill label="Spans" value={String(summary().spanCount)} />
                  <Show when={summary().model}>
                    <StatPill label="Model" value={summary().model!} accent />
                  </Show>
                  <Show when={summary().provider}>
                    <StatPill label="Provider" value={summary().provider!} />
                  </Show>
                  <Show when={summary().inputTokens}>
                    <StatPill label="Input" value={`${Number(summary().inputTokens).toLocaleString()} tok`} />
                  </Show>
                  <Show when={summary().outputTokens}>
                    <StatPill label="Output" value={`${Number(summary().outputTokens).toLocaleString()} tok`} />
                  </Show>
                  <Show when={summary().steps}>
                    <StatPill label="Steps" value={String(summary().steps)} />
                  </Show>
                </div>
              )}
            </Show>

            {/* Delegation breadcrumb — shows when this trace was spawned by a parent agent */}
            <Show when={delegationInfo()}>
              {(info) => (
                <button
                  class="flex items-center gap-2 px-6 py-2 border-b border-border bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer w-full text-left"
                  onClick={() => showTraceDetail(info().parentTraceID)}
                  title={`View parent trace from ${info().parentAgent}`}
                >
                  <svg class="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span class="text-[10px] uppercase tracking-wider text-accent font-medium">Delegated from</span>
                  <span class="text-xs font-mono text-accent font-semibold">{info().parentAgent}</span>
                  <Show when={info().runName}>
                    <span class="text-[10px] text-text-muted font-mono">({info().runName})</span>
                  </Show>
                  <svg class="w-3 h-3 text-text-muted ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
            </Show>

            {/* Delegated to — shows when this trace delegated work to sub-agents */}
            <Show when={delegationChildren().length > 0}>
              <div class="border-b border-border">
                <For each={delegationChildren()}>
                  {(child) => <DelegationChildBanner agent={child.agent} runName={child.runName} namespace={child.namespace} />}
                </For>
              </div>
            </Show>

            {/* Prompt & Response + Tool Summary */}
            <Show when={userPrompt() || assistantResponse() || toolSummary().length > 0}>
              <div class="px-6 py-3 border-b border-border space-y-3">
                {/* User prompt */}
                <Show when={userPrompt()}>
                  <div>
                    <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Prompt</div>
                    <div class="text-xs text-text font-mono bg-surface-2 rounded-lg px-3 py-2 border border-border-subtle max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                      {userPrompt()}
                    </div>
                  </div>
                </Show>

                {/* Tool calls summary */}
                <Show when={toolSummary().length > 0}>
                  <div>
                    <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                      Tools ({toolSummary().length})
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={toolSummary()}>
                        {(tool) => (
                          <span
                            class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                              tool.isError
                                ? 'bg-error/5 border-error/20 text-error'
                                : 'bg-warning/5 border-warning/20 text-warning'
                            }`}
                          >
                            {tool.name.startsWith('mcp_') ? tool.name.slice(4).replace('_', '/') : tool.name}
                            <span class="text-text-muted">{formatDuration(tool.duration)}</span>
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Assistant response */}
                <Show when={assistantResponse()}>
                  <div>
                    <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">Response</div>
                    <div class="text-xs text-text-secondary font-mono bg-surface-2 rounded-lg px-3 py-2 border border-border-subtle max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                      {assistantResponse()}
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Waterfall */}
            <div class="flex-1 overflow-y-auto">
              <div class="py-2">
                <Show
                  when={flatSpans().length > 0}
                  fallback={
                    <div class="text-sm text-text-muted text-center py-12">
                      No spans found for this trace.
                    </div>
                  }
                >
                  {/* Waterfall header */}
                  <div class="flex items-center gap-2 px-4 pb-1.5 border-b border-border-subtle">
                    <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider" style={{ width: '200px' }}>
                      Operation
                    </div>
                    <div class="flex-1 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                      Timeline
                    </div>
                    <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider w-16 text-right">
                      Duration
                    </div>
                  </div>

                  <For each={flatSpans()}>
                    {(node) => {
                      const range = timeRange();
                      const totalDuration = range.max - range.min;
                      const leftPct = () => ((node.span.startTime - range.min) / totalDuration) * 100;
                      const widthPct = () => Math.max(0.3, (node.span.duration / totalDuration) * 100);
                      const durationMs = () => node.span.duration / 1000;
                      const isError = () => node.span.status?.code === 2;
                      const isSelected = () => selectedSpanID() === node.span.spanID;
                      const delegationChild = () => spanDelegationChildren().get(node.span.spanID);
                      const barColor = () => {
                        if (isError()) return 'bg-error';
                        const op = node.span.operationName;
                        if (op.startsWith('gen_ai.')) return 'bg-info';
                        if (op.startsWith('tool.') || op.startsWith('mcp.')) return 'bg-warning';
                        if (op.startsWith('engram.')) return 'bg-success/70';
                        if (op === 'agent.step') return 'bg-accent/50';
                        return 'bg-accent';
                      };

                      // Extract key attributes for inline display
                      const toolName = () => getTag(node.span, 'tool.name') || getTag(node.span, 'gen_ai.tool.name');
                      const model = () => getTag(node.span, 'gen_ai.request.model');

                      return (
                        <div class="flex flex-col">
                          <button
                            class={`w-full flex items-center gap-2 px-4 py-1 transition-colors cursor-pointer border-l-2 ${
                              isSelected()
                                ? 'bg-accent/8 border-l-accent'
                                : 'border-l-transparent hover:bg-surface-hover/50'
                            }`}
                            onClick={() => setSelectedSpanID(isSelected() ? null : node.span.spanID)}
                          >
                            {/* Operation name */}
                            <div
                              class="flex-shrink-0 text-[11px] font-mono truncate text-left"
                              style={{ width: '200px', 'padding-left': `${node.depth * 14}px` }}
                            >
                              <span class={`${isError() ? 'text-error' : 'text-text-secondary'}`}>
                                {spanDisplayName(node.span.operationName, toolName(), model())}
                              </span>
                            </div>

                            {/* Waterfall bar */}
                            <div class="flex-1 h-5 relative min-w-0">
                              <div
                                class={`absolute top-1 h-3 rounded-[3px] ${barColor()} transition-all opacity-85 hover:opacity-100`}
                                style={{
                                  left: `${leftPct()}%`,
                                  width: `${widthPct()}%`,
                                  'min-width': '3px',
                                }}
                              />
                            </div>

                            {/* Duration */}
                            <span class="flex-shrink-0 text-[10px] font-mono text-text-muted w-16 text-right">
                              {formatDuration(durationMs())}
                            </span>
                          </button>

                          {/* Sub-agent trace link — shown when this span delegated to another agent */}
                          <Show when={delegationChild()}>
                            {(child) => {
                              const [loading, setLoading] = createSignal(false);
                              const navigateToChildTrace = async (e: MouseEvent) => {
                                e.stopPropagation();
                                setLoading(true);
                                try {
                                  const run = await agentRuns.get(child().namespace, child().runName);
                                  const traceID = run?.status?.traceID;
                                  if (traceID) {
                                    showTraceDetail(traceID);
                                  }
                                } catch (err) {
                                  console.warn('Failed to resolve child trace:', err);
                                } finally {
                                  setLoading(false);
                                }
                              };
                              return (
                                <button
                                  class="flex items-center gap-1.5 ml-4 px-2 py-0.5 text-left hover:bg-accent/8 transition-colors rounded cursor-pointer"
                                  style={{ 'padding-left': `${(node.depth + 1) * 14 + 16}px` }}
                                  onClick={navigateToChildTrace}
                                  title={`View trace for ${child().agent}`}
                                  disabled={loading()}
                                >
                                  <Show when={loading()} fallback={
                                    <svg class="w-3 h-3 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                  }>
                                    <Spinner size="sm" class="w-3 h-3" />
                                  </Show>
                                  <span class="text-[10px] text-accent font-medium">
                                    View sub-agent trace
                                  </span>
                                  <span class="text-[10px] font-mono text-accent/70">{child().agent}</span>
                                  <span class="text-[10px] font-mono text-text-muted truncate max-w-[150px]">{child().runName}</span>
                                  <svg class="w-2.5 h-2.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </button>
                              );
                            }}
                          </Show>
                        </div>
                      );
                    }}
                  </For>

                  {/* Legend */}
                  <div class="flex flex-wrap gap-4 px-4 mt-4 pt-3 border-t border-border-subtle">
                    <LegendDot color="bg-accent" label="agent" />
                    <LegendDot color="bg-info" label="gen_ai" />
                    <LegendDot color="bg-warning" label="tool / mcp" />
                    <LegendDot color="bg-success/70" label="engram" />
                    <LegendDot color="bg-error" label="error" />
                  </div>
                </Show>
              </div>
            </div>
          </div>

          {/* Right: Span detail panel */}
          <Show when={selectedSpan()}>
            {(span) => (
              <SpanDetailPanel
                span={span()}
                processes={processes()}
                onClose={() => setSelectedSpanID(null)}
              />
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── Span Detail Panel ──

function SpanDetailPanel(props: {
  span: TraceSpan;
  processes: Record<string, TraceProcess>;
  onClose: () => void;
}) {
  const isError = () => props.span.status?.code === 2;

  // Categorize tags into semantic groups for display
  const tagGroups = createMemo(() => {
    const tags = props.span.tags ?? [];
    const groups: Record<string, Array<{ key: string; value: unknown; type: string }>> = {
      'GenAI': [],
      'Agent': [],
      'Delegation': [],
      'Tool': [],
      'Memory': [],
      'Other': [],
    };

    for (const tag of tags) {
      if (tag.key.startsWith('gen_ai.')) {
        groups['GenAI'].push(tag);
      } else if (tag.key.startsWith('delegation.')) {
        groups['Delegation'].push(tag);
      } else if (tag.key.startsWith('agent.') || tag.key.startsWith('step.')) {
        groups['Agent'].push(tag);
      } else if (tag.key.startsWith('tool.') || tag.key.startsWith('mcp.')) {
        groups['Tool'].push(tag);
      } else if (tag.key.startsWith('engram.')) {
        groups['Memory'].push(tag);
      } else {
        groups['Other'].push(tag);
      }
    }

    // Remove empty groups
    return Object.entries(groups).filter(([, tags]) => tags.length > 0);
  });

  // Process tags (resource attributes from the process)
  const processTags = createMemo(() => {
    const pid = props.span.processID;
    if (!pid || !props.processes[pid]) return [];
    return props.processes[pid].tags ?? [];
  });

  return (
    <div class="w-[380px] flex-shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
        <div class="flex-1 min-w-0">
          <div class={`text-xs font-mono font-medium truncate ${isError() ? 'text-error' : 'text-text'}`}>
            {props.span.operationName}
          </div>
          <div class="text-[10px] text-text-muted font-mono mt-0.5">
            {props.span.spanID.slice(0, 16)}
          </div>
        </div>
        <button
          class="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors flex-shrink-0"
          onClick={props.onClose}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div class="flex-1 overflow-y-auto">
        {/* Quick stats row */}
        <div class="flex gap-2 px-4 py-3 border-b border-border-subtle">
          <MiniStat label="Duration" value={formatDuration(props.span.duration / 1000)} />
          <Show when={isError()}>
            <MiniStat label="Status" value="ERROR" error />
          </Show>
          <Show when={!isError() && props.span.status?.code === 1}>
            <MiniStat label="Status" value="OK" success />
          </Show>
        </div>

        {/* Status error message */}
        <Show when={isError() && props.span.status?.message}>
          <div class="mx-4 mt-3 px-3 py-2 bg-error/5 border border-error/20 rounded-lg">
            <span class="text-[10px] uppercase tracking-wider text-error font-medium">Error</span>
            <p class="text-xs text-error/80 font-mono mt-1 whitespace-pre-wrap break-all">
              {props.span.status!.message}
            </p>
          </div>
        </Show>

        {/* Tag groups */}
        <div class="px-4 py-3 space-y-4">
          <For each={tagGroups()}>
            {([groupName, tags]) => (
              <div>
                <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                  {groupName}
                </div>
                <div class="space-y-1">
                  <For each={tags as Array<{ key: string; value: unknown; type: string }>}>
                    {(tag) => (
                      <TagRow key={tag.key} value={tag.value} type={tag.type} />
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>

           {/* Resource Attributes (from process) */}
          <Show when={processTags().length > 0}>
            <div>
              <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
                Resource
              </div>
              <div class="space-y-1">
                <For each={processTags()}>
                  {(tag: { key: string; value: unknown; type?: string }) => (
                    <TagRow key={tag.key} value={tag.value} type={tag.type || 'string'} />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Linked Traces — delegation links to sub-agent traces */}
        <Show when={(props.span.links?.length ?? 0) > 0}>
          <div class="px-4 py-3 border-t border-border-subtle">
            <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
              Linked Traces
            </div>
            <div class="space-y-1.5">
              <For each={props.span.links!}>
                {(link) => {
                  const linkType = () => link.tags?.find(t => t.key === 'link.type')?.value as string | undefined;
                  const agentName = () => link.tags?.find(t => t.key === 'link.parent_agent')?.value as string | undefined;
                  const runName = () => link.tags?.find(t => t.key === 'link.run_name')?.value as string | undefined;
                  return (
                    <button
                      class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/5 border border-accent/15 hover:bg-accent/10 hover:border-accent/25 transition-colors cursor-pointer text-left"
                      onClick={() => link.traceID && showTraceDetail(link.traceID)}
                      title={`Navigate to linked trace ${link.traceID?.slice(0, 16)}...`}
                    >
                      <svg class="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <div class="flex-1 min-w-0">
                        <Show when={linkType() === 'delegation'}>
                          <span class="text-[10px] text-accent font-medium">Sub-agent trace</span>
                        </Show>
                        <Show when={linkType() !== 'delegation'}>
                          <span class="text-[10px] text-text-muted">{linkType() || 'linked'}</span>
                        </Show>
                        <Show when={agentName()}>
                          <span class="text-[10px] font-mono text-accent ml-1">{agentName()}</span>
                        </Show>
                        <Show when={runName()}>
                          <div class="text-[9px] font-mono text-text-muted truncate">{runName()}</div>
                        </Show>
                        <div class="text-[9px] font-mono text-text-muted/60 truncate">{link.traceID?.slice(0, 24)}...</div>
                      </div>
                      <svg class="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        {/* Events / Logs */}
        <Show when={(props.span.logs?.length ?? 0) > 0}>
          <div class="px-4 py-3 border-t border-border-subtle">
            <div class="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">
              Events
            </div>
            <div class="space-y-2">
              <For each={props.span.logs!}>
                {(log) => {
                  const eventName = log.fields?.find((f) => f.key === 'event')?.value as string | undefined;
                  const otherFields = log.fields?.filter((f) => f.key !== 'event') ?? [];

                  // Special rendering for content events (prompt, completion, tool I/O)
                  const isContentEvent = () =>
                    eventName === 'gen_ai.content.prompt' ||
                    eventName === 'gen_ai.content.completion' ||
                    eventName === 'gen_ai.tool.input' ||
                    eventName === 'gen_ai.tool.output';

                  const contentLabel = () => {
                    switch (eventName) {
                      case 'gen_ai.content.prompt': return 'Prompt';
                      case 'gen_ai.content.completion': return 'Response';
                      case 'gen_ai.tool.input': return 'Tool Input';
                      case 'gen_ai.tool.output': return 'Tool Output';
                      default: return eventName || 'event';
                    }
                  };

                  // Extract the main content field from content events
                  const contentText = () => {
                    if (!isContentEvent()) return null;
                    const contentKeys = ['gen_ai.prompt', 'gen_ai.completion', 'tool.input', 'tool.output'];
                    for (const key of contentKeys) {
                      const field = otherFields.find((f) => f.key === key);
                      if (field) return String(field.value);
                    }
                    return null;
                  };

                  const isErrorOutput = () =>
                    eventName === 'gen_ai.tool.output' &&
                    otherFields.some((f) => f.key === 'tool.error' && f.value === true);

                  return (
                    <div class={`rounded-lg px-3 py-2 border ${
                      isErrorOutput()
                        ? 'bg-error/5 border-error/20'
                        : isContentEvent()
                          ? 'bg-surface-2 border-border'
                          : 'bg-surface-2 border-border-subtle'
                    }`}>
                      <div class="flex items-center gap-2">
                        <span class={`text-[10px] font-mono font-medium ${
                          isErrorOutput() ? 'text-error' :
                          isContentEvent() ? 'text-accent' : 'text-warning'
                        }`}>
                          {contentLabel()}
                        </span>
                        <Show when={!isContentEvent()}>
                          <span class="text-[9px] text-text-muted font-mono">
                            {log.timestamp > 0 ? new Date(log.timestamp / 1000).toISOString().slice(11, 23) : ''}
                          </span>
                        </Show>
                      </div>
                      <Show when={isContentEvent() && contentText()}>
                        <div class="mt-1.5 text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                          {contentText()}
                        </div>
                      </Show>
                      <Show when={!isContentEvent() && otherFields.length > 0}>
                        <div class="mt-1.5 space-y-0.5">
                          <For each={otherFields}>
                            {(field) => (
                              <div class="flex gap-2 text-[10px]">
                                <span class="text-text-muted font-mono flex-shrink-0">{field.key}:</span>
                                <span class="text-text-secondary font-mono break-all">{String(field.value)}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      {/* Show non-content fields for content events too (e.g. tool.name on tool I/O) */}
                      <Show when={isContentEvent()}>
                        {(() => {
                          const metaFields = otherFields.filter(
                            (f) => !['gen_ai.prompt', 'gen_ai.completion', 'tool.input', 'tool.output'].includes(f.key)
                          );
                          return (
                            <Show when={metaFields.length > 0}>
                              <div class="mt-1 space-y-0.5">
                                <For each={metaFields}>
                                  {(field) => (
                                    <div class="flex gap-2 text-[9px]">
                                      <span class="text-text-muted font-mono flex-shrink-0">{field.key}:</span>
                                      <span class="text-text-secondary font-mono break-all">{String(field.value)}</span>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>
                          );
                        })()}
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── Subcomponents ──

/** Banner for "Delegated to" — clickable link to navigate to child agent's trace */
function DelegationChildBanner(props: { agent: string; runName: string; namespace: string }) {
  const [loading, setLoading] = createSignal(false);

  const navigate = async () => {
    setLoading(true);
    try {
      const run = await agentRuns.get(props.namespace, props.runName);
      const traceID = run?.status?.traceID;
      if (traceID) {
        showTraceDetail(traceID);
      }
    } catch (err) {
      console.warn('Failed to resolve child trace:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      class="flex items-center gap-2 px-6 py-2 bg-surface-2/50 hover:bg-accent/8 transition-colors cursor-pointer w-full text-left"
      onClick={navigate}
      disabled={loading()}
      title={`View sub-agent trace for ${props.agent}`}
    >
      <Show when={loading()} fallback={
        <svg class="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      }>
        <Spinner size="sm" class="w-3.5 h-3.5" />
      </Show>
      <span class="text-[10px] uppercase tracking-wider text-accent font-medium">Delegated to</span>
      <span class="text-xs font-mono text-accent font-semibold">{props.agent}</span>
      <span class="text-[10px] text-text-muted font-mono truncate">({props.runName})</span>
      <svg class="w-3 h-3 text-text-muted ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  );
}

function StatPill(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 border border-border-subtle">
      <span class="text-[10px] text-text-muted">{props.label}</span>
      <span class={`text-[11px] font-mono font-medium ${props.accent ? 'text-accent' : 'text-text'}`}>
        {props.value}
      </span>
    </div>
  );
}

function MiniStat(props: { label: string; value: string; error?: boolean; success?: boolean }) {
  return (
    <div class="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-surface-2 border border-border-subtle min-w-[60px]">
      <span class="text-[9px] text-text-muted uppercase tracking-wider">{props.label}</span>
      <span
        class={`text-[11px] font-mono font-medium ${
          props.error ? 'text-error' : props.success ? 'text-success' : 'text-text'
        }`}
      >
        {props.value}
      </span>
    </div>
  );
}

function TagRow(props: { key: string; value: unknown; type: string }) {
  const isGenAI = () => props.key.startsWith('gen_ai.');
  const isTokenCount = () =>
    props.key.includes('.input_tokens') ||
    props.key.includes('.output_tokens') ||
    props.key.includes('.reasoning_tokens') ||
    props.key.includes('.cache_');
  const isModel = () => props.key.includes('.model') || props.key.includes('.provider');
  const isError = () => props.key === 'tool.error' && props.value === true;

  // Pretty display key (strip namespace prefix)
  const displayKey = () => {
    const k = props.key;
    if (k.startsWith('gen_ai.')) return k.slice(7);
    if (k.startsWith('agent.')) return k.slice(6);
    if (k.startsWith('tool.')) return k.slice(5);
    if (k.startsWith('engram.')) return k.slice(7);
    if (k.startsWith('step.')) return k.slice(5);
    return k;
  };

  // Format value
  const displayValue = () => {
    const v = props.value;
    if (typeof v === 'number') {
      if (isTokenCount()) return v.toLocaleString();
      return String(v);
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v ?? '');
  };

  return (
    <div class="flex items-start gap-2 py-0.5 group">
      <span
        class="text-[10px] font-mono text-text-muted flex-shrink-0 min-w-[120px] truncate"
        title={props.key}
      >
        {displayKey()}
      </span>
      <span
        class={`text-[11px] font-mono break-all ${
          isError()
            ? 'text-error'
            : isModel()
              ? 'text-accent font-medium'
              : isTokenCount()
                ? 'text-info'
                : 'text-text-secondary'
        }`}
        title={`${props.key}: ${displayValue()}`}
      >
        {displayValue()}
      </span>
    </div>
  );
}

function LegendDot(props: { color: string; label: string }) {
  return (
    <div class="flex items-center gap-1.5">
      <div class={`w-2 h-2 rounded-sm ${props.color}`} />
      <span class="text-[10px] text-text-muted">{props.label}</span>
    </div>
  );
}

// ── Helpers ──

function getTag(span: TraceSpan, key: string): string | undefined {
  const tag = span.tags?.find((t) => t.key === key);
  if (!tag) return undefined;
  return String(tag.value);
}

/** Build a human-readable span name with context */
function spanDisplayName(operation: string, toolName?: string, model?: string): string {
  // "agent.prompt" → "prompt"
  if (operation === 'agent.prompt') return 'prompt';
  if (operation === 'agent.step') return 'step';
  // "gen_ai.stream" → "stream claude-sonnet-4"
  if (operation.startsWith('gen_ai.')) {
    const shortOp = operation.slice(7);
    if (model) {
      const shortModel = model.split('/').pop()?.replace(/-20\d{6}$/, '') ?? model;
      return `${shortOp} ${shortModel}`;
    }
    return shortOp;
  }
  // New format: "tool.execute: bash" — tool name is in the span name itself
  if (operation.startsWith('tool.execute: ')) {
    const name = operation.slice('tool.execute: '.length);
    if (name.startsWith('mcp_')) {
      const parts = name.slice(4).split('_');
      if (parts.length > 1) return `${parts[0]}/${parts.slice(1).join('_')}`;
      return name.slice(4);
    }
    return name;
  }
  // Legacy format: "tool.execute" without name in span — fall back to attributes
  if (operation === 'tool.execute') {
    if (toolName) {
      if (toolName.startsWith('mcp_')) {
        const parts = toolName.slice(4).split('_');
        if (parts.length > 1) return `${parts[0]}/${parts.slice(1).join('_')}`;
        return toolName.slice(4);
      }
      return toolName;
    }
    return 'tool';
  }
  // New format: "mcp.call: server/tool"
  if (operation.startsWith('mcp.call: ')) {
    return `mcp:${operation.slice('mcp.call: '.length)}`;
  }
  // Legacy format
  if (operation === 'mcp.call') {
    if (toolName) return `mcp:${toolName}`;
    return 'mcp';
  }
  if (operation.startsWith('engram.')) return operation.slice(7).replace('_', ' ');
  return operation;
}

function formatDuration(ms: number): string {
  if (ms < 0.01) return '<0.01ms';
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
