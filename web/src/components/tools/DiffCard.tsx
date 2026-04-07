// DiffCard — edit results (unified or side-by-side diff view)
import { createSignal, Show, For } from 'solid-js';
import Badge from '../shared/Badge';
import type { ToolMetadata } from '../../types';

interface DiffCardProps {
  toolName: string;
  input: string;
  output: string;
  isError: boolean;
  metadata?: ToolMetadata;
  class?: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber?: number;
}

function parseDiffOutput(output: string): DiffLine[] {
  if (!output) return [];
  return output.split('\n').map((line) => {
    if (line.startsWith('+')) return { type: 'add', content: line.slice(1) };
    if (line.startsWith('-')) return { type: 'remove', content: line.slice(1) };
    return { type: 'context', content: line };
  });
}

export default function DiffCard(props: DiffCardProps) {
  const [expanded, setExpanded] = createSignal(true);

  const filePath = () => {
    if (props.metadata?.filePath) return props.metadata.filePath as string;
    try {
      const parsed = JSON.parse(props.input);
      return parsed.filePath || parsed.file_path || '';
    } catch {
      return '';
    }
  };

  const diffLines = () => parseDiffOutput(props.output);

  const addCount = () => diffLines().filter((l) => l.type === 'add').length;
  const removeCount = () => diffLines().filter((l) => l.type === 'remove').length;

  return (
    <div class={`border border-border rounded-lg overflow-hidden my-1 ${props.class || ''}`}>
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border-b border-border-subtle">
        <span class="text-xs font-medium text-[#E8A838]">Edit</span>
        <span class="text-xs text-text-secondary truncate">{filePath()}</span>
        <div class="flex items-center gap-1.5 ml-auto">
          <Show when={addCount() > 0}>
            <span class="text-xs text-success">+{addCount()}</span>
          </Show>
          <Show when={removeCount() > 0}>
            <span class="text-xs text-error">-{removeCount()}</span>
          </Show>
          <Badge variant={props.isError ? 'error' : 'success'}>
            {props.isError ? 'failed' : 'applied'}
          </Badge>
        </div>
      </div>

      {/* Diff content */}
      <Show when={expanded() && diffLines().length > 0}>
        <div class="px-0 py-0 bg-surface max-h-[400px] overflow-y-auto font-mono text-xs">
          <For each={diffLines()}>
            {(line) => (
              <div
                class={`px-3 py-0.5 ${
                  line.type === 'add'
                    ? 'bg-success/10 text-success'
                    : line.type === 'remove'
                    ? 'bg-error/10 text-error'
                    : 'text-text-secondary'
                }`}
              >
                <span class="select-none opacity-50 mr-2">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.content}
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!expanded() && diffLines().length > 0}>
        <button
          class="w-full px-3 py-1.5 text-xs text-accent hover:bg-surface-hover text-left"
          onClick={() => setExpanded(true)}
        >
          Show diff ({diffLines().length} lines)
        </button>
      </Show>
    </div>
  );
}
