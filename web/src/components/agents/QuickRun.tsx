// QuickRun — inline form to create an AgentRun directly from the console.
// Appears in the AgentInspector for task agents. Supports optional git workspace.
import { createSignal, createMemo, Show, For } from 'solid-js';
import { agentRuns } from '../../lib/api';
import { refetchRuns, selectRun } from '../../stores/runs';
import type { AgentResourceBinding } from '../../types';

interface QuickRunProps {
  agentName: string;
  agentNamespace: string;
  resources: AgentResourceBinding[];
}

/** Generate a slug from prompt text for branch naming. */
function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, maxLen)
    .replace(/-$/, '');
}

export default function QuickRun(props: QuickRunProps) {
  const [expanded, setExpanded] = createSignal(false);
  const [prompt, setPrompt] = createSignal('');
  const [selectedResource, setSelectedResource] = createSignal('');
  const [branchOverride, setBranchOverride] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  // Filter to only git-capable resources
  const gitResources = createMemo(() =>
    props.resources.filter(
      (r) =>
        r.kind === 'github-repo' ||
        r.kind === 'gitlab-project' ||
        r.kind === 'git-repo',
    ),
  );

  // Compute branch name: user override > auto-generated from prompt
  const branchName = createMemo(() => {
    if (branchOverride()) return branchOverride();
    const p = prompt().trim();
    if (!p) return `agent/${props.agentName}/task`;
    const slug = slugify(p);
    return `agent/${props.agentName}/${slug || 'task'}`;
  });

  // Get default branch from selected resource
  const baseBranch = createMemo(() => {
    const resName = selectedResource();
    if (!resName) return '';
    const res = gitResources().find((r) => r.name === resName);
    if (!res) return '';
    return res.github?.defaultBranch || res.gitlab?.defaultBranch || 'main';
  });

  // Resource display helper
  const resourceLabel = (res: AgentResourceBinding): string => {
    if (res.github) return `${res.github.owner}/${res.github.repo}`;
    if (res.gitlab) return res.gitlab.project;
    return res.displayName || res.name;
  };

  const canSubmit = () => prompt().trim().length > 0 && !submitting();

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit()) return;

    setSubmitting(true);
    setError('');

    try {
      const params: Parameters<typeof agentRuns.create>[0] = {
        agentRef: props.agentName,
        prompt: prompt().trim(),
      };

      // Add git config if a resource is selected
      if (selectedResource()) {
        params.git = {
          resourceRef: selectedResource(),
          branch: branchName(),
          baseBranch: baseBranch() || undefined,
        };
      }

      const run = await agentRuns.create(params);
      // Reset form
      setPrompt('');
      setSelectedResource('');
      setBranchOverride('');
      setExpanded(false);
      // Refresh runs list and select the new run
      refetchRuns();
      if (run.metadata?.namespace && run.metadata?.name) {
        selectRun(run.metadata.namespace, run.metadata.name);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="quick-run">
      {/* Toggle button */}
      <Show
        when={expanded()}
        fallback={
          <button
            type="button"
            onClick={() => setExpanded(true)}
            class="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-accent/8 hover:bg-accent/14 border border-accent/20 hover:border-accent/35 text-accent text-xs font-medium transition-all duration-200 group"
          >
            <svg class="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Quick Run
            <Show when={gitResources().length > 0}>
              <span class="ml-auto text-[10px] text-accent/60">
                {gitResources().length} repo{gitResources().length !== 1 ? 's' : ''}
              </span>
            </Show>
          </button>
        }
      >
        {/* Expanded form */}
        <form onSubmit={handleSubmit} class="rounded-xl bg-surface-2 border border-border overflow-hidden">
          {/* Header */}
          <div class="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Quick Run</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              class="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-surface transition-colors"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-3 space-y-3">
            {/* Prompt */}
            <div>
              <textarea
                value={prompt()}
                onInput={(e) => setPrompt(e.currentTarget.value)}
                placeholder="Describe the task..."
                rows={3}
                class="w-full px-3 py-2 rounded-lg bg-background border border-border-subtle text-sm text-text placeholder-text-muted/50 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 resize-y min-h-[60px] transition-colors"
              />
            </div>

            {/* Git workspace (only if git resources exist) */}
            <Show when={gitResources().length > 0}>
              <div class="space-y-2">
                {/* Repository selector */}
                <div>
                  <label class="text-[10px] font-medium text-text-muted uppercase tracking-wider block mb-1">
                    Repository
                  </label>
                  <select
                    value={selectedResource()}
                    onChange={(e) => setSelectedResource(e.currentTarget.value)}
                    class="w-full px-3 py-1.5 rounded-lg bg-background border border-border-subtle text-xs text-text focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">No git workspace</option>
                    <For each={gitResources()}>
                      {(res) => (
                        <option value={res.name}>
                          {resourceLabel(res)} ({res.kind.replace('-', ' ')})
                        </option>
                      )}
                    </For>
                  </select>
                </div>

                {/* Branch name (shown only when a resource is selected) */}
                <Show when={selectedResource()}>
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <label class="text-[10px] font-medium text-text-muted uppercase tracking-wider block mb-1">
                        Branch
                      </label>
                      <input
                        type="text"
                        value={branchOverride() || branchName()}
                        onInput={(e) => setBranchOverride(e.currentTarget.value)}
                        placeholder={branchName()}
                        class="w-full px-3 py-1.5 rounded-lg bg-background border border-border-subtle text-xs font-mono text-text focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors"
                      />
                    </div>
                    <Show when={baseBranch()}>
                      <div class="w-24 flex-shrink-0">
                        <label class="text-[10px] font-medium text-text-muted uppercase tracking-wider block mb-1">
                          Base
                        </label>
                        <div class="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs font-mono text-text-secondary truncate">
                          {baseBranch()}
                        </div>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Error message */}
            <Show when={error()}>
              <div class="text-xs text-error bg-error/8 border border-error/15 rounded-lg px-3 py-2">
                {error()}
              </div>
            </Show>

            {/* Submit */}
            <div class="flex items-center justify-between">
              <div class="text-[10px] text-text-muted">
                <Show when={selectedResource()} fallback="Prompt-only run">
                  <span class="inline-flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                    </svg>
                    Git workspace enabled
                  </span>
                </Show>
              </div>
              <button
                type="submit"
                disabled={!canSubmit()}
                class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-accent text-white hover:bg-accent/90 active:scale-[0.97]"
              >
                <Show
                  when={!submitting()}
                  fallback={
                    <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  }
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                </Show>
                Run
              </button>
            </div>
          </div>
        </form>
      </Show>
    </div>
  );
}
