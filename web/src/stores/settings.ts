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

// ── Persist changes ──

createEffect(() => stored?.setItem('theme-mode', themeMode()));
createEffect(() => stored?.setItem('theme-style', themeStyle()));
createEffect(() => stored?.setItem('accent-color', accentColor()));
createEffect(() => stored?.setItem('diff-view', diffView()));
createEffect(() => stored?.setItem('collapsed-tools', String(collapsedTools())));

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
});

// ── Public API ──

export {
  themeMode, setThemeMode,
  themeStyle, setThemeStyle,
  accentColor, setAccentColor,
  diffView, setDiffView,
  collapsedTools, setCollapsedTools,
};
