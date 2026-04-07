// ContextPill — small pill showing an attached context resource (MCP server, K8s resource, file, etc.)
import { Show } from 'solid-js';

export type ContextType = 'mcp' | 'kubernetes' | 'file' | 'agent' | 'channel';

interface ContextPillProps {
  /** What kind of resource this represents */
  type: ContextType;
  /** Display label (e.g. server name, pod name, file path) */
  label: string;
  /** Optional secondary info (e.g. namespace, tool count) */
  detail?: string;
  /** Whether this resource is in a healthy/ready state */
  ready?: boolean;
  /** Called when the pill is clicked (e.g. to open a detail view) */
  onClick?: () => void;
  /** Called when the dismiss button is clicked */
  onDismiss?: () => void;
  /** Optional: CSS class for the root element */
  class?: string;
}

const typeIcons: Record<ContextType, () => any> = {
  mcp: () => (
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
    </svg>
  ),
  kubernetes: () => (
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  ),
  file: () => (
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  agent: () => (
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.59.659H9.06a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v9.5" />
    </svg>
  ),
  channel: () => (
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
};

const typeColors: Record<ContextType, string> = {
  mcp: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  kubernetes: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  file: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  agent: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  channel: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
};

export default function ContextPill(props: ContextPillProps) {
  const Icon = () => {
    const iconFn = typeIcons[props.type];
    return iconFn ? iconFn() : null;
  };

  return (
    <div
      class={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded-full border transition-colors ${
        typeColors[props.type] || 'bg-surface-2 border-border-subtle text-text-secondary'
      } ${props.onClick ? 'cursor-pointer hover:brightness-110' : ''} ${props.class || ''}`}
      onClick={() => props.onClick?.()}
    >
      {/* Status dot */}
      <Show when={props.ready !== undefined}>
        <span
          class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            props.ready ? 'bg-success' : 'bg-error'
          }`}
        />
      </Show>

      {/* Type icon */}
      <Icon />

      {/* Label */}
      <span class="truncate max-w-[120px]">{props.label}</span>

      {/* Detail */}
      <Show when={props.detail}>
        <span class="text-[10px] opacity-60">{props.detail}</span>
      </Show>

      {/* Dismiss button */}
      <Show when={props.onDismiss}>
        <button
          class="ml-0.5 p-0.5 rounded-full hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            props.onDismiss?.();
          }}
        >
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </Show>
    </div>
  );
}
