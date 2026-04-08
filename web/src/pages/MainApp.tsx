// MainApp — three-panel layout: Left Sidebar (agents/sessions) + Center Stage + Right Panel (runs).
// Both sidebars are collapsible to a thin strip with hamburger icons.
// Center content switches between EmptyState / AgentDetail / ChatView based on selection state.
import { onMount, onCleanup, Show } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import { selectedAgent } from '../stores/agents';
import { currentSessionId, draftMode } from '../stores/sessions';
import Sidebar from '../components/layout/Sidebar';
import RunsPanel from '../components/layout/RunsPanel';
import ChatView from '../components/chat/ChatView';
import AgentDetail from '../components/agents/AgentDetail';
import EmptyState from '../components/shared/EmptyState';

export default function MainApp() {
  // Start global SSE on mount
  onMount(() => {
    startEventStream();
  });

  onCleanup(() => {
    stopEventStream();
  });

  // Content routing:
  // - No agent selected → EmptyState
  // - Agent selected + session or draft → ChatView
  // - Agent selected, no session, no draft → AgentDetail
  const showChat = () => currentSessionId() !== null || draftMode();
  const showAgentDetail = () => selectedAgent() !== null && !showChat();
  const showEmpty = () => selectedAgent() === null;

  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* ── Left Sidebar (agents + sessions) ── */}
      <Sidebar />

      {/* ── Center Stage ── */}
      <div class="flex-1 flex flex-col min-w-0">
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
      </div>

      {/* ── Right Panel (runs) ── */}
      <RunsPanel />
    </div>
  );
}
