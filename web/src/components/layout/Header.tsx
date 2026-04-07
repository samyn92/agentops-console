// Header — breadcrumb + agent status bar + neural trace
import { Show } from 'solid-js';
import { selectedAgent } from '../../stores/agents';
import { currentSession } from '../../stores/sessions';
import { streaming } from '../../stores/chat';
import NeuralTrace from '../shared/NeuralTrace';

interface HeaderProps {
  onMenuClick?: () => void;
  class?: string;
}

export default function Header(props: HeaderProps) {
  const agent = () => selectedAgent();
  const session = () => currentSession();

  return (
    <header class={`relative flex flex-col bg-background ${props.class || ''}`}>
      <div class="flex items-center gap-3 px-4 h-12 border-b border-border">
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

            <Show when={session()?.title}>
              <span class="text-text-muted mx-1">&middot;</span>
              <span class="text-text-secondary truncate text-xs">
                {session()!.title}
              </span>
            </Show>
          </Show>
        </div>
      </div>

      {/* Neural trace bar — overlays below the border when streaming */}
      <NeuralTrace active={streaming()} size="sm" />
    </header>
  );
}
