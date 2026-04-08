// View store — tracks layout state for both sidebars.
import { createSignal } from 'solid-js';

export type PanelState = 'collapsed' | 'expanded';

// ── Left panel (agents) ──

const LEFT_KEY = 'agentops:leftPanel';

function loadLeftState(): PanelState {
  try {
    const raw = localStorage.getItem(LEFT_KEY);
    if (raw === 'collapsed') return 'collapsed';
  } catch { /* ignore */ }
  return 'expanded';
}

const [leftPanelState, setLeftPanelStateRaw] = createSignal<PanelState>(loadLeftState());

export { leftPanelState };

export function setLeftPanelState(state: PanelState) {
  setLeftPanelStateRaw(state);
  try {
    localStorage.setItem(LEFT_KEY, state);
  } catch { /* ignore */ }
}

export function toggleLeftPanel() {
  const current = leftPanelState();
  setLeftPanelState(current === 'collapsed' ? 'expanded' : 'collapsed');
}

// ── Right panel (runs) ──

const RIGHT_KEY = 'agentops:rightPanel';

function loadRightState(): PanelState {
  try {
    const raw = localStorage.getItem(RIGHT_KEY);
    if (raw === 'expanded') return 'expanded';
  } catch { /* ignore */ }
  return 'collapsed';
}

const [rightPanelState, setRightPanelStateRaw] = createSignal<PanelState>(loadRightState());

export { rightPanelState };

export function setRightPanelState(state: PanelState) {
  setRightPanelStateRaw(state);
  try {
    localStorage.setItem(RIGHT_KEY, state);
  } catch { /* ignore */ }
}

export function toggleRightPanel() {
  const current = rightPanelState();
  setRightPanelState(current === 'collapsed' ? 'expanded' : 'collapsed');
}

// ── Right panel tab (memory vs runs) ──

export type RightPanelTab = 'memory' | 'runs';

const TAB_KEY = 'agentops:rightPanelTab';

function loadTabState(): RightPanelTab {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    if (raw === 'memory' || raw === 'runs') return raw;
  } catch { /* ignore */ }
  return 'memory';
}

const [rightPanelTab, setRightPanelTabRaw] = createSignal<RightPanelTab>(loadTabState());

export { rightPanelTab };

export function setRightPanelTab(tab: RightPanelTab) {
  setRightPanelTabRaw(tab);
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch { /* ignore */ }
}

// Legacy exports — kept so existing imports don't break.
export type RightPanelState = PanelState;
export type AppView = 'agents' | 'runs';
export const activeView = () => 'agents' as const;
export function setActiveView(_view: AppView) {
  if (_view === 'runs') {
    setRightPanelState('expanded');
  }
}
