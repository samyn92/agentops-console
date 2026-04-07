// Token usage and cost breakdown display
import { Show } from 'solid-js';
import type { Usage } from '../../types';
import { formatTokens } from '../../lib/format';

interface CostDisplayProps {
  usage: Usage;
  model?: string | null;
  compact?: boolean;
  class?: string;
}

export default function CostDisplay(props: CostDisplayProps) {
  const usage = () => props.usage;

  if (props.compact) {
    return (
      <span class={`text-xs text-text-muted ${props.class || ''}`}>
        {formatTokens(usage().total_tokens)} tokens
      </span>
    );
  }

  return (
    <div class={`flex flex-wrap items-center gap-3 text-xs text-text-muted ${props.class || ''}`}>
      <Show when={props.model}>
        <span class="font-medium text-text-secondary">{props.model}</span>
        <span class="text-border-hover">|</span>
      </Show>

      <span title="Input tokens">
        <span class="text-text-secondary">{formatTokens(usage().input_tokens)}</span>
        {' in'}
      </span>

      <span title="Output tokens">
        <span class="text-text-secondary">{formatTokens(usage().output_tokens)}</span>
        {' out'}
      </span>

      <Show when={usage().reasoning_tokens > 0}>
        <span title="Reasoning tokens">
          <span class="text-text-secondary">{formatTokens(usage().reasoning_tokens)}</span>
          {' reasoning'}
        </span>
      </Show>

      <Show when={usage().cache_read_tokens > 0}>
        <span title="Cache read tokens">
          <span class="text-text-secondary">{formatTokens(usage().cache_read_tokens)}</span>
          {' cached'}
        </span>
      </Show>

      <span class="text-border-hover">|</span>
      <span>
        <span class="text-text-secondary">{formatTokens(usage().total_tokens)}</span>
        {' total'}
      </span>
    </div>
  );
}
