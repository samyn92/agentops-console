// MainApp — main application layout with Sidebar + Header + ChatView
import { createSignal, onMount, onCleanup } from 'solid-js';
import { startEventStream, stopEventStream } from '../stores/events';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import MobileDrawer from '../components/layout/MobileDrawer';
import ChatView from '../components/chat/ChatView';

export default function MainApp() {
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  // Start global SSE on mount
  onMount(() => {
    startEventStream();
  });

  onCleanup(() => {
    stopEventStream();
  });

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
        <ChatView class="flex-1 min-h-0" />
      </div>
    </div>
  );
}
