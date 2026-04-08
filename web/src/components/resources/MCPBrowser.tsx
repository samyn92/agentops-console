// MCPBrowser — popover for browsing MCP server tools available to the selected agent
import { createResource, createSignal, For, Show } from 'solid-js';
import { mcpServers } from '../../lib/api';
import { selectedAgent } from '../../stores/agents';
import type { MCPServerResponse } from '../../types';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';

interface MCPBrowserProps {
  /** When true, the popover is visible */
  open: boolean;
  /** Called when the user wants to close the popover */
  onClose: () => void;
  /** Optional: CSS class for the root element */
  class?: string;
  /** When true, skip rendering backdrop and header (parent panel handles those) */
  embedded?: boolean;
}

export default function MCPBrowser(props: MCPBrowserProps) {
  const [serverList] = createResource(
    () => props.open,
    async (isOpen) => {
      if (!isOpen) return [];
      const agent = selectedAgent();
      if (!agent) return [];
      return mcpServers.list();
    }
  );

  const [expandedServer, setExpandedServer] = createSignal<string | null>(null);

  function toggleExpand(name: string) {
    setExpandedServer((prev) => (prev === name ? null : name));
  }

  function phaseVariant(phase: string | undefined): 'success' | 'warning' | 'error' | 'muted' {
    switch (phase) {
      case 'Ready':
      case 'Active':
        return 'success';
      case 'Pending':
        return 'warning';
      case 'Failed':
        return 'error';
      default:
        return 'muted';
    }
  }

  return (
    <Show when={props.open}>
      {/* Backdrop — skip in embedded mode */}
      <Show when={!props.embedded}>
        <div class="fixed inset-0 z-40" onClick={() => props.onClose()} />
      </Show>

      {/* Popover panel */}
      <div
        class={`${props.embedded ? '' : 'absolute z-50'} bg-surface ${props.embedded ? '' : 'w-80 max-h-96 border border-border rounded-xl shadow-lg'} overflow-hidden ${props.class || ''}`}
        style={props.embedded ? { width: '100%', height: '100%' } : {}}
      >
        {/* Header — skip in embedded mode */}
        <Show when={!props.embedded}>
        <div class="flex items-center justify-between px-3 py-2 border-b border-border">
          <span class="text-xs font-semibold text-text uppercase tracking-wide">
            MCP Servers
          </span>
          <button
            class="p-1 text-text-muted hover:text-text rounded transition-colors"
            onClick={() => props.onClose()}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        </Show>

        {/* Content */}
        <div class={`overflow-y-auto ${props.embedded ? 'h-full' : 'max-h-80'}`}>
          <Show when={serverList.loading}>
            <div class="flex items-center justify-center py-6">
              <Spinner size="sm" />
            </div>
          </Show>

          <Show when={!serverList.loading}>
            <Show
              when={(serverList() || []).length > 0}
              fallback={
                <div class="px-3 py-6 text-center">
                  <p class="text-xs text-text-muted">No MCP servers found for this agent.</p>
                </div>
              }
            >
              <div class="divide-y divide-border-subtle">
                <For each={serverList()}>
                  {(srv: MCPServerResponse) => {
                    const isExpanded = () => expandedServer() === srv.metadata.name;
                    const toolCount = () => srv.status?.tools?.length || 0;

                    return (
                      <div>
                        {/* Server row */}
                        <button
                          class="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors flex items-center gap-2"
                          onClick={() => toggleExpand(srv.metadata.name)}
                        >
                          {/* Expand chevron */}
                          <svg
                            class={`w-3 h-3 text-text-muted transition-transform ${isExpanded() ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                          </svg>

                          <span class="text-xs font-mono text-text truncate flex-1">
                            {srv.metadata.name}
                          </span>

                          <Show when={toolCount() > 0}>
                            <span class="text-[10px] text-text-muted">{toolCount()} tools</span>
                          </Show>

                          <Badge variant={phaseVariant(srv.status?.phase)}>
                            {srv.status?.phase || '?'}
                          </Badge>
                        </button>

                        {/* Expanded tools list */}
                        <Show when={isExpanded()}>
                          <div class="px-3 pb-2">
                            <Show
                              when={toolCount() > 0}
                              fallback={
                                <p class="text-[10px] text-text-muted pl-5 py-1">
                                  No tools discovered yet.
                                </p>
                              }
                            >
                              <div class="flex flex-wrap gap-1 pl-5">
                                <For each={srv.status!.tools}>
                                  {(tool: string) => (
                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary bg-surface-2 border border-border-subtle rounded">
                                      <svg class="w-2.5 h-2.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.42 15.17l-5.66-5.66a8 8 0 1111.31 0l-5.65 5.66z" />
                                      </svg>
                                      {tool}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>

                            {/* Server metadata */}
                            <div class="flex items-center gap-3 pl-5 mt-1.5 text-[10px] text-text-muted">
                              <span>{srv.spec.mode}</span>
                              <Show when={srv.spec.image}>
                                <span class="truncate max-w-[140px]">{srv.spec.image}</span>
                              </Show>
                              <Show when={srv.spec.url}>
                                <span class="truncate max-w-[140px]">{srv.spec.url}</span>
                              </Show>
                            </div>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}
