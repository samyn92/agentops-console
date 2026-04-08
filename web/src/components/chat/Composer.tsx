// Composer — input area with send/stop/steer functionality
import { createSignal, Show, createMemo, For } from 'solid-js';
import { streaming, lastStepUsage, activeModel } from '../../stores/chat';
import { sendMessage, abortStream, steerAgent } from '../../stores/chat';
import { selectedAgent } from '../../stores/agents';
import { formatTokens } from '../../lib/format';
import { selectedContextItems, removeContextItem, selectedContextCount, clearContextItems } from '../../stores/resources';
import { resourceContextKey } from '../../types/api';
import type { ResourceContext } from '../../types';
import AgentResourcesPanel from '../resources/AgentResourcesPanel';

// ── Model context window sizes (tokens) ──

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4': 8_192,
  'gpt-4-32k': 32_768,
  'gpt-4-turbo': 128_000,
  'gpt-4-turbo-preview': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1-nano': 1_047_576,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o1-preview': 128_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,
  'gpt-3.5-turbo': 16_385,
  // Anthropic
  'claude-3-opus': 200_000,
  'claude-3-sonnet': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3.5-sonnet': 200_000,
  'claude-3.5-haiku': 200_000,
  'claude-3.7-sonnet': 200_000,
  'claude-4-sonnet': 200_000,
  'claude-4-opus': 200_000,
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  // Google
  'gemini-pro': 1_000_000,
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  // Mistral
  'mistral-large': 128_000,
  'mistral-medium': 32_000,
  'mistral-small': 32_000,
};

/** Best-effort lookup: match model string against known context windows. */
function getContextWindow(model: string | null): number | null {
  if (!model) return null;
  const lower = model.toLowerCase();
  // Exact match first
  if (MODEL_CONTEXT_WINDOWS[lower]) return MODEL_CONTEXT_WINDOWS[lower];
  // Prefix/substring match (handles versioned names like "gpt-4o-2024-08-06")
  for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.includes(key) || lower.startsWith(key)) return size;
  }
  return null;
}

// ── Context gauge component ──

function ContextGauge(props: { inputTokens: number; contextWindow: number | null }) {
  const pct = createMemo(() => {
    if (!props.contextWindow || props.contextWindow === 0) return null;
    return Math.min((props.inputTokens / props.contextWindow) * 100, 100);
  });

  // Color thresholds: green < 50%, yellow 50-80%, red > 80%
  const color = createMemo(() => {
    const p = pct();
    if (p === null) return 'bg-text-muted/30';
    if (p < 50) return 'bg-success';
    if (p < 80) return 'bg-warning';
    return 'bg-error';
  });

  const textColor = createMemo(() => {
    const p = pct();
    if (p === null) return 'text-text-muted/60';
    if (p < 50) return 'text-text-muted/60';
    if (p < 80) return 'text-warning';
    return 'text-error';
  });

  return (
    <span class={`inline-flex items-center gap-1.5 ${textColor()}`}>
      {/* Battery icon */}
      <span class="relative inline-flex items-center">
        {/* Battery body */}
        <span class="relative w-5 h-2.5 rounded-[3px] border border-current/40 overflow-hidden">
          <span
            class={`absolute inset-y-0 left-0 rounded-[2px] transition-all duration-500 ${color()}`}
            style={{ width: pct() !== null ? `${pct()}%` : '0%', opacity: pct() !== null ? 0.8 : 0.3 }}
          />
        </span>
        {/* Battery tip */}
        <span class="w-[2px] h-1.5 rounded-r-[1px] bg-current/40 -ml-px" />
      </span>
      <span class="text-[11px] select-none">
        {formatTokens(props.inputTokens)}
        <Show when={props.contextWindow}>
          {' / '}{formatTokens(props.contextWindow!)}
        </Show>
      </span>
    </span>
  );
}

interface ComposerProps {
  class?: string;
}

// ── Context chip for selected resource items ──

function ContextChip(props: { item: ResourceContext; onRemove: () => void }) {
  const isK8s = () => props.item.kind === 'kubernetes';

  const label = () => {
    if (isK8s()) {
      // For k8s items, show kind:name from the path (namespace/name)
      const name = props.item.path?.split('/').pop() || props.item.title || props.item.item_type;
      return name;
    }
    switch (props.item.item_type) {
      case 'file':
        return props.item.path?.split('/').pop() || props.item.path || 'file';
      case 'directory':
        return (props.item.path?.split('/').pop() || props.item.path || 'dir') + '/';
      case 'commit':
        return props.item.sha?.slice(0, 7) || 'commit';
      case 'branch':
        return props.item.path || 'branch';
      case 'issue':
        return `#${props.item.number}`;
      case 'merge_request':
        return `!${props.item.number}`;
      default:
        return props.item.item_type;
    }
  };

  const icon = () => {
    if (isK8s()) {
      // Kubernetes resource icons
      switch (props.item.item_type) {
        case 'deployment': return 'M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z';
        case 'pod': return 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z';
        case 'service': return 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z';
        case 'event': return 'M13 10V3L4 14h7v7l9-11h-7z';
        default: return 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z';
      }
    }
    switch (props.item.item_type) {
      case 'file': return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
      case 'directory': return 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z';
      case 'commit': return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'branch': return 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6';
      case 'issue': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z';
      case 'merge_request': return 'M4 6h16M4 10h16M4 14h16M4 18h16';
      default: return 'M19 11H5m14 0a2 2 0 012 2v6';
    }
  };

  const chipColor = () => isK8s() ? 'bg-[#326CE5]/10 text-[#326CE5] border-[#326CE5]/20' : 'bg-accent/10 text-accent border-accent/20';

  return (
    <span
      class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md ${chipColor()} font-medium max-w-[160px]`}
      title={`${props.item.item_type}: ${props.item.title || props.item.path || ''} (${props.item.resource_name})`}
    >
      <svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={icon()} />
      </svg>
      <span class="truncate">{label()}</span>
      <button
        class="flex-shrink-0 hover:text-error transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
      >
        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

export default function Composer(props: ComposerProps) {
  const [input, setInput] = createSignal('');
  const [mode, setMode] = createSignal<'prompt' | 'steer'>('prompt');
  const [resourcesOpen, setResourcesOpen] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;

  function autoResize() {
    if (!textareaRef) return;
    textareaRef.style.height = 'auto';
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 200)}px`;
  }

  async function handleSubmit() {
    const text = input().trim();
    if (!text) return;

    // Capture mode before clearing — steer check needs current state
    const isSteer = mode() === 'steer' && streaming();

    // Clear input immediately — don't wait for the async operation
    setInput('');
    setMode('prompt');
    if (textareaRef) {
      textareaRef.style.height = 'auto';
    }

    if (isSteer) {
      await steerAgent(text);
    } else {
      await sendMessage(text);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }

    // Escape to toggle steer mode when streaming
    if (e.key === 'Escape' && streaming()) {
      if (mode() === 'steer') {
        setMode('prompt');
      } else {
        abortStream();
      }
    }
  }

  function handleStop() {
    abortStream();
  }

  function toggleSteer() {
    setMode((m) => (m === 'steer' ? 'prompt' : 'steer'));
    textareaRef?.focus();
  }

  const isDisabled = () => !selectedAgent();
  const isProcessing = () => streaming();
  const ctxCount = () => selectedContextCount();

  const placeholder = () => {
    if (isDisabled()) return 'Select an agent to start...';
    if (mode() === 'steer') return 'Steer the agent (guide its next action)...';
    if (isProcessing()) return 'Agent is working... Press Esc to abort';
    return 'Message the agent...';
  };

  return (
    <div class={`bg-background px-4 py-3 ${props.class || ''}`}>
      <div class="max-w-3xl mx-auto">
        {/* Selected resource context chips */}
        <Show when={ctxCount() > 0}>
          <div class="flex flex-wrap items-center gap-1 mb-1.5 px-1">
            <For each={selectedContextItems()}>
              {(item) => (
                <ContextChip item={item} onRemove={() => removeContextItem(resourceContextKey(item))} />
              )}
            </For>
            <Show when={ctxCount() > 1}>
              <button
                class="text-[10px] text-text-muted hover:text-error transition-colors ml-1"
                onClick={() => clearContextItems()}
              >
                Clear all
              </button>
            </Show>
          </div>
        </Show>

        <div
          class={`composer-input flex items-end gap-1.5 border border-border rounded-xl px-3 py-2 ${
            isProcessing() ? 'composer-processing' : ''
          }`}
        >
          {/* Steer mode indicator */}
          <Show when={streaming()}>
            <button
              class={`flex-shrink-0 self-center p-1 rounded-lg transition-colors ${
                mode() === 'steer'
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={toggleSteer}
              title={mode() === 'steer' ? 'Switch to normal mode' : 'Switch to steer mode'}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          </Show>

          {/* Agent Resources panel toggle */}
          <Show when={!streaming() && selectedAgent()}>
            <div class="relative flex-shrink-0 self-center">
              <button
                class={`p-1 rounded-lg transition-colors ${
                  resourcesOpen()
                    ? 'bg-accent/20 text-accent'
                    : ctxCount() > 0
                      ? 'text-accent'
                      : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setResourcesOpen(!resourcesOpen())}
                title="Browse agent resources"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                {/* Selection count dot */}
                <Show when={ctxCount() > 0 && !resourcesOpen()}>
                  <span class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[8px] font-bold bg-accent text-white rounded-full flex items-center justify-center leading-none">
                    {ctxCount()}
                  </span>
                </Show>
              </button>
              <AgentResourcesPanel
                open={resourcesOpen()}
                onClose={() => setResourcesOpen(false)}
                class="bottom-full left-0 mb-2"
              />
            </div>
          </Show>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            class="flex-1 bg-transparent text-sm text-text placeholder-text-muted resize-none outline-none min-h-[24px] max-h-[200px] leading-[24px]"
            placeholder={placeholder()}
            value={input()}
            disabled={isDisabled()}
            rows={1}
            onInput={(e) => {
              setInput(e.currentTarget.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
          />

          {/* Action buttons */}
          <div class="flex items-center gap-1 flex-shrink-0 self-center">
            <Show
              when={streaming()}
              fallback={
                <button
                  class="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  disabled={!input().trim() || isDisabled()}
                  onClick={handleSubmit}
                  title="Send message (Enter)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                </button>
              }
            >
              {/* During streaming: steer or stop */}
              <Show when={mode() === 'steer' && input().trim()}>
                <button
                  class="p-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
                  onClick={handleSubmit}
                  title="Send steer message"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </Show>

              <button
                class="p-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
                onClick={handleStop}
                title="Stop generation (Esc)"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </Show>
          </div>
        </div>

        {/* Hints + Context gauge */}
        <div class="flex items-center justify-between mt-1.5 px-1">
          <span class="text-[11px] text-text-muted">
            <Show when={streaming() && mode() !== 'steer'}>
              <kbd class="px-1 py-0.5 bg-surface-2 rounded text-[10px] border border-border-subtle">Esc</kbd>
              {' to stop'}
            </Show>
            <Show when={streaming() && mode() === 'steer'}>
              <span class="text-accent">Steer mode</span>
              {' — guide the agent\'s next action'}
            </Show>
            <Show when={!streaming() && lastStepUsage()}>
              <ContextGauge
                inputTokens={lastStepUsage()!.input_tokens}
                contextWindow={getContextWindow(activeModel())}
              />
            </Show>
          </span>
          <span class="text-[11px] text-text-muted">
            <kbd class="px-1 py-0.5 bg-surface-2 rounded text-[10px] border border-border-subtle">Shift+Enter</kbd>
            {' for newline'}
          </span>
        </div>
      </div>
    </div>
  );
}
