// Composer — input area with send/stop/steer functionality
import { createSignal, Show, createMemo } from 'solid-js';
import { streaming, lastStepUsage, activeModel } from '../../stores/chat';
import { sendMessage, abortStream, steerAgent } from '../../stores/chat';
import { selectedAgent } from '../../stores/agents';
import { formatTokens } from '../../lib/format';
import MCPBrowser from '../resources/MCPBrowser';

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

export default function Composer(props: ComposerProps) {
  const [input, setInput] = createSignal('');
  const [mode, setMode] = createSignal<'prompt' | 'steer'>('prompt');
  const [mcpOpen, setMcpOpen] = createSignal(false);
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

  const placeholder = () => {
    if (isDisabled()) return 'Select an agent to start...';
    if (mode() === 'steer') return 'Steer the agent (guide its next action)...';
    if (isProcessing()) return 'Agent is working... Press Esc to abort';
    return 'Message the agent...';
  };

  return (
    <div class={`bg-background px-4 py-3 ${props.class || ''}`}>
      <div class="max-w-3xl mx-auto">
        <div
          class={`composer-input flex items-end gap-2 border border-border rounded-xl px-3 py-2 ${
            isProcessing() ? 'composer-processing' : ''
          }`}
        >
          {/* Steer mode indicator */}
          <Show when={streaming()}>
            <button
              class={`flex-shrink-0 self-end mb-0.5 p-1 rounded-md transition-colors ${
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

          {/* MCP browser toggle */}
          <Show when={!streaming() && selectedAgent()}>
            <div class="relative flex-shrink-0 self-end mb-0.5">
              <button
                class={`p-1 rounded-md transition-colors ${
                  mcpOpen()
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setMcpOpen(!mcpOpen())}
                title="Browse MCP server tools"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                </svg>
              </button>
              <MCPBrowser
                open={mcpOpen()}
                onClose={() => setMcpOpen(false)}
                class="bottom-full left-0 mb-2"
              />
            </div>
          </Show>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            class="flex-1 bg-transparent text-sm text-text placeholder-text-muted resize-none outline-none min-h-[24px] max-h-[200px] py-0.5"
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
          <div class="flex items-center gap-1 flex-shrink-0 self-end">
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
