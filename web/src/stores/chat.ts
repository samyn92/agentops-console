// Chat store — FEP event state machine with per-agent state.
// Each agent maintains independent messages, streaming state, and interactive
// requests. One conversation per agent — no sessions.
import { createSignal, batch, createEffect, onCleanup } from 'solid-js';
import { streamPrompt, conversation as conversationAPI } from '../lib/api';
import { selectedAgent, refreshAgentHealth } from './agents';
import { getSelectedContext, clearContextItems } from './resources';
import type {
  FEPEvent,
  Usage,
  ContextBudget,
  ToolMetadata,
  RuntimeMessage,
  RuntimeMessagePart,
  DelegationRunCompletedEvent,
  DelegationAllCompletedEvent,
  DelegationTimeoutEvent,
} from '../types';
import type {
  ChatMessage,
  MessagePart,
  TextPart,
  ReasoningPart,
  ToolPart,
  StepFinishPart,
} from '../types';

// ── Per-agent state ──

interface AgentChatState {
  // Reactive signals (each agent owns its own)
  messages: ReturnType<typeof createSignal<ChatMessage[]>>;
  streaming: ReturnType<typeof createSignal<boolean>>;
  currentStep: ReturnType<typeof createSignal<number>>;
  totalUsage: ReturnType<typeof createSignal<Usage | null>>;
  lastStepUsage: ReturnType<typeof createSignal<Usage | null>>;
  activeModel: ReturnType<typeof createSignal<string | null>>;
  contextBudget: ReturnType<typeof createSignal<ContextBudget | null>>;
  activeText: ReturnType<typeof createSignal<{ id: string; content: string } | null>>;
  activeReasoning: ReturnType<typeof createSignal<{ id: string; content: string } | null>>;
  activeToolInput: ReturnType<typeof createSignal<{ id: string; toolName: string; args: string } | null>>;
  pendingPermission: ReturnType<typeof createSignal<PendingPermissionState | null>>;
  pendingQuestion: ReturnType<typeof createSignal<PendingQuestionState | null>>;
  lastTraceID: ReturnType<typeof createSignal<string | null>>;
  // Non-reactive
  abortController: AbortController | null;
}

interface PendingPermissionState {
  id: string;
  toolName: string;
  input: string;
  description: string;
}

interface PendingQuestionState {
  id: string;
  questions: Array<{
    question: string;
    header: string;
    options?: Array<{ label: string; description: string }>;
    multiple?: boolean;
  }>;
}

// ── Agent state registry ──

const agentStates = new Map<string, AgentChatState>();
// Reactive trigger so SolidJS re-evaluates currentState() when the Map mutates
const [stateVersion, setStateVersion] = createSignal(0);

function agentKey(ns: string, name: string): string {
  return `${ns}/${name}`;
}

function getOrCreateState(key: string): AgentChatState {
  let state = agentStates.get(key);
  if (!state) {
    state = {
      messages: createSignal<ChatMessage[]>([]),
      streaming: createSignal(false),
      currentStep: createSignal(0),
      totalUsage: createSignal<Usage | null>(null),
      lastStepUsage: createSignal<Usage | null>(null),
      activeModel: createSignal<string | null>(null),
      contextBudget: createSignal<ContextBudget | null>(null),
      activeText: createSignal<{ id: string; content: string } | null>(null),
      activeReasoning: createSignal<{ id: string; content: string } | null>(null),
      activeToolInput: createSignal<{ id: string; toolName: string; args: string } | null>(null),
      pendingPermission: createSignal<PendingPermissionState | null>(null),
      pendingQuestion: createSignal<PendingQuestionState | null>(null),
      lastTraceID: createSignal<string | null>(null),
      abortController: null,
    };
    agentStates.set(key, state);
    setStateVersion((v) => v + 1); // notify reactive consumers
  }
  return state;
}

// ── Current-agent derived accessors ──
// These read from whichever agent is currently selected.
// Components bind to these; when selectedAgent changes, they re-render.

function currentState(): AgentChatState | null {
  const agent = selectedAgent();
  stateVersion(); // subscribe to Map mutations
  if (!agent) return null;
  return agentStates.get(agentKey(agent.namespace, agent.name)) ?? null;
}

export const messages = () => currentState()?.messages[0]() ?? [];
export const streaming = () => currentState()?.streaming[0]() ?? false;
export const currentStep = () => currentState()?.currentStep[0]() ?? 0;
export const totalUsage = () => currentState()?.totalUsage[0]() ?? null;
export const lastStepUsage = () => currentState()?.lastStepUsage[0]() ?? null;
export const activeModel = () => currentState()?.activeModel[0]() ?? null;
export const contextBudget = () => currentState()?.contextBudget[0]() ?? null;
export const activeText = () => currentState()?.activeText[0]() ?? null;
export const activeReasoning = () => currentState()?.activeReasoning[0]() ?? null;
export const activeToolInput = () => currentState()?.activeToolInput[0]() ?? null;
export const pendingPermission = () => currentState()?.pendingPermission[0]() ?? null;
export const pendingQuestion = () => currentState()?.pendingQuestion[0]() ?? null;
export const lastTraceID = () => currentState()?.lastTraceID[0]() ?? null;

export function setPendingPermission(val: PendingPermissionState | null) {
  const state = currentState();
  if (state) state.pendingPermission[1](val);
}

export function setPendingQuestion(val: PendingQuestionState | null) {
  const state = currentState();
  if (state) state.pendingQuestion[1](val);
}

// ── Agent change: hydrate chat from working memory ──

createEffect(() => {
  const agent = selectedAgent();
  if (!agent) return;

  // Hydrate chat from working memory (if local chat is empty)
  hydrateFromWorkingMemory(agent.namespace, agent.name);
});

// ── Streaming agents (for sidebar indicators) ──

const [streamingAgentKeys, setStreamingAgentKeys] = createSignal<Set<string>>(new Set());
export { streamingAgentKeys };

function markStreaming(key: string, isStreaming: boolean) {
  setStreamingAgentKeys((prev) => {
    const next = new Set(prev);
    if (isStreaming) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return next;
  });
}

// ── Send message (agent-scoped) ──

export async function sendMessage(prompt: string) {
  const agent = selectedAgent();
  if (!agent) return;

  // Capture selected resource context before clearing (per-turn injection)
  const context = getSelectedContext();
  if (context.length > 0) {
    clearContextItems(); // clear after capturing
  }

  const key = agentKey(agent.namespace, agent.name);
  const state = getOrCreateState(key);
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

  markStreaming(key, true);
  state.abortController = new AbortController();

  // Capture for the closure — even if user switches agents mid-stream,
  // events continue writing to the correct agent's state.
  const capturedKey = key;
  const capturedState = state;

  try {
    await streamPrompt(
      agent.namespace,
      agent.name,
      prompt,
      (event) => handleFEPEvent(capturedState, capturedKey, event),
      state.abortController.signal,
      context.length > 0 ? context : undefined,
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
    markStreaming(capturedKey, false);
    // Refresh agent health after stream completes (updates context usage)
    refreshAgentHealth();
  }
}

/** Abort the stream for the current agent. */
export function abortStream() {
  const agent = selectedAgent();
  if (!agent) return;
  const key = agentKey(agent.namespace, agent.name);
  const state = agentStates.get(key);
  if (state?.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state?.streaming[1](false);
  markStreaming(key, false);
}

/** Steer the current agent mid-execution. */
export async function steerAgent(message: string) {
  const agent = selectedAgent();
  if (!agent) return;

  try {
    await conversationAPI.steer(agent.namespace, agent.name, message);
  } catch (err) {
    console.error('Failed to steer:', err);
  }
}

// ── FEP Event Handler (agent-scoped) ──

function handleFEPEvent(state: AgentChatState, key: string, event: FEPEvent) {
  const [, setMsgs] = state.messages;
  const [, setStr] = state.streaming;
  const [, setStep] = state.currentStep;
  const [, setUsage] = state.totalUsage;
  const [, setLastStep] = state.lastStepUsage;
  const [, setModel] = state.activeModel;
  const [, setBudget] = state.contextBudget;
  const [, setATxt] = state.activeText;
  const [, setAReason] = state.activeReasoning;
  const [, setAToolIn] = state.activeToolInput;
  const [, setPerm] = state.pendingPermission;
  const [, setQ] = state.pendingQuestion;
  const [, setTraceID] = state.lastTraceID;

  switch (event.type) {
    case 'agent_start':
      // Capture trace_id for the Traces panel / Run detail linking
      if (event.trace_id) {
        setTraceID(event.trace_id);
      }
      // Capture context budget snapshot for the UI gauge
      if (event.context_budget) {
        setBudget(event.context_budget);
      }
      // Use server timestamp (RFC3339 UTC) for the assistant message if available.
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
      batch(() => {
        setUsage(event.total_usage);
        setModel(event.model || null);
      });
      break;

    case 'agent_error':
      appendPart(state, { type: 'error', error: event.error || 'Unknown error' });
      break;

    case 'step_start': {
      const stepNum = event.step_number || 0;
      setStep(stepNum);

      // On step > 0, create a new assistant message so each step gets its own
      // bubble + TokenBadge.
      if (stepNum > 0) {
        batch(() => {
          finalizeActiveText(state);
          finalizeActiveReasoning(state);
          state.activeToolInput[1](null);
          setMsgs((prev) => [
            ...prev,
            { role: 'assistant' as const, parts: [], timestamp: Date.now() },
          ]);
        });
      }
      break;
    }

    case 'step_finish':
      if (event.usage && event.usage.total_tokens > 0) {
        setLastStep(event.usage);
        appendPart(state, {
          type: 'step-finish',
          stepNumber: event.step_number || 0,
          usage: event.usage,
          finishReason: event.finish_reason || 'unknown',
          toolCallCount: event.tool_call_count || 0,
        });
      }
      // Update context budget with actual token data
      if (event.context_budget) {
        setBudget(event.context_budget);
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
        for (let idx = updated.length - 1; idx >= 0; idx--) {
          const m = updated[idx];
          if (m.role !== 'assistant' || !m.parts) continue;
          const hasMatch = m.parts.some(
            (p) => p.type === 'tool' && (p as ToolPart).id === toolId,
          );
          if (hasMatch) {
            updated[idx] = {
              ...m,
              parts: m.parts.map((p) => {
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
            break;
          }
        }
        return updated;
      });
      break;
    }

    case 'permission_asked':
      setPerm({
        id: event.id || '',
        toolName: event.tool_name || '',
        input: event.input || '',
        description: event.description || '',
      });
      break;

    case 'question_asked':
      setQ({
        id: event.id || '',
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
      markStreaming(key, false);
      break;

    // ── Delegation events (update existing run_agents tool part in-place) ──

    case 'delegation.fan_out':
      // The fan-out event arrives after the run_agents tool_result. We could use
      // this to confirm the group was registered, but the tool_result metadata
      // already has all the info. Store the event timestamp for latency tracking.
      break;

    case 'delegation.run_completed':
      updateDelegationMeta(state, event as DelegationRunCompletedEvent);
      break;

    case 'delegation.all_completed':
      updateDelegationAllCompleted(state, event as DelegationAllCompletedEvent);
      break;

    case 'delegation.timeout':
      updateDelegationTimeout(state, event as DelegationTimeoutEvent);
      break;
  }
}

// ── Helpers ──

function appendPart(state: AgentChatState, part: MessagePart) {
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

function finalizeActiveText(state: AgentChatState) {
  const text = state.activeText[0]();
  if (text && text.content) {
    batch(() => {
      appendPart(state, { type: 'text', id: text.id, content: text.content } as TextPart);
      state.activeText[1](null);
    });
  } else {
    state.activeText[1](null);
  }
}

function finalizeActiveReasoning(state: AgentChatState) {
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

// ── Delegation metadata updaters ──
// These find the run_agents tool part by groupId and patch its metadata
// so the DelegationFanOutCard re-renders with live progress.

/**
 * Find a tool part with metadata.ui === "delegation-fan-out" and matching groupId.
 * Returns [messageIndex, partIndex] or null.
 */
function findDelegationToolPart(
  msgs: ChatMessage[],
  groupId: string,
): [number, number] | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant' || !m.parts) continue;
    for (let j = 0; j < m.parts.length; j++) {
      const p = m.parts[j];
      if (
        p.type === 'tool' &&
        (p as ToolPart).metadata?.ui === 'delegation-fan-out' &&
        (p as ToolPart).metadata?.groupId === groupId
      ) {
        return [i, j];
      }
    }
  }
  return null;
}

/** Update delegation tool part when a child run completes. */
function updateDelegationMeta(state: AgentChatState, event: DelegationRunCompletedEvent) {
  state.messages[1]((prev) => {
    const loc = findDelegationToolPart(prev, event.groupId);
    if (!loc) return prev;
    const [mi, pi] = loc;

    const updated = [...prev];
    const msg = { ...updated[mi], parts: [...updated[mi].parts!] };
    const part = { ...(msg.parts[pi] as ToolPart) };
    const meta = { ...part.metadata } as ToolMetadata & Record<string, unknown>;

    // Build completedRuns map: { runName: { childAgent, phase, duration } }
    const completedRuns = (meta._completedRuns as Record<string, unknown>) || {};
    completedRuns[event.runName] = {
      childAgent: event.childAgent,
      phase: event.phase,
      duration: event.duration,
    };
    meta._completedRuns = completedRuns;
    meta._remaining = event.remaining;

    part.metadata = meta;
    msg.parts[pi] = part;
    updated[mi] = msg;
    return updated;
  });
}

/** Mark delegation group as fully completed. */
function updateDelegationAllCompleted(state: AgentChatState, event: DelegationAllCompletedEvent) {
  state.messages[1]((prev) => {
    const loc = findDelegationToolPart(prev, event.groupId);
    if (!loc) return prev;
    const [mi, pi] = loc;

    const updated = [...prev];
    const msg = { ...updated[mi], parts: [...updated[mi].parts!] };
    const part = { ...(msg.parts[pi] as ToolPart) };
    const meta = { ...part.metadata } as ToolMetadata & Record<string, unknown>;

    meta._allCompleted = true;
    meta._succeeded = event.succeeded;
    meta._failed = event.failed;
    meta._totalDuration = event.totalDuration;
    meta._remaining = 0;

    part.metadata = meta;
    msg.parts[pi] = part;
    updated[mi] = msg;
    return updated;
  });
}

/** Mark delegation group as timed out. */
function updateDelegationTimeout(state: AgentChatState, event: DelegationTimeoutEvent) {
  state.messages[1]((prev) => {
    const loc = findDelegationToolPart(prev, event.groupId);
    if (!loc) return prev;
    const [mi, pi] = loc;

    const updated = [...prev];
    const msg = { ...updated[mi], parts: [...updated[mi].parts!] };
    const part = { ...(msg.parts[pi] as ToolPart) };
    const meta = { ...part.metadata } as ToolMetadata & Record<string, unknown>;

    meta._timedOut = true;
    meta._completedCount = event.completed;
    meta._timedOutCount = event.timedOut;

    part.metadata = meta;
    msg.parts[pi] = part;
    updated[mi] = msg;
    return updated;
  });
}

// ── Working memory hydration ──

/**
 * Convert RuntimeMessage[] (from the runtime's GET /working-memory) into
 * ChatMessage[] for the frontend. Groups assistant + tool messages together,
 * merges tool results back into their tool call parts.
 */
function runtimeToChat(runtimeMessages: RuntimeMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let currentAssistant: ChatMessage | null = null;

  for (const msg of runtimeMessages) {
    if (msg.role === 'user') {
      // Flush any pending assistant
      if (currentAssistant) {
        result.push(currentAssistant);
        currentAssistant = null;
      }
      // Extract text from content parts
      const text = msg.content
        ?.filter((p) => p.type === 'text')
        .map((p) => p.text || '')
        .join('\n') || '';
      result.push({ role: 'user', content: text, timestamp: Date.now() });

    } else if (msg.role === 'assistant') {
      // Flush any pending assistant (new step = new bubble)
      if (currentAssistant) {
        result.push(currentAssistant);
      }
      currentAssistant = { role: 'assistant', parts: [], timestamp: Date.now() };

      for (const part of msg.content || []) {
        if (part.type === 'text' && part.text) {
          currentAssistant.parts!.push({
            type: 'text',
            id: crypto.randomUUID(),
            content: part.text,
          } as TextPart);
        } else if (part.type === 'reasoning' && part.text) {
          currentAssistant.parts!.push({
            type: 'reasoning',
            id: crypto.randomUUID(),
            content: part.text,
          } as ReasoningPart);
        } else if (part.type === 'tool-call') {
          currentAssistant.parts!.push({
            type: 'tool',
            id: part.tool_call_id || crypto.randomUUID(),
            toolName: part.tool_name || '',
            input: part.input || '',
            output: '',
            isError: false,
            status: 'completed', // historical — already finished
          } as ToolPart);
        }
      }

    } else if (msg.role === 'tool') {
      // Tool result — find the matching tool-call in currentAssistant
      if (!currentAssistant) continue;

      for (const part of msg.content || []) {
        if (part.type === 'tool-result' && part.tool_call_id) {
          const toolPart = currentAssistant.parts?.find(
            (p) => p.type === 'tool' && (p as ToolPart).id === part.tool_call_id,
          ) as ToolPart | undefined;
          if (toolPart) {
            const output = part.output;
            if (output) {
              toolPart.output = output.text || output.error || '';
              toolPart.isError = output.type === 'error';
              if (output.type === 'media') {
                toolPart.mediaType = output.media_type;
                toolPart.data = output.data;
              }
            }
            // Restore metadata from working memory (renderer hints, duration, etc.)
            if (part.metadata) {
              try {
                toolPart.metadata = JSON.parse(part.metadata);
              } catch { /* malformed metadata — ignore */ }
            }
          }
        }
      }
    }
  }

  // Flush last assistant
  if (currentAssistant) {
    result.push(currentAssistant);
  }

  return result;
}

/**
 * Hydrate the chat for the selected agent from the runtime's working memory.
 * Called on agent change / page load. Only populates if the local chat is empty
 * (doesn't overwrite an in-progress conversation).
 */
async function hydrateFromWorkingMemory(ns: string, name: string) {
  const key = agentKey(ns, name);
  const state = agentStates.get(key);

  // Don't hydrate if already streaming or if we already have messages
  if (state?.streaming[0]()) return;
  if (state && state.messages[0]().length > 0) return;

  try {
    const runtimeMsgs = await conversationAPI.getWorkingMemory(ns, name);
    if (!runtimeMsgs || runtimeMsgs.length === 0) return;

    const chatMsgs = runtimeToChat(runtimeMsgs);
    if (chatMsgs.length === 0) return;

    // Re-check: might have started streaming while we waited
    const freshState = getOrCreateState(key);
    if (freshState.streaming[0]() || freshState.messages[0]().length > 0) return;

    freshState.messages[1](chatMsgs);
  } catch {
    // Silently fail — agent might be unreachable or BFF not ready
  }
}
