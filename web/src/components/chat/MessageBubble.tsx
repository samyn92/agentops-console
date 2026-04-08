// MessageBubble — single message (user or assistant) with rich chat styling.
// Text/reasoning content renders inside grey bubbles. Tool calls, errors, and
// sources render standalone between bubbles. Empty assistant messages are hidden
// until the first visible content arrives.
import { For, Show, createMemo } from 'solid-js';
import type {
  ChatMessage, MessagePart, TextPart, ReasoningPart, ToolPart,
  SourcePart, ErrorPart,
} from '../../types';
import StreamingText from './StreamingText';
import ReasoningBlock from './ReasoningBlock';
import ToolCallCard from './ToolCallCard';
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

/** Parts that belong inside the grey text bubble */
const BUBBLE_TYPES = new Set(['text', 'reasoning']);

/** A contiguous group of parts — either a "bubble" group or a standalone part */
interface PartGroup {
  kind: 'bubble' | 'standalone';
  parts: MessagePart[];
}

/** Group consecutive parts: text/reasoning go into bubble groups, everything else is standalone */
function groupParts(parts: MessagePart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  let currentBubble: MessagePart[] | null = null;

  for (const part of parts) {
    if (part.type === 'step-finish') continue; // rendered in footer

    if (BUBBLE_TYPES.has(part.type)) {
      if (!currentBubble) currentBubble = [];
      currentBubble.push(part);
    } else {
      // Flush any pending bubble group
      if (currentBubble) {
        groups.push({ kind: 'bubble', parts: currentBubble });
        currentBubble = null;
      }
      groups.push({ kind: 'standalone', parts: [part] });
    }
  }

  // Flush trailing bubble
  if (currentBubble) {
    groups.push({ kind: 'bubble', parts: currentBubble });
  }

  return groups;
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
  const groups = createMemo(() => groupParts(msg().parts || []));

  // Determine if there's any visible content to show
  const hasVisibleContent = createMemo(() => {
    const g = groups();
    if (g.length > 0) return true;
    if (props.isLastAssistant) {
      if (props.activeText?.content) return true;
      if (props.activeReasoning?.content) return true;
      if (props.activeToolInput) return true;
    }
    return false;
  });

  // Check if there's active streaming content that should go in a bubble
  const hasActiveStreamBubble = () =>
    props.isLastAssistant && (props.activeText?.content || props.activeReasoning?.content);

  // Check if there's active tool input preview (renders outside bubble)
  const hasActiveToolInput = () => props.isLastAssistant && props.activeToolInput;

  const hasFooter = () => !!msg().timestamp;

  return (
    <Show when={hasVisibleContent()}>
      <div class={`mb-5 ${props.class || ''}`}>
        <div class="max-w-[95%] md:max-w-[85%] space-y-2">
          {/* Render grouped parts */}
          <For each={groups()}>
            {(group) => {
              if (group.kind === 'bubble') {
                return (
                  <div class="bg-assistant-bubble border border-assistant-bubble-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <For each={group.parts}>
                      {(part) => {
                        if (part.type === 'text') {
                          return <StreamingText content={(part as TextPart).content} />;
                        }
                        if (part.type === 'reasoning') {
                          return <ReasoningBlock content={(part as ReasoningPart).content} />;
                        }
                        return null;
                      }}
                    </For>
                  </div>
                );
              }
              // Standalone parts (tool, error, source)
              return (
                <For each={group.parts}>
                  {(part) => {
                    if (part.type === 'tool') {
                      return <ToolCallCard part={part as ToolPart} />;
                    }
                    if (part.type === 'error') {
                      return (
                        <div class="flex items-start gap-2 border border-error/30 bg-error/5 rounded-lg px-3 py-2">
                          <svg class="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <span class="text-sm text-error">{(part as ErrorPart).error}</span>
                        </div>
                      );
                    }
                    if (part.type === 'source') {
                      return (
                        <SourceReference
                          sourceType={(part as SourcePart).sourceType}
                          url={(part as SourcePart).url}
                          title={(part as SourcePart).title}
                        />
                      );
                    }
                    return null;
                  }}
                </For>
              );
            }}
          </For>

          {/* Active streaming text/reasoning — in a bubble */}
          <Show when={hasActiveStreamBubble()}>
            <div class="bg-assistant-bubble border border-assistant-bubble-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
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
            </div>
          </Show>

          {/* Active tool input preview — outside bubble */}
          <Show when={hasActiveToolInput()}>
            <ToolInputPreview
              toolName={props.activeToolInput!.toolName}
              args={props.activeToolInput!.args}
            />
          </Show>

          {/* Footer row — timestamp */}
          <Show when={hasFooter()}>
            <div class="flex items-center px-1 -mt-1">
              <span class="text-[11px] text-text-muted/50 select-none">
                {formatTime(msg().timestamp)}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
