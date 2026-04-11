// RightPanel — collapsible right sidebar with context-aware content.
// Default mode: Memory, Tools, Resources tabs (agent context).
// Trace mode: Shows SpanDetailPanel when a span is selected in the waterfall.
// Switching back to an agent view restores the agent context tabs.
import { Show, createSignal } from 'solid-js';
import { rightPanelState, toggleRightPanel, rightPanelTab, setRightPanelTab, centerView, selectedSpanData, traceProcesses, clearSelectedSpan } from '../../stores/view';
import type { RightPanelTab } from '../../stores/view';
import { memoryEnabled } from '../../stores/memory';
import MemoryPanel from './MemoryPanel';
import ToolBrowser from '../resources/ToolBrowser';
import AgentResourcesPanel from '../resources/AgentResourcesPanel';
import SpanDetailPanel from '../traces/SpanDetailPanel';

interface RightPanelProps {
  class?: string;
}

export default function RightPanel(props: RightPanelProps) {
  const [panelWidth, setPanelWidth] = createSignal(340);
  const [isResizingWidth, setIsResizingWidth] = createSignal(false);

  let panelRef: HTMLElement | undefined;

  const isExpanded = () => rightPanelState() === 'expanded';
  const hasMemory = () => memoryEnabled();

  // Whether the right panel should show span detail instead of agent context
  const showSpanDetail = () => centerView() === 'trace-detail' && selectedSpanData() !== null;
  const isTraceView = () => centerView() === 'trace-detail';

  // Width resize handler (drag left edge)
  function onWidthResizeStart(e: MouseEvent) {
    e.preventDefault();
    setIsResizingWidth(true);
    const startX = e.clientX;
    const startWidth = panelWidth();

    function onMouseMove(e: MouseEvent) {
      const delta = startX - e.clientX;
      const newWidth = Math.max(280, Math.min(520, startWidth + delta));
      setPanelWidth(newWidth);
    }

    function onMouseUp() {
      setIsResizingWidth(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return (
    <aside
      ref={panelRef}
      class={`relative flex flex-col h-full bg-surface border-l border-border overflow-hidden transition-[width,min-width] duration-200 ${props.class || ''}`}
      style={{
        width: isExpanded() ? `${panelWidth()}px` : '44px',
        'min-width': isExpanded() ? `${panelWidth()}px` : '44px',
      }}
    >
      {/* ── Collapsed strip ── */}
      <Show when={!isExpanded()}>
        <button
          class="flex flex-col items-center gap-3 py-3 w-full h-full hover:bg-surface-hover transition-colors"
          onClick={() => toggleRightPanel()}
          title="Show panel (Ctrl+3)"
        >
          <div class="relative">
            <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
        </button>
      </Show>

      {/* ── Expanded panel ── */}
      <Show when={isExpanded()}>
        {/* Width resize handle (left edge) */}
        <div
          class={`absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent/30 z-10 ${isResizingWidth() ? 'bg-accent/30' : ''}`}
          onMouseDown={onWidthResizeStart}
        />

        {/* ── Span detail mode (trace view with selected span) ── */}
        <Show when={showSpanDetail()}>
          <SpanDetailPanel
            span={selectedSpanData()!}
            processes={traceProcesses()}
            onClose={() => clearSelectedSpan()}
          />
        </Show>

        {/* ── Trace view, no span selected — blank hint ── */}
        <Show when={isTraceView() && !showSpanDetail()}>
          <div class="flex items-center gap-2 px-3 h-12 border-b border-border flex-shrink-0">
            <button
              class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
              onClick={() => toggleRightPanel()}
              title="Collapse panel"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span class="text-xs text-text-muted">Span Detail</span>
          </div>
          <div class="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <svg class="w-10 h-10 text-text-muted/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <p class="text-xs text-text-muted">
              Select a span in the waterfall to inspect its details.
            </p>
          </div>
        </Show>

        {/* ── Agent context mode (default: Memory/Tools/Resources) ── */}
        <Show when={!isTraceView()}>
          {/* Header with tabs */}
          <div class="flex items-center gap-2 px-3 h-12 border-b border-border flex-shrink-0">
            <button
              class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
              onClick={() => toggleRightPanel()}
              title="Collapse panel"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div class="flex gap-0.5 ml-1">
              <TabButton tab="memory" current={rightPanelTab()} label="Memory" />
              <TabButton tab="tools" current={rightPanelTab()} label="Tools" />
              <TabButton tab="resources" current={rightPanelTab()} label="Resources" />
            </div>
          </div>

          {/* Content */}
          <div class="flex-1 min-h-0 overflow-hidden">
            <Show when={rightPanelTab() === 'memory'}>
              <MemoryPanel />
            </Show>
            <Show when={rightPanelTab() === 'tools'}>
              <div class="h-full relative">
                <ToolBrowser
                  open={true}
                  onClose={() => {}}
                  class="!absolute !inset-0 !w-full !h-full !rounded-none !border-0 !shadow-none !max-h-none !max-w-none"
                  embedded={true}
                />
              </div>
            </Show>
            <Show when={rightPanelTab() === 'resources'}>
              <AgentResourcesPanel />
            </Show>
          </div>
        </Show>
      </Show>
    </aside>
  );
}

function TabButton(props: { tab: RightPanelTab; current: RightPanelTab; label: string }) {
  return (
    <button
      class={`relative px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
        props.current === props.tab
          ? 'bg-surface-hover text-text font-medium'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover/50'
      }`}
      onClick={() => setRightPanelTab(props.tab)}
    >
      {props.label}
    </button>
  );
}
