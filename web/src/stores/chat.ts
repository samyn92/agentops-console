// Chat store — FEP event state machine with per-session state.
// Each session maintains independent messages, streaming state, and interactive
// requests. Switching sessions shows the correct state instantly; background
// sessions continue streaming uninterrupted.
import { createSignal, batch, createEffect } from 'solid-js';
import { streamPrompt, sessions as sessionsAPI } from '../lib/api';
import { selectedAgent } from './agents';
import { currentSessionId, setCurrentSessionId, createSession, onSessionDeleted, notifyPromptCompleted, triggerDelayedSessionRefetch, sessionList } from './sessions';
import type {
  FEPEvent,
  Usage,
  ToolMetadata,
  RuntimeMessage,
  RuntimeMessagePart,
  Session,
} from '../types';
import type {
  ChatMessage,
  MessagePart,
  TextPart,
  ReasoningPart,
  ToolPart,
  StepFinishPart,
} from '../types';

// ── Per-session state ──

interface SessionChatState {
  // Reactive signals (each session owns its own)
  messages: ReturnType<typeof createSignal<ChatMessage[]>>;
  streaming: ReturnType<typeof createSignal<boolean>>;
  currentStep: ReturnType<typeof createSignal<number>>;
  totalUsage: ReturnType<typeof createSignal<Usage | null>>;
  activeModel: ReturnType<typeof createSignal<string | null>>;
  activeText: ReturnType<typeof createSignal<{ id: string; content: string } | null>>;
  activeReasoning: ReturnType<typeof createSignal<{ id: string; content: string } | null>>;
  activeToolInput: ReturnType<typeof createSignal<{ id: string; toolName: string; args: string } | null>>;
  pendingPermission: ReturnType<typeof createSignal<PendingPermissionState | null>>;
  pendingQuestion: ReturnType<typeof createSignal<PendingQuestionState | null>>;
  // Non-reactive
  abortController: AbortController | null;
  loaded: boolean; // whether we've fetched history from runtime
}

interface PendingPermissionState {
  id: string;
  sessionId: string;
  toolName: string;
  input: string;
  description: string;
}

interface PendingQuestionState {
  id: string;
  sessionId: string;
  questions: Array<{
    question: string;
    header: string;
    options?: Array<{ label: string; description: string }>;
    multiple?: boolean;
  }>;
}

// ── Session state registry ──

const sessionStates = new Map<string, SessionChatState>();
// Reactive trigger so SolidJS re-evaluates currentState() when the Map mutates
const [stateVersion, setStateVersion] = createSignal(0);

function getOrCreateState(sessionId: string): SessionChatState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      messages: createSignal<ChatMessage[]>([]),
      streaming: createSignal(false),
      currentStep: createSignal(0),
      totalUsage: createSignal<Usage | null>(null),
      activeModel: createSignal<string | null>(null),
      activeText: createSignal<{ id: string; content: string } | null>(null),
      activeReasoning: createSignal<{ id: string; content: string } | null>(null),
      activeToolInput: createSignal<{ id: string; toolName: string; args: string } | null>(null),
      pendingPermission: createSignal<PendingPermissionState | null>(null),
      pendingQuestion: createSignal<PendingQuestionState | null>(null),
      abortController: null,
      loaded: false,
    };
    sessionStates.set(sessionId, state);
    setStateVersion((v) => v + 1); // notify reactive consumers
  }
  return state;
}

/** Remove a session's state from the registry (e.g. on delete). */
export function removeSessionState(sessionId: string) {
  const state = sessionStates.get(sessionId);
  if (state?.abortController) {
    state.abortController.abort();
  }
  sessionStates.delete(sessionId);
  setStateVersion((v) => v + 1); // notify reactive consumers
}

// Register cleanup callback with sessions store (avoids circular import)
onSessionDeleted(removeSessionState);

// ── Current-session derived accessors ──
// These read from whichever session is currently selected.
// Components bind to these; when currentSessionId changes, they re-render.

function currentState(): SessionChatState | null {
  const id = currentSessionId();
  stateVersion(); // subscribe to Map mutations
  return id ? sessionStates.get(id) ?? null : null;
}

export const messages = () => currentState()?.messages[0]() ?? [];
export const streaming = () => currentState()?.streaming[0]() ?? false;
export const currentStep = () => currentState()?.currentStep[0]() ?? 0;
export const totalUsage = () => currentState()?.totalUsage[0]() ?? null;
export const activeModel = () => currentState()?.activeModel[0]() ?? null;
export const activeText = () => currentState()?.activeText[0]() ?? null;
export const activeReasoning = () => currentState()?.activeReasoning[0]() ?? null;
export const activeToolInput = () => currentState()?.activeToolInput[0]() ?? null;
export const pendingPermission = () => currentState()?.pendingPermission[0]() ?? null;
export const pendingQuestion = () => currentState()?.pendingQuestion[0]() ?? null;

export function setPendingPermission(val: PendingPermissionState | null) {
  const state = currentState();
  if (state) state.pendingPermission[1](val);
}

export function setPendingQuestion(val: PendingQuestionState | null) {
  const state = currentState();
  if (state) state.pendingQuestion[1](val);
}

// ── Streaming sessions (for sidebar indicators) ──

const [streamingSessionIds, setStreamingSessionIds] = createSignal<Set<string>>(new Set());
export { streamingSessionIds };

function markStreaming(sessionId: string, isStreaming: boolean) {
  setStreamingSessionIds((prev) => {
    const next = new Set(prev);
    if (isStreaming) {
      next.add(sessionId);
    } else {
      next.delete(sessionId);
    }
    return next;
  });
}

// ── Load session messages from runtime ──

export async function loadSessionMessages(sessionId: string) {
  const agent = selectedAgent();
  if (!agent) return;

  const state = getOrCreateState(sessionId);
  if (state.loaded) return; // already fetched

  try {
    const runtimeMsgs = await sessionsAPI.messages(agent.namespace, agent.name, sessionId);
    // Guard: if sendMessage already populated messages while we were fetching,
    // don't overwrite them — mark loaded and bail.
    if (state.messages[0]().length > 0) {
      state.loaded = true;
      return;
    }

    // Look up session metadata for timestamps and usage
    const session = sessionList()?.find((s: Session) => s.id === sessionId);
    const createdTs = session?.created_at ? new Date(session.created_at).getTime() : 0;
    const updatedTs = session?.updated_at ? new Date(session.updated_at).getTime() : 0;

    const chatMsgs = mapRuntimeMessages(runtimeMsgs, createdTs, updatedTs);

    // Inject per-turn usage so TokenBadge renders on each assistant turn after
    // a browser refresh. A "turn" = everything from a user message to the next
    // user message (or end). The usage goes on the LAST assistant message of
    // each turn — that's the final text response the user sees.
    const turnUsages = session?.turn_usages;
    if (turnUsages && turnUsages.length > 0) {
      // Identify the last assistant message index for each turn.
      // Turn boundaries are user messages (skip the first one which starts turn 0).
      const turnLastAssistantIdx: number[] = [];
      let lastAssistantIdx = -1;
      for (let i = 0; i < chatMsgs.length; i++) {
        if (chatMsgs[i].role === 'assistant') {
          lastAssistantIdx = i;
        } else if (chatMsgs[i].role === 'user' && lastAssistantIdx >= 0) {
          // This user message starts a new turn — flush the previous turn
          turnLastAssistantIdx.push(lastAssistantIdx);
          lastAssistantIdx = -1;
        }
      }
      // Flush the final turn
      if (lastAssistantIdx >= 0) {
        turnLastAssistantIdx.push(lastAssistantIdx);
      }

      // Inject synthetic step-finish on each turn's last assistant message
      for (let t = 0; t < Math.min(turnLastAssistantIdx.length, turnUsages.length); t++) {
        const msg = chatMsgs[turnLastAssistantIdx[t]];
        if (msg.parts) {
          const tu = turnUsages[t];
          msg.parts.push({
            type: 'step-finish',
            stepNumber: tu.steps || 0,
            usage: {
              input_tokens: tu.usage.input_tokens,
              output_tokens: tu.usage.output_tokens,
              total_tokens: tu.usage.total_tokens,
              reasoning_tokens: tu.usage.reasoning_tokens,
              cache_creation_tokens: tu.usage.cache_creation_tokens,
              cache_read_tokens: tu.usage.cache_read_tokens,
            },
            finishReason: 'stop',
            toolCallCount: 0,
          } as StepFinishPart);
        }
      }
    }

    batch(() => {
      state.messages[1](chatMsgs);
      // Restore usage and model signals from session metadata (for Header display)
      if (session?.total_usage) {
        state.totalUsage[1]({
          input_tokens: session.total_usage.input_tokens,
          output_tokens: session.total_usage.output_tokens,
          total_tokens: session.total_usage.total_tokens,
          reasoning_tokens: session.total_usage.reasoning_tokens,
          cache_creation_tokens: session.total_usage.cache_creation_tokens,
          cache_read_tokens: session.total_usage.cache_read_tokens,
        });
      }
      if (session?.model) {
        state.activeModel[1](session.model);
      }
    });
    state.loaded = true;
  } catch (err) {
    console.error('Failed to load session messages:', err);
    // Still mark loaded to avoid retry loops
    state.loaded = true;
  }
}

// Auto-load messages when session changes
createEffect(() => {
  const sessionId = currentSessionId();
  if (sessionId) {
    loadSessionMessages(sessionId);
  }
});

// ── Message format mapper: RuntimeMessage[] -> ChatMessage[] ──

function mapRuntimeMessages(runtimeMsgs: RuntimeMessage[], createdTs: number, updatedTs: number): ChatMessage[] {
  const chatMsgs: ChatMessage[] = [];

  // We'll distribute timestamps: first user message gets createdAt,
  // last assistant message gets updatedAt. Others interpolate or use 0.
  let firstUserAssigned = false;

  for (const msg of runtimeMsgs) {
    if (msg.role === 'user') {
      // User messages: extract text parts into content string
      const textContent = msg.content
        ?.filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('') ?? '';
      const ts = !firstUserAssigned && createdTs ? createdTs : 0;
      firstUserAssigned = true;
      chatMsgs.push({
        role: 'user',
        content: textContent,
        timestamp: ts,
      });
    } else if (msg.role === 'assistant') {
      // Assistant messages: convert parts to MessagePart[]
      const parts: MessagePart[] = [];
      // Map tool-call parts to track IDs for pairing with tool-results
      const toolCalls = new Map<string, ToolPart>();

      for (const part of msg.content ?? []) {
        switch (part.type) {
          case 'text':
            if (part.text) {
              parts.push({ type: 'text', id: '', content: part.text } as TextPart);
            }
            break;
          case 'reasoning':
            if (part.text) {
              parts.push({ type: 'reasoning', id: '', content: part.text } as ReasoningPart);
            }
            break;
          case 'tool-call': {
            const tp: ToolPart = {
              type: 'tool',
              id: part.tool_call_id ?? '',
              toolName: part.tool_name ?? '',
              input: part.input ?? '',
              output: '',
              isError: false,
              status: 'completed', // historical = completed
            };
            toolCalls.set(tp.id, tp);
            parts.push(tp);
            break;
          }
          // tool-result parts are in separate "tool" role messages; handled below
        }
      }

      chatMsgs.push({ role: 'assistant', parts, timestamp: 0 });
    } else if (msg.role === 'tool') {
      // Tool-result messages: pair with the last assistant message's tool parts
      const lastAssistant = chatMsgs[chatMsgs.length - 1];
      if (lastAssistant?.role === 'assistant' && lastAssistant.parts) {
        for (const part of msg.content ?? []) {
          if (part.type === 'tool-result' && part.tool_call_id) {
            const toolPart = lastAssistant.parts.find(
              (p) => p.type === 'tool' && (p as ToolPart).id === part.tool_call_id,
            ) as ToolPart | undefined;
            if (toolPart) {
              toolPart.output = extractToolOutput(part);
              toolPart.isError = part.output?.type === 'error';
              toolPart.status = part.output?.type === 'error' ? 'error' : 'completed';
            }
          }
        }
      }
    }
  }

  // Assign updatedTs to the last assistant message
  if (updatedTs) {
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      if (chatMsgs[i].role === 'assistant') {
        chatMsgs[i] = { ...chatMsgs[i], timestamp: updatedTs };
        break;
      }
    }
  }

  return chatMsgs;
}

function extractToolOutput(part: RuntimeMessagePart): string {
  if (!part.output) return '';
  switch (part.output.type) {
    case 'text':
      return part.output.text ?? '';
    case 'error':
      return part.output.error ?? '';
    case 'media':
      return part.output.text ?? '[media]';
    default:
      return '';
  }
}

// ── Send message (session-scoped) ──

export async function sendMessage(prompt: string) {
  const agent = selectedAgent();
  if (!agent) return;

  // Ensure we have a session
  let sessionId = currentSessionId();
  if (!sessionId) {
    sessionId = await createSession();
    if (!sessionId) return;
    // Schedule a delayed refetch to catch the AI-generated title.
    // Title generation fires immediately on the runtime (before agent work)
    // but takes ~1-2s to complete.
    triggerDelayedSessionRefetch(2000);
  }

  const state = getOrCreateState(sessionId);
  state.loaded = true; // prevent loadSessionMessages from overwriting our messages
  const [, setMsgs] = state.messages;
  const [, setStr] = state.streaming;
  const [, setStep] = state.currentStep;
  const [, setUsage] = state.totalUsage;
  const [, setATxt] = state.activeText;
  const [, setAReason] = state.activeReasoning;
  const [, setAToolIn] = state.activeToolInput;

  // Add user message + placeholder assistant message
  const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
  const assistantMsg: ChatMessage = { role: 'assistant', parts: [], timestamp: Date.now() };

  batch(() => {
    setMsgs((prev) => [...prev, userMsg, assistantMsg]);
    setStr(true);
    setStep(0);
    setUsage(null);
    setATxt(null);
    setAReason(null);
    setAToolIn(null);
  });

  markStreaming(sessionId, true);
  state.abortController = new AbortController();

  // Capture sessionId for the closure — even if user switches sessions mid-stream,
  // events continue writing to the correct session's state.
  const capturedSessionId = sessionId;
  const capturedState = state;

  try {
    await streamPrompt(
      agent.namespace,
      agent.name,
      capturedSessionId,
      prompt,
      (event) => handleFEPEvent(capturedState, capturedSessionId, event),
      state.abortController.signal,
    );
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      appendPart(capturedState, { type: 'error', error: (err as Error).message });
    }
  } finally {
    batch(() => {
      capturedState.streaming[1](false);
      finalizeActiveText(capturedState);
      finalizeActiveReasoning(capturedState);
      capturedState.activeToolInput[1](null);
    });
    capturedState.abortController = null;
    markStreaming(capturedSessionId, false);
  }
}

/** Abort the stream for the current session. */
export function abortStream() {
  const id = currentSessionId();
  if (!id) return;
  const state = sessionStates.get(id);
  if (state?.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state?.streaming[1](false);
  markStreaming(id, false);
}

/** Steer the current agent mid-execution. */
export async function steerAgent(message: string) {
  const agent = selectedAgent();
  const sessionId = currentSessionId();
  if (!agent || !sessionId) return;

  try {
    await sessionsAPI.steer(agent.namespace, agent.name, sessionId, message);
  } catch (err) {
    console.error('Failed to steer:', err);
  }
}

/** Clear messages for the current session. */
export function clearMessages() {
  const state = currentState();
  if (state) {
    state.messages[1]([]);
    state.totalUsage[1](null);
    state.activeModel[1](null);
    state.loaded = false; // allow re-fetch
  }
}

// ── FEP Event Handler (session-scoped) ──

function handleFEPEvent(state: SessionChatState, sessionId: string, event: FEPEvent) {
  const [, setMsgs] = state.messages;
  const [, setStr] = state.streaming;
  const [, setStep] = state.currentStep;
  const [, setUsage] = state.totalUsage;
  const [, setModel] = state.activeModel;
  const [, setATxt] = state.activeText;
  const [, setAReason] = state.activeReasoning;
  const [, setAToolIn] = state.activeToolInput;
  const [, setPerm] = state.pendingPermission;
  const [, setQ] = state.pendingQuestion;

  switch (event.type) {
    case 'agent_start':
      // Use server timestamp (RFC3339 UTC) for the assistant message if available.
      // This ensures the displayed time reflects when the server started processing,
      // not when the client sent the request.
      if (event.timestamp) {
        const serverTs = new Date(event.timestamp).getTime();
        if (!isNaN(serverTs)) {
          setMsgs((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              updated[updated.length - 1] = { ...lastMsg, timestamp: serverTs };
            }
            return updated;
          });
        }
      }
      break;

    case 'agent_finish':
      // Only update usage/model here — streaming state is handled in the
      // `finally` block of sendMessage to avoid double state transitions.
      batch(() => {
        setUsage(event.total_usage);
        setModel(event.model || null);
      });
      // Refetch session list to pick up AI-generated title
      notifyPromptCompleted();
      break;

    case 'agent_error':
      appendPart(state, { type: 'error', error: event.error || 'Unknown error' });
      // Streaming state is handled in the `finally` block of sendMessage.
      notifyPromptCompleted();
      break;

    case 'step_start':
      // Just update the step counter signal — don't append a visual part.
      // This eliminates a redundant array mutation + re-render per step.
      setStep(event.step_number || 0);
      break;

    case 'step_finish':
      // Only append a visual part when there's usage data worth showing.
      if (event.usage && event.usage.total_tokens > 0) {
        appendPart(state, {
          type: 'step-finish',
          stepNumber: event.step_number || 0,
          usage: event.usage,
          finishReason: event.finish_reason || 'unknown',
          toolCallCount: event.tool_call_count || 0,
        });
      }
      break;

    case 'text_start':
      setATxt({ id: event.id || '', content: '' });
      break;

    case 'text_delta':
      setATxt((prev) =>
        prev ? { ...prev, content: prev.content + (event.delta || '') } : null,
      );
      break;

    case 'text_end':
      finalizeActiveText(state);
      break;

    case 'reasoning_start':
      setAReason({ id: event.id || '', content: '' });
      break;

    case 'reasoning_delta':
      setAReason((prev) =>
        prev ? { ...prev, content: prev.content + (event.delta || '') } : null,
      );
      break;

    case 'reasoning_end':
      finalizeActiveReasoning(state);
      break;

    case 'tool_input_start':
      setAToolIn({ id: event.id || '', toolName: event.tool_name || '', args: '' });
      break;

    case 'tool_input_delta':
      setAToolIn((prev) =>
        prev ? { ...prev, args: prev.args + (event.delta || '') } : null,
      );
      break;

    case 'tool_input_end':
      setAToolIn(null);
      break;

    case 'tool_call':
      appendPart(state, {
        type: 'tool',
        id: event.id || '',
        toolName: event.tool_name || '',
        input: event.input || '',
        output: '',
        isError: false,
        status: 'running',
      });
      break;

    case 'tool_result': {
      const toolId = event.id || '';
      let metadata: ToolMetadata | undefined;
      if (event.metadata) {
        try {
          metadata = JSON.parse(event.metadata) as ToolMetadata;
        } catch { /* skip */ }
      }
      setMsgs((prev) => {
        const updated = [...prev];
        const lastAssistant = updated[updated.length - 1];
        if (lastAssistant?.role === 'assistant' && lastAssistant.parts) {
          updated[updated.length - 1] = {
            ...lastAssistant,
            parts: lastAssistant.parts.map((p) => {
              if (p.type === 'tool' && (p as ToolPart).id === toolId) {
                return {
                  ...p,
                  output: event.output || '',
                  isError: event.is_error || false,
                  metadata,
                  status: event.is_error ? 'error' : 'completed',
                } as ToolPart;
              }
              return p;
            }),
          };
        }
        return updated;
      });
      break;
    }

    case 'permission_asked':
      setPerm({
        id: event.id || '',
        sessionId: event.session_id || '',
        toolName: event.tool_name || '',
        input: event.input || '',
        description: event.description || '',
      });
      break;

    case 'question_asked':
      setQ({
        id: event.id || '',
        sessionId: event.session_id || '',
        questions: (event.questions as any) || [],
      });
      break;

    case 'source':
      appendPart(state, {
        type: 'source',
        id: event.id || '',
        sourceType: event.source_type || 'url',
        url: event.url || '',
        title: event.title || '',
      });
      break;

    case 'session_idle':
      setStr(false);
      markStreaming(sessionId, false);
      break;
  }
}

// ── Helpers ──

function appendPart(state: SessionChatState, part: MessagePart) {
  state.messages[1]((prev) => {
    const updated = [...prev];
    const lastMsg = updated[updated.length - 1];
    if (lastMsg?.role === 'assistant') {
      updated[updated.length - 1] = {
        ...lastMsg,
        parts: [...(lastMsg.parts || []), part],
      };
    }
    return updated;
  });
}

function finalizeActiveText(state: SessionChatState) {
  const text = state.activeText[0]();
  if (text && text.content) {
    // Batch the appendPart + signal clear to coalesce into a single reactive update
    batch(() => {
      appendPart(state, { type: 'text', id: text.id, content: text.content } as TextPart);
      state.activeText[1](null);
    });
  } else {
    state.activeText[1](null);
  }
}

function finalizeActiveReasoning(state: SessionChatState) {
  const reasoning = state.activeReasoning[0]();
  if (reasoning && reasoning.content) {
    batch(() => {
      appendPart(state, { type: 'reasoning', id: reasoning.id, content: reasoning.content } as ReasoningPart);
      state.activeReasoning[1](null);
    });
  } else {
    state.activeReasoning[1](null);
  }
}
