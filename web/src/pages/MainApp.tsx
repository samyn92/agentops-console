// MainApp — three-panel layout: Left Sidebar (agents) + Center Stage + Right Panel (memory/runs).
// Both sidebars are collapsible to a thin strip with hamburger icons.
// Center panel has a unified h-12 header bar aligned with both sidebars.
// Center content switches based on agent selection, mode, and centerView overlay:
// - centerView === 'run-detail' -> RunDetailView (selected run from right panel)
// - No agent -> EmptyState
// - Daemon agent -> ChatView (conversation stream)
// - Task agent -> AgentInspector (config, tools, resources — runs live in right panel)
import { onMount, onCleanup, Show, createMemo } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import { selectedAgent, agentList } from '../stores/agents';
import { centerView } from '../stores/view';
import { selectedRunKey, allRuns, refreshRuns, startRunPolling, stopRunPolling } from '../stores/runs';
import { selectedTraceForDetail } from '../stores/view';
import { phaseVariant } from '../lib/format';
import Sidebar from '../components/layout/Sidebar';
import RightPanel from '../components/layout/RightPanel';
import ChatView from '../components/chat/ChatView';
import AgentInspector from '../components/agents/AgentInspector';
import RunDetailView from '../components/runs/RunDetailView';
import TraceDetailView from '../components/traces/TraceDetailView';
import EmptyState from '../components/shared/EmptyState';
import Badge from '../components/shared/Badge';

export default function MainApp() {
  // Start global SSE and run polling on mount
  onMount(() => {
    startEventStream();
    startRunPolling();
    refreshRuns();
  });

  onCleanup(() => {
    stopEventStream();
    stopRunPolling();
  });

  const hasAgent = () => selectedAgent() !== null;
  const showRunOverlay = () => centerView() === 'run-detail' && selectedRunKey() !== null;
  const showTraceOverlay = () => centerView() === 'trace-detail' && selectedTraceForDetail() !== null;

  const agentInfo = createMemo(() => {
    const sel = selectedAgent();
    if (!sel) return null;
    const list = agentList();
    return list?.find((a) => a.namespace === sel.namespace && a.name === sel.name) ?? null;
  });

  const isTaskAgent = createMemo(() => agentInfo()?.mode === 'task');

  // Run info for the header when in run-detail mode
  const selectedRun = createMemo(() => {
    const key = selectedRunKey();
    if (!key) return null;
    const runs = allRuns() ?? [];
    return runs.find((r) => `${r.metadata.namespace}/${r.metadata.name}` === key) ?? null;
  });

  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* ── Left Sidebar (agents — hierarchical) ── */}
      <Sidebar />

      {/* ── Center Stage ── */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* ── Unified header bar (h-12, aligned with sidebars) ── */}
        <div class="flex items-center gap-3 px-4 h-12 border-b border-border flex-shrink-0">
          <Show when={showTraceOverlay()}>
            <svg class="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
            </svg>
            <span class="text-sm font-semibold text-text font-mono truncate min-w-0">
              {selectedTraceForDetail()}
            </span>
            <div class="ml-auto flex-shrink-0">
              <Badge variant="info" dot>trace</Badge>
            </div>
          </Show>

          <Show when={!showTraceOverlay() && showRunOverlay() && selectedRun()}>
            {(run) => (
              <>
                <span class="text-sm font-semibold text-text font-mono truncate">
                  {run().metadata.name}
                </span>
                <span class="text-xs text-text-muted">{run().spec.agentRef}</span>
                <div class="ml-auto flex-shrink-0">
                  <Badge variant={phaseVariant(run().status?.phase)} dot>
                    {run().status?.phase || '?'}
                  </Badge>
                </div>
              </>
            )}
          </Show>

          <Show when={!showTraceOverlay() && !showRunOverlay() && agentInfo()}>
            {(info) => (
              <>
                <span class="text-sm font-semibold text-text truncate">
                  {info().name}
                </span>
                <span class="text-xs text-text-muted font-mono">{info().model}</span>

                <Show when={info().phase}>
                  <div class="ml-auto flex-shrink-0">
                    <Badge variant={phaseVariant(info().phase)} dot>
                      {info().phase}
                    </Badge>
                  </div>
                </Show>
              </>
            )}
          </Show>

          <Show when={!showTraceOverlay() && !showRunOverlay() && !hasAgent()}>
            <span class="text-sm text-text-muted">Select an agent</span>
          </Show>
        </div>

        {/* ── Content below header ── */}
        <Show when={showTraceOverlay()}>
          <TraceDetailView class="flex-1 min-h-0" />
        </Show>

        <Show when={!showTraceOverlay() && showRunOverlay()}>
          <RunDetailView class="flex-1 min-h-0" />
        </Show>

        <Show when={!showTraceOverlay() && !showRunOverlay()}>
          <Show when={!hasAgent()}>
            <div class="flex-1 flex items-center justify-center min-h-0">
              <EmptyState
                title="Select an Agent"
                description="Choose an agent from the sidebar to get started."
              />
            </div>
          </Show>

          <Show when={hasAgent()}>
            <Show when={isTaskAgent()} fallback={<ChatView class="flex-1 min-h-0" />}>
              <AgentInspector class="flex-1 min-h-0" />
            </Show>
          </Show>
        </Show>
      </div>

      {/* ── Right Panel (global runs + memory) ── */}
      <RightPanel />
    </div>
  );
}
