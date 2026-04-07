// MessageBubble — single message (user or assistant)
import { For, Show, Switch, Match } from 'solid-js';
import type { ChatMessage, MessagePart, TextPart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart, SourcePart, ErrorPart } from '../../types';
import StreamingText from './StreamingText';
import ReasoningBlock from './ReasoningBlock';
import ToolCallCard from './ToolCallCard';
import StepIndicator from './StepIndicator';
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

export default function MessageBubble(props: MessageBubbleProps) {
  const msg = () => props.message;

  if (msg().role === 'user') {
    return (
      <div class={`flex justify-end mb-3 ${props.class || ''}`}>
        <div class="max-w-[85%] md:max-w-[70%] px-4 py-2.5 bg-primary text-primary-foreground rounded-2xl rounded-br-md text-sm">
          {msg().content || ''}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div class={`mb-3 ${props.class || ''}`}>
      <div class="max-w-[95%] md:max-w-[85%]">
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

              <Match when={part.type === 'step-start'}>
                <StepIndicator stepNumber={(part as StepStartPart).stepNumber} />
              </Match>

              <Match when={part.type === 'step-finish'}>
                <StepIndicator
                  stepNumber={(part as StepFinishPart).stepNumber}
                  usage={(part as StepFinishPart).usage}
                  finishReason={(part as StepFinishPart).finishReason}
                  toolCallCount={(part as StepFinishPart).toolCallCount}
                />
              </Match>

              <Match when={part.type === 'error'}>
                <div class="border border-error/30 bg-error/5 rounded-lg px-3 py-2 my-1">
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
      </div>
    </div>
  );
}
