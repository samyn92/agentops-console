// Sidebar — agents navigation (left panel)
// Hierarchical layout with four groups:
// 1. Orchestrators — daemon agents with nested task agents (from run_agent delegation)
//    A task can appear under multiple daemons if both have invoked it.
// 2. Workers — task agents with no daemon, channel, or schedule
// 3. Scheduled — task agents with spec.schedule and no daemon parent or channel
// 4. Channels — task agents bound to channels (webhook/gitlab/slack) with no daemon parent
//
// Channel/schedule badges appear on cards regardless of group.
import { For, Show, createSignal, createMemo, onCleanup } from 'solid-js';
import { A } from '@solidjs/router';
import { agentList, selectedAgent, selectAgent } from '../../stores/agents';
import { leftPanelState, toggleLeftPanel, leftPanelTab, setLeftPanelTab, showRunDetail, clearCenterOverlay } from '../../stores/view';
import type { LeftPanelTab } from '../../stores/view';
import { contextualRuns, selectedRunKey, selectRun, clearRunSelection, getRunSource, type RunSource } from '../../stores/runs';
import { getChannelsForAgent, channelBoundAgents } from '../../stores/channels';
import { getResourceForge, getResourceRepoName } from '../../stores/resources';
import { streamingAgentKeys } from '../../stores/chat';
import { relativeTime } from '../../lib/format';
import Spinner from '../shared/Spinner';
import AgentCard from './AgentCard';

import TracesPanel from './TracesPanel';
import RunPhaseIcon from '../shared/RunPhaseIcon';
import type { AgentResponse, AgentRunResponse } from '../../types';

interface SidebarProps {
  class?: string;
}

export default function Sidebar(props: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = createSignal(308);
  const [isResizing, setIsResizing] = createSignal(false);

  // Split view: percentage of height for the agents section (top).
  // 60% agents, 40% runs by default.
  const [splitPct, setSplitPct] = createSignal(60);
  const [isSplitDragging, setIsSplitDragging] = createSignal(false);
  let splitContainerRef: HTMLDivElement | undefined;

  const isExpanded = () => leftPanelState() === 'expanded';

  // ── Build agent groups ──
  // Orchestrators = daemons, Workers/Channels/Scheduled = task agents by type.
  // No nesting — delegation relationships are visible in the Runs tab.
  const agentTree = createMemo(() => {
    const agents = agentList() ?? [];
    const chBound = channelBoundAgents();
    const byName = (a: AgentResponse, b: AgentResponse) => a.name.localeCompare(b.name);

    const daemons = agents.filter((a) => a.mode === 'daemon').sort(byName);
    const tasks = agents.filter((a) => a.mode === 'task');

    // Channels: task agents that have channel bindings
    const channelTasks = tasks.filter((t) => chBound.has(t.name)).sort(byName);

    // Scheduled: task agents with spec.schedule but no channel
    const scheduledTasks = tasks.filter(
      (t) => !chBound.has(t.name) && t.schedule,
    ).sort(byName);

    // Workers: everything else (task agents with no channel or schedule)
    const workers = tasks.filter(
      (t) => !chBound.has(t.name) && !t.schedule,
    ).sort(byName);

    return { daemons, workers, channelTasks, scheduledTasks };
  });

  // ── Sidebar width resize handler ──
  function onResizeStart(e: MouseEvent) {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = sidebarWidth();

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const newWidth = Math.max(220, Math.min(400, startWidth + delta));
      setSidebarWidth(newWidth);
    }

    function onMouseUp() {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ── Split divider drag handler (vertical, between agents and runs) ──
  function onSplitDragStart(e: MouseEvent) {
    e.preventDefault();
    setIsSplitDragging(true);
    const container = splitContainerRef;
    if (!container) return;

    function onMouseMove(e: MouseEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const pct = Math.max(25, Math.min(75, (y / rect.height) * 100));
      setSplitPct(pct);
    }

    function onMouseUp() {
      setIsSplitDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Agent-scoped runs for the bottom split section
  const agentRuns = createMemo(() => {
    const runs = contextualRuns();
    return [...runs].sort((a, b) => {
      const ta = new Date(a.metadata.creationTimestamp).getTime();
      const tb = new Date(b.metadata.creationTimestamp).getTime();
      return tb - ta;
    });
  });

  const agentRunsActive = createMemo(() =>
    agentRuns().filter(r => r.status?.phase === 'Running' || r.status?.phase === 'Pending' || r.status?.phase === 'Queued')
  );

  return (
    <aside
      class={`relative flex flex-col h-full bg-surface border-r border-border overflow-hidden transition-[width,min-width] duration-200 ${props.class || ''}`}
      style={{
        width: isExpanded() ? `${sidebarWidth()}px` : '44px',
        'min-width': isExpanded() ? `${sidebarWidth()}px` : '44px',
      }}
    >
      {/* ── Collapsed strip ── */}
      <Show when={!isExpanded()}>
        <button
          class="flex flex-col items-center gap-3 py-3 w-full h-full hover:bg-surface-hover transition-colors"
          onClick={() => toggleLeftPanel()}
          title="Show sidebar (Ctrl+1)"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </Show>

      {/* ── Expanded panel ── */}
      <Show when={isExpanded()}>
        {/* Header with logo */}
        <div class="flex items-center gap-2 px-3 h-12 border-b border-border flex-shrink-0">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <img src="/logo.png" alt="AgentOps" class="w-6 h-6 rounded-lg flex-shrink-0" />
            <span class="text-[15px] font-semibold text-text truncate tracking-wide leading-tight">
              Agent<span class="text-text-secondary">Ops</span> <span class="text-text-secondary">Console</span>
            </span>
          </div>
          <button
            class="p-1 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text transition-colors flex-shrink-0"
            onClick={() => toggleLeftPanel()}
            title="Collapse sidebar"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Tab switcher */}
        <div class="flex items-center gap-2 px-3 h-10 border-b border-border flex-shrink-0">
          <div class="flex gap-0.5 ml-1">
            <SidebarTabButton tab="agents" current={leftPanelTab()} label="Agents" />
            <SidebarTabButton tab="traces" current={leftPanelTab()} label="Traces" />
          </div>
        </div>

        {/* ── Content area ── */}
        <div class="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ── Traces tab ── */}
          <Show when={leftPanelTab() === 'traces'}>
            <TracesPanel />
          </Show>

          {/* ── Agents tab (split: agents list + agent runs) ── */}
          <Show when={leftPanelTab() === 'agents'}>
          <div ref={splitContainerRef} class="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* ── Top section: Agents list ── */}
            <div class="flex flex-col overflow-hidden min-h-0" style={{ height: `${splitPct()}%` }}>
              <Show
                when={!agentList.loading}
                fallback={
                  <div class="flex items-center justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                }
              >
                <div class="flex-1 overflow-y-auto min-h-0 pb-1">

                  {/* ── 1. Orchestrators (daemons) ── */}
                  <Show when={agentTree().daemons.length > 0}>
                    <div class="section-header section-header--first">
                      <span class="section-label">Orchestrators</span>
                    </div>
                    <div class="flex flex-col gap-0.5 px-2">
                      <For each={agentTree().daemons}>
                        {(agent) => {
                          const isSelected = () => {
                            const sel = selectedAgent();
                            return sel?.namespace === agent.namespace && sel?.name === agent.name;
                          };

                          return (
                            <AgentCard
                              agent={agent}
                              selected={isSelected()}
                              onSelect={() => { clearRunSelection(); selectAgent(agent.namespace, agent.name); }}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>

                  {/* ── 2. Channels (task agents triggered by channels, no daemon parent) ── */}
                  <Show when={agentTree().channelTasks.length > 0}>
                    <div class="section-header">
                      <span class="section-label">Channels</span>
                    </div>
                    <div class="flex flex-col gap-1 px-2">
                      <For each={agentTree().channelTasks}>
                        {(agent) => {
                          const isSelected = () => {
                            const sel = selectedAgent();
                            return sel?.namespace === agent.namespace && sel?.name === agent.name;
                          };
                          const channels = () => getChannelsForAgent(agent.name);

                          return (
                            <div>
                              <AgentCard
                                agent={agent}
                                selected={isSelected()}
                                onSelect={() => { clearRunSelection(); selectAgent(agent.namespace, agent.name); }}
                              />
                              {/* Channel binding pills below the card */}
                              <Show when={channels().length > 0}>
                                <div class="flex flex-wrap gap-1 px-3 pb-1 -mt-0.5">
                                  <For each={channels()}>
                                    {(ch) => (
                                      <span class="sidebar-channel-pill">
                                        <ChannelTypeIcon type={ch.spec.type} />
                                        <span class="truncate">{ch.metadata.name}</span>
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>

                  {/* ── 2. Workers (all task agents with no channel or schedule) ── */}
                  <Show when={agentTree().workers.length > 0}>
                    <div class="section-header">
                      <span class="section-label">Workers</span>
                    </div>
                    <div class="flex flex-col gap-1 px-2">
                      <For each={agentTree().workers}>
                        {(agent) => {
                          const isSelected = () => {
                            const sel = selectedAgent();
                            return sel?.namespace === agent.namespace && sel?.name === agent.name;
                          };

                          return (
                            <AgentCard
                              agent={agent}
                              selected={isSelected()}
                              onSelect={() => { clearRunSelection(); selectAgent(agent.namespace, agent.name); }}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>

                  {/* ── 3. Scheduled (task agents with cron, no daemon/channel) ── */}
                  <Show when={agentTree().scheduledTasks.length > 0}>
                    <div class="section-header">
                      <span class="section-label">Scheduled</span>
                    </div>
                    <div class="flex flex-col gap-1 px-2">
                      <For each={agentTree().scheduledTasks}>
                        {(agent) => {
                          const isSelected = () => {
                            const sel = selectedAgent();
                            return sel?.namespace === agent.namespace && sel?.name === agent.name;
                          };

                          return (
                            <AgentCard
                              agent={agent}
                              selected={isSelected()}
                              onSelect={() => { clearRunSelection(); selectAgent(agent.namespace, agent.name); }}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>

                  {/* Fallback when no agents exist at all */}
                  <Show when={(agentList()?.length ?? 0) === 0}>
                    <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                      <p class="text-xs text-text-muted">No agents found.</p>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            {/* ── Draggable split divider ── */}
            <div
              class={`flex-shrink-0 h-[3px] cursor-row-resize group relative ${
                isSplitDragging() ? 'bg-accent/40' : 'hover:bg-accent/30'
              }`}
              onMouseDown={onSplitDragStart}
            >
              <div class="absolute inset-x-0 -top-1 -bottom-1" />
              <div class="absolute inset-x-0 top-0 h-px bg-border" />
            </div>

            {/* ── Bottom section: Agent runs ── */}
            <div class="flex flex-col overflow-hidden min-h-0" style={{ height: `${100 - splitPct()}%` }}>
              {/* Section header */}
              <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-border flex-shrink-0 bg-surface-2/30">
                <span class="text-[10px] font-medium text-text-muted uppercase tracking-wider">Runs</span>
                <Show when={selectedAgent()}>
                  <span class="text-[10px] text-text-muted/60 font-mono truncate">
                    {selectedAgent()!.name}
                  </span>
                </Show>
                <Show when={agentRunsActive().length > 0}>
                  <span class="ml-auto px-1 py-px text-[9px] font-bold bg-accent text-primary-foreground rounded-full animate-pulse">
                    {agentRunsActive().length}
                  </span>
                </Show>
              </div>

              {/* Runs list */}
              <div class="flex-1 overflow-y-auto min-h-0">
                <Show
                  when={selectedAgent()}
                  fallback={
                    <div class="flex flex-col items-center justify-center py-6 px-4 text-center">
                      <p class="text-[11px] text-text-muted">Select an agent to see runs.</p>
                    </div>
                  }
                >
                  <Show
                    when={agentRuns().length > 0}
                    fallback={
                      <div class="flex flex-col items-center justify-center py-6 px-4 text-center">
                        <p class="text-[11px] text-text-muted">No runs for this agent.</p>
                      </div>
                    }
                  >
                    <div class="run-card-list p-2">
                      <For each={agentRuns()}>
                        {(run) => {
                          const key = () => `${run.metadata.namespace}/${run.metadata.name}`;
                          const isSelected = () => selectedRunKey() === key();
                          const source = () => getRunSource(run);
                          const hasGit = () => !!run.status?.branch || !!run.spec.git;
                          const isRunning = () => run.status?.phase === 'Running';
                          const isFailed = () => run.status?.phase === 'Failed';
                          const forge = () => getResourceForge(run.spec.git?.resourceRef);
                          const repoName = () => getResourceRepoName(run.spec.git?.resourceRef);

                          const cardClass = () => {
                            const classes = ['run-card'];
                            if (isSelected()) classes.push('run-card--selected');
                            if (isRunning()) classes.push('run-card--running');
                            if (isFailed()) classes.push('run-card--failed');
                            return classes.join(' ');
                          };

                          return (
                            <button
                              class={`w-full text-left ${cardClass()}`}
                              onClick={() => {
                                if (isSelected()) {
                                  clearRunSelection();
                                  clearCenterOverlay();
                                } else {
                                  selectRun(run.metadata.namespace, run.metadata.name);
                                  showRunDetail();
                                }
                              }}
                            >
                              {/* Forge watermark */}
                              <Show when={forge()}>
                                <ForgeWatermark forge={forge()!} />
                              </Show>

                              {/* Row 1: Source/forge icon + Git branch tag (or run name) + commits + phase icon */}
                              <div class="flex items-center gap-1.5">
                                <Show
                                  when={hasGit() && forge()}
                                  fallback={<SourceIcon source={source()} />}
                                >
                                  <ForgeIcon forge={forge()!} />
                                </Show>
                                <Show
                                  when={hasGit() && run.status?.branch}
                                  fallback={
                                    <span class="run-card__title truncate flex-1">{run.metadata.name}</span>
                                  }
                                >
                                  <span class={`run-card__branch-tag ${forge() === 'gitlab' ? 'run-card__branch-tag--gitlab' : forge() === 'github' ? 'run-card__branch-tag--github' : ''}`}>
                                    <svg class="run-card__branch-tag-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
                                    </svg>
                                    <span class="run-card__branch-tag-text">
                                      <Show when={repoName()}>
                                        <span class="run-card__branch-tag-repo">{repoName()}</span>
                                      </Show>
                                      <span class="run-card__branch-tag-branch">{run.status!.branch}</span>
                                    </span>
                                  </span>
                                  <span class="flex-1" />
                                </Show>
                                <Show when={run.status?.commits}>
                                  <span class="run-card__commits-inline">{run.status!.commits}</span>
                                </Show>
                                <RunPhaseIcon phase={run.status?.phase} />
                              </div>

                              {/* Row 2: Prompt preview */}
                              <Show when={run.spec.prompt}>
                                <p class="run-card__prompt">{run.spec.prompt}</p>
                              </Show>

                              {/* Row 3: Run name + timestamp */}
                              <div class="run-card__meta">
                                <span class="truncate">{run.metadata.name}</span>
                                <span class="run-card__time">{relativeTime(run.metadata.creationTimestamp)}</span>
                              </div>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
          </Show>
        </div>
        <div class="border-t border-border px-2 py-2 flex-shrink-0">
          <A
            href="/settings"
            class="flex items-center gap-2 px-2.5 py-2 text-sm text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors"
            activeClass="!text-text !bg-surface-hover"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </A>
        </div>

        {/* Resize handle */}
        <div
          class={`sidebar-resize-handle absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 ${isResizing() ? 'active bg-accent/30' : ''}`}
          onMouseDown={onResizeStart}
        />
      </Show>
    </aside>
  );
}

// ── Sub-components ──

/** Small icon for channel type (webhook, gitlab, slack, etc.) */
function ChannelTypeIcon(props: { type: string }) {
  const t = () => props.type?.toLowerCase();

  return (
    <Show
      when={t() === 'gitlab'}
      fallback={
        <Show
          when={t() === 'github'}
          fallback={
            <Show
              when={t() === 'slack'}
              fallback={
                <Show
                  when={t() === 'telegram'}
                  fallback={
                    // Default: lightning bolt for webhook/generic
                    <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
                    </svg>
                  }
                >
                  {/* Telegram */}
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                  </svg>
                </Show>
              }
            >
              {/* Slack */}
              <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z"/>
              </svg>
            </Show>
          }
        >
          {/* GitHub */}
          <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
        </Show>
      }
    >
      {/* GitLab */}
      <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
      </svg>
    </Show>
  );
}

/** Tab button for left sidebar */
function SidebarTabButton(props: { tab: LeftPanelTab; current: LeftPanelTab; label: string; badge?: number }) {
  return (
    <button
      class={`relative px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
        props.current === props.tab
          ? 'bg-surface-hover text-text font-medium'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover/50'
      }`}
      onClick={() => setLeftPanelTab(props.tab)}
    >
      {props.label}
      <Show when={props.badge !== undefined && props.badge! > 0}>
        <span class="ml-1 px-1 py-px text-[9px] font-bold bg-accent text-primary-foreground rounded-full animate-pulse">
          {props.badge}
        </span>
      </Show>
    </button>
  );
}

/** Run source icon (channel, agent delegation, schedule, console, unknown) */
function SourceIcon(props: { source: RunSource }) {
  const title = () => {
    switch (props.source) {
      case 'channel': return 'From channel';
      case 'agent': return 'Agent delegation';
      case 'schedule': return 'Scheduled';
      default: return 'Manual';
    }
  };

  return (
    <span class="flex-shrink-0 w-4 h-4 flex items-center justify-center" title={title()}>
      <Show when={props.source === 'channel'}>
        <svg class="w-3 h-3 text-warning" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
        </svg>
      </Show>
      <Show when={props.source === 'agent'}>
        <svg class="w-3 h-3 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5" />
        </svg>
      </Show>
      <Show when={props.source === 'schedule'}>
        <svg class="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </Show>
      <Show when={props.source === 'unknown'}>
        <svg class="w-3 h-3 text-text-muted/50" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Show>
    </span>
  );
}

/** Forge icon (GitHub/GitLab) shown left of the branch tag */
function ForgeIcon(props: { forge: 'github' | 'gitlab' | 'git' }) {
  return (
    <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
      <Show when={props.forge === 'github'}>
        <svg class="w-[18px] h-[18px] text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'gitlab'}>
        <svg class="w-[18px] h-[18px] text-[#FC6D26]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'git'}>
        <svg class="w-[18px] h-[18px] text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
        </svg>
      </Show>
    </span>
  );
}

/** Subtle forge logo watermark in the bottom-right corner of run cards */
function ForgeWatermark(props: { forge: 'github' | 'gitlab' | 'git' }) {
  return (
    <div class={`run-card__watermark run-card__watermark--${props.forge}`}>
      <Show when={props.forge === 'github'}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'gitlab'}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
        </svg>
      </Show>
      <Show when={props.forge === 'git'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 3v12m0 0a3 3 0 103 3H15a3 3 0 100-3H9m-3 0a3 3 0 01-3-3V6a3 3 0 013-3h0" />
        </svg>
      </Show>
    </div>
  );
}
