// RightPanel — collapsible right sidebar with stacked Runs (top) + Memory (bottom).
// When memory is enabled: 60/40 split with a draggable horizontal divider.
// When memory is not enabled: Runs fills the full panel.
import { Show, createSignal, onMount, onCleanup } from 'solid-js';
import { rightPanelState, toggleRightPanel } from '../../stores/view';
import { memoryEnabled } from '../../stores/memory';
import { selectedAgent } from '../../stores/agents';
import {
  activeRunCount,
  refreshRuns,
  startRunPolling,
  stopRunPolling,
} from '../../stores/runs';
import RunsPanelContent from './RunsPanelContent';
import MemoryPanel from './MemoryPanel';

interface RightPanelProps {
  class?: string;
}

export default function RightPanel(props: RightPanelProps) {
  const [panelWidth, setPanelWidth] = createSignal(340);
  const [isResizingWidth, setIsResizingWidth] = createSignal(false);

  // Vertical split: percentage of panel height for Memory (top section)
  const [splitPct, setSplitPct] = createSignal(60);
  const [isResizingSplit, setIsResizingSplit] = createSignal(false);

  let panelRef: HTMLElement | undefined;

  onMount(() => {
    startRunPolling();
    refreshRuns();
  });

  onCleanup(() => {
    stopRunPolling();
  });

  const isExpanded = () => rightPanelState() === 'expanded';
  const globalActive = () => activeRunCount();
  const hasMemory = () => memoryEnabled();

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

  // Vertical split resize handler (drag horizontal divider)
  function onSplitResizeStart(e: MouseEvent) {
    e.preventDefault();
    setIsResizingSplit(true);

    function onMouseMove(e: MouseEvent) {
      if (!panelRef) return;
      const rect = panelRef.getBoundingClientRect();
      // Subtract header height (48px = h-12)
      const headerHeight = 48;
      const availableHeight = rect.height - headerHeight;
      const offsetY = e.clientY - rect.top - headerHeight;
      const pct = Math.max(20, Math.min(80, (offsetY / availableHeight) * 100));
      setSplitPct(pct);
    }

    function onMouseUp() {
      setIsResizingSplit(false);
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
            <Show when={globalActive() > 0}>
              <span class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {globalActive()}
              </span>
            </Show>
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

        {/* Header */}
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

          <div class="flex-1" />

          <button
            class="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
            onClick={() => refreshRuns()}
            title="Refresh"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Content: stacked when memory enabled, full runs otherwise */}
        <Show when={hasMemory()} fallback={
          <div class="flex-1 min-h-0 overflow-hidden">
            <RunsPanelContent />
          </div>
        }>
          <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Top section: Runs */}
            <div
              class="overflow-y-auto overflow-x-hidden flex-shrink-0"
              style={{ height: `${splitPct()}%` }}
            >
              <RunsPanelContent />
            </div>

            {/* Draggable horizontal divider between runs and memory */}
            <div
              class={`flex-shrink-0 cursor-row-resize group relative`}
              onMouseDown={onSplitResizeStart}
            >
              <div class={`h-[3px] w-full transition-colors ${
                isResizingSplit() ? 'bg-accent' : 'bg-border group-hover:bg-border-hover'
              }`} />
              {/* Drag affordance — a small centered pill that appears on hover */}
              <div class={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 rounded-full transition-all ${
                isResizingSplit()
                  ? 'w-12 h-1.5 bg-accent'
                  : 'w-8 h-1 bg-border-hover opacity-0 group-hover:opacity-100'
              }`} />
            </div>

            {/* Bottom section: Memory */}
            <div class="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              <MemoryPanel />
            </div>
          </div>
        </Show>
      </Show>
    </aside>
  );
}
