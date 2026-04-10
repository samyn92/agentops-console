// AgentInspector — center view for task agents.
// Shows agent configuration, tools, resources, schedule, and concurrency settings.
// Runs are NOT shown here — they live exclusively in the right panel.
// This gives each panel a single purpose: center = inspect/interact, right = monitor executions.
import { Show, For, createResource, createMemo } from 'solid-js';
import { selectedAgent, agentList } from '../../stores/agents';
import { contextualRuns, contextActiveRunCount, getDelegationMap } from '../../stores/runs';
import { agents as agentsAPI, agentResources as resourcesAPI } from '../../lib/api';
import Badge from '../shared/Badge';
import NeuralTrace from '../shared/NeuralTrace';
import Spinner from '../shared/Spinner';
import QuickRun from './QuickRun';
import { phaseVariant, formatDateTime, relativeTime } from '../../lib/format';
import type { AgentCRD, AgentResourceBinding } from '../../types';

interface AgentInspectorProps {
  class?: string;
}

export default function AgentInspector(props: AgentInspectorProps) {
  const agent = () => selectedAgent();
  const runs = () => contextualRuns();
  const activeCount = () => contextActiveRunCount();

  const agentInfo = createMemo(() => {
    const a = agent();
    if (!a) return null;
    const list = agentList();
    return list?.find((ag) => ag.namespace === a.namespace && ag.name === a.name) ?? null;
  });

  // Fetch full CRD for agent details
  const [crd] = createResource(
    () => {
      const a = agent();
      return a ? { ns: a.namespace, name: a.name } : null;
    },
    async (key) => {
      if (!key) return null;
      return agentsAPI.get(key.ns, key.name) as Promise<AgentCRD>;
    },
  );

  // Fetch bound resources
  const [resources] = createResource(
    () => {
      const a = agent();
      return a ? { ns: a.namespace, name: a.name } : null;
    },
    async (key) => {
      if (!key) return [];
      try {
        return await resourcesAPI.forAgent(key.ns, key.name);
      } catch {
        return [];
      }
    },
  );

  // Which daemons delegate to this task agent?
  const parentDaemons = createMemo(() => {
    const a = agent();
    if (!a) return [];
    const map = getDelegationMap();
    const parents: string[] = [];
    for (const [daemon, tasks] of Object.entries(map)) {
      if (tasks.includes(a.name)) {
        parents.push(daemon);
      }
    }
    return parents;
  });

  // Run stats
  const runStats = createMemo(() => {
    const r = runs();
    const succeeded = r.filter((run) => run.status?.phase === 'Succeeded').length;
    const failed = r.filter((run) => run.status?.phase === 'Failed').length;
    const active = r.filter((run) => {
      const phase = run.status?.phase;
      return phase === 'Running' || phase === 'Pending' || phase === 'Queued';
    }).length;
    return { total: r.length, succeeded, failed, active };
  });

  // Last run
  const lastRun = createMemo(() => {
    const r = runs();
    if (r.length === 0) return null;
    return r[0]; // Runs are typically sorted by creation time desc
  });

  return (
    <div class={`flex flex-col h-full ${props.class || ''}`}>
      {/* Neural trace (activity indicator) */}
      <NeuralTrace active={activeCount() > 0} size="sm" />

      {/* Content — scrollable inspector */}
      <div class="flex-1 overflow-y-auto">
        <Show when={crd.loading}>
          <div class="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        </Show>

        <Show when={crd()}>
          {(data) => {
            const spec = () => data().spec;

            return (
              <div class="px-6 py-4 space-y-5">

                {/* ── Run Overview (summary cards, not the full run list) ── */}
                <div class="grid grid-cols-4 gap-3">
                  <StatCard label="Total" value={String(runStats().total)} />
                  <StatCard label="Active" value={String(runStats().active)} accent={runStats().active > 0} />
                  <StatCard label="Succeeded" value={String(runStats().succeeded)} success />
                  <StatCard label="Failed" value={String(runStats().failed)} error={runStats().failed > 0} />
                </div>

                {/* ── Quick Run ── */}
                <QuickRun
                  agentName={data().metadata.name}
                  agentNamespace={data().metadata.namespace}
                  resources={resources() ?? []}
                />

                {/* Delegation source — which daemons trigger this task */}
                <Show when={parentDaemons().length > 0}>
                  <Section title="Delegated By">
                    <div class="flex flex-wrap gap-2">
                      <For each={parentDaemons()}>
                        {(daemon) => (
                          <div class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-info/8 border border-info/15 text-xs">
                            <svg class="w-3 h-3 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span class="font-medium text-text">{daemon}</span>
                            <span class="text-text-muted">daemon</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Section>
                </Show>

                {/* Last run info */}
                <Show when={lastRun()}>
                  {(run) => (
                    <Section title="Last Run">
                      <div class="rounded-lg bg-surface-2 border border-border-subtle p-3 space-y-1.5">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-mono text-text truncate flex-1">{run().metadata.name}</span>
                          <Badge variant={phaseVariant(run().status?.phase)} dot>
                            {run().status?.phase || '?'}
                          </Badge>
                        </div>
                        <Show when={run().spec.prompt}>
                          <p class="text-xs text-text-secondary/70 line-clamp-2">{run().spec.prompt}</p>
                        </Show>
                        <div class="flex items-center gap-3 text-[11px] text-text-muted">
                          <span>{relativeTime(run().metadata.creationTimestamp)}</span>
                          <Show when={run().spec.source}>
                            <span>via {run().spec.source}{run().spec.sourceRef ? ` / ${run().spec.sourceRef}` : ''}</span>
                          </Show>
                        </div>
                      </div>
                    </Section>
                  )}
                </Show>

                {/* ── Configuration ── */}
                <Section title="Configuration">
                  <div class="grid grid-cols-2 gap-2">
                    <PropCard label="Model" value={spec().model} mono />
                    <Show when={spec().image}>
                      <PropCard label="Image" value={spec().image!} mono />
                    </Show>
                    <Show when={spec().temperature !== undefined}>
                      <PropCard label="Temperature" value={String(spec().temperature)} />
                    </Show>
                    <Show when={spec().maxOutputTokens !== undefined}>
                      <PropCard label="Max Tokens" value={String(spec().maxOutputTokens)} />
                    </Show>
                    <Show when={spec().maxSteps !== undefined}>
                      <PropCard label="Max Steps" value={String(spec().maxSteps)} />
                    </Show>
                    <Show when={spec().timeout}>
                      <PropCard label="Timeout" value={spec().timeout!} />
                    </Show>
                  </div>
                </Section>

                {/* ── Concurrency ── */}
                <Show when={spec().concurrency}>
                  <Section title="Concurrency">
                    <div class="grid grid-cols-2 gap-2">
                      <Show when={spec().concurrency!.maxRuns}>
                        <PropCard label="Max Runs" value={String(spec().concurrency!.maxRuns)} />
                      </Show>
                      <Show when={spec().concurrency!.policy}>
                        <PropCard label="Policy" value={spec().concurrency!.policy!} />
                      </Show>
                    </div>
                  </Section>
                </Show>

                {/* ── Schedule ── */}
                <Show when={spec().schedule}>
                  <Section title="Schedule">
                    <div class="rounded-lg bg-surface-2 border border-border-subtle p-3">
                      <div class="flex items-center gap-2 mb-1">
                        <svg class="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span class="text-xs font-mono text-text">{spec().schedule}</span>
                      </div>
                      <Show when={spec().schedulePrompt}>
                        <p class="text-xs text-text-secondary mt-1">{spec().schedulePrompt}</p>
                      </Show>
                    </div>
                  </Section>
                </Show>

                {/* ── Tools ── */}
                <Show when={spec().tools?.length || spec().builtinTools?.length}>
                  <Section title="Tools">
                    <div class="flex flex-wrap gap-1.5">
                      <For each={spec().builtinTools ?? []}>
                        {(tool) => (
                          <span class="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium bg-surface-2 border border-border-subtle text-text-secondary">
                            {tool}
                          </span>
                        )}
                      </For>
                      <For each={spec().tools ?? []}>
                        {(tool) => (
                          <span class="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium bg-info/8 border border-info/15 text-info">
                            {tool.name}
                          </span>
                        )}
                      </For>
                    </div>
                  </Section>
                </Show>

                {/* ── Resources ── */}
                <Show when={resources() && resources()!.length > 0}>
                  <Section title="Resources">
                    <div class="space-y-1.5">
                      <For each={resources()!}>
                        {(res) => (
                          <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border-subtle">
                            <ResourceIcon kind={res.kind} />
                            <div class="flex-1 min-w-0">
                              <div class="text-xs font-medium text-text truncate">{res.displayName || res.name}</div>
                              <div class="text-[10px] text-text-muted">{res.kind}</div>
                            </div>
                            <Show when={res.readOnly}>
                              <span class="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">RO</span>
                            </Show>
                            <Badge variant={res.phase === 'Ready' ? 'success' : 'muted'} class="text-[10px]">
                              {res.phase}
                            </Badge>
                          </div>
                        )}
                      </For>
                    </div>
                  </Section>
                </Show>

                {/* ── Providers ── */}
                <Show when={spec().providers?.length}>
                  <Section title="Providers">
                    <div class="flex flex-wrap gap-1.5">
                      <For each={spec().providers}>
                        {(p) => (
                          <span class="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium bg-accent/8 border border-accent/15 text-accent">
                            {p.name}
                          </span>
                        )}
                      </For>
                    </div>
                    <Show when={spec().fallbackModels?.length}>
                      <div class="mt-2">
                        <span class="text-[10px] text-text-muted uppercase tracking-wider">Fallback models</span>
                        <div class="flex flex-wrap gap-1 mt-1">
                          <For each={spec().fallbackModels}>
                            {(model) => (
                              <span class="text-[11px] font-mono text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                                {model}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </Section>
                </Show>

                {/* ── System Prompt (truncated) ── */}
                <Show when={spec().systemPrompt}>
                  <Section title="System Prompt">
                    <pre class="text-xs text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded-lg p-3 max-h-48 overflow-y-auto border border-border-subtle">
                      {spec().systemPrompt}
                    </pre>
                  </Section>
                </Show>

                {/* Created */}
                <div class="pt-3 border-t border-border-subtle">
                  <p class="text-xs text-text-muted">
                    Created {formatDateTime(data().metadata.creationTimestamp)}
                  </p>
                </div>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
}

// ── Sub-components ──

function Section(props: { title: string; children: any }) {
  return (
    <div>
      <h3 class="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">{props.title}</h3>
      {props.children}
    </div>
  );
}

function StatCard(props: { label: string; value: string; accent?: boolean; success?: boolean; error?: boolean }) {
  const colorClass = () => {
    if (props.accent) return 'text-accent';
    if (props.success) return 'text-success';
    if (props.error) return 'text-error';
    return 'text-text';
  };

  return (
    <div class="rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-center">
      <div class={`text-lg font-mono font-semibold ${colorClass()}`}>{props.value}</div>
      <div class="text-[10px] text-text-muted uppercase tracking-wider">{props.label}</div>
    </div>
  );
}

function PropCard(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="rounded-lg bg-surface-2 border border-border-subtle px-3 py-2">
      <div class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">{props.label}</div>
      <div class={`text-xs text-text truncate ${props.mono ? 'font-mono' : ''}`}>{props.value}</div>
    </div>
  );
}

function ResourceIcon(props: { kind: string }) {
  const k = () => props.kind;
  return (
    <div class="w-6 h-6 rounded-md bg-surface flex items-center justify-center flex-shrink-0">
      <Show when={k().includes('github')}>
        <svg class="w-3.5 h-3.5 text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </Show>
      <Show when={k().includes('gitlab')}>
        <svg class="w-3.5 h-3.5 text-[#FC6D26]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      </Show>
      <Show when={k() === 'git-repo'}>
        <svg class="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
        </svg>
      </Show>
      <Show when={k() === 's3-bucket'}>
        <svg class="w-3.5 h-3.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </Show>
      <Show when={k() === 'documentation'}>
        <svg class="w-3.5 h-3.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </Show>
    </div>
  );
}
