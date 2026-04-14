// OrchestratorDetailView — center panel for daemon (orchestrator) agents.
// Three tabs:
//   1. Chat — the conversation stream
//   2. Ops  — fleet overview, delegation tree, delegation history
//   3. Agent — unified metadata panel (discovery, delegation, memory, config, tools, etc.)
import { Show, createSignal, createMemo } from 'solid-js';
import { Tabs } from '@ark-ui/solid/tabs';
import { selectedAgent, getAgentStatus } from '../../stores/agents';
import { getRunsDelegatedBy } from '../../stores/runs';
import { phaseVariant } from '../../lib/format';
import ChatView from '../chat/ChatView';
import OpsPanel from './OpsPanel';
import AgentPanel from './AgentPanel';
import Badge from '../shared/Badge';

interface OrchestratorDetailViewProps {
  class?: string;
}

export type OrchestratorTab = 'chat' | 'ops' | 'agent';

// Right-panel pill tab style
const TAB_CLASS = "relative px-2.5 py-1 text-[11px] rounded-lg transition-colors data-[selected]:bg-surface-hover data-[selected]:text-text data-[selected]:font-medium text-text-muted hover:text-text-secondary hover:bg-surface-hover/50";

export default function OrchestratorDetailView(props: OrchestratorDetailViewProps) {
  const [activeTab, setActiveTab] = createSignal<OrchestratorTab>('chat');

  const agent = () => selectedAgent();
  const agentName = () => agent()?.name ?? '';

  const agentStatus = () => {
    const a = agent();
    if (!a) return { phase: '', isOnline: false, model: '', image: '' };
    return getAgentStatus(a.namespace, a.name);
  };

  // Active delegation count for badge on Ops tab
  const activeDelegatedCount = createMemo(() =>
    getRunsDelegatedBy(agentName()).filter((r) => {
      const phase = r.status?.phase;
      return phase === 'Running' || phase === 'Pending' || phase === 'Queued';
    }).length
  );

  return (
    <div class={`flex flex-col h-full ${props.class || ''}`}>
      <Tabs.Root
        value={activeTab()}
        onValueChange={(details) => setActiveTab(details.value as OrchestratorTab)}
        class="flex flex-col h-full"
      >
        {/* Tab bar */}
        <div class="flex items-center gap-3 h-12 border-b border-border flex-shrink-0 px-4">
          {/* Agent name + status badge */}
          <span class="text-sm font-semibold text-text truncate">{agentName()}</span>
          <Show when={agentStatus().phase}>
            <Badge variant={phaseVariant(agentStatus().phase)} dot>
              {agentStatus().phase}
            </Badge>
          </Show>

          {/* Spacer pushes tabs to the right */}
          <span class="flex-1" />

          {/* Tabs (right-aligned) */}
          <Tabs.List class="flex gap-0.5">
            <Tabs.Trigger value="chat" class={TAB_CLASS}>
              Chat
            </Tabs.Trigger>
            <Tabs.Trigger value="ops" class={`${TAB_CLASS} inline-flex items-center gap-1`}>
              Ops
              <Show when={activeDelegatedCount() > 0}>
                <span class="px-1 py-px text-[9px] font-bold bg-accent text-primary-foreground rounded-full animate-pulse">
                  {activeDelegatedCount()}
                </span>
              </Show>
            </Tabs.Trigger>
            <Tabs.Trigger value="agent" class={TAB_CLASS}>
              Agent
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="chat" class="flex-1 min-h-0 flex flex-col">
          <ChatView class="flex-1 min-h-0" />
        </Tabs.Content>

        <Tabs.Content value="ops" class="flex-1 min-h-0 overflow-hidden">
          <OpsPanel />
        </Tabs.Content>

        <Tabs.Content value="agent" class="flex-1 min-h-0 overflow-hidden">
          <AgentPanel />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
