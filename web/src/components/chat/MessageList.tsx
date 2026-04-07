// MessageList — auto-scrolling message list with rAF-debounced scroll
import { For, Show, createEffect, onCleanup } from 'solid-js';
import {
  messages,
  streaming,
  activeText,
  activeReasoning,
  activeToolInput,
} from '../../stores/chat';
import MessageBubble from './MessageBubble';
import EmptyState from '../shared/EmptyState';

interface MessageListProps {
  class?: string;
}

export default function MessageList(props: MessageListProps) {
  let listRef: HTMLDivElement | undefined;
  let isUserScrolled = false;
  let rafId: number | null = null; // rAF guard — at most one pending scroll per frame

  function scheduleScroll() {
    if (isUserScrolled || !listRef || rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (listRef) listRef.scrollTop = listRef.scrollHeight;
    });
  }

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  // Auto-scroll to bottom when new content arrives.
  // Single rAF guard prevents multiple scroll calls per frame.
  createEffect(() => {
    // Track dependencies
    messages();
    activeText();
    activeReasoning();
    activeToolInput();

    scheduleScroll();
  });

  function onScroll() {
    if (!listRef) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef;
    // Consider "at bottom" if within 100px of the end
    isUserScrolled = scrollHeight - scrollTop - clientHeight > 100;
  }

  // Reset scroll lock when streaming starts
  createEffect(() => {
    if (streaming()) {
      isUserScrolled = false;
    }
  });

  const msgs = () => messages();
  const lastIndex = () => msgs().length - 1;

  return (
    <div
      ref={listRef}
      class={`flex-1 overflow-y-auto px-4 py-4 ${props.class || ''}`}
      onScroll={onScroll}
    >
      <Show
        when={msgs().length > 0}
        fallback={
          <EmptyState
            title="Start a conversation"
            description="Select an agent and type a message to begin."
            icon={
              <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
        }
      >
        <div class="max-w-3xl mx-auto">
          <For each={msgs()}>
            {(msg, i) => (
              <MessageBubble
                message={msg}
                isLastAssistant={msg.role === 'assistant' && i() === lastIndex()}
                activeText={i() === lastIndex() ? activeText() : null}
                activeReasoning={i() === lastIndex() ? activeReasoning() : null}
                activeToolInput={i() === lastIndex() ? activeToolInput() : null}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
