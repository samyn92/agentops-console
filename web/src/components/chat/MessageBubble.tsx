// MessageBubble — single message (user or assistant) with Material You chat styling.
// Follows M3 chat bubble guidelines: asymmetric radii, density-aware spacing,
// body-medium typography (14/20), label-small timestamps (11/16).
import { For, Show, createMemo, createSignal } from 'solid-js';
import type {
  ChatMessage, MessagePart, TextPart, ReasoningPart, ToolPart,
  SourcePart, ErrorPart,
} from '../../types';
import StreamingText from './StreamingText';
import ReasoningBlock from './ReasoningBlock';
import ToolCallCard from './ToolCallCard';
import SourceReference from './SourceReference';
import ToolInputPreview from './ToolInputPreview';
import { memoryEnabled } from '../../stores/memory';
import RememberAction from './RememberAction';

interface MessageBubbleProps {
  message: ChatMessage;
  activeText?: { id: string; content: string } | null;
  activeReasoning?: { id: string; content: string } | null;
  activeToolInput?: { id: string; toolName: string; args: string } | null;
  isLastAssistant?: boolean;
  /** Whether the previous message is the same role (for tighter grouping) */
  prevSameRole?: boolean;
  class?: string;
}

/** Parts that belong inside the text bubble */
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
    if (part.type === 'step-finish') continue;

    if (BUBBLE_TYPES.has(part.type)) {
      if (!currentBubble) currentBubble = [];
      currentBubble.push(part);
    } else {
      if (currentBubble) {
        groups.push({ kind: 'bubble', parts: currentBubble });
        currentBubble = null;
      }
      groups.push({ kind: 'standalone', parts: [part] });
    }
  }

  if (currentBubble) {
    groups.push({ kind: 'bubble', parts: currentBubble });
  }

  return groups;
}


export default function MessageBubble(props: MessageBubbleProps) {
  const msg = () => props.message;

  // M3 spacing: 8px between same-role messages, 16px between role changes
  const topSpacing = () => props.prevSameRole ? 'mt-1.5' : 'mt-4';

  // ── User message ──
  if (msg().role === 'user') {
    return (
      <div class={`flex justify-end ${topSpacing()} ${props.class || ''}`}>
        <div class="flex flex-col items-end gap-0.5 max-w-[80%] md:max-w-[65%]">
          <div class="chat-bubble-user px-3.5 py-2 text-[14px] leading-[20px] tracking-[0.25px]">
            {msg().content || ''}
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ──
  const groups = createMemo(() => groupParts(msg().parts || []));

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

  const hasActiveStreamBubble = () =>
    props.isLastAssistant && (props.activeText?.content || props.activeReasoning?.content);

  const hasActiveToolInput = () => props.isLastAssistant && props.activeToolInput;

  const hasFooter = () => msg().role === 'assistant' && memoryEnabled();

  return (
    <Show when={hasVisibleContent()}>
      <div class={`group ${topSpacing()} ${props.class || ''}`}>
        <div class="max-w-[92%] md:max-w-[80%] space-y-1.5">
          {/* Render grouped parts */}
          <For each={groups()}>
            {(group) => {
              if (group.kind === 'bubble') {
                return (
                  <div class="chat-bubble-assistant px-3.5 py-2.5 text-[14px] leading-[20px] tracking-[0.25px]">
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
                        <div class="flex items-start gap-2 border border-error/30 bg-error/5 rounded-xl px-3 py-2">
                          <svg class="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <span class="text-[13px] leading-[18px] text-error">{(part as ErrorPart).error}</span>
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
            <div class="chat-bubble-assistant px-3.5 py-2.5 text-[14px] leading-[20px] tracking-[0.25px]">
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

          {/* Footer row — remember action */}
          <Show when={hasFooter()}>
            <div class="flex items-center px-0.5 gap-2">
              <Show when={msg().role === 'assistant' && memoryEnabled()}>
                <RememberAction message={msg()} />
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
