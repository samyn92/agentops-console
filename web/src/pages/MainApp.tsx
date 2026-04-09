// MainApp — three-panel layout: Left Sidebar (agents) + Center Stage + Right Panel (memory/runs).
// Both sidebars are collapsible to a thin strip with hamburger icons.
// Center content switches based on agent selection and mode:
// - No agent -> EmptyState
// - Daemon agent -> ChatView (conversation stream)
// - Task agent -> TaskAgentView (run timeline with git workspace details)
import { onMount, onCleanup, Show, createMemo } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import { selectedAgent, agentList } from '../stores/agents';
import Sidebar from '../components/layout/Sidebar';
import RightPanel from '../components/layout/RightPanel';
import ChatView from '../components/chat/ChatView';
import TaskAgentView from '../components/agents/TaskAgentView';
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
  // - Daemon agent selected -> ChatView (one conversation per agent)
  // - Task agent selected -> TaskAgentView (run timeline)
  const hasAgent = () => selectedAgent() !== null;

  const isTaskAgent = createMemo(() => {
    const sel = selectedAgent();
    if (!sel) return false;
    const list = agentList();
    const found = list?.find((a) => a.namespace === sel.namespace && a.name === sel.name);
    return found?.mode === 'task';
  });

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
          <Show when={isTaskAgent()} fallback={<ChatView class="flex-1 min-h-0" />}>
            <TaskAgentView class="flex-1 min-h-0" />
          </Show>
        </Show>
      </div>

      {/* ── Right Panel (memory / runs) ── */}
      <RightPanel />
    </div>
  );
}
