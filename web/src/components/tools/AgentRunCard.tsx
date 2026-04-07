// AgentRunCard — run_agent / get_agent_run results (sub-agent tracking)
import { Show } from 'solid-js';
import Badge from '../shared/Badge';
import type { ToolMetadata } from '../../types';

interface AgentRunCardProps {
  toolName: string;
  input: string;
  output: string;
  isError: boolean;
  metadata?: ToolMetadata;
  class?: string;
  /** When true, skip the outer wrapper border/rounded/margin and the header row */
  headerless?: boolean;
}

function phaseVariant(phase: string | undefined): 'success' | 'warning' | 'error' | 'info' | 'muted' {
  switch (phase) {
    case 'Completed': case 'Succeeded': return 'success';
    case 'Running': case 'Pending': return 'warning';
    case 'Failed': case 'Error': return 'error';
    default: return 'muted';
  }
}

export default function AgentRunCard(props: AgentRunCardProps) {
  const agentName = () => {
    if (props.metadata?.agent) return props.metadata.agent as string;
    try {
      const parsed = JSON.parse(props.input);
      return parsed.agent || parsed.agentRef || '';
    } catch {
      return '';
    }
  };

  const runName = () => (props.metadata?.runName || props.metadata?.name || '') as string;
  const namespace = () => (props.metadata?.namespace || '') as string;
  const phase = () => (props.metadata?.phase || '') as string;
  const runOutput = () => (props.metadata?.output || '') as string;

  const isStatusCard = () => props.metadata?.ui === 'agent-run-status';

  // Content body — shared between headerless and full modes
  const Body = () => (
    <div class="px-3 py-2 bg-surface space-y-1.5">
      <Show when={runName()}>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-text-muted w-16">Run</span>
          <span class="text-text font-mono">{runName()}</span>
        </div>
      </Show>
      <Show when={namespace()}>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-text-muted w-16">Namespace</span>
          <span class="text-text-secondary font-mono">{namespace()}</span>
        </div>
      </Show>

      {/* Output preview (for completed runs) */}
      <Show when={runOutput()}>
        <div class="mt-2 pt-2 border-t border-border-subtle">
          <span class="text-xs text-text-muted">Output</span>
          <pre class="text-xs text-text-secondary font-mono mt-1 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
            {runOutput()}
          </pre>
        </div>
      </Show>

      {/* Fallback to raw output */}
      <Show when={!runOutput() && props.output}>
        <div class="mt-2 pt-2 border-t border-border-subtle">
          <pre class="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
            {props.output}
          </pre>
        </div>
      </Show>
    </div>
  );

  if (props.headerless) {
    return <div class={props.class || ''}><Body /></div>;
  }

  return (
    <div class={`border border-border rounded-lg overflow-hidden my-1 ${props.class || ''}`}>
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border-b border-border-subtle">
        <span class="text-xs font-medium" style={{ color: 'var(--accent)' }}>
          {isStatusCard() ? 'Run Status' : 'Agent Run'}
        </span>
        <Show when={agentName()}>
          <span class="text-xs text-text-secondary font-mono">{agentName()}</span>
        </Show>
        <div class="flex items-center gap-1.5 ml-auto">
          <Show when={phase()}>
            <Badge variant={phaseVariant(phase())}>{phase()}</Badge>
          </Show>
          <Show when={!phase()}>
            <Badge variant={props.isError ? 'error' : 'success'}>
              {props.isError ? 'error' : 'created'}
            </Badge>
          </Show>
        </div>
      </div>

      <Body />
    </div>
  );
}
