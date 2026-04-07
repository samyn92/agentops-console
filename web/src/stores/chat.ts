// Chat store — FEP event state machine that assembles streaming events
// into renderable message parts.
import { createSignal, batch } from 'solid-js';
import { streamPrompt, sessions as sessionsAPI } from '../lib/api';
import { selectedAgent } from './agents';
import { currentSessionId, createSession } from './sessions';
import type {
  FEPEvent,
  Usage,
  ToolMetadata,
} from '../types';
import type {
  ChatMessage,
  MessagePart,
  TextPart,
  ReasoningPart,
  ToolPart,
} from '../types';

// ── State ──

const [messages, setMessages] = createSignal<ChatMessage[]>([]);
const [streaming, setStreaming] = createSignal(false);
const [currentStep, setCurrentStep] = createSignal(0);
const [totalUsage, setTotalUsage] = createSignal<Usage | null>(null);
const [activeModel, setActiveModel] = createSignal<string | null>(null);

// Active streaming parts (assembled from deltas)
const [activeText, setActiveText] = createSignal<{ id: string; content: string } | null>(null);
const [activeReasoning, setActiveReasoning] = createSignal<{ id: string; content: string } | null>(null);
const [activeToolInput, setActiveToolInput] = createSignal<{ id: string; toolName: string; args: string } | null>(null);

// Pending interactive requests
const [pendingPermission, setPendingPermission] = createSignal<{
  id: string;
  sessionId: string;
  toolName: string;
  input: string;
  description: string;
} | null>(null);

const [pendingQuestion, setPendingQuestion] = createSignal<{
  id: string;
  sessionId: string;
  questions: Array<{
    question: string;
    header: string;
    options?: Array<{ label: string; description: string }>;
    multiple?: boolean;
  }>;
} | null>(null);

// Abort controller for current stream
let abortController: AbortController | null = null;

// ── Public API ──

export {
  messages,
  streaming,
  currentStep,
  totalUsage,
  activeModel,
  activeText,
  activeReasoning,
  activeToolInput,
  pendingPermission,
  pendingQuestion,
  setPendingPermission,
  setPendingQuestion,
};

/** Send a prompt to the current agent/session. Creates a session if needed. */
export async function sendMessage(prompt: string) {
  const agent = selectedAgent();
  if (!agent) return;

  // Ensure we have a session
  let sessionId = currentSessionId();
  if (!sessionId) {
    sessionId = await createSession();
    if (!sessionId) return;
  }

  // Add user message
  const userMsg: ChatMessage = {
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
  };

  const assistantMsg: ChatMessage = {
    role: 'assistant',
    parts: [],
    timestamp: Date.now(),
  };

  batch(() => {
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setCurrentStep(0);
    setTotalUsage(null);
    setActiveText(null);
    setActiveReasoning(null);
    setActiveToolInput(null);
  });

  abortController = new AbortController();

  try {
    await streamPrompt(
      agent.namespace,
      agent.name,
      sessionId,
      prompt,
      (event) => handleFEPEvent(event),
      abortController.signal,
    );
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      appendPart({ type: 'error', error: (err as Error).message });
    }
  } finally {
    batch(() => {
      setStreaming(false);
      // Finalize any active parts
      finalizeActiveText();
      finalizeActiveReasoning();
      setActiveToolInput(null);
    });
    abortController = null;
  }
}

/** Abort the current stream. */
export function abortStream() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  setStreaming(false);
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

/** Clear all messages. */
export function clearMessages() {
  setMessages([]);
  setTotalUsage(null);
  setActiveModel(null);
}

// ── FEP Event Handler (state machine) ──

function handleFEPEvent(event: FEPEvent) {
  switch (event.type) {
    // Agent lifecycle
    case 'agent_start':
      break; // already handled by sendMessage

    case 'agent_finish':
      batch(() => {
        setTotalUsage(event.total_usage);
        setActiveModel(event.model || null);
        setStreaming(false);
      });
      break;

    case 'agent_error':
      appendPart({ type: 'error', error: event.error || 'Unknown error' });
      setStreaming(false);
      break;

    // Step lifecycle
    case 'step_start':
      setCurrentStep(event.step_number || 0);
      appendPart({
        type: 'step-start',
        stepNumber: event.step_number || 0,
      });
      break;

    case 'step_finish':
      appendPart({
        type: 'step-finish',
        stepNumber: event.step_number || 0,
        usage: event.usage,
        finishReason: event.finish_reason || 'unknown',
        toolCallCount: event.tool_call_count || 0,
      });
      break;

    // Text streaming
    case 'text_start':
      setActiveText({ id: event.id || '', content: '' });
      break;

    case 'text_delta':
      setActiveText((prev) =>
        prev ? { ...prev, content: prev.content + (event.delta || '') } : null,
      );
      break;

    case 'text_end':
      finalizeActiveText();
      break;

    // Reasoning streaming
    case 'reasoning_start':
      setActiveReasoning({ id: event.id || '', content: '' });
      break;

    case 'reasoning_delta':
      setActiveReasoning((prev) =>
        prev ? { ...prev, content: prev.content + (event.delta || '') } : null,
      );
      break;

    case 'reasoning_end':
      finalizeActiveReasoning();
      break;

    // Tool input streaming
    case 'tool_input_start':
      setActiveToolInput({
        id: event.id || '',
        toolName: event.tool_name || '',
        args: '',
      });
      break;

    case 'tool_input_delta':
      setActiveToolInput((prev) =>
        prev ? { ...prev, args: prev.args + (event.delta || '') } : null,
      );
      break;

    case 'tool_input_end':
      setActiveToolInput(null);
      break;

    // Tool execution
    case 'tool_call':
      appendPart({
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
      // Update the matching tool part from 'running' to 'complete'
      const toolId = event.id || '';
      let metadata: ToolMetadata | undefined;
      if (event.metadata) {
        try {
          metadata = JSON.parse(event.metadata) as ToolMetadata;
        } catch {
          // skip malformed metadata
        }
      }
      setMessages((prev) => {
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

    // Interactive
    case 'permission_asked':
      setPendingPermission({
        id: event.id || '',
        sessionId: event.session_id || '',
        toolName: event.tool_name || '',
        input: event.input || '',
        description: event.description || '',
      });
      break;

    case 'question_asked':
      setPendingQuestion({
        id: event.id || '',
        sessionId: event.session_id || '',
        questions: (event.questions as any) || [],
      });
      break;

    // Sources
    case 'source':
      appendPart({
        type: 'source',
        id: event.id || '',
        sourceType: event.source_type || 'url',
        url: event.url || '',
        title: event.title || '',
      });
      break;

    case 'session_idle':
      setStreaming(false);
      break;
  }
}

// ── Helpers ──

function appendPart(part: MessagePart) {
  setMessages((prev) => {
    const updated = [...prev];
    const lastMsg = updated[updated.length - 1];
    if (lastMsg?.role === 'assistant') {
      // Create a new object so SolidJS detects the change
      updated[updated.length - 1] = {
        ...lastMsg,
        parts: [...(lastMsg.parts || []), part],
      };
    }
    return updated;
  });
}

function finalizeActiveText() {
  const text = activeText();
  if (text && text.content) {
    appendPart({ type: 'text', id: text.id, content: text.content } as TextPart);
  }
  setActiveText(null);
}

function finalizeActiveReasoning() {
  const reasoning = activeReasoning();
  if (reasoning && reasoning.content) {
    appendPart({ type: 'reasoning', id: reasoning.id, content: reasoning.content } as ReasoningPart);
  }
  setActiveReasoning(null);
}
