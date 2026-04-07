// ChannelsPage — Channel list and detail view
import { createResource, createSignal, For, Show } from 'solid-js';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import { channels } from '../lib/api';
import type { ChannelResponse } from '../types';
import Badge from '../components/shared/Badge';
import Spinner from '../components/shared/Spinner';
import EmptyState from '../components/shared/EmptyState';
import { phaseVariant } from '../lib/format';

export default function ChannelsPage() {
  const [channelList, { refetch }] = createResource(() => channels.list());
  const [selectedChannel, setSelectedChannel] = createSignal<ChannelResponse | null>(null);

  return (
    <div class="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div class="flex flex-col flex-1 min-w-0">
        <Header />
        <main class="flex-1 overflow-hidden flex">
          {/* Channel list */}
          <div class="w-[360px] min-w-[300px] border-r border-border overflow-y-auto">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 class="text-sm font-semibold text-text">Channels</h2>
              <button
                class="text-xs text-accent hover:text-accent/80 transition-colors"
                onClick={() => refetch()}
              >
                Refresh
              </button>
            </div>

            <Show when={channelList.loading}>
              <div class="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            </Show>

            <Show when={channelList()}>
              {(data) => (
                <Show
                  when={data().length > 0}
                  fallback={
                    <EmptyState
                      title="No Channels"
                      description="Channels bridge external systems (webhooks, GitLab, etc.) to agents."
                    />
                  }
                >
                  <div class="divide-y divide-border-subtle">
                    <For each={data()}>
                      {(ch) => (
                        <button
                          class={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors ${
                            selectedChannel()?.metadata.name === ch.metadata.name ? 'bg-surface-hover' : ''
                          }`}
                          onClick={() => setSelectedChannel(ch)}
                        >
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-mono text-text truncate flex-1">
                              {ch.metadata.name}
                            </span>
                            <Badge variant={phaseVariant(ch.status?.phase)}>
                              {ch.status?.phase || 'Unknown'}
                            </Badge>
                          </div>
                          <div class="flex items-center gap-3 text-xs text-text-muted">
                            <span>{ch.spec.type}</span>
                            <span>Agent: {ch.spec.agentRef}</span>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              )}
            </Show>
          </div>

          {/* Channel detail */}
          <div class="flex-1 overflow-y-auto">
            <Show
              when={selectedChannel()}
              fallback={
                <div class="flex items-center justify-center h-full text-sm text-text-muted">
                  Select a channel to view details
                </div>
              }
            >
              {(ch) => (
                <div class="space-y-4">
                  <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <div class="flex-1 min-w-0">
                      <h2 class="text-sm font-semibold text-text font-mono">{ch().metadata.name}</h2>
                      <p class="text-xs text-text-muted">{ch().metadata.namespace}</p>
                    </div>
                    <Badge variant={phaseVariant(ch().status?.phase)}>
                      {ch().status?.phase || 'Unknown'}
                    </Badge>
                  </div>
                  <div class="px-4 space-y-2">
                    <Property label="Type" value={ch().spec.type} />
                    <Property label="Agent" value={ch().spec.agentRef} />
                    <Show when={ch().spec.webhook?.path}>
                      <Property label="Webhook Path" value={ch().spec.webhook!.path!} />
                    </Show>
                    <Show when={ch().spec.config}>
                      <div class="space-y-1 mt-2">
                        <span class="text-xs text-text-muted">Config</span>
                        <pre class="text-xs font-mono text-text-secondary bg-surface-2 rounded-md p-2 border border-border-subtle">
                          {JSON.stringify(ch().spec.config, null, 2)}
                        </pre>
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
      <span class="text-text-muted w-24 flex-shrink-0">{props.label}</span>
      <span class="text-text font-mono">{props.value}</span>
    </div>
  );
}
