// TokenBadge — minimal inline token count for step-finish parts.
// Replaces the old StepIndicator with just a compact "2.1k tokens" text.
import { Show } from 'solid-js';
import type { Usage } from '../../types';
import { formatTokens } from '../../lib/format';

interface TokenBadgeProps {
  usage?: Usage;
  class?: string;
}

export default function TokenBadge(props: TokenBadgeProps) {
  const total = () => props.usage?.total_tokens ?? 0;

  return (
    <Show when={total() > 0}>
      <div class={`flex items-center py-0.5 my-0.5 ${props.class || ''}`}>
        <span class="text-[11px] text-text-muted/50">
          {formatTokens(total())} tokens
        </span>
      </div>
    </Show>
  );
}
