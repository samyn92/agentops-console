// Sidebar — agents + sessions navigation (left panel)
// M3 redesign: Agent cards with metadata + concurrency, sessions below.
// Agents take natural height. Divider is hidden; only grabbable when agents overflow.
import { For, Show, createSignal, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { agentList, selectedAgent, selectAgent } from '../../stores/agents';
import {
  sessionList,
  currentSessionId,
  setCurrentSessionId,
  selectSession,
  startNewChat,
  deleteSession,
  setDraftMode,
} from '../../stores/sessions';
import { leftPanelState, toggleLeftPanel } from '../../stores/view';
import { streamingSessionIds } from '../../stores/chat';
import Spinner from '../shared/Spinner';
import AgentCard from './AgentCard';

interface SidebarProps {
  class?: string;
}

export default function Sidebar(props: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [isResizing, setIsResizing] = createSignal(false);

  // Divider: user can drag to cap agent section height (px).
  // null = auto (agents take natural height).
  const [agentMaxHeight, setAgentMaxHeight] = createSignal<number | null>(null);
  const [isDividerDragging, setIsDividerDragging] = createSignal(false);
  let sidebarRef: HTMLElement | undefined;

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

  // ── Divider drag handler ──
  // Dragging sets agentMaxHeight to a pixel value, capping the agents section.
  function onDividerStart(e: MouseEvent) {
    e.preventDefault();
    setIsDividerDragging(true);

    function onMouseMove(e: MouseEvent) {
      if (!sidebarRef) return;
      const rect = sidebarRef.getBoundingClientRect();
      // Header is 48px
      const headerH = 48;
      const y = e.clientY - rect.top - headerH;
      // Clamp: minimum 80px for agents, leave at least 120px for sessions + settings
      const bottomH = 44; // settings bar
      const minSessions = 120;
      const maxAgentH = rect.height - headerH - bottomH - minSessions;
      const clamped = Math.max(80, Math.min(maxAgentH, y));
      setAgentMaxHeight(clamped);
    }

    function onMouseUp() {
      setIsDividerDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Double-click divider to reset to auto height
  function onDividerDblClick() {
    setAgentMaxHeight(null);
  }

  return (
    <aside
      ref={sidebarRef}
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
              Agent<span class="text-text-secondary">Ops</span>
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

        {/* ── Content area (agents + divider + sessions) ── */}
        <div class="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ── Agents section ── */}
          {/* Default: natural height (flex: 0 0 auto). When user drags, capped to agentMaxHeight. */}
          <div
            class="flex flex-col flex-shrink-0 overflow-hidden"
            style={{
              'max-height': agentMaxHeight() !== null ? `${agentMaxHeight()}px` : undefined,
            }}
          >
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
              <div class="flex flex-col gap-1.5 px-2 overflow-y-auto pb-1">
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
                        onSelect={() => {
                          selectAgent(ns, name);
                          setCurrentSessionId(null);
                          setDraftMode(false);
                        }}
                      />
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* ── Divider — hidden by default, visible on hover near border ── */}
          <div
            class={`sidebar-divider flex-shrink-0 ${isDividerDragging() ? 'sidebar-divider--active' : ''}`}
            onMouseDown={onDividerStart}
            onDblClick={onDividerDblClick}
            title="Drag to resize agent list. Double-click to reset."
          >
            <div class="sidebar-divider__track" />
          </div>

          {/* ── Sessions section ── */}
          <div class="flex flex-col flex-1 overflow-hidden min-h-0">
            <Show when={selectedAgent()}>
              <div class="flex items-center justify-between px-3 py-2 flex-shrink-0">
                <span class="section-label">Sessions</span>
                <button
                  class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-border text-text-secondary hover:text-text hover:border-text-muted hover:bg-surface-hover active:bg-surface-active transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  onClick={() => startNewChat()}
                  title="New chat (Ctrl+N)"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New
                </button>
              </div>

              <Show
                when={!sessionList.loading}
                fallback={
                  <div class="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                }
              >
                <div class="flex flex-col gap-0.5 px-2 overflow-y-auto flex-1 min-h-0 pb-1">
                  <For
                    each={sessionList() ?? []}
                    fallback={
                      <p class="text-xs text-text-muted px-2 py-3">
                        No sessions yet. Type a message to start.
                      </p>
                    }
                  >
                    {(session) => {
                      const isActive = () => currentSessionId() === session.id;
                      const isProcessing = () => streamingSessionIds().has(session.id);
                      const hasTitle = () => !!session.title;

                      return (
                        <div class="relative group">
                          <button
                            class={`flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg transition-colors w-full text-left ${
                              isActive()
                                ? 'bg-surface-hover text-text'
                                : 'text-text-secondary hover:text-text hover:bg-surface-hover'
                            } ${isProcessing() ? 'session-row-processing' : ''}`}
                            onClick={() => selectSession(session.id)}
                          >
                            {/* Orbital Trace on the left when processing */}
                            <Show when={isProcessing()}>
                              <span class="agent-thinking agent-thinking--sidebar flex-shrink-0">
                                <span class="agent-thinking__orbit agent-thinking__orbit--sm">
                                  <span class="agent-thinking__track" />
                                  <span class="agent-thinking__dot agent-thinking__dot--1" />
                                  <span class="agent-thinking__dot agent-thinking__dot--2" />
                                  <span class="agent-thinking__dot agent-thinking__dot--3" />
                                  <span class="agent-thinking__core" />
                                </span>
                              </span>
                            </Show>
                            <span class="truncate flex-1">
                              <Show
                                when={hasTitle()}
                                fallback={<span class="shimmer-title" />}
                              >
                                {session.title}
                              </Show>
                            </span>
                          </button>

                          {/* Delete button on hover (hidden during processing) */}
                          <Show when={!isProcessing()}>
                            <button
                              class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                              title="Delete session"
                            >
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>

            {/* No agent selected fallback */}
            <Show when={!selectedAgent()}>
              <div class="flex flex-col items-center justify-center flex-1 px-4 text-center">
                <p class="text-xs text-text-muted">Select an agent to see sessions.</p>
              </div>
            </Show>
          </div>
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
