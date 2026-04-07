// TokenBadge — compact token count display for message footers.
// Sits right-aligned in the footer row below assistant bubbles.
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
      <span class={`text-xs text-text-muted/60 select-none ${props.class || ''}`}>
        {formatTokens(total())} tokens
      </span>
    </Show>
  );
}
