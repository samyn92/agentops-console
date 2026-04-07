// SettingsPage — theme, accent color, preferences
import { A } from '@solidjs/router';
import {
  themeMode, setThemeMode,
  themeStyle, setThemeStyle,
  accentColor, setAccentColor,
  diffView, setDiffView,
  collapsedTools, setCollapsedTools,
} from '../stores/settings';
import type { ThemeMode, ThemeStyle } from '../stores/settings';

const accentPresets = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
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
            <div class="flex gap-1.5">
              {accentPresets.map((preset) => (
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
              ))}
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
            <button
              class={`relative w-10 h-5 rounded-full transition-colors ${
                collapsedTools() ? 'bg-accent' : 'bg-surface-2 border border-border'
              }`}
              onClick={() => setCollapsedTools(!collapsedTools())}
            >
              <span
                class={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  collapsedTools() ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </SettingRow>
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
