// Composer — input area with send/stop/steer functionality
import { createSignal, Show } from 'solid-js';
import { streaming } from '../../stores/chat';
import { sendMessage, abortStream, steerAgent } from '../../stores/chat';
import { selectedAgent } from '../../stores/agents';
import MCPBrowser from '../resources/MCPBrowser';

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

    if (mode() === 'steer' && streaming()) {
      await steerAgent(text);
    } else {
      await sendMessage(text);
    }

    setInput('');
    setMode('prompt');
    if (textareaRef) {
      textareaRef.style.height = 'auto';
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
    <div class={`border-t border-border bg-background px-4 py-3 ${props.class || ''}`}>
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

        {/* Hints */}
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
