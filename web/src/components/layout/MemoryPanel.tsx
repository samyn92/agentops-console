// MemoryPanel — Engram memory browser for the selected agent.
// Flat layout: section header + inline search + observation list.
// No tabs — search filters the list in-place.
// Detail and Extract views overlay the list when active.
import { For, Show, createSignal, createEffect, createMemo } from 'solid-js';
import {
  memoryEnabled,
  memoryProject,
  observations,
  observationsLoading,
  fetchObservations,
  selectedObservation,
  setSelectedObservation,
  selectedObservationLoading,
  fetchObservationDetail,
  searchQuery,
  setSearchQuery,
  searchResults,
  searchLoading,
  searchMemory,
  memoryStats,
  fetchMemoryStats,
  memoryView,
  setMemoryView,
  updateObservation,
  deleteObservation,
  extracting,
  extractionResult,
  extractionError,
  setExtractionResult,
  extractFromConversation,
  saveExtraction,
  discardExtraction,
  type MemoryView,
} from '../../stores/memory';
import { selectedAgent, getAgentRuntimeStatus } from '../../stores/agents';
import Spinner from '../shared/Spinner';
import { relativeTime } from '../../lib/format';
import type { MemoryObservation, MemorySearchResult } from '../../types';

// ── Observation type metadata ──

const TYPE_META: Record<string, { label: string; color: string }> = {
  decision:     { label: 'Decision',     color: 'text-accent' },
  architecture: { label: 'Architecture', color: 'text-info' },
  bugfix:       { label: 'Bugfix',       color: 'text-error' },
  pattern:      { label: 'Pattern',      color: 'text-success' },
  config:       { label: 'Config',       color: 'text-warning' },
  discovery:    { label: 'Discovery',    color: 'text-accent' },
  learning:     { label: 'Learning',     color: 'text-success' },
  preference:   { label: 'Preference',   color: 'text-text-secondary' },
};

function typeLabel(type: string | undefined): string {
  if (!type) return 'Unknown';
  return TYPE_META[type]?.label || type.charAt(0).toUpperCase() + type.slice(1);
}

function typeColor(type: string | undefined): string {
  if (!type) return 'text-text-muted';
  return TYPE_META[type]?.color || 'text-text-muted';
}

// ── Main component ──

export default function MemoryPanel() {
  const agent = () => selectedAgent();
  const [localQuery, setLocalQuery] = createSignal('');
  let debounceTimer: number | undefined;

  const isSearching = () => localQuery().trim().length > 0;
  const hasSearchResults = () => searchResults().length > 0;

  // Debounced search
  function handleSearchInput(e: InputEvent) {
    const val = (e.target as HTMLInputElement).value;
    setLocalQuery(val);
    clearTimeout(debounceTimer);
    if (val.trim().length >= 2) {
      debounceTimer = window.setTimeout(() => searchMemory(val), 300);
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const val = localQuery();
      if (val.trim()) searchMemory(val);
    }
    if (e.key === 'Escape') {
      setLocalQuery('');
      setSearchQuery('');
    }
  }

  // Stats text
  const statsText = createMemo(() => {
    const s = memoryStats();
    if (!s) return '';
    return `${s.total_observations} memories`;
  });

  // Show the main list view (not detail, not extract)
  const showList = () => memoryView() === 'observations' || memoryView() === 'search';

  // Disabled state (no memory)
  if (!memoryEnabled()) {
    return (
      <div class="flex flex-col items-center justify-center py-8 px-4 text-center h-full">
        <svg class="w-8 h-8 text-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a3.375 3.375 0 01-2.386.988H9.856a3.375 3.375 0 01-2.386-.988L5 14.5" />
        </svg>
        <p class="text-xs text-text-muted">
          <Show when={agent()} fallback="Select an agent to view memory.">
            Memory not enabled for {agent()!.name}.
          </Show>
        </p>
        <p class="text-[10px] text-text-muted/60 mt-1">
          Set <code class="text-text-secondary">spec.memory.serverRef</code> to enable.
        </p>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-full">
      {/* ── List view: header + search + observations ── */}
      <Show when={showList()}>
        {/* Section header — matching sidebar ruled-line style */}
        <div class="section-header section-header--first">
          <span class="section-label">Memories</span>
        </div>

        {/* Inline search input — always visible */}
        <div class="px-2 py-1.5">
          <div class="flex items-center gap-2 px-2.5 py-1.5 bg-surface-2 rounded-lg border border-border-subtle focus-within:border-border-hover transition-colors">
            <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              class="flex-1 bg-transparent text-xs text-text placeholder:text-text-muted outline-none"
              placeholder="Search memories..."
              value={localQuery()}
              onInput={handleSearchInput}
              onKeyDown={handleSearchKeyDown}
            />
            <Show when={searchLoading()}>
              <Spinner size="sm" />
            </Show>
            <Show when={isSearching() && !searchLoading()}>
              <button
                class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                onClick={() => { setLocalQuery(''); setSearchQuery(''); }}
                title="Clear search"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Show>
          </div>
          {/* Stats line */}
          <Show when={statsText()}>
            <div class="text-[10px] text-text-muted/60 px-1 pt-1">{statsText()}</div>
          </Show>
        </div>

        {/* Content: search results or observations */}
        <div class="flex-1 overflow-y-auto">
          {/* Search results mode */}
          <Show when={isSearching()}>
            <Show when={hasSearchResults()}>
              <div class="px-3 py-1 text-[10px] text-text-muted border-b border-border-subtle">
                {searchResults().length} result{searchResults().length !== 1 ? 's' : ''}
              </div>
              <div class="flex flex-col">
                <For each={searchResults()}>
                  {(result) => <SearchResultItem result={result} />}
                </For>
              </div>
            </Show>
            <Show when={!searchLoading() && searchQuery() && !hasSearchResults()}>
              <div class="flex flex-col items-center justify-center py-6 px-4 text-center">
                <p class="text-xs text-text-muted">No results for "{searchQuery()}"</p>
              </div>
            </Show>
          </Show>

          {/* Default observations list */}
          <Show when={!isSearching()}>
            <Show when={observationsLoading()}>
              <div class="flex items-center justify-center py-6">
                <Spinner size="sm" />
              </div>
            </Show>
            <Show when={!observationsLoading()}>
              <Show
                when={observations().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center py-6 px-4 text-center">
                    <BrainIcon class="w-8 h-8 text-text-muted mb-2" />
                    <p class="text-xs text-text-muted">No memories yet.</p>
                  </div>
                }
              >
                <div class="flex flex-col">
                  <For each={observations()}>
                    {(obs) => <ObservationItem obs={obs} />}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>

        {/* Extract from conversation — fixed bottom action */}
        <Show when={(() => {
          const a = selectedAgent();
          if (!a) return false;
          const rs = getAgentRuntimeStatus(a.namespace, a.name);
          return (rs?.messages ?? 0) > 0;
        })()}>
          <div class="border-t border-border px-2 py-1.5">
            <button
              class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] text-accent hover:text-accent/80 bg-accent/5 hover:bg-accent/10 rounded-lg transition-colors border border-accent/20"
              onClick={() => setMemoryView('extract')}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Extract from conversation
            </button>
          </div>
        </Show>
      </Show>

      {/* ── Detail overlay ── */}
      <Show when={memoryView() === 'detail'}>
        <DetailView />
      </Show>

      {/* ── Extract overlay ── */}
      <Show when={memoryView() === 'extract'}>
        <ExtractView />
      </Show>
    </div>
  );
}

// ── Observation List Item ──

function ObservationItem(props: { obs: MemoryObservation }) {
  const isSelected = () => selectedObservation()?.id === props.obs.id;

  return (
    <button
      class={`w-full text-left px-3 py-2.5 transition-colors border-b border-border-subtle ${
        isSelected()
          ? 'bg-accent-muted border-l-2 border-l-accent'
          : 'hover:bg-surface-hover border-l-2 border-l-transparent'
      }`}
      onClick={() => {
        fetchObservationDetail(props.obs.id);
        setMemoryView('detail');
      }}
    >
      {/* Row 1: Type badge + title */}
      <div class="flex items-center gap-1.5 mb-0.5">
        <TypeDot type={props.obs.type} />
        <span class="text-xs font-medium text-text truncate flex-1">
          {props.obs.title}
        </span>
      </div>

      {/* Row 2: Type label + time */}
      <div class="flex items-center gap-2 text-[11px] leading-[16px] tracking-[0.5px] text-text-muted">
        <span class={typeColor(props.obs.type)}>{typeLabel(props.obs.type)}</span>
        <Show when={props.obs.scope === 'personal'}>
          <span class="text-text-muted/60">personal</span>
        </Show>
        <span class="ml-auto flex-shrink-0">{relativeTime(props.obs.created_at)}</span>
      </div>

      {/* Row 3: Content preview */}
      <p class="text-[11px] text-text-secondary/70 mt-1 truncate">
        {props.obs.content.slice(0, 120)}
      </p>
    </button>
  );
}

// ── Search Result Item ──

function SearchResultItem(props: { result: MemorySearchResult }) {
  return (
    <button
      class="w-full text-left px-3 py-2.5 transition-colors border-b border-border-subtle hover:bg-surface-hover border-l-2 border-l-transparent"
      onClick={() => {
        fetchObservationDetail(props.result.id);
        setMemoryView('detail');
      }}
    >
      <div class="flex items-center gap-1.5 mb-0.5">
        <TypeDot type={props.result.type} />
        <span class="text-xs font-medium text-text truncate flex-1">
          {props.result.title}
        </span>
        <span class="text-[10px] text-text-muted/50 flex-shrink-0">
          #{props.result.rank.toFixed(1)}
        </span>
      </div>
      <p class="text-[11px] text-text-secondary/70 mt-0.5 line-clamp-2">
        {props.result.content.slice(0, 160)}
      </p>
      <Show when={props.result.created_at}>
        <span class="text-[10px] text-text-muted mt-0.5 block">{relativeTime(props.result.created_at)}</span>
      </Show>
    </button>
  );
}

// ── Detail View ──

function DetailView() {
  const [editing, setEditing] = createSignal(false);
  const [editTitle, setEditTitle] = createSignal('');
  const [editContent, setEditContent] = createSignal('');
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const obs = () => selectedObservation();

  function startEdit() {
    const o = obs();
    if (!o) return;
    setEditTitle(o.title);
    setEditContent(o.content);
    setEditing(true);
  }

  async function saveEdit() {
    const o = obs();
    if (!o) return;
    const success = await updateObservation(o.id, {
      title: editTitle(),
      content: editContent(),
    });
    if (success) setEditing(false);
  }

  async function handleDelete() {
    const o = obs();
    if (!o) return;
    if (!confirmDelete()) {
      setConfirmDelete(true);
      return;
    }
    const success = await deleteObservation(o.id);
    if (success) {
      setMemoryView('observations');
      setConfirmDelete(false);
    }
  }

  return (
    <div class="flex flex-col h-full">
      {/* Back button */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
          onClick={() => {
            setSelectedObservation(null);
            setMemoryView('observations');
            setEditing(false);
            setConfirmDelete(false);
          }}
          title="Back to list"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <span class="text-xs text-text-muted flex-1 truncate">Observation</span>

        {/* Action buttons */}
        <Show when={!editing()}>
          <button
            class="p-1 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
            onClick={startEdit}
            title="Edit"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button
            class={`p-1 rounded-lg transition-colors ${
              confirmDelete()
                ? 'bg-error/20 text-error hover:bg-error/30'
                : 'hover:bg-surface-hover text-text-muted hover:text-error'
            }`}
            onClick={handleDelete}
            title={confirmDelete() ? 'Click again to confirm' : 'Delete'}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </Show>
      </div>

      <Show when={selectedObservationLoading()}>
        <div class="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </div>
      </Show>

      <Show when={!selectedObservationLoading() && obs()}>
        {(o) => (
          <div class="flex-1 overflow-y-auto">
            <Show when={!editing()} fallback={
              <EditForm
                title={editTitle()}
                content={editContent()}
                onTitleChange={setEditTitle}
                onContentChange={setEditContent}
                onSave={saveEdit}
                onCancel={() => { setEditing(false); setConfirmDelete(false); }}
              />
            }>
              {/* Read-only detail */}
              <div class="px-3 py-3 space-y-3">
                {/* Title */}
                <div>
                  <h3 class="text-sm font-medium text-text">{o().title}</h3>
                  <div class="flex items-center gap-2 mt-1">
                    <TypeDot type={o().type} />
                    <span class={`text-[11px] ${typeColor(o().type)}`}>{typeLabel(o().type)}</span>
                    <Show when={o().scope}>
                      <span class="text-[10px] text-text-muted/60">{o().scope}</span>
                    </Show>
                    <Show when={o().topic_key}>
                      <span class="text-[10px] font-mono text-text-muted">{o().topic_key}</span>
                    </Show>
                  </div>
                </div>

                {/* Content */}
                <div>
                  <span class="text-[10px] text-text-muted block mb-1">Content</span>
                  <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded-lg p-2.5 border border-border-subtle max-h-48 overflow-y-auto">
                    {o().content}
                  </pre>
                </div>

                {/* Metadata */}
                <div class="space-y-1.5 pt-1">
                  <DetailRow label="ID" value={String(o().id)} />
                  <DetailRow label="Session" value={o().session_id?.slice(0, 8) || '\u2014'} />
                  <DetailRow label="Created" value={relativeTime(o().created_at)} />
                  <DetailRow label="Updated" value={relativeTime(o().updated_at)} />
                  <Show when={o().revision_count && o().revision_count! > 0}>
                    <DetailRow label="Revisions" value={String(o().revision_count)} />
                  </Show>
                  <Show when={o().duplicate_count && o().duplicate_count! > 0}>
                    <DetailRow label="Dupes" value={String(o().duplicate_count)} />
                  </Show>
                  <Show when={o().tool_name}>
                    <DetailRow label="Tool" value={o().tool_name!} />
                  </Show>
                  <Show when={o().project}>
                    <DetailRow label="Project" value={o().project!} />
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

// ── Edit Form ──

function EditForm(props: {
  title: string;
  content: string;
  onTitleChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="px-3 py-3 space-y-3">
      <div>
        <label class="text-[10px] text-text-muted block mb-1">Title</label>
        <input
          type="text"
          class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors"
          value={props.title}
          onInput={(e) => props.onTitleChange((e.target as HTMLInputElement).value)}
        />
      </div>
      <div>
        <label class="text-[10px] text-text-muted block mb-1">Content</label>
        <textarea
          class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors font-mono resize-y min-h-[120px]"
          value={props.content}
          onInput={(e) => props.onContentChange((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <div class="flex gap-2">
        <button
          class="flex-1 px-3 py-1.5 text-[11px] font-medium text-text bg-accent/20 hover:bg-accent/30 rounded-lg transition-colors"
          onClick={props.onSave}
        >
          Save
        </button>
        <button
          class="flex-1 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text bg-surface-2 hover:bg-surface-hover rounded-lg transition-colors"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Extract View (AI-assisted memory extraction) ──

function ExtractView() {
  const [focusHint, setFocusHint] = createSignal('');
  const [typeHint, setTypeHint] = createSignal('');
  const [editType, setEditType] = createSignal('');
  const [editTitle, setEditTitle] = createSignal('');
  const [editContent, setEditContent] = createSignal('');
  const [editTags, setEditTags] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const TYPES = ['decision', 'discovery', 'bugfix', 'pattern', 'architecture', 'config', 'learning', 'preference'];

  const hasResult = () => extractionResult() !== null;
  const status = () => {
    const a = selectedAgent();
    if (!a) return null;
    return getAgentRuntimeStatus(a.namespace, a.name);
  };
  const msgCount = () => status()?.messages ?? 0;

  createEffect(() => {
    const r = extractionResult();
    if (r) {
      setEditType(r.type || 'learning');
      setEditTitle(r.title || '');
      setEditContent(r.content || '');
      setEditTags((r.tags || []).join(', '));
    }
  });

  async function handleExtract() {
    await extractFromConversation(
      focusHint().trim() || undefined,
      typeHint() || undefined,
    );
  }

  async function handleSave() {
    setSaving(true);
    const tags = editTags().split(',').map(t => t.trim()).filter(Boolean);
    await saveExtraction({
      type: editType(),
      title: editTitle(),
      content: editContent(),
      tags,
    });
    setSaving(false);
  }

  function handleDiscard() {
    discardExtraction();
    setMemoryView('observations');
  }

  function handleBack() {
    discardExtraction();
    setFocusHint('');
    setTypeHint('');
    setMemoryView('observations');
  }

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors"
          onClick={handleBack}
          title="Back"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <svg class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
        <span class="text-xs text-text-muted flex-1">Extract from conversation</span>
        <span class="text-[10px] text-text-muted/60">{msgCount()} msgs</span>
      </div>

      <div class="flex-1 overflow-y-auto">
        {/* Input phase */}
        <Show when={!hasResult() && !extracting() && !extractionError()}>
          <div class="px-3 py-3 space-y-3">
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Focus hint <span class="text-text-muted/50">(optional)</span></label>
              <input
                type="text"
                class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors"
                placeholder="e.g. why the deployment failed"
                value={focusHint()}
                onInput={(e) => setFocusHint((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleExtract(); }}
              />
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Type hint <span class="text-text-muted/50">(optional)</span></label>
              <div class="flex flex-wrap gap-1">
                <button
                  class={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                    typeHint() === ''
                      ? 'bg-surface-hover text-text font-medium border border-border-hover'
                      : 'text-text-muted hover:text-text-secondary bg-surface-2 border border-border-subtle'
                  }`}
                  onClick={() => setTypeHint('')}
                >
                  Auto
                </button>
                <For each={TYPES}>
                  {(t) => (
                    <button
                      class={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                        typeHint() === t
                          ? 'bg-surface-hover text-text font-medium border border-border-hover'
                          : 'text-text-muted hover:text-text-secondary bg-surface-2 border border-border-subtle'
                      }`}
                      onClick={() => setTypeHint(t)}
                    >
                      {typeLabel(t)}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <button
              class="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-text bg-accent/20 hover:bg-accent/30 rounded-lg transition-colors disabled:opacity-40"
              onClick={handleExtract}
              disabled={msgCount() === 0}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Extract knowledge
            </button>
            <Show when={msgCount() === 0}>
              <p class="text-[10px] text-text-muted/60 text-center">No messages in working memory to extract from.</p>
            </Show>
          </div>
        </Show>

        {/* Loading phase */}
        <Show when={extracting()}>
          <div class="flex flex-col items-center justify-center py-12 px-4 gap-3">
            <Spinner size="md" />
            <p class="text-xs text-text-muted">Analyzing conversation...</p>
            <p class="text-[10px] text-text-muted/60">The agent's model is extracting knowledge</p>
          </div>
        </Show>

        {/* Error phase */}
        <Show when={extractionError() && !extracting()}>
          <div class="px-3 py-3 space-y-3">
            <div class="flex items-start gap-2 p-2.5 bg-error/10 rounded-lg border border-error/20">
              <svg class="w-4 h-4 text-error flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <p class="text-xs text-error font-medium">Extraction failed</p>
                <p class="text-[10px] text-error/80 mt-0.5">{extractionError()}</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                class="flex-1 px-3 py-1.5 text-[11px] font-medium text-text bg-accent/20 hover:bg-accent/30 rounded-lg transition-colors"
                onClick={handleExtract}
              >
                Retry
              </button>
              <button
                class="flex-1 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text bg-surface-2 hover:bg-surface-hover rounded-lg transition-colors"
                onClick={handleBack}
              >
                Cancel
              </button>
            </div>
          </div>
        </Show>

        {/* Review phase */}
        <Show when={hasResult() && !extracting()}>
          <div class="px-3 py-3 space-y-3">
            <div class="flex items-center gap-1.5 text-[10px] text-success">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Review and edit before saving
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Type</label>
              <div class="flex flex-wrap gap-1">
                <For each={TYPES}>
                  {(t) => (
                    <button
                      class={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                        editType() === t
                          ? 'bg-surface-hover text-text font-medium border border-border-hover'
                          : 'text-text-muted hover:text-text-secondary bg-surface-2 border border-border-subtle'
                      }`}
                      onClick={() => setEditType(t)}
                    >
                      {typeLabel(t)}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Title</label>
              <input
                type="text"
                class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors"
                value={editTitle()}
                onInput={(e) => setEditTitle((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Content</label>
              <textarea
                class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors font-mono resize-y min-h-[120px]"
                value={editContent()}
                onInput={(e) => setEditContent((e.target as HTMLTextAreaElement).value)}
              />
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-1">Tags <span class="text-text-muted/50">(comma-separated)</span></label>
              <input
                type="text"
                class="w-full px-2.5 py-1.5 text-xs bg-surface-2 text-text rounded-lg border border-border-subtle focus:border-border-hover outline-none transition-colors"
                placeholder="e.g. kubernetes, deployment, fix"
                value={editTags()}
                onInput={(e) => setEditTags((e.target as HTMLInputElement).value)}
              />
              <Show when={editTags().trim()}>
                <div class="flex flex-wrap gap-1 mt-1.5">
                  <For each={editTags().split(',').map(t => t.trim()).filter(Boolean)}>
                    {(tag) => (
                      <span class="px-1.5 py-0.5 text-[10px] bg-surface-hover text-text-secondary rounded-md border border-border-subtle">
                        {tag}
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="flex gap-2 pt-1">
              <button
                class="flex-1 px-3 py-1.5 text-[11px] font-medium text-text bg-accent/20 hover:bg-accent/30 rounded-lg transition-colors disabled:opacity-40"
                onClick={handleSave}
                disabled={saving() || !editTitle().trim() || !editContent().trim()}
              >
                <Show when={saving()} fallback="Save to memory">
                  <span class="flex items-center justify-center gap-1.5"><Spinner size="sm" /> Saving...</span>
                </Show>
              </button>
              <button
                class="px-3 py-1.5 text-[11px] text-text-secondary hover:text-text bg-surface-2 hover:bg-surface-hover rounded-lg transition-colors"
                onClick={handleDiscard}
              >
                Discard
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── Shared sub-components ──

function TypeDot(props: { type: string }) {
  return (
    <span class={`w-2 h-2 rounded-full flex-shrink-0 ${
      props.type === 'decision' ? 'bg-accent' :
      props.type === 'bugfix' ? 'bg-error' :
      props.type === 'discovery' ? 'bg-accent' :
      props.type === 'pattern' ? 'bg-success' :
      props.type === 'architecture' ? 'bg-info' :
      props.type === 'config' ? 'bg-warning' :
      props.type === 'learning' ? 'bg-success' :
      'bg-text-muted/40'
    }`} />
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-center gap-2 text-[11px]">
      <span class="text-text-muted w-16 flex-shrink-0">{props.label}</span>
      <span class="text-text-secondary font-mono truncate">{props.value}</span>
    </div>
  );
}

function BrainIcon(props: { class?: string }) {
  return (
    <svg class={props.class || 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a3.375 3.375 0 01-2.386.988H9.856a3.375 3.375 0 01-2.386-.988L5 14.5m14 0l.228-.303a3 3 0 00.547-1.992 3.368 3.368 0 00-.21-1.143L19 9.5m0 5l.341-.455a3.003 3.003 0 00.434-2.785L19 9.5m0 0l-.597-.334A3 3 0 0016 6.42V4.5" />
    </svg>
  );
}

// ── Exported for use in "Remember this" feature ──
export { BrainIcon };
