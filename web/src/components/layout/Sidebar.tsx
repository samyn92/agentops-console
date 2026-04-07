// Sidebar — navigation + agent list + session list
import { For, Show, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { agentList, selectedAgent, selectAgent, getAgentStatus } from '../../stores/agents';
import {
  sessionList,
  currentSessionId,
  selectSession,
  startNewChat,
  deleteSession,
} from '../../stores/sessions';
import { streaming, streamingSessionIds } from '../../stores/chat';
import { connected } from '../../stores/events';
import AgentStatusBadge from '../agents/AgentStatusBadge';
import NeuralTrace from '../shared/NeuralTrace';
import Spinner from '../shared/Spinner';

interface SidebarProps {
  class?: string;
}

export default function Sidebar(props: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [isResizing, setIsResizing] = createSignal(false);

  // Resize handler
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
      class={`relative flex flex-col h-full bg-surface border-r border-border overflow-hidden ${props.class || ''}`}
      style={{ width: `${sidebarWidth()}px`, 'min-width': `${sidebarWidth()}px` }}
    >
      {/* Header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <span class="text-primary-foreground text-xs font-bold">A</span>
          </div>
          <span class="text-sm font-semibold text-text truncate">AgentOps</span>
        </div>
        <div class="flex items-center gap-1">
          <span
            class={`w-2 h-2 rounded-full ${connected() ? 'bg-success' : 'bg-error'}`}
            title={connected() ? 'Connected' : 'Disconnected'}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav class="flex flex-col gap-0.5 px-2 py-2 border-b border-border">
        <A
          href="/"
          end
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Chat
        </A>
        <A
          href="/agents"
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v9.5" />
          </svg>
          Agents
        </A>
        <A
          href="/runs"
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          Runs
        </A>
        <A
          href="/channels"
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          Channels
        </A>
        <A
          href="/mcpservers"
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
          </svg>
          MCP Servers
        </A>
        <A
          href="/settings"
          class="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-md transition-colors"
          activeClass="!text-text !bg-surface-hover"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </A>
      </nav>

      {/* Agent List */}
      <div class="flex-1 overflow-y-auto">
        <div class="px-3 py-2">
          <span class="section-label">Agents</span>
        </div>

        <Show
          when={!agentList.loading}
          fallback={
            <div class="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          }
        >
          <div class="flex flex-col gap-0.5 px-2">
            <For each={agentList()}>
              {(agent) => {
                const ns = agent.namespace;
                const name = agent.name;
                const status = () => getAgentStatus(ns, name);
                const isSelected = () => {
                  const sel = selectedAgent();
                  return sel?.namespace === ns && sel?.name === name;
                };

                return (
                  <button
                    class={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors w-full text-left ${
                      isSelected()
                        ? 'bg-accent-muted text-text border border-accent/20'
                        : 'text-text-secondary hover:text-text hover:bg-surface-hover border border-transparent'
                    }`}
                    onClick={() => selectAgent(ns, name)}
                  >
                    <span
                      class={`w-2 h-2 rounded-full flex-shrink-0 ${
                        status().isOnline ? 'bg-success' : 'bg-text-muted'
                      }`}
                    />
                    <span class="truncate flex-1">{name}</span>
                    <Show when={agent.runtime}>
                      <span class="text-xs text-text-muted">{agent.runtime}</span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Session List (when agent selected) */}
        <Show when={selectedAgent()}>
          <div class="mt-4">
            <div class="flex items-center justify-between px-3 py-2">
              <span class="section-label">Sessions</span>
              <button
                class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border text-text-secondary hover:text-text hover:border-text-muted hover:bg-surface-hover active:bg-surface-active transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
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
              <div class="flex flex-col gap-0.5 px-2">
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
                          class={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors w-full text-left ${
                            isActive()
                              ? 'bg-surface-hover text-text'
                              : 'text-text-secondary hover:text-text hover:bg-surface-hover'
                          } ${isProcessing() ? 'session-row-processing' : ''}`}
                          onClick={() => selectSession(session.id)}
                        >
                          <span class="truncate flex-1">
                            <Show
                              when={hasTitle()}
                              fallback={<span class="shimmer-title" />}
                            >
                              {session.title}
                            </Show>
                          </span>
                          <span class="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            {session.messageCount || 0}
                          </span>
                        </button>

                        {/* Delete button on hover */}
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

                        {/* Neural trace for active processing session */}
                        <Show when={isProcessing()}>
                          <div class="absolute bottom-0 left-2 right-2">
                            <NeuralTrace active inline size="sm" />
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Resize handle */}
      <div
        class={`sidebar-resize-handle absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 ${isResizing() ? 'active bg-accent/30' : ''}`}
        onMouseDown={onResizeStart}
      />
    </aside>
  );
}
