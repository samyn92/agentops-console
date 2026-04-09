// Sidebar — agents navigation (left panel)
// M3 redesign: Agent cards with metadata + concurrency.
// Agents take natural height in a scrollable list.
import { For, Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { agentList, selectedAgent, selectAgent } from '../../stores/agents';
import { leftPanelState, toggleLeftPanel } from '../../stores/view';
import { streamingAgentKeys } from '../../stores/chat';
import Spinner from '../shared/Spinner';
import AgentCard from './AgentCard';

interface SidebarProps {
  class?: string;
}

export default function Sidebar(props: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [isResizing, setIsResizing] = createSignal(false);

  const isExpanded = () => leftPanelState() === 'expanded';

  // ── Sidebar width resize handler ──
  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth();

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const newWidth = Math.max(220, Math.min(400, startWidth + delta));
      setSidebarWidth(newWidth);
    }

    function onMouseUp() {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return (
    <aside
      class={`relative flex flex-col h-full bg-surface border-r border-border overflow-hidden transition-[width,min-width] duration-200 ${props.class || ''}`}
      style={{
        width: isExpanded() ? `${sidebarWidth()}px` : '44px',
        'min-width': isExpanded() ? `${sidebarWidth()}px` : '44px',
      }}
    >
      {/* ── Collapsed strip ── */}
      <Show when={!isExpanded()}>
        <button
          class="flex flex-col items-center gap-3 py-3 w-full h-full hover:bg-surface-hover transition-colors"
          onClick={() => toggleLeftPanel()}
          title="Show sidebar (Ctrl+1)"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </Show>

      {/* ── Expanded panel ── */}
      <Show when={isExpanded()}>
        {/* Header */}
        <div class="flex items-center gap-2 px-3 h-12 border-b border-border flex-shrink-0">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <img src="/logo.png" alt="AgentOps" class="w-6 h-6 rounded-lg flex-shrink-0" />
            <span class="text-[15px] font-semibold text-text truncate tracking-wide leading-tight">
              Agent<span class="text-text-secondary">Ops</span> <span class="text-text-secondary">Console</span>
            </span>
          </div>
          <button
            class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
            onClick={() => toggleLeftPanel()}
            title="Collapse sidebar"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* ── Content area (agents list) ── */}
        <div class="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ── Agents section ── */}
          <div class="flex items-center justify-between px-3 py-2 flex-shrink-0">
            <span class="section-label">Agents</span>
            <span class="text-[10px] text-text-muted font-mono">
              {agentList()?.length ?? 0}
            </span>
          </div>

          <Show
            when={!agentList.loading}
            fallback={
              <div class="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            }
          >
            <div class="flex flex-col gap-1.5 px-2 overflow-y-auto flex-1 min-h-0 pb-1">
              <For each={agentList()}>
                {(agent) => {
                  const ns = agent.namespace;
                  const name = agent.name;
                  const isSelected = () => {
                    const sel = selectedAgent();
                    return sel?.namespace === ns && sel?.name === name;
                  };

                  return (
                    <AgentCard
                      agent={agent}
                      selected={isSelected()}
                      onSelect={() => selectAgent(ns, name)}
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Bottom bar — Settings */}
        <div class="border-t border-border px-2 py-2 flex-shrink-0">
          <A
            href="/settings"
            class="flex items-center gap-2 px-2.5 py-2 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
            activeClass="!text-text !bg-surface-hover"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </A>
        </div>

        {/* Resize handle */}
        <div
          class={`sidebar-resize-handle absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 ${isResizing() ? 'active bg-accent/30' : ''}`}
          onMouseDown={onResizeStart}
        />
      </Show>
    </aside>
  );
}
