// RememberAction — "Remember this" button on assistant messages.
// Shows a brain icon that expands into a mini-form for saving the message
// content as an Engram observation.
import { Show, createSignal, For } from 'solid-js';
import { createObservation } from '../../stores/memory';
import Spinner from '../shared/Spinner';
import type { ChatMessage } from '../../types';

interface RememberActionProps {
  message: ChatMessage;
}

const TYPE_OPTIONS = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'decision', label: 'Decision' },
  { value: 'bugfix', label: 'Bugfix' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'config', label: 'Config' },
  { value: 'learning', label: 'Learning' },
] as const;

/** Extract text content from a ChatMessage's parts */
function extractText(msg: ChatMessage): string {
  if (msg.content) return msg.content;
  if (!msg.parts) return '';
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as any).content || '')
    .join('\n\n');
}

/** Auto-generate a title from content (first line, truncated) */
function autoTitle(content: string): string {
  const first = content.split('\n')[0].trim();
  if (first.length <= 60) return first;
  return first.slice(0, 57) + '...';
}

export default function RememberAction(props: RememberActionProps) {
  const [open, setOpen] = createSignal(false);
  const [type, setType] = createSignal<string>('discovery');
  const [title, setTitle] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  function handleOpen() {
    const content = extractText(props.message);
    setTitle(autoTitle(content));
    setOpen(true);
    setSaved(false);
  }

  async function handleSave() {
    const content = extractText(props.message);
    if (!title().trim() || !content.trim()) return;

    setSaving(true);
    const success = await createObservation({
      type: type(),
      title: title(),
      content: content,
    });
    setSaving(false);

    if (success) {
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
        setSaved(false);
      }, 1500);
    }
  }

  return (
    <div class="relative">
      {/* Trigger button */}
      <Show when={!saved()}>
        <button
          class={`p-0.5 rounded transition-colors ${
            open()
              ? 'text-accent'
              : 'text-text-muted/40 hover:text-accent opacity-0 group-hover:opacity-100'
          }`}
          onClick={handleOpen}
          title="Remember this"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5" />
          </svg>
        </button>
      </Show>

      {/* Saved confirmation */}
      <Show when={saved()}>
        <span class="text-[10px] text-success flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Saved
        </span>
      </Show>

      {/* Inline form (dropdown) */}
      <Show when={open() && !saved()}>
        <div class="absolute bottom-full left-0 mb-1 w-64 bg-surface border border-border rounded-xl shadow-lg p-2.5 z-50 space-y-2">
          {/* Type selector */}
          <div class="flex flex-wrap gap-1">
            <For each={TYPE_OPTIONS}>
              {(opt) => (
                <button
                  class={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                    type() === opt.value
                      ? 'bg-surface-hover text-text font-medium border border-border-hover'
                      : 'text-text-muted hover:text-text-secondary bg-surface-2 border border-border-subtle'
                  }`}
                  onClick={() => setType(opt.value)}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>

          {/* Title input */}
          <input
            type="text"
            class="w-full px-2 py-1 text-[11px] bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors"
            placeholder="Title..."
            value={title()}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          />

          {/* Actions */}
          <div class="flex gap-1.5">
            <button
              class="flex-1 px-2.5 py-1 text-[10px] font-medium text-text bg-accent/20 hover:bg-accent/30 rounded-lg transition-colors disabled:opacity-40"
              onClick={handleSave}
              disabled={saving() || !title().trim()}
            >
              <Show when={saving()} fallback="Save">
                <Spinner size="sm" />
              </Show>
            </button>
            <button
              class="px-2.5 py-1 text-[10px] text-text-secondary hover:text-text bg-surface-2 hover:bg-surface-hover rounded-lg transition-colors"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
