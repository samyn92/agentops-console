// KubernetesCard — kubectl / K8s resource table (from MCP metadata)
import { createSignal, For, Show, createMemo } from 'solid-js';
import Badge from '../shared/Badge';
import type { ToolMetadata } from '../../types';

interface KubernetesCardProps {
  toolName: string;
  input: string;
  output: string;
  isError: boolean;
  metadata?: ToolMetadata;
  class?: string;
  /** When true, skip the outer wrapper border/rounded/margin and the header row */
  headerless?: boolean;
}

interface K8sResource {
  name: string;
  namespace?: string;
  kind?: string;
  status?: string;
  ready?: string;
  age?: string;
  [key: string]: unknown;
}

function statusColor(status: string | undefined): string {
  switch (status?.toLowerCase()) {
    case 'running': case 'active': case 'ready': case 'bound': case 'available':
      return 'text-success';
    case 'pending': case 'containercreating': case 'terminating':
      return 'text-warning';
    case 'failed': case 'error': case 'crashloopbackoff': case 'imagepullbackoff':
      return 'text-error';
    default:
      return 'text-text-secondary';
  }
}

function parseKubectlTable(output: string): { headers: string[]; rows: string[][] } {
  const lines = output.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // First line is headers in kubectl output
  const headerLine = lines[0];
  // Find column positions based on header spacing
  const headers = headerLine.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) =>
    line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
  );

  return { headers, rows };
}

export default function KubernetesCard(props: KubernetesCardProps) {
  const [showRaw, setShowRaw] = createSignal(false);

  const resourceKind = () => (props.metadata?.kind || props.metadata?.resourceKind || '') as string;
  const namespace = () => (props.metadata?.namespace || '') as string;

  // Try to parse kubectl table output
  const table = createMemo(() => {
    if (props.metadata?.resources && Array.isArray(props.metadata.resources)) {
      // Structured resource list from metadata
      const resources = props.metadata.resources as K8sResource[];
      if (resources.length === 0) return { headers: [], rows: [] };
      const headers = Object.keys(resources[0]).filter((k) => typeof resources[0][k] !== 'object');
      const rows = resources.map((r) => headers.map((h) => String(r[h] ?? '')));
      return { headers: headers.map((h) => h.toUpperCase()), rows };
    }
    // Fall back to parsing kubectl table output
    return parseKubectlTable(props.output);
  });

  // Content body — shared between headerless and full modes
  const Body = () => (
    <>
      {/* Table view */}
      <Show when={!showRaw() && table().headers.length > 0}>
        <div class="bg-surface overflow-x-auto max-h-[400px] overflow-y-auto">
          <table class="w-full text-xs font-mono">
            <thead>
              <tr class="border-b border-border-subtle">
                <For each={table().headers}>
                  {(header) => (
                    <th class="text-left px-3 py-1.5 text-text-muted font-medium whitespace-nowrap">
                      {header}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={table().rows}>
                {(row) => (
                  <tr class="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors">
                    <For each={row}>
                      {(cell, i) => {
                        // Apply status coloring to STATUS column
                        const isStatusCol = () =>
                          table().headers[i()]?.toUpperCase() === 'STATUS' ||
                          table().headers[i()]?.toUpperCase() === 'PHASE';
                        return (
                          <td class={`px-3 py-1 whitespace-nowrap ${
                            isStatusCol() ? statusColor(cell) : 'text-text-secondary'
                          }`}>
                            {cell}
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      {/* Raw view / fallback */}
      <Show when={showRaw() || table().headers.length === 0}>
        <div class="px-3 py-2 bg-surface max-h-[400px] overflow-y-auto">
          <pre class="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
            {props.output}
          </pre>
        </div>
      </Show>
    </>
  );

  if (props.headerless) {
    return <div class={props.class || ''}><Body /></div>;
  }

  return (
    <div class={`border border-border rounded-lg overflow-hidden my-1 ${props.class || ''}`}>
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border-b border-border-subtle">
        <span class="text-xs font-medium text-[#326CE5]">Kubernetes</span>
        <Show when={resourceKind()}>
          <span class="text-xs text-text-secondary">{resourceKind()}</span>
        </Show>
        <Show when={namespace()}>
          <span class="text-xs text-text-muted">in {namespace()}</span>
        </Show>
        <div class="flex items-center gap-1.5 ml-auto">
          <button
            class="text-xs text-text-muted hover:text-accent transition-colors"
            onClick={() => setShowRaw(!showRaw())}
          >
            {showRaw() ? 'Table' : 'Raw'}
          </button>
          <Badge variant={props.isError ? 'error' : 'success'}>
            {props.isError ? 'error' : `${table().rows.length} items`}
          </Badge>
        </div>
      </div>

      <Body />
    </div>
  );
}
