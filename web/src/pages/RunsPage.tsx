// RunsPage — AgentRun list and detail view
import { createSignal, Show } from 'solid-js';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import RunList from '../components/runs/RunList';
import RunDetail from '../components/runs/RunDetail';

export default function RunsPage() {
  const [selectedRun, setSelectedRun] = createSignal<{ ns: string; name: string } | null>(null);

  return (
    <div class="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div class="flex flex-col flex-1 min-w-0">
        <Header />
        <main class="flex-1 overflow-hidden flex">
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
      </div>
    </div>
  );
}
