// MessageBubble — single message (user or assistant) with rich chat styling,
// asymmetric corners, role indicators, timestamps, and proper alignment.
import { For, Show, Switch, Match } from 'solid-js';
import type { ChatMessage, MessagePart, TextPart, ReasoningPart, ToolPart, StepFinishPart, SourcePart, ErrorPart } from '../../types';
import StreamingText from './StreamingText';
import ReasoningBlock from './ReasoningBlock';
import ToolCallCard from './ToolCallCard';
import TokenBadge from './TokenBadge';
import SourceReference from './SourceReference';
import ToolInputPreview from './ToolInputPreview';

interface MessageBubbleProps {
  message: ChatMessage;
  activeText?: { id: string; content: string } | null;
  activeReasoning?: { id: string; content: string } | null;
  activeToolInput?: { id: string; toolName: string; args: string } | null;
  isLastAssistant?: boolean;
  class?: string;
}

/** Format a timestamp (ms epoch or ISO string) to local time HH:MM */
function formatTime(ts: number | string): string {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Collect the last step-finish part's usage from the parts array */
function lastUsage(parts: MessagePart[] | undefined) {
  if (!parts) return undefined;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === 'step-finish') {
      return (parts[i] as StepFinishPart).usage;
    }
  }
  return undefined;
}

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = () => props.message;

  // ── User message ──
  if (msg().role === 'user') {
    return (
      <div class={`flex justify-end mb-5 ${props.class || ''}`}>
        <div class="flex flex-col items-end gap-1 max-w-[85%] md:max-w-[70%]">
          <div class="px-4 py-2.5 bg-primary text-primary-foreground rounded-2xl rounded-br-sm text-sm leading-relaxed shadow-sm">
            {msg().content || ''}
          </div>
          {/* Timestamp — right-aligned under user bubble */}
          <Show when={msg().timestamp}>
            <span class="text-[11px] text-text-muted/50 px-1 select-none">
              {formatTime(msg().timestamp)}
            </span>
          </Show>
        </div>
      </div>
    );
  }

  // ── Assistant message ──
  // Collect usage from step-finish parts (rendered in footer, not inline)
  const usage = () => lastUsage(msg().parts);
  const hasFooter = () => !!(msg().timestamp || usage());

  return (
    <div class={`mb-5 ${props.class || ''}`}>
      <div class="max-w-[95%] md:max-w-[85%]">
        {/* Bubble container — grey background with asymmetric corners */}
        <div class="bg-assistant-bubble border border-assistant-bubble-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
          {/* Render finalized parts (except step-finish — shown in footer) */}
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

                {/* step-finish parts are rendered in the footer row, not inline */}

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
            <Show when={props.activeReasoning}>
              <ReasoningBlock
                content={props.activeReasoning!.content}
                isStreaming
              />
            </Show>

            <Show when={props.activeText}>
              <StreamingText
                content={props.activeText!.content}
                isStreaming
              />
            </Show>

            <Show when={props.activeToolInput}>
              <ToolInputPreview
                toolName={props.activeToolInput!.toolName}
                args={props.activeToolInput!.args}
              />
            </Show>
          </Show>
        </div>

        {/* Footer row — timestamp left, token count right */}
        <Show when={hasFooter()}>
          <div class="flex items-center justify-between mt-1 px-1">
            <Show when={msg().timestamp} fallback={<span />}>
              <span class="text-[11px] text-text-muted/50 select-none">
                {formatTime(msg().timestamp)}
              </span>
            </Show>
            <Show when={usage()}>
              <TokenBadge usage={usage()} />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
