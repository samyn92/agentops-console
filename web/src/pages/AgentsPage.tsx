// AgentsPage — agent management overview
import { createSignal, Show } from 'solid-js';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import AgentDetail from '../components/agents/AgentDetail';
import { selectedAgent } from '../stores/agents';
import EmptyState from '../components/shared/EmptyState';

export default function AgentsPage() {
  return (
    <div class="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div class="flex flex-col flex-1 min-w-0">
        <Header />
        <main class="flex-1 overflow-y-auto">
          <Show
            when={selectedAgent()}
            fallback={
              <div class="flex items-center justify-center h-full">
                <EmptyState
                  title="Select an Agent"
                  description="Choose an agent from the sidebar to view its configuration and details."
                />
              </div>
            }
          >
            <AgentDetail />
          </Show>
        </main>
      </div>
    </div>
  );
}
