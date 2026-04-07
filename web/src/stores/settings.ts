// Settings store — theme, accent color, preferences.
import { createSignal, createEffect } from 'solid-js';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ThemeStyle = 'vercel' | 'material';

// ── State ──

const stored = typeof localStorage !== 'undefined' ? localStorage : null;

const [themeMode, setThemeMode] = createSignal<ThemeMode>(
  (stored?.getItem('theme-mode') as ThemeMode) || 'dark',
);

const [themeStyle, setThemeStyle] = createSignal<ThemeStyle>(
  (stored?.getItem('theme-style') as ThemeStyle) || 'vercel',
);

const [accentColor, setAccentColor] = createSignal(
  stored?.getItem('accent-color') || '#3b82f6',
);

const [diffView, setDiffView] = createSignal<'unified' | 'split'>(
  (stored?.getItem('diff-view') as 'unified' | 'split') || 'unified',
);

const [collapsedTools, setCollapsedTools] = createSignal(
  stored?.getItem('collapsed-tools') !== 'false',
);

// Per-tool expansion defaults (granular control)
function loadToolExpansionDefaults(): Record<string, 'expanded' | 'collapsed'> {
  try {
    const raw = stored?.getItem('tool-expansion-defaults');
    if (raw) return JSON.parse(raw) as Record<string, 'expanded' | 'collapsed'>;
  } catch { /* ignore */ }
  return {};
}

const [toolExpansionDefaults, setToolExpansionDefaultsRaw] = createSignal<Record<string, 'expanded' | 'collapsed'>>(
  loadToolExpansionDefaults(),
);

function setToolExpansionDefault(toolName: string, state: 'expanded' | 'collapsed') {
  setToolExpansionDefaultsRaw((prev) => ({ ...prev, [toolName]: state }));
}

function setAllToolExpansionDefaults(tools: string[], state: 'expanded' | 'collapsed') {
  setToolExpansionDefaultsRaw((prev) => {
    const next = { ...prev };
    for (const t of tools) next[t] = state;
    return next;
  });
}

/** Check if a specific tool should start collapsed based on settings.
 *  Errors always expand regardless. Falls back to global collapsedTools. */
function isToolCollapsed(toolName: string, isError: boolean): boolean {
  if (isError) return false; // errors always expand
  const perTool = toolExpansionDefaults();
  if (toolName in perTool) {
    return perTool[toolName] === 'collapsed';
  }
  return collapsedTools(); // fall back to global toggle
}

// Show system prompts in agent sidebar
const [showSystemPrompts, setShowSystemPrompts] = createSignal(
  stored?.getItem('show-system-prompts') !== 'false',
);

// ── Persist changes ──

createEffect(() => stored?.setItem('theme-mode', themeMode()));
createEffect(() => stored?.setItem('theme-style', themeStyle()));
createEffect(() => stored?.setItem('accent-color', accentColor()));
createEffect(() => stored?.setItem('diff-view', diffView()));
createEffect(() => stored?.setItem('collapsed-tools', String(collapsedTools())));
createEffect(() => stored?.setItem('tool-expansion-defaults', JSON.stringify(toolExpansionDefaults())));
createEffect(() => stored?.setItem('show-system-prompts', String(showSystemPrompts())));

// ── Apply theme to document ──

createEffect(() => {
  const mode = themeMode();
  const style = themeStyle();

  const root = document.documentElement;

  // Resolve system preference
  let resolvedMode = mode;
  if (mode === 'system') {
    resolvedMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Apply data attributes for CSS selectors
  root.setAttribute('data-theme', resolvedMode);
  root.setAttribute('data-style', style);

  // Toggle class for Tailwind dark mode
  if (resolvedMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Apply Material You class
  if (style === 'material') {
    root.classList.add('material');
  } else {
    root.classList.remove('material');
  }
});

// ── Public API ──

export {
  themeMode, setThemeMode,
  themeStyle, setThemeStyle,
  accentColor, setAccentColor,
  diffView, setDiffView,
  collapsedTools, setCollapsedTools,
  toolExpansionDefaults, setToolExpansionDefault, setAllToolExpansionDefaults,
  isToolCollapsed,
  showSystemPrompts, setShowSystemPrompts,
};

/** All known built-in tool names for the settings UI */
export const KNOWN_TOOLS = [
  'bash', 'read', 'write', 'edit', 'glob', 'grep',
  'fetch', 'task', 'run_agent', 'get_agent_run',
] as const;
