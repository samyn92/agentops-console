// MainApp — single-shell layout with Sidebar + Header + content area.
// Content switches between Agent views (detail/chat) and Runs based on view + session state.
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import { selectedAgent } from '../stores/agents';
import { currentSessionId, draftMode } from '../stores/sessions';
import { activeView } from '../stores/view';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import MobileDrawer from '../components/layout/MobileDrawer';
import ChatView from '../components/chat/ChatView';
import AgentDetail from '../components/agents/AgentDetail';
import RunList from '../components/runs/RunList';
import RunDetail from '../components/runs/RunDetail';
import EmptyState from '../components/shared/EmptyState';

export default function MainApp() {
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [selectedRun, setSelectedRun] = createSignal<{ ns: string; name: string } | null>(null);

  // Start global SSE on mount
  onMount(() => {
    startEventStream();
  });

  onCleanup(() => {
    stopEventStream();
  });

  // Agent view logic:
  // - No agent selected → EmptyState
  // - Agent selected + session or draft → ChatView
  // - Agent selected, no session, no draft → AgentDetail
  const showChat = () => currentSessionId() !== null || draftMode();
  const showAgentDetail = () => selectedAgent() !== null && !showChat();
  const showEmpty = () => selectedAgent() === null;

  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* Desktop sidebar */}
      <div class="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <div class="md:hidden">
        <MobileDrawer
          open={drawerOpen()}
          onClose={() => setDrawerOpen(false)}
        >
          <Sidebar class="w-full h-full" />
        </MobileDrawer>
      </div>

      {/* Main content area */}
      <div class="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setDrawerOpen(true)} />

        {/* ── Agents view ── */}
        <Show when={activeView() === 'agents'}>
          <Show when={showEmpty()}>
            <div class="flex-1 flex items-center justify-center min-h-0">
              <EmptyState
                title="Select an Agent"
                description="Choose an agent from the sidebar to get started."
              />
            </div>
          </Show>

          <Show when={showAgentDetail()}>
            <main class="flex-1 overflow-y-auto min-h-0">
              <AgentDetail />
            </main>
          </Show>

          <Show when={showChat()}>
            <ChatView class="flex-1 min-h-0" />
          </Show>
        </Show>

        {/* ── Runs view ── */}
        <Show when={activeView() === 'runs'}>
          <main class="flex-1 overflow-hidden flex min-h-0">
            {/* Run list */}
            <div class="w-[360px] min-w-[300px] border-r border-border overflow-y-auto">
              <RunList onSelect={(ns, name) => setSelectedRun({ ns, name })} />
            </div>

            {/* Run detail */}
            <div class="flex-1 overflow-y-auto">
              <Show
                when={selectedRun()}
                fallback={
                  <div class="flex items-center justify-center h-full text-sm text-text-muted">
                    Select a run to view details
                  </div>
                }
              >
                {(run) => (
                  <RunDetail namespace={run().ns} name={run().name} />
                )}
              </Show>
            </div>
          </main>
        </Show>
      </div>
    </div>
  );
}
