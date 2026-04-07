// ToolInputPreview — Live tool argument composition (the signature Fantasy-only feature!)
// Shows the tool name and args being composed character by character as
// tool.input.delta events stream in.
import { Show, createMemo } from 'solid-js';
import { getToolStyle, parsePartialArgs } from '../../lib/detect';

interface ToolInputPreviewProps {
  toolName: string;
  args: string;
  class?: string;
}

export default function ToolInputPreview(props: ToolInputPreviewProps) {
  const style = () => getToolStyle(props.toolName);
  const parsed = () => parsePartialArgs(props.toolName, props.args);

  return (
    <div class={`border border-border rounded-lg overflow-hidden my-1 fade-in ${props.class || ''}`}>
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border-b border-border-subtle">
        <span class={`text-xs font-medium ${style().color}`}>
          {style().label}
        </span>
        <span class="text-xs text-text-muted">composing arguments...</span>
        <div class="flex items-center gap-0.5 ml-auto">
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" />
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.2s" />
          <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.4s" />
        </div>
      </div>

      {/* Content preview */}
      <div class="px-3 py-2 bg-surface font-mono text-sm">
        <Show
          when={parsed()}
          fallback={
            <div class="text-text-muted text-xs overflow-hidden">
              <pre class="whitespace-pre-wrap break-all">{props.args || ' '}</pre>
            </div>
          }
        >
          {(p) => (
            <div class="flex items-baseline gap-2">
              <Show when={props.toolName === 'bash'}>
                <span class="text-text-muted select-none">$</span>
              </Show>
              <span class="text-text break-all">
                {p().value}
                <span class="streaming-cursor" />
              </span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
