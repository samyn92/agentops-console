// View store — tracks layout state for both sidebars.
import { createSignal } from 'solid-js';

export type PanelState = 'collapsed' | 'expanded';

// ── Left panel (agents/sessions) ──

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

// Legacy exports — kept so existing imports don't break.
export type RightPanelState = PanelState;
export type AppView = 'agents' | 'runs';
export const activeView = () => 'agents' as const;
export function setActiveView(_view: AppView) {
  if (_view === 'runs') {
    setRightPanelState('expanded');
  }
}
