// MainApp — three-panel layout: Left Sidebar (agents) + Center Stage + Right Panel (memory/runs).
// Both sidebars are collapsible to a thin strip with hamburger icons.
// Center content switches between EmptyState / ChatView based on agent selection.
import { onMount, onCleanup, Show } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import { selectedAgent } from '../stores/agents';
import Sidebar from '../components/layout/Sidebar';
import RightPanel from '../components/layout/RightPanel';
import ChatView from '../components/chat/ChatView';
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
  // - No agent selected -> EmptyState
  // - Agent selected -> ChatView (one conversation per agent)
  const hasAgent = () => selectedAgent() !== null;

  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* ── Left Sidebar (agents) ── */}
      <Sidebar />

      {/* ── Center Stage ── */}
      <div class="flex-1 flex flex-col min-w-0">
        <Show when={!hasAgent()}>
          <div class="flex-1 flex items-center justify-center min-h-0">
            <EmptyState
              title="Select an Agent"
              description="Choose an agent from the sidebar to get started."
            />
          </div>
        </Show>

        <Show when={hasAgent()}>
          <ChatView class="flex-1 min-h-0" />
        </Show>
      </div>

      {/* ── Right Panel (memory / runs) ── */}
      <RightPanel />
    </div>
  );
}
