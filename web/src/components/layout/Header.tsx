// Header — breadcrumb + agent status bar + neural trace
import { Show } from 'solid-js';
import { selectedAgent } from '../../stores/agents';
import { currentSession } from '../../stores/sessions';
import { streaming } from '../../stores/chat';
import NeuralTrace from '../shared/NeuralTrace';

interface HeaderProps {
  class?: string;
}

export default function Header(props: HeaderProps) {
  const agent = () => selectedAgent();
  const session = () => currentSession();

  return (
    <header class={`relative flex flex-col bg-background ${props.class || ''}`}>
      <div class="flex items-center gap-3 px-4 h-12 border-b border-border">
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
