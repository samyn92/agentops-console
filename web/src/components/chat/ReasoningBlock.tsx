// ReasoningBlock — collapsible thinking/reasoning panel
import { createSignal, Show } from 'solid-js';

interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
  class?: string;
}

export default function ReasoningBlock(props: ReasoningBlockProps) {
  const [collapsed, setCollapsed] = createSignal(false);

  // Auto-collapse when streaming ends and content is long
  const shouldAutoCollapse = () => !props.isStreaming && props.content.length > 500;

  const isCollapsed = () => shouldAutoCollapse() ? collapsed() : false;

  const displayContent = () => {
    if (isCollapsed()) {
      return props.content.slice(0, 200) + '...';
    }
    return props.content;
  };

  return (
    <div class={`border-l-2 border-accent/30 pl-3 my-1 ${props.class || ''}`}>
      <button
        class="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-1"
        onClick={() => setCollapsed((c) => !c)}
      >
        <svg
          class={`w-3 h-3 transition-transform ${isCollapsed() ? '' : 'rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span class="font-medium uppercase tracking-wider">Thinking</span>
        <Show when={props.isStreaming}>
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" />
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.2s" />
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.4s" />
        </Show>
      </button>

      <Show when={!isCollapsed()}>
        <div class="text-sm text-text-muted leading-relaxed whitespace-pre-wrap fade-in">
          {displayContent()}
          <Show when={props.isStreaming}>
            <span class="streaming-cursor" />
          </Show>
        </div>
      </Show>

      <Show when={isCollapsed()}>
        <div class="text-sm text-text-muted leading-relaxed">
          {displayContent()}
          <button
            class="ml-1 text-accent text-xs hover:underline"
            onClick={() => setCollapsed(false)}
          >
            Show more
          </button>
        </div>
      </Show>
    </div>
  );
}
