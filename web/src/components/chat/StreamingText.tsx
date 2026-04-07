// StreamingText — progressive text rendering with markdown and streaming cursor
import { Show, createMemo } from 'solid-js';
import Markdown from '../shared/Markdown';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  class?: string;
}

export default function StreamingText(props: StreamingTextProps) {
  return (
    <div class={`relative ${props.class || ''}`}>
      <Markdown content={props.content} />
      <Show when={props.isStreaming}>
        <span class="streaming-cursor" />
      </Show>
    </div>
  );
}
