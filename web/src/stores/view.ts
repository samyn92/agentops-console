// View store — tracks which top-level view is active in the main content area.
import { createSignal } from 'solid-js';

export type AppView = 'agents' | 'runs';

const STORAGE_KEY = 'agentops:view';

function loadPersistedView(): AppView {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'runs') return 'runs';
  } catch { /* ignore */ }
  return 'agents';
}

const [activeView, setActiveViewRaw] = createSignal<AppView>(loadPersistedView());

export { activeView };

export function setActiveView(view: AppView) {
  setActiveViewRaw(view);
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch { /* ignore */ }
}
