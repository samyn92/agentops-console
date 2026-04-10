// FEP TypeScript types — mirrors the Go types in internal/fep/types.go

// ---- Usage & Metadata ----

export interface Usage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

export type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "unknown"

// ---- Tool Metadata (drives custom UI renderers) ----

export interface ToolMetadata {
  ui?: string // renderer hint: "terminal" | "diff" | "code" | "file-tree" | "search-results" | "file-created" | "web-fetch" | "agent-run" | "agent-run-status" | "kubernetes-resources" | "helm-release"
  [key: string]: unknown
}

// ---- Question ----

export interface QuestionOption {
  label: string
  description: string
}

export interface Question {
  header: string
  question: string
  options?: QuestionOption[]
  multiple?: boolean
}

// ---- Warning ----

export interface Warning {
  message: string
}

// ---- FEP Event Types ----
// NOTE: Event type strings use underscore format (e.g. "agent_start") to match
// the Go runtime's actual SSE output. PLAN.md specifies dot format but the
// runtime was built with underscores. These will be aligned in a future pass.
//
// Every FEP event carries an optional `timestamp` field (RFC3339 UTC) set by
// the runtime. The frontend converts this to local time for display.

/** Common fields present on every FEP event. */
interface FEPEventBase {
  /** RFC3339 UTC timestamp set by the runtime. */
  timestamp?: string;
}

export interface AgentStartEvent extends FEPEventBase {
  type: "agent_start"
  session_id: string
  prompt: string
  trace_id?: string
}

export interface AgentFinishEvent extends FEPEventBase {
  type: "agent_finish"
  session_id: string
  total_usage: Usage
  step_count: number
  model: string
}

export interface AgentErrorEvent extends FEPEventBase {
  type: "agent_error"
  session_id: string
  error: string
  retryable: boolean
}

export interface StepStartEvent extends FEPEventBase {
  type: "step_start"
  step_number: number
  session_id: string
}

export interface StepFinishEvent extends FEPEventBase {
  type: "step_finish"
  step_number: number
  session_id: string
  usage: Usage
  finish_reason: FinishReason
  tool_call_count: number
}

export interface TextStartEvent extends FEPEventBase {
  type: "text_start"
  id: string
}

export interface TextDeltaEvent extends FEPEventBase {
  type: "text_delta"
  id: string
  delta: string
}

export interface TextEndEvent extends FEPEventBase {
  type: "text_end"
  id: string
}

export interface ReasoningStartEvent extends FEPEventBase {
  type: "reasoning_start"
  id: string
}

export interface ReasoningDeltaEvent extends FEPEventBase {
  type: "reasoning_delta"
  id: string
  delta: string
}

export interface ReasoningEndEvent extends FEPEventBase {
  type: "reasoning_end"
  id: string
}

export interface ToolInputStartEvent extends FEPEventBase {
  type: "tool_input_start"
  id: string
  tool_name: string
}

export interface ToolInputDeltaEvent extends FEPEventBase {
  type: "tool_input_delta"
  id: string
  delta: string
}

export interface ToolInputEndEvent extends FEPEventBase {
  type: "tool_input_end"
  id: string
}

export interface ToolCallEvent extends FEPEventBase {
  type: "tool_call"
  id: string
  tool_name: string
  input: string // JSON string of args
  provider_executed: boolean
}

export interface ToolResultEvent extends FEPEventBase {
  type: "tool_result"
  id: string
  tool_name: string
  output: string
  is_error: boolean
  metadata?: string // JSON string of ToolMetadata
  media_type?: string
  data?: string // base64 for binary
}

export interface SourceEvent extends FEPEventBase {
  type: "source"
  id: string
  source_type: "url" | "document"
  url: string
  title: string
}

export interface WarningsEvent extends FEPEventBase {
  type: "warnings"
  warnings: Warning[]
}

export interface StreamFinishEvent extends FEPEventBase {
  type: "stream_finish"
  usage: Usage
  finish_reason: FinishReason
}

export interface PermissionAskedEvent extends FEPEventBase {
  type: "permission_asked"
  id: string
  session_id: string
  tool_name: string
  input: string
  description: string
}

export interface PermissionRepliedEvent extends FEPEventBase {
  type: "permission_replied"
  id: string
  response: "once" | "always" | "deny"
}

export interface QuestionAskedEvent extends FEPEventBase {
  type: "question_asked"
  id: string
  session_id: string
  questions: Question[]
}

export interface QuestionRepliedEvent extends FEPEventBase {
  type: "question_replied"
  id: string
  answers: string[][]
}

export interface SessionIdleEvent extends FEPEventBase {
  type: "session_idle"
  session_id: string
}

export interface SessionStatusEvent extends FEPEventBase {
  type: "session_status"
  session_id: string
  status: "idle" | "busy" | "waiting"
}

// ---- Union ----

export type FEPEvent =
  | AgentStartEvent
  | AgentFinishEvent
  | AgentErrorEvent
  | StepStartEvent
  | StepFinishEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputEndEvent
  | ToolCallEvent
  | ToolResultEvent
  | SourceEvent
  | WarningsEvent
  | StreamFinishEvent
  | PermissionAskedEvent
  | PermissionRepliedEvent
  | QuestionAskedEvent
  | QuestionRepliedEvent
  | SessionIdleEvent
  | SessionStatusEvent

// ---- Global SSE Envelope ----

export interface AgentRef {
  namespace: string
  name: string
}

export interface AgentEventEnvelope {
  agent: AgentRef
  event: FEPEvent
}

// ---- Global SSE Named Events ----

export interface AgentOnlineEvent {
  namespace: string
  name: string
  connected: true
}

export interface AgentOfflineEvent {
  namespace: string
  name: string
  connected: false
}

export interface ResourceChangedEvent {
  type: "ADDED" | "MODIFIED" | "DELETED"
  resourceKind: string
  namespace: string
  name: string
  resource: unknown
}
