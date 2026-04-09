// AgentCard — M3-styled card for the sidebar agent list.
// Shows name, model, mode badge, online indicator, and concurrency slots.
// Supports a `compact` variant for nested task agents in the hierarchy.
import { Show, For } from 'solid-js';
import { getAgentStatus } from '../../stores/agents';
import { getAgentConcurrency } from '../../stores/runs';
import type { AgentResponse } from '../../types';

interface AgentCardProps {
  agent: AgentResponse;
  selected: boolean;
  onSelect: () => void;
  /** Compact variant for nested task agents under an orchestrator */
  compact?: boolean;
}

/** Shorten model names for compact display (e.g. "claude-sonnet-4-20250514" → "sonnet-4") */
function shortModel(model: string): string {
  if (!model) return '';
  const m = model.toLowerCase();
  const cleaned = m.replace(/-\d{4}[-]?\d{2}[-]?\d{2}$/g, '').replace(/-\d{8}$/g, '');
  const withoutVendor = cleaned
    .replace(/^claude-/, '')
    .replace(/^gpt-/, 'gpt-')
    .replace(/^gemini-/, 'gemini-');
  return withoutVendor;
}

export default function AgentCard(props: AgentCardProps) {
  const status = () => getAgentStatus(props.agent.namespace, props.agent.name);
  const concurrency = () => getAgentConcurrency(props.agent.name);
  const hasActivity = () => concurrency().running > 0 || concurrency().queued > 0;
  const isCompact = () => props.compact ?? false;

  return (
    <button
      class={`agent-card w-full text-left transition-all ${
        props.selected ? 'agent-card--selected' : ''
      } ${isCompact() ? 'agent-card--compact' : ''}`}
      onClick={() => props.onSelect()}
    >
      {/* Row 1: Name + Status dot */}
      <div class="flex items-center gap-2 mb-1">
        <span
          class={`flex-shrink-0 rounded-full ${
            status().isOnline ? 'bg-success' : 'bg-text-muted'
          } ${isCompact() ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
          title={status().isOnline ? 'Online' : 'Offline'}
        />
        <Show when={status().isOnline && !isCompact()}>
          <span class="absolute w-2 h-2 rounded-full bg-success status-dot-glow" style={{ left: '12px' }} />
        </Show>
        <span class={`font-medium text-text truncate flex-1 ${isCompact() ? 'text-xs' : 'text-sm'}`}>
          {props.agent.name}
        </span>
        <Show when={props.agent.phase && props.agent.phase !== 'Running'}>
          <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            props.agent.phase === 'Pending' ? 'bg-warning/15 text-warning' :
            props.agent.phase === 'Failed' ? 'bg-error/15 text-error' :
            'bg-text-muted/15 text-text-muted'
          }`}>
            {props.agent.phase}
          </span>
        </Show>
      </div>

      {/* Row 2: Model + Mode */}
      <div class={`flex items-center gap-2 ${isCompact() ? 'text-[10px]' : 'text-[11px]'} leading-[16px] tracking-[0.5px]`}>
        <Show when={props.agent.model}>
          <span class="text-text-muted font-mono truncate">
            {shortModel(props.agent.model)}
          </span>
        </Show>
        <Show when={props.agent.mode && !isCompact()}>
          <span class={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
            props.agent.mode === 'daemon'
              ? 'bg-info/12 text-info'
              : 'bg-accent/12 text-accent'
          }`}>
            {props.agent.mode}
          </span>
        </Show>
        {/* Compact mode: show task badge only as a tiny indicator */}
        <Show when={props.agent.mode === 'task' && isCompact()}>
          <span class="inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-medium bg-accent/12 text-accent">
            task
          </span>
        </Show>
      </div>

      {/* Row 3: Concurrency slots (only when there's activity) */}
      <Show when={hasActivity()}>
        <div class={`flex items-center gap-1.5 ${isCompact() ? 'mt-1' : 'mt-1.5'}`}>
          <div class="flex gap-0.5 flex-1">
            <For each={Array.from({ length: Math.max(concurrency().running + concurrency().queued, concurrency().running + 1) })}>
              {(_, i) => (
                <div
                  class={`flex-1 rounded-full transition-colors ${
                    i() < concurrency().running
                      ? 'bg-success'
                      : i() < concurrency().running + concurrency().queued
                        ? 'bg-warning'
                        : 'bg-border'
                  } ${isCompact() ? 'h-0.5' : 'h-1'}`}
                />
              )}
            </For>
          </div>
          <span class="text-[10px] font-mono text-text-muted flex-shrink-0">
            {concurrency().running}r
            <Show when={concurrency().queued > 0}>
              <span class="text-warning"> +{concurrency().queued}q</span>
            </Show>
          </span>
        </div>
      </Show>
    </button>
  );
}
