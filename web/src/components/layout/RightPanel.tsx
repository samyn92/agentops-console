// RightPanel — collapsible right sidebar with tabbed content: Memory, Traces.
// Runs have been moved to the left sidebar.
import { Show, createSignal, Switch, Match } from 'solid-js';
import { rightPanelState, toggleRightPanel, rightPanelTab, setRightPanelTab } from '../../stores/view';
import type { RightPanelTab } from '../../stores/view';
import { memoryEnabled } from '../../stores/memory';
import MemoryPanel from './MemoryPanel';
import TracesPanel from './TracesPanel';

interface RightPanelProps {
  class?: string;
}

export default function RightPanel(props: RightPanelProps) {
  const [panelWidth, setPanelWidth] = createSignal(340);
  const [isResizingWidth, setIsResizingWidth] = createSignal(false);

  let panelRef: HTMLElement | undefined;

  const isExpanded = () => rightPanelState() === 'expanded';
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

          {/* Tab switcher */}
          <div class="flex gap-0.5 flex-1">
            <Show when={hasMemory()}>
              <TabButton tab="memory" current={rightPanelTab()} label="Memory" />
            </Show>
            <TabButton tab="traces" current={rightPanelTab()} label="Traces" />
          </div>
        </div>

        {/* Tab content */}
        <div class="flex-1 min-h-0 overflow-hidden">
          <Switch>
            <Match when={rightPanelTab() === 'memory'}>
              <MemoryPanel />
            </Match>
            <Match when={rightPanelTab() === 'traces'}>
              <TracesPanel />
            </Match>
          </Switch>
        </div>
      </Show>
    </aside>
  );
}

function TabButton(props: { tab: RightPanelTab; current: RightPanelTab; label: string }) {
  return (
    <button
      class={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
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
