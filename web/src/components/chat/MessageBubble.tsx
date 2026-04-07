// MessageBubble — single message (user or assistant) with rich chat styling,
// asymmetric corners, role indicators, timestamps, and proper alignment.
import { For, Show, Switch, Match, createSignal } from 'solid-js';
import type { ChatMessage, MessagePart, TextPart, ReasoningPart, ToolPart, StepFinishPart, SourcePart, ErrorPart } from '../../types';
import StreamingText from './StreamingText';
import ReasoningBlock from './ReasoningBlock';
import ToolCallCard from './ToolCallCard';
import TokenBadge from './TokenBadge';
import SourceReference from './SourceReference';

interface MessageBubbleProps {
  message: ChatMessage;
  activeText?: { id: string; content: string } | null;
  activeReasoning?: { id: string; content: string } | null;
  activeToolInput?: { id: string; toolName: string; args: string } | null;
  isLastAssistant?: boolean;
  class?: string;
}

// Lazy import to avoid circular dependency
import ToolInputPreview from './ToolInputPreview';

/** Format timestamp to short time string */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = () => props.message;
  const [hovered, setHovered] = createSignal(false);

  // ── User message ──
  if (msg().role === 'user') {
    return (
      <div
        class={`flex justify-end mb-4 group ${props.class || ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div class="flex flex-col items-end gap-0.5 max-w-[85%] md:max-w-[70%]">
          <div class="px-4 py-2.5 bg-primary text-primary-foreground rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm">
            {msg().content || ''}
          </div>
          {/* Timestamp — visible on hover */}
          <Show when={hovered() && msg().timestamp}>
            <span class="text-[10px] text-text-muted/60 px-1 select-none fade-in">
              {formatTime(msg().timestamp)}
            </span>
          </Show>
        </div>
      </div>
    );
  }

  // ── Assistant message ──
  return (
    <div
      class={`mb-4 group ${props.class || ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div class="flex gap-2.5 items-start">
        {/* Agent avatar — subtle accent dot */}
        <div class="shrink-0 mt-1.5">
          <div class="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center">
            <svg class="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <div class="max-w-[95%] md:max-w-[85%] min-w-0">
          {/* Render finalized parts */}
          <For each={msg().parts || []}>
            {(part) => (
              <Switch>
                <Match when={part.type === 'text'}>
                  <StreamingText content={(part as TextPart).content} />
                </Match>

                <Match when={part.type === 'reasoning'}>
                  <ReasoningBlock content={(part as ReasoningPart).content} />
                </Match>

                <Match when={part.type === 'tool'}>
                  <ToolCallCard part={part as ToolPart} />
                </Match>

                <Match when={part.type === 'step-finish'}>
                  <TokenBadge usage={(part as StepFinishPart).usage} />
                </Match>

                <Match when={part.type === 'error'}>
                  <div class="flex items-start gap-2 border border-error/30 bg-error/5 rounded-lg px-3 py-2 my-1">
                    <svg class="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <span class="text-sm text-error">{(part as ErrorPart).error}</span>
                  </div>
                </Match>

                <Match when={part.type === 'source'}>
                  <SourceReference
                    sourceType={(part as SourcePart).sourceType}
                    url={(part as SourcePart).url}
                    title={(part as SourcePart).title}
                  />
                </Match>
              </Switch>
            )}
          </For>

          {/* Active streaming content (not yet finalized into parts) */}
          <Show when={props.isLastAssistant}>
            {/* Active reasoning stream */}
            <Show when={props.activeReasoning}>
              <ReasoningBlock
                content={props.activeReasoning!.content}
                isStreaming
              />
            </Show>

            {/* Active text stream */}
            <Show when={props.activeText}>
              <StreamingText
                content={props.activeText!.content}
                isStreaming
              />
            </Show>

            {/* Active tool input stream (Fantasy-only feature!) */}
            <Show when={props.activeToolInput}>
              <ToolInputPreview
                toolName={props.activeToolInput!.toolName}
                args={props.activeToolInput!.args}
              />
            </Show>
          </Show>

          {/* Timestamp — visible on hover */}
          <Show when={hovered() && msg().timestamp}>
            <span class="text-[10px] text-text-muted/60 px-0.5 select-none fade-in">
              {formatTime(msg().timestamp)}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}
