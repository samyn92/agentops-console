// ToolCallCard — Rich tool result card with branded theming, collapsible headers,
// duration display, category badges, watermark icons, and per-tool expansion settings.
// Dispatches to tool-specific renderers based on metadata.ui hint.
import { Show, Switch, Match, createSignal, createMemo } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { ToolPart, ToolMetadata } from '../../types';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import GenericCard from '../tools/GenericCard';
import TerminalCard from '../tools/TerminalCard';
import DiffCard from '../tools/DiffCard';
import CodeCard from '../tools/CodeCard';
import FileTreeCard from '../tools/FileTreeCard';
import SearchResultsCard from '../tools/SearchResultsCard';
import FileCreatedCard from '../tools/FileCreatedCard';
import WebFetchCard from '../tools/WebFetchCard';
import AgentRunCard from '../tools/AgentRunCard';
import KubernetesCard from '../tools/KubernetesCard';
import HelmCard from '../tools/HelmCard';
import {
  detectToolCategory,
  toolThemes,
  getCategoryIcon,
  getCategoryLabel,
  getToolDisplayName,
  type ToolCategory,
} from '../../lib/capability-themes';
import { isToolCollapsed } from '../../stores/settings';
import { getToolStyle } from '../../lib/detect';

interface ToolCallCardProps {
  part: ToolPart;
  class?: string;
}

interface ToolCardProps {
  toolName: string;
  input: string;
  output: string;
  isError: boolean;
  metadata?: ToolMetadata;
  class?: string;
  /** When true, skip the outer wrapper and header (rendered inside ToolCallCard) */
  headerless?: boolean;
}

// Tool renderer dispatch map — maps metadata.ui hint to component
const renderers: Record<string, (props: ToolCardProps) => any> = {
  terminal: TerminalCard,
  diff: DiffCard,
  code: CodeCard,
  'file-tree': FileTreeCard,
  'search-results': SearchResultsCard,
  'file-created': FileCreatedCard,
  'web-fetch': WebFetchCard,
  'agent-run': AgentRunCard,
  'agent-run-status': AgentRunCard,
  'kubernetes-resources': KubernetesCard,
  'helm-release': HelmCard,
};

/** Format milliseconds to human-readable duration */
function formatDuration(ms: number | undefined): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/** Get a category-appropriate tool icon as inline SVG */
function ToolIcon(props: { toolName: string; category: ToolCategory; class?: string }) {
  const isThemed = () => props.category !== 'builtin';
  const theme = () => toolThemes[props.category];

  // For non-builtin tools, use the branded category icon (slightly larger for clarity)
  if (isThemed()) {
    const Icon = getCategoryIcon(props.category);
    return <Icon class={`${props.class || 'w-6 h-6'} ${theme().iconColor}`} />;
  }

  // Built-in tool icons
  const style = getToolStyle(props.toolName);
  return (
    <Switch fallback={
      <svg class={`${props.class || 'w-4 h-4'} ${style.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    }>
      <Match when={props.toolName === 'bash'}>
        <svg class={`${props.class || 'w-4 h-4'} text-[#4EAA25]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </Match>
      <Match when={props.toolName === 'read'}>
        <svg class={`${props.class || 'w-4 h-4'} text-[#E8A838]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </Match>
      <Match when={props.toolName === 'edit' || props.toolName === 'write'}>
        <svg class={`${props.class || 'w-4 h-4'} text-[#E8A838]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </Match>
      <Match when={props.toolName === 'glob' || props.toolName === 'ls'}>
        <svg class={`${props.class || 'w-4 h-4'} text-[#4285F4]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </Match>
      <Match when={props.toolName === 'grep'}>
        <svg class={`${props.class || 'w-4 h-4'} text-[#4285F4]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </Match>
      <Match when={props.toolName === 'fetch' || props.toolName === 'webfetch'}>
        <svg class={`${props.class || 'w-4 h-4'} text-info`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
        </svg>
      </Match>
      <Match when={props.toolName === 'task'}>
        <svg class={`${props.class || 'w-4 h-4'} text-info`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Match>
      <Match when={props.toolName === 'run_agent' || props.toolName === 'get_agent_run'}>
        <svg class={`${props.class || 'w-4 h-4'} text-accent`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </Match>
    </Switch>
  );
}

/** Transient activity indicator shown while a tool is pending or running */
function ToolActivityLine(props: { part: ToolPart }) {
  const style = () => getToolStyle(props.part.toolName);

  const activityLabel = () => {
    const name = props.part.toolName;
    switch (name) {
      case 'bash': return 'Executing command';
      case 'read': return 'Reading file';
      case 'edit': return 'Editing file';
      case 'write': return 'Writing file';
      case 'glob': case 'ls': return 'Finding files';
      case 'grep': return 'Searching';
      case 'fetch': case 'webfetch': return 'Fetching';
      case 'task': return 'Delegating to sub-agent';
      case 'run_agent': return 'Running agent';
      case 'get_agent_run': return 'Checking agent run';
      default: return `Running ${name.replace(/[_-]/g, ' ')}`;
    }
  };

  const activityDetail = () => {
    try {
      const input = JSON.parse(props.part.input);
      const name = props.part.toolName;
      if (name === 'bash' && input.command) {
        const cmd = input.command as string;
        return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
      }
      if (['read', 'edit', 'write'].includes(name) && input.filePath) {
        const fp = input.filePath as string;
        return fp.split('/').slice(-2).join('/');
      }
      if ((name === 'glob' || name === 'grep') && input.pattern) return input.pattern as string;
      if ((name === 'fetch' || name === 'webfetch') && input.url) {
        const url = input.url as string;
        return url.length > 50 ? url.slice(0, 50) + '...' : url;
      }
      if (name === 'task' && input.description) return input.description as string;
      // MCP and other tools: show first arg value as preview
      if (name.startsWith('mcp_')) {
        const keys = Object.keys(input);
        if (keys.length > 0) {
          const first = String(input[keys[0]]);
          return first.length > 50 ? first.slice(0, 50) + '...' : first;
        }
      }
    } catch { /* ignore */ }
    return '';
  };

  return (
    <div class="flex items-center gap-2.5 py-1.5 px-2 fade-in">
      <div class="relative flex items-center justify-center w-5 h-5">
        <div class="absolute inset-0 border-[1.5px] border-accent/20 border-t-accent/70 rounded-full animate-spin" />
        <ToolIcon toolName={props.part.toolName} category={detectToolCategory(props.part.toolName)} class="w-3 h-3" />
      </div>
      <span class="text-xs text-text-muted">
        {activityLabel()}
        <Show when={activityDetail()}>
          <span class="text-text-muted/60 ml-1 font-mono">{activityDetail()}</span>
        </Show>
      </span>
    </div>
  );
}

/** Collapsible input arguments section — shows the JSON args passed to the tool */
function ToolInputSection(props: { input: string }) {
  const [showInput, setShowInput] = createSignal(false);

  const formattedInput = createMemo(() => {
    try {
      const parsed = JSON.parse(props.input);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return props.input;
    }
  });

  const inputSummary = createMemo(() => {
    try {
      const parsed = JSON.parse(props.input);
      const keys = Object.keys(parsed);
      if (keys.length === 0) return '';
      // Show up to 3 key=value pairs as a preview
      return keys.slice(0, 3).map((k) => {
        const v = parsed[k];
        const vStr = typeof v === 'string'
          ? (v.length > 40 ? `"${v.slice(0, 40)}..."` : `"${v}"`)
          : JSON.stringify(v);
        return `${k}=${vStr}`;
      }).join(', ') + (keys.length > 3 ? ` +${keys.length - 3} more` : '');
    } catch {
      return '';
    }
  });

  return (
    <div class="border-b border-inherit">
      <button
        onClick={(e) => { e.stopPropagation(); setShowInput((v) => !v); }}
        class="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-surface-hover/30 transition-colors"
      >
        <span class={`shrink-0 transition-transform duration-150 ${showInput() ? 'rotate-90' : ''} text-text-muted`}>
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </span>
        <span class="text-[11px] font-medium text-text-muted">Input</span>
        <Show when={!showInput() && inputSummary()}>
          <span class="text-[11px] text-text-muted/60 font-mono truncate">{inputSummary()}</span>
        </Show>
      </button>
      <Show when={showInput()}>
        <div class="px-3 pb-2">
          <pre class="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all bg-surface/50 rounded p-2 max-h-[200px] overflow-y-auto">
            {formattedInput()}
          </pre>
        </div>
      </Show>
    </div>
  );
}

export default function ToolCallCard(props: ToolCallCardProps) {
  const part = () => props.part;

  // Show transient activity line while tool is running/pending
  if (part().status === 'running' || part().status === 'pending') {
    return <ToolActivityLine part={part()} />;
  }

  // Detect tool category and theme
  const category = createMemo(() => detectToolCategory(part().toolName));
  const theme = createMemo(() => toolThemes[category()]);
  const isThemed = createMemo(() => category() !== 'builtin');
  const categoryLabel = createMemo(() => getCategoryLabel(category()));

  // Determine default expansion state from per-tool settings
  const defaultExpanded = () => !isToolCollapsed(part().toolName, part().isError);
  const [expanded, setExpanded] = createSignal(defaultExpanded());

  // Watermark icon for themed cards
  const WatermarkIcon = createMemo(() => {
    if (!isThemed() || category() === 'generic') return null;
    return getCategoryIcon(category());
  });

  // Status configuration
  const statusConfig = createMemo(() => {
    if (part().isError) {
      return { label: 'Error', variant: 'error' as const, color: 'text-error' };
    }
    return { label: 'Done', variant: 'success' as const, color: 'text-success' };
  });

  // Tool renderer
  const Renderer = createMemo(() => {
    const uiHint = part().metadata?.ui as string | undefined;
    if (uiHint && renderers[uiHint]) return renderers[uiHint];
    switch (part().toolName) {
      case 'bash': return TerminalCard;
      case 'edit': return DiffCard;
      case 'read': return CodeCard;
      case 'glob': case 'ls': return FileTreeCard;
      case 'grep': return SearchResultsCard;
      case 'write': return FileCreatedCard;
      case 'fetch': case 'webfetch': return WebFetchCard;
      case 'run_agent': case 'get_agent_run': return AgentRunCard;
      default: return GenericCard;
    }
  });

  // MCP metadata accessors
  const mcpServer = createMemo(() => (part().metadata?.server as string | undefined) || '');
  const mcpOriginalTool = createMemo(() => (part().metadata?.tool as string | undefined) || '');
  const mcpTransport = createMemo(() => (part().metadata?.transport as string | undefined) || '');

  // Whether to show the input arguments section (skip for trivial inputs or builtins with dedicated renderers)
  const hasInputArgs = createMemo(() => {
    if (!part().input || part().input === '{}') return false;
    // Builtins with dedicated renderers already show their input contextually
    const builtinsWithInlineInput = ['bash', 'read', 'edit', 'write', 'grep', 'glob', 'ls', 'fetch', 'webfetch'];
    if (builtinsWithInlineInput.includes(part().toolName)) return false;
    return true;
  });

  // For "read" tool, show a compact inline row instead of full card
  const isReadFile = createMemo(() => part().toolName === 'read' && !part().isError);

  if (isReadFile()) {
    return (
      <div class="group">
        <div
          onClick={() => setExpanded((v) => !v)}
          class="flex items-center gap-2 py-1 cursor-pointer select-none text-sm hover:bg-surface-hover/50 rounded px-1 -mx-1 transition-colors"
        >
          <span class={`shrink-0 transition-transform ${expanded() ? 'rotate-90' : ''} text-text-muted`}>
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </span>
          <ToolIcon toolName="read" category="builtin" class="w-3.5 h-3.5" />
          <span class="text-text-muted font-medium">Read</span>
          <span class="text-text-secondary font-mono text-xs truncate">
            {(() => {
              try {
                const parsed = JSON.parse(part().input);
                return parsed.filePath || parsed.file_path || '';
              } catch { return ''; }
            })()}
          </span>
          <Show when={part().duration}>
            <span class="text-xs text-text-muted ml-auto shrink-0">{formatDuration(part().duration)}</span>
          </Show>
        </div>
        <Show when={expanded()}>
          <div class="ml-7 mb-1">
            <Dynamic
              component={Renderer()}
              toolName={part().toolName}
              input={part().input}
              output={part().output}
              isError={part().isError}
              metadata={part().metadata}
              headerless
            />
          </div>
        </Show>
      </div>
    );
  }

  // Full rich card for all other tools
  return (
    <div
      class={`rounded-lg border relative overflow-hidden my-1 fade-in ${
        isThemed() ? `${theme().border} ${theme().bg}` : part().isError ? 'border-error/30 bg-error/5' : 'border-border bg-surface-2/30'
      } ${props.class || ''}`}
    >
      {/* Watermark - large faded icon for themed capability cards */}
      <Show when={WatermarkIcon()}>
        {(Icon) => (
          <div class="absolute top-1 right-1 pointer-events-none">
            <Dynamic component={Icon()} class={`w-16 h-16 max-md:w-10 max-md:h-10 ${theme().watermark}`} />
          </div>
        )}
      </Show>

      {/* Header — clickable to toggle expand/collapse */}
      <div
        onClick={() => setExpanded((v) => !v)}
        class={`px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 relative cursor-pointer select-none transition-colors hover:bg-surface-hover/30 ${
          expanded() ? 'border-b border-inherit' : ''
        } ${isThemed() ? theme().headerBg : ''}`}
      >
        {/* Chevron */}
        <span class={`shrink-0 transition-transform duration-150 ${expanded() ? 'rotate-90' : ''} text-text-muted`}>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </span>

        {/* Tool icon */}
        <ToolIcon toolName={part().toolName} category={category()} />

        {/* Tool name — for MCP tools, show server > tool breadcrumb instead of the verbose display name */}
        <Show
          when={mcpServer()}
          fallback={
            <span class="text-sm font-semibold text-text shrink-0">
              {getToolDisplayName(part().toolName)}
            </span>
          }
        >
          <span class="text-sm font-mono text-text-secondary shrink-0">
            {mcpServer()}<Show when={mcpOriginalTool()}>{' '}<span class="text-text-muted">&rsaquo;</span>{' '}{mcpOriginalTool()}</Show>
          </span>
        </Show>

        {/* Category badge for themed tools — hide when MCP breadcrumb is shown (redundant) */}
        <Show when={isThemed() && categoryLabel() && !mcpServer()}>
          <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${theme().badge}`}>
            {categoryLabel()}
          </span>
        </Show>

        {/* MCP transport badge — distinguishes inline (OCI/stdio) from server (gateway/sse) */}
        <Show when={mcpTransport()}>
          <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
            mcpTransport() === 'sse'
              ? 'bg-violet-500/15 text-violet-400'
              : 'bg-indigo-500/15 text-indigo-400'
          }`}>
            {mcpTransport() === 'sse' ? 'MCP Server' : 'Inline MCP'}
          </span>
        </Show>

        {/* Metadata title/description */}
        <Show when={part().metadata?.description || part().metadata?.command}>
          <span class="text-xs text-text-muted truncate min-w-0 max-md:w-full max-md:order-last">
            {(() => {
              const desc = part().metadata?.description as string | undefined;
              const cmd = part().metadata?.command as string | undefined;
              const label = desc || cmd || '';
              return label.length > 80 ? `${label.slice(0, 80)}...` : label;
            })()}
          </span>
        </Show>

        {/* Push duration + status to the right */}
        <span class="flex items-center gap-2 ml-auto shrink-0">
          <Show when={part().duration || part().metadata?.duration}>
            <span class="flex items-center gap-1 text-xs text-text-muted">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(part().duration || (part().metadata?.duration as number | undefined))}
            </span>
          </Show>
          <Badge variant={statusConfig().variant}>
            {statusConfig().label}
          </Badge>
        </span>
      </div>

      {/* Tool-specific content — collapsed for successful tools */}
      <Show when={expanded()}>
        <div class="relative">
          {/* Input arguments — collapsible subsection */}
          <Show when={hasInputArgs()}>
            <ToolInputSection input={part().input} />
          </Show>

          <Dynamic
            component={Renderer()}
            toolName={part().toolName}
            input={part().input}
            output={part().output}
            isError={part().isError}
            metadata={part().metadata}
            headerless
          />
        </div>
      </Show>
    </div>
  );
}
