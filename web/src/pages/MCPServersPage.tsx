// MCPServersPage — MCPServer list and detail view
import { createResource, createSignal, For, Show } from 'solid-js';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import { mcpServers } from '../lib/api';
import type { MCPServerResponse } from '../types';
import Badge from '../components/shared/Badge';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import { phaseVariant } from '../lib/format';

export default function MCPServersPage() {
  const [serverList, { refetch }] = createResource(() => mcpServers.list());
  const [selectedServer, setSelectedServer] = createSignal<MCPServerResponse | null>(null);

  return (
    <div class="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div class="flex flex-col flex-1 min-w-0">
        <Header />
        <main class="flex-1 overflow-hidden flex">
          {/* Server list */}
          <div class="w-[360px] min-w-[300px] border-r border-border overflow-y-auto">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 class="text-sm font-semibold text-text">MCP Servers</h2>
              <button
                class="text-xs text-accent hover:text-accent/80 transition-colors"
                onClick={() => refetch()}
              >
                Refresh
              </button>
            </div>

            <Show when={serverList.loading}>
              <div class="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            </Show>

            <Show when={serverList()}>
              {(data) => (
                <Show
                  when={data().length > 0}
                  fallback={
                    <EmptyState
                      title="No MCP Servers"
                      description="MCP servers provide tools to agents via the Model Context Protocol."
                    />
                  }
                >
                  <div class="divide-y divide-border-subtle">
                    <For each={data()}>
                      {(srv) => (
                        <button
                          class={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors ${
                            selectedServer()?.metadata.name === srv.metadata.name ? 'bg-surface-hover' : ''
                          }`}
                          onClick={() => setSelectedServer(srv)}
                        >
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-mono text-text truncate flex-1">
                              {srv.metadata.name}
                            </span>
                            <Badge variant={phaseVariant(srv.status?.phase)}>
                              {srv.status?.phase || 'Unknown'}
                            </Badge>
                          </div>
                          <div class="flex items-center gap-3 text-xs text-text-muted">
                            <span>{srv.spec.mode}</span>
                            <Show when={srv.status?.tools?.length}>
                              <span>{srv.status!.tools!.length} tools</span>
                            </Show>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              )}
            </Show>
          </div>

          {/* Server detail */}
          <div class="flex-1 overflow-y-auto">
            <Show
              when={selectedServer()}
              fallback={
                <div class="flex items-center justify-center h-full text-sm text-text-muted">
                  Select an MCP server to view details
                </div>
              }
            >
              {(srv) => (
                <div class="space-y-4">
                  <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <div class="flex-1 min-w-0">
                      <h2 class="text-sm font-semibold text-text font-mono">{srv().metadata.name}</h2>
                      <p class="text-xs text-text-muted">{srv().metadata.namespace}</p>
                    </div>
                    <Badge variant={phaseVariant(srv().status?.phase)}>
                      {srv().status?.phase || 'Unknown'}
                    </Badge>
                  </div>
                  <div class="px-4 space-y-2">
                    <Property label="Mode" value={srv().spec.mode} />
                    <Show when={srv().spec.image}>
                      <Property label="Image" value={srv().spec.image!} />
                    </Show>
                    <Show when={srv().spec.url}>
                      <Property label="URL" value={srv().spec.url!} />
                    </Show>

                    {/* Available tools */}
                    <Show when={srv().status?.tools?.length}>
                      <div class="space-y-1.5 mt-3">
                        <span class="text-xs text-text-muted uppercase tracking-wide font-medium">
                          Available Tools ({srv().status!.tools!.length})
                        </span>
                        <div class="flex flex-wrap gap-1.5">
                          <For each={srv().status!.tools}>
                            {(tool) => (
                              <Badge variant="muted">{tool}</Badge>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Configured tools */}
                    <Show when={srv().spec.tools?.length}>
                      <div class="space-y-1.5 mt-3">
                        <span class="text-xs text-text-muted uppercase tracking-wide font-medium">
                          Configured Tools
                        </span>
                        <div class="flex flex-wrap gap-1.5">
                          <For each={srv().spec.tools}>
                            {(tool) => (
                              <Badge variant="info">{tool}</Badge>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </main>
      </div>
    </div>
  );
}

function Property(props: { label: string; value: string }) {
  return (
    <div class="flex items-center gap-2 text-xs">
      <span class="text-text-muted w-20 flex-shrink-0">{props.label}</span>
      <span class="text-text font-mono truncate">{props.value}</span>
    </div>
  );
}
