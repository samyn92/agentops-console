// Keyboard shortcuts — global hotkeys for the console
import { onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { agentList, selectAgent, selectedAgent } from '../stores/agents';
import { startNewChat } from '../stores/sessions';

export interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

/**
 * Register global keyboard shortcuts.
 * Call this once from your root component (e.g. App or MainApp).
 * Returns a cleanup function.
 */
export function registerKeyboardShortcuts(navigate: ReturnType<typeof useNavigate>) {
  const shortcuts: Shortcut[] = [
    {
      key: 'k',
      meta: true,
      description: 'Cycle to next agent',
      action: () => {
        const agents = agentList();
        if (!agents || agents.length === 0) return;
        const current = selectedAgent();
        if (!current) {
          selectAgent(agents[0].namespace, agents[0].name);
          return;
        }
        const idx = agents.findIndex(
          (a) => a.namespace === current.namespace && a.name === current.name,
        );
        const next = agents[(idx + 1) % agents.length];
        selectAgent(next.namespace, next.name);
      },
    },
    {
      key: 'n',
      meta: true,
      description: 'New chat',
      action: () => {
        startNewChat();
      },
    },
    {
      key: '1',
      meta: true,
      description: 'Go to Chat',
      action: () => navigate('/'),
    },
    {
      key: '2',
      meta: true,
      description: 'Go to Agents',
      action: () => navigate('/agents'),
    },
    {
      key: '3',
      meta: true,
      description: 'Go to Runs',
      action: () => navigate('/runs'),
    },
    {
      key: '4',
      meta: true,
      description: 'Go to Channels',
      action: () => navigate('/channels'),
    },
    {
      key: '5',
      meta: true,
      description: 'Go to MCP Servers',
      action: () => navigate('/mcpservers'),
    },
    {
      key: ',',
      meta: true,
      description: 'Go to Settings',
      action: () => navigate('/settings'),
    },
  ];

  function handleKeyDown(e: KeyboardEvent) {
    // Don't capture shortcuts when typing in inputs/textareas
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Allow Meta+N and Meta+K even in inputs
      const isMeta = e.metaKey || e.ctrlKey;
      if (!(isMeta && (e.key === 'k' || e.key === 'n'))) return;
    }

    for (const shortcut of shortcuts) {
      const metaMatch = shortcut.meta
        ? e.metaKey || e.ctrlKey
        : !(e.metaKey || e.ctrlKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;

      if (e.key === shortcut.key && metaMatch && shiftMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }

  document.addEventListener('keydown', handleKeyDown);

  return () => document.removeEventListener('keydown', handleKeyDown);
}

/** Returns a formatted list of all available shortcuts (for display in settings/help) */
export function getShortcutList(): Array<{ keys: string; description: string }> {
  const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
  const mod = isMac ? '\u2318' : 'Ctrl+';

  return [
    { keys: `${mod}K`, description: 'Cycle to next agent' },
    { keys: `${mod}N`, description: 'New chat' },
    { keys: `${mod}1`, description: 'Go to Chat' },
    { keys: `${mod}2`, description: 'Go to Agents' },
    { keys: `${mod}3`, description: 'Go to Runs' },
    { keys: `${mod}4`, description: 'Go to Channels' },
    { keys: `${mod}5`, description: 'Go to MCP Servers' },
    { keys: `${mod},`, description: 'Go to Settings' },
    { keys: 'Enter', description: 'Send message' },
    { keys: 'Shift+Enter', description: 'New line' },
    { keys: 'Esc', description: 'Stop generation / Cancel' },
  ];
}
