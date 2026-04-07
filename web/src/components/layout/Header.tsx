// Header — breadcrumb + agent status bar + neural trace
import { Show } from 'solid-js';
import { selectedAgent, getAgentStatus } from '../../stores/agents';
import { currentSession } from '../../stores/sessions';
import { streaming, currentStep, totalUsage, activeModel } from '../../stores/chat';
import AgentStatusBadge from '../agents/AgentStatusBadge';
import NeuralTrace from '../shared/NeuralTrace';
import CostDisplay from '../shared/CostDisplay';

interface HeaderProps {
  onMenuClick?: () => void;
  class?: string;
}

export default function Header(props: HeaderProps) {
  const agent = () => selectedAgent();
  const status = () => {
    const a = agent();
    if (!a) return null;
    return getAgentStatus(a.namespace, a.name);
  };
  const session = () => currentSession();

  return (
    <header class={`flex flex-col border-b border-border bg-background ${props.class || ''}`}>
      <div class="flex items-center gap-3 px-4 py-2.5 min-h-[48px]">
        {/* Mobile menu button */}
        <Show when={props.onMenuClick}>
          <button
            class="md:hidden touch-target -ml-2 text-text-secondary hover:text-text"
            onClick={props.onMenuClick}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </Show>

        {/* Breadcrumb */}
        <div class="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          <Show
            when={agent()}
            fallback={<span class="text-text-muted">Select an agent</span>}
          >
            <span class="text-text-secondary">{agent()!.namespace}</span>
            <span class="text-text-muted">/</span>
            <span class="font-medium text-text truncate">{agent()!.name}</span>

            <Show when={session()}>
              <span class="text-text-muted mx-1">&middot;</span>
              <span class="text-text-secondary truncate text-xs">
                {session()!.title || `Session ${session()!.id.slice(0, 8)}`}
              </span>
            </Show>
          </Show>
        </div>

        {/* Status area */}
        <div class="flex items-center gap-2 flex-shrink-0">
          <Show when={streaming()}>
            <span class="text-xs text-accent">
              Step {currentStep()}
            </span>
          </Show>

          <Show when={status()}>
            <AgentStatusBadge
              phase={status()!.phase}
              isOnline={status()!.isOnline}
            />
          </Show>
        </div>
      </div>

      {/* Neural trace bar — shows when streaming */}
      <NeuralTrace active={streaming()} size="sm" />

      {/* Usage bar — shows after completion */}
      <Show when={!streaming() && totalUsage()}>
        <div class="px-4 py-1.5 border-t border-border-subtle">
          <CostDisplay usage={totalUsage()!} model={activeModel()} compact />
        </div>
      </Show>
    </header>
  );
}
