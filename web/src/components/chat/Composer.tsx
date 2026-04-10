// Composer — input area with send/stop/steer functionality
import { createSignal, Show, createMemo, createEffect, For, onCleanup } from 'solid-js';
import { streaming } from '../../stores/chat';
import { sendMessage, abortStream, steerAgent, setWindowSize, clearWorkingMemory } from '../../stores/chat';
import { selectedAgent, getAgentStatus, getAgentRuntimeStatus } from '../../stores/agents';
import { selectedContextItems, removeContextItem, selectedContextCount, clearContextItems } from '../../stores/resources';
import { resourceContextKey } from '../../types/api';
import type { ResourceContext } from '../../types';

// ── Sliding window indicator (clickable — opens config popover) ──

function SlidingWindowIndicator(props: { messages: number; windowSize: number }) {
  const [open, setOpen] = createSignal(false);
  const [localSize, setLocalSize] = createSignal(props.windowSize);
  const [localMessages, setLocalMessages] = createSignal(props.messages);
  const [saving, setSaving] = createSignal(false);
  const [clearing, setClearing] = createSignal(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let sliderRef: HTMLInputElement | undefined;

  // Sync local state when props change (e.g. after server confirms)
  createEffect(() => {
    setLocalMessages(props.messages);
  });
  createEffect(() => {
    const ws = props.windowSize;
    if (!open()) setLocalSize(ws);
  });

  // Keep slider DOM element in sync with localSize (SolidJS range input quirk)
  createEffect(() => {
    const val = localSize();
    if (sliderRef) sliderRef.value = String(val);
  });

  const pct = createMemo(() => {
    if (localSize() <= 0) return 0;
    return Math.min((localMessages() / localSize()) * 100, 100);
  });

  const textColor = createMemo(() => {
    const p = pct();
    if (p < 75) return 'text-text-muted/60';
    if (p < 90) return 'text-warning';
    return 'text-error';
  });

  function handleSliderChange(val: number) {
    setLocalSize(val);
    setSaving(true);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await setWindowSize(val);
      } finally {
        setSaving(false);
      }
    }, 300);
  }

  async function handleClear() {
    setClearing(true);
    setLocalMessages(0); // optimistic
    try {
      await clearWorkingMemory();
    } finally {
      setClearing(false);
    }
  }

  // Close popover on outside click
  let containerRef: HTMLSpanElement | undefined;
  function handleDocClick(e: MouseEvent) {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
    }
  }

  createEffect(() => {
    if (open()) {
      document.addEventListener('mousedown', handleDocClick);
    } else {
      document.removeEventListener('mousedown', handleDocClick);
    }
  });

  onCleanup(() => {
    document.removeEventListener('mousedown', handleDocClick);
    clearTimeout(debounceTimer);
  });

  return (
    <span ref={containerRef} class="relative inline-flex items-center">
      <button
        class={`inline-flex items-center gap-1 ${textColor()} hover:text-text-secondary transition-colors cursor-pointer`}
        onClick={() => setOpen(!open())}
        title="Working memory — click to adjust"
      >
        <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
        <span class="text-[11px] select-none">
          {localMessages()}/{localSize()}
        </span>
      </button>

      <Show when={open()}>
        <div class="absolute bottom-full left-0 mb-2 bg-surface border border-border rounded-lg shadow-lg p-3 w-52 z-50">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-text-secondary font-medium">Working memory</span>
            <span class="text-xs font-mono tabular-nums text-text-muted">
              {localMessages()}/{localSize()}
              <Show when={saving()}>
                <span class="text-accent ml-1 text-[10px]">saving</span>
              </Show>
            </span>
          </div>
          <input
            ref={sliderRef}
            type="range"
            min="4"
            max="100"
            step="2"
            value={localSize()}
            onInput={(e) => handleSliderChange(parseInt(e.currentTarget.value))}
            class="w-full h-1.5 bg-surface-2 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface
              [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-surface"
          />
          <div class="flex justify-between mt-1 text-[9px] text-text-muted/50">
            <span>4</span>
            <span>100</span>
          </div>
          <button
            class={`w-full mt-2 pt-2 border-t border-border-subtle text-[11px] transition-colors text-center
              ${localMessages() > 0
                ? 'text-text-muted hover:text-error cursor-pointer'
                : 'text-text-muted/30 cursor-default'
              }`}
            disabled={localMessages() === 0 || clearing()}
            onClick={handleClear}
          >
            {clearing() ? 'Clearing...' : localMessages() === 0 ? 'Empty' : 'Clear memory'}
          </button>
        </div>
      </Show>
    </span>
  );
}

interface ComposerProps {
  class?: string;
}

// ── Context chip for selected resource items ──

function ContextChip(props: { item: ResourceContext; onRemove: () => void }) {
  const isK8s = () => props.item.kind === 'kubernetes';
  const isGitHub = () => props.item.kind === 'github-repo' || props.item.kind === 'github-org';
  const isGitLab = () => props.item.kind === 'gitlab-project' || props.item.kind === 'gitlab-group';

  const label = () => {
    if (isK8s()) {
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
        return `#${props.item.number}` + (props.item.title ? ` ${props.item.title}` : '');
      case 'merge_request':
        return `!${props.item.number}` + (props.item.title ? ` ${props.item.title}` : '');
      default:
        return props.item.item_type;
    }
  };

  // Human-readable type label
  const typeLabel = () => {
    if (isK8s()) {
      return props.item.item_type; // deployment, pod, service, etc.
    }
    switch (props.item.item_type) {
      case 'file': return 'file';
      case 'directory': return 'dir';
      case 'commit': return 'commit';
      case 'branch': return 'branch';
      case 'issue': return 'issue';
      case 'merge_request': return isGitHub() ? 'PR' : 'MR';
      default: return props.item.item_type;
    }
  };

  // Platform icon (branded SVG)
  const platformIcon = () => {
    if (isK8s()) {
      return (
        <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 722 702" fill="#326CE5">
          <path d="M358.986 1.456c-10.627.472-19.969 4.96-28.832 10.08l-248.96 144a68.8 68.8 0 00-25.344 25.504 64.64 64.64 0 00-8.832 34.56v288a64.64 64.64 0 008.832 34.56 68.8 68.8 0 0025.344 25.504l248.96 144c8.64 5.024 17.952 9.312 28.352 10.08a68.8 68.8 0 0036.288-10.08l248.96-144a68.8 68.8 0 0025.344-25.504 64.64 64.64 0 008.832-34.56v-288a64.64 64.64 0 00-8.832-34.56 68.8 68.8 0 00-25.344-25.504l-248.96-144c-9.152-5.344-18.816-9.152-28.768-10.08a78.08 78.08 0 00-7.04 0z"/>
        </svg>
      );
    }
    if (isGitLab()) {
      return (
        <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="#E24329">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      );
    }
    // Default: GitHub
    return (
      <svg class="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    );
  };

  const chipColor = () => {
    if (isK8s()) return 'bg-[#326CE5]/10 text-[#326CE5] border-[#326CE5]/25';
    if (isGitLab()) return 'bg-[#E24329]/10 text-[#E24329] border-[#E24329]/25';
    return 'bg-accent/10 text-accent border-accent/25';
  };

  const typeBadgeColor = () => {
    if (isK8s()) return 'bg-[#326CE5]/15 text-[#326CE5]';
    if (isGitLab()) return 'bg-[#E24329]/15 text-[#E24329]';
    return 'bg-accent/15 text-accent';
  };

  return (
    <span
      class={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border ${chipColor()} font-medium max-w-[240px]`}
      title={`${props.item.item_type}: ${props.item.title || props.item.path || ''} (${props.item.resource_name})`}
    >
      {platformIcon()}
      <span class={`text-[9px] uppercase tracking-wide font-semibold px-1 py-0.5 rounded ${typeBadgeColor()}`}>
        {typeLabel()}
      </span>
      <span class="truncate">{label()}</span>
      <button
        class="flex-shrink-0 ml-0.5 hover:text-error transition-colors opacity-60 hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

export default function Composer(props: ComposerProps) {
  const [input, setInput] = createSignal('');
  const [mode, setMode] = createSignal<'prompt' | 'steer'>('prompt');
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

  const agentOnline = () => {
    const agent = selectedAgent();
    if (!agent) return false;
    return getAgentStatus(agent.namespace, agent.name).isOnline;
  };
  const isDisabled = () => !selectedAgent() || (!agentOnline() && !streaming());
  const isProcessing = () => streaming();
  const ctxCount = () => selectedContextCount();

  const placeholder = () => {
    if (!selectedAgent()) return 'Select an agent to start...';
    if (!agentOnline() && !streaming()) return 'Agent unreachable — waiting for pod...';
    if (mode() === 'steer') return 'Steer the agent (guide its next action)...';
    if (isProcessing()) return 'Agent is working... Press Esc to abort';
    return 'Message the agent...';
  };

  return (
    <div class={`px-4 py-3 ${props.class || ''}`}>
      <div class="max-w-3xl mx-auto">
        {/* Selected resource context chips */}
        <Show when={ctxCount() > 0}>
          <div class="flex flex-wrap items-center gap-1 mb-2 px-1">
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

        {/* Composer container — elevated surface with generous radius */}
        <div
          class={`composer-input bg-surface-2 rounded-3xl border border-border-subtle overflow-hidden ${
            isProcessing() ? 'composer-processing' : ''
          }`}
        >
          {/* Input row */}
          <div class="flex items-end gap-2 px-4 py-3">
            {/* Steer mode indicator */}
            <Show when={streaming()}>
              <button
                class={`flex-shrink-0 self-center p-1.5 rounded-full transition-all duration-200 ${
                  mode() === 'steer'
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                }`}
                onClick={toggleSteer}
                title={mode() === 'steer' ? 'Switch to normal mode' : 'Switch to steer mode'}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            </Show>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              class="flex-1 bg-transparent text-sm text-text placeholder-text-muted/60 resize-none outline-none min-h-[24px] max-h-[200px] leading-[24px] py-0.5"
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
            <div class="flex items-center gap-1.5 flex-shrink-0 self-center">
              <Show
                when={streaming()}
                fallback={
                  <button
                    class={`p-2 rounded-full transition-all duration-200 ${
                      input().trim() && !isDisabled()
                        ? 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm hover:shadow-md scale-100 hover:scale-105'
                        : 'bg-surface-hover text-text-muted/40 cursor-not-allowed'
                    }`}
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
                    class="p-2 rounded-full bg-accent text-white hover:bg-accent/90 transition-all duration-200 shadow-sm"
                    onClick={handleSubmit}
                    title="Send steer message"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </button>
                </Show>

                <button
                  class="p-2 rounded-full bg-error/10 text-error hover:bg-error/20 transition-all duration-200"
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

          {/* Bottom bar — hints inside the container */}
          <div class="flex items-center justify-between px-4 pb-2.5 pt-0">
            <span class="text-[11px] text-text-muted/50">
              <Show when={streaming() && mode() !== 'steer'}>
                <kbd class="px-1.5 py-0.5 bg-surface rounded-md text-[10px] text-text-muted/60 border border-border-subtle/50">Esc</kbd>
                <span class="ml-1">to stop</span>
              </Show>
              <Show when={streaming() && mode() === 'steer'}>
                <span class="text-accent/80 font-medium">Steer mode</span>
                <span class="ml-1">— guide the agent's next action</span>
              </Show>
              <Show when={!streaming() && selectedAgent()}>
                {(() => {
                  const a = selectedAgent()!;
                  const rs = getAgentRuntimeStatus(a.namespace, a.name);
                  return (
                    <Show when={rs?.window_size != null}>
                      <SlidingWindowIndicator
                        messages={rs?.messages ?? 0}
                        windowSize={rs!.window_size!}
                      />
                    </Show>
                  );
                })()}
              </Show>
            </span>
            <span class="text-[11px] text-text-muted/40">
              <kbd class="px-1.5 py-0.5 bg-surface rounded-md text-[10px] text-text-muted/50 border border-border-subtle/50">Shift+Enter</kbd>
              <span class="ml-1">for newline</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
