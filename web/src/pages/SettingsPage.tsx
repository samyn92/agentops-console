// SettingsPage — theme, accent color, per-tool expansion, preferences
import { For } from 'solid-js';
import { A } from '@solidjs/router';
import {
  themeMode, setThemeMode,
  themeStyle, setThemeStyle,
  accentColor, setAccentColor,
  diffView, setDiffView,
  collapsedTools, setCollapsedTools,
  toolExpansionDefaults, setToolExpansionDefault, setAllToolExpansionDefaults,
  showSystemPrompts, setShowSystemPrompts,
  KNOWN_TOOLS,
} from '../stores/settings';
import type { ThemeMode, ThemeStyle } from '../stores/settings';
import { getToolDisplayName } from '../lib/capability-themes';

const accentPresets = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Red', value: '#ef4444' },
];

function SettingSection(props: { title: string; children: any }) {
  return (
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-text mb-3">{props.title}</h3>
      {props.children}
    </div>
  );
}

function SettingRow(props: { label: string; description?: string; children: any }) {
  return (
    <div class="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
      <div class="min-w-0 mr-4">
        <p class="text-sm text-text">{props.label}</p>
        {props.description && (
          <p class="text-xs text-text-muted mt-0.5">{props.description}</p>
        )}
      </div>
      <div class="flex-shrink-0">
        {props.children}
      </div>
    </div>
  );
}

function SelectButton(props: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div class="flex rounded-lg border border-border overflow-hidden">
      {props.options.map((opt) => (
        <button
          class={`px-3 py-1.5 text-xs font-medium transition-colors ${
            props.value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface text-text-secondary hover:bg-surface-hover'
          }`}
          onClick={() => props.onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      class={`relative w-10 h-5 rounded-full transition-colors ${
        props.checked ? 'bg-accent' : 'bg-surface-2 border border-border'
      }`}
      onClick={() => props.onChange(!props.checked)}
    >
      <span
        class={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          props.checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/** Per-tool expansion state: 'expanded' | 'collapsed' | undefined (use global) */
function toolState(toolName: string): 'expanded' | 'collapsed' | 'default' {
  const defaults = toolExpansionDefaults();
  return defaults[toolName] || 'default';
}

function ToolExpansionRow(props: { tool: string }) {
  const state = () => toolState(props.tool);

  const cycle = () => {
    const current = state();
    if (current === 'default') setToolExpansionDefault(props.tool, 'expanded');
    else if (current === 'expanded') setToolExpansionDefault(props.tool, 'collapsed');
    else setToolExpansionDefault(props.tool, 'expanded'); // reset cycle could go back to 'default' but that requires clearing
  };

  return (
    <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-hover/50 transition-colors">
      <span class="text-xs text-text-secondary font-mono">{getToolDisplayName(props.tool)}</span>
      <button
        class={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
          state() === 'expanded'
            ? 'bg-success/15 text-success'
            : state() === 'collapsed'
            ? 'bg-warning/15 text-warning'
            : 'bg-surface-2 text-text-muted'
        }`}
        onClick={cycle}
        title="Click to cycle: default -> expanded -> collapsed"
      >
        {state() === 'expanded' ? 'Expanded' : state() === 'collapsed' ? 'Collapsed' : 'Default'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div class="min-h-screen bg-background text-text">
      {/* Header */}
      <div class="border-b border-border px-4 py-3 flex items-center gap-3">
        <A href="/" class="text-text-secondary hover:text-text transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </A>
        <h1 class="text-lg font-semibold">Settings</h1>
      </div>

      {/* Settings content */}
      <div class="max-w-2xl mx-auto px-4 py-6">

        <SettingSection title="Appearance">
          <SettingRow label="Theme" description="Color mode for the interface">
            <SelectButton
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'System' },
              ]}
              value={themeMode()}
              onChange={(v) => setThemeMode(v as ThemeMode)}
            />
          </SettingRow>

          <SettingRow label="Style" description="Visual design language">
            <SelectButton
              options={[
                { value: 'vercel', label: 'Vercel' },
                { value: 'material', label: 'Material' },
              ]}
              value={themeStyle()}
              onChange={(v) => setThemeStyle(v as ThemeStyle)}
            />
          </SettingRow>

          <SettingRow label="Accent Color" description="Primary accent for interactive elements">
            <div class="flex flex-wrap gap-1.5">
              <For each={accentPresets}>
                {(preset) => (
                  <button
                    class={`w-6 h-6 rounded-full border-2 transition-all ${
                      accentColor() === preset.value
                        ? 'border-text scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: preset.value }}
                    onClick={() => setAccentColor(preset.value)}
                    title={preset.name}
                  />
                )}
              </For>
            </div>
          </SettingRow>
        </SettingSection>

        <SettingSection title="Editor">
          <SettingRow label="Diff View" description="How code diffs are displayed">
            <SelectButton
              options={[
                { value: 'unified', label: 'Unified' },
                { value: 'split', label: 'Split' },
              ]}
              value={diffView()}
              onChange={(v) => setDiffView(v as 'unified' | 'split')}
            />
          </SettingRow>

          <SettingRow label="Auto-collapse Tools" description="Collapse completed tool results by default">
            <Toggle
              checked={collapsedTools()}
              onChange={setCollapsedTools}
            />
          </SettingRow>

          <SettingRow label="Show System Prompts" description="Display system prompts in agent sidebar">
            <Toggle
              checked={showSystemPrompts()}
              onChange={setShowSystemPrompts}
            />
          </SettingRow>
        </SettingSection>

        {/* Per-tool expansion defaults */}
        <SettingSection title="Per-Tool Expansion Defaults">
          <p class="text-xs text-text-muted mb-3">
            Override the global collapse setting per tool. Click the badge to cycle through states. "Default" follows the global toggle above.
          </p>
          <div class="flex gap-2 mb-3">
            <button
              class="text-xs px-2.5 py-1 rounded border border-border text-text-secondary hover:bg-surface-hover transition-colors"
              onClick={() => setAllToolExpansionDefaults([...KNOWN_TOOLS], 'expanded')}
            >
              Expand All
            </button>
            <button
              class="text-xs px-2.5 py-1 rounded border border-border text-text-secondary hover:bg-surface-hover transition-colors"
              onClick={() => setAllToolExpansionDefaults([...KNOWN_TOOLS], 'collapsed')}
            >
              Collapse All
            </button>
          </div>
          <div class="border border-border rounded-lg overflow-hidden divide-y divide-border-subtle">
            <For each={[...KNOWN_TOOLS]}>
              {(tool) => <ToolExpansionRow tool={tool} />}
            </For>
          </div>
        </SettingSection>

        <SettingSection title="About">
          <SettingRow label="AgentOps Console" description="Fantasy SDK native agent operations console">
            <span class="text-xs text-text-muted">v0.1.0</span>
          </SettingRow>
        </SettingSection>

      </div>
    </div>
  );
}
