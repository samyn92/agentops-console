// Session store — manages sessions for the currently selected agent.
import { createSignal, createResource, createEffect } from 'solid-js';
import { sessions as sessionsAPI } from '../lib/api';
import { selectedAgent } from './agents';
import type { Session } from '../types';

// ── State ──

const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null);
const [draftMode, setDraftMode] = createSignal(false);
const [refetchTrigger, setRefetchTrigger] = createSignal(0);

// Fetch sessions when selected agent or trigger changes
const [sessionList, { refetch: refetchSessions }] = createResource(
  () => {
    const agent = selectedAgent();
    const trigger = refetchTrigger();
    return agent ? { ...agent, trigger } : null;
  },
  async (params) => {
    if (!params) return [];
    try {
      return await sessionsAPI.list(params.namespace, params.name);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      return [];
    }
  },
);

// Clear current session when agent changes
createEffect(() => {
  selectedAgent(); // track
  setCurrentSessionId(null);
});

// ── Public API ──

export { sessionList, currentSessionId, setCurrentSessionId, refetchSessions, draftMode, setDraftMode };

/** Start a fresh chat — no session created yet, just show the empty composer. */
export function startNewChat() {
  setCurrentSessionId(null);
  setDraftMode(true);
}

/** Select an existing session (clears draft mode). */
export function selectSession(id: string) {
  setCurrentSessionId(id);
  setDraftMode(false);
}

/** Create a new session for the selected agent. */
export async function createSession(title?: string): Promise<string | null> {
  const agent = selectedAgent();
  if (!agent) return null;

  try {
    const result = await sessionsAPI.create(agent.namespace, agent.name, title);
    setCurrentSessionId(result.id);
    setDraftMode(false);
    // Don't refetch yet — session has no title, sidebar filters it out
    return result.id;
  } catch (err) {
    console.error('Failed to create session:', err);
    return null;
  }
}

/** Delete a session. */
export async function deleteSession(id: string): Promise<boolean> {
  const agent = selectedAgent();
  if (!agent) return false;

  try {
    await sessionsAPI.delete(agent.namespace, agent.name, id);
    // Notify chat store via callback (avoids circular import)
    onSessionDeletedCallback?.(id);
    setRefetchTrigger((n) => n + 1);
    if (currentSessionId() === id) {
      setCurrentSessionId(null);
    }
    return true;
  } catch (err) {
    console.error('Failed to delete session:', err);
    return false;
  }
}

// ── Delete callback (set by chat store to avoid circular import) ──

type SessionDeletedCallback = (id: string) => void;
let onSessionDeletedCallback: SessionDeletedCallback | null = null;

export function onSessionDeleted(cb: SessionDeletedCallback) {
  onSessionDeletedCallback = cb;
}

/** Notify that a prompt completed — triggers session list refetch.
 *  The initial refetch picks up session metadata. A delayed refetch (3s)
 *  catches the AI-generated title from the runtime's background goroutine. */
export function notifyPromptCompleted() {
  // Delayed refetch to catch AI-generated title
  setTimeout(() => setRefetchTrigger((n) => n + 1), 3000);
}

/** Get the current session object. */
export function currentSession(): Session | undefined {
  const id = currentSessionId();
  if (!id) return undefined;
  return sessionList()?.find((s) => s.id === id);
}
