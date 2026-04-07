// ResourceBrowser — K8s namespace/pod browser
import { createResource, createSignal, For, Show } from 'solid-js';
import { kubernetes } from '../../lib/api';
import type { NamespaceInfo, PodInfo } from '../../types';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';

interface ResourceBrowserProps {
  class?: string;
}

function podStatusVariant(phase: string): 'success' | 'warning' | 'error' | 'muted' {
  switch (phase.toLowerCase()) {
    case 'running': return 'success';
    case 'pending': case 'containercreating': return 'warning';
    case 'failed': case 'error': case 'crashloopbackoff': return 'error';
    default: return 'muted';
  }
}

export default function ResourceBrowser(props: ResourceBrowserProps) {
  const [namespaces] = createResource(() => kubernetes.namespaces());
  const [selectedNs, setSelectedNs] = createSignal<string | null>(null);
  const [pods] = createResource(selectedNs, (ns) => ns ? kubernetes.pods(ns) : Promise.resolve([]));

  return (
    <div class={`space-y-3 ${props.class || ''}`}>
      {/* Namespace list */}
      <div>
        <h3 class="text-xs font-medium text-text-muted uppercase tracking-wide px-4 py-2">Namespaces</h3>

        <Show when={namespaces.loading}>
          <div class="flex items-center justify-center py-4">
            <Spinner size="sm" />
          </div>
        </Show>

        <Show when={namespaces()}>
          {(data) => (
            <div class="space-y-0.5 px-2">
              <For each={data()}>
                {(ns) => {
                  const isSelected = () => selectedNs() === ns.name;
                  const resourceCount = () => ns.agents + ns.runs + ns.channels + ns.mcpServers;

                  return (
                    <button
                      class={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                        isSelected()
                          ? 'bg-accent-muted text-text'
                          : 'text-text-secondary hover:text-text hover:bg-surface-hover'
                      }`}
                      onClick={() => setSelectedNs(isSelected() ? null : ns.name)}
                    >
                      <div class="flex items-center gap-2">
                        <span class="truncate flex-1 font-mono text-xs">{ns.name}</span>
                        <Show when={resourceCount() > 0}>
                          <span class="text-xs text-text-muted">{resourceCount()}</span>
                        </Show>
                      </div>
                      <Show when={isSelected()}>
                        <div class="flex gap-3 mt-1 text-[10px] text-text-muted">
                          <Show when={ns.agents > 0}><span>{ns.agents} agents</span></Show>
                          <Show when={ns.runs > 0}><span>{ns.runs} runs</span></Show>
                          <Show when={ns.channels > 0}><span>{ns.channels} channels</span></Show>
                          <Show when={ns.mcpServers > 0}><span>{ns.mcpServers} MCP</span></Show>
                        </div>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </Show>
      </div>

      {/* Pods in selected namespace */}
      <Show when={selectedNs()}>
        <div>
          <h3 class="text-xs font-medium text-text-muted uppercase tracking-wide px-4 py-2">
            Pods in {selectedNs()}
          </h3>

          <Show when={pods.loading}>
            <div class="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          </Show>

          <Show when={pods()}>
            {(podList) => (
              <Show
                when={podList().length > 0}
                fallback={<p class="text-xs text-text-muted px-4 py-2">No pods</p>}
              >
                <div class="space-y-0.5 px-2">
                  <For each={podList()}>
                    {(pod) => (
                      <div class="px-2 py-1.5 rounded-md text-xs hover:bg-surface-hover transition-colors">
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-text truncate flex-1">{pod.name}</span>
                          <Badge variant={podStatusVariant(pod.phase)} class="text-[10px]">
                            {pod.phase}
                          </Badge>
                        </div>
                        <div class="flex gap-3 mt-0.5 text-[10px] text-text-muted">
                          <span>{pod.age}</span>
                          <Show when={pod.restarts > 0}>
                            <span class="text-warning">{pod.restarts} restarts</span>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
