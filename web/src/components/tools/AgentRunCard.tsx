// AgentRunCard — run_agent / get_agent_run results (sub-agent tracking)
// Enhanced: shows a mini run-card with phase, agent ref, and a link to
// open the run in the right panel for full details.
import { Show } from 'solid-js';
import Badge from '../shared/Badge';
import NeuralTrace from '../shared/NeuralTrace';
import { selectRun } from '../../stores/runs';
import { setRightPanelState } from '../../stores/view';
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

function isActivePhase(phase: string | undefined): boolean {
  return phase === 'Running' || phase === 'Pending' || phase === 'Queued';
}

/** Open the run in the right panel */
function openRunInPanel(namespace: string, name: string) {
  if (namespace && name) {
    selectRun(namespace, name);
    setRightPanelState('expanded');
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
  const isActive = () => isActivePhase(phase());

  // Content body — shared between headerless and full modes
  const Body = () => (
    <div class="px-3 py-2 bg-surface space-y-1.5">
      <Show when={runName()}>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-text-muted w-16">Run</span>
          <span class="text-text font-mono truncate flex-1">{runName()}</span>
          {/* Link to open in right panel */}
          <button
            class="text-[10px] text-accent hover:text-accent/80 hover:underline flex-shrink-0 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              openRunInPanel(namespace(), runName());
            }}
            title="Show in runs panel"
          >
            <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </button>
        </div>
      </Show>
      <Show when={namespace()}>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-text-muted w-16">Namespace</span>
          <span class="text-text-secondary font-mono">{namespace()}</span>
        </div>
      </Show>

      {/* Phase + agent info */}
      <Show when={phase()}>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-text-muted w-16">Phase</span>
          <span class={`font-medium ${
            phase() === 'Running' ? 'text-warning' :
            phase() === 'Succeeded' || phase() === 'Completed' ? 'text-success' :
            phase() === 'Failed' ? 'text-error' : 'text-text-secondary'
          }`}>{phase()}</span>
        </div>
      </Show>

      {/* Neural trace for active runs */}
      <Show when={isActive()}>
        <NeuralTrace active size="sm" />
        <p class="text-[11px] text-text-muted italic">
          Run is still in progress. Call get_agent_run again to check for completion.
        </p>
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
