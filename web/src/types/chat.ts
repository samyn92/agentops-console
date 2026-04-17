// Chat types — UI-side message representations

import type { Usage, ToolMetadata } from "./fep"

// ---- Message Parts ----

export interface TextPart {
  type: "text"
  id: string
  content: string
}

export interface ReasoningPart {
  type: "reasoning"
  id: string
  content: string
}

export type ToolStatus = "composing" | "pending" | "running" | "completed" | "error"

export interface ToolPart {
  type: "tool"
  id: string
  toolName: string
  input: string // JSON string of args
  output: string
  isError: boolean
  status: ToolStatus
  metadata?: ToolMetadata
  mediaType?: string
  data?: string // base64
  duration?: number
}

export interface StepFinishPart {
  type: "step-finish"
  stepNumber: number
  usage: Usage
  finishReason: string
  toolCallCount: number
}

export interface SourcePart {
  type: "source"
  id: string
  sourceType: "url" | "document"
  url: string
  title: string
}

export interface ErrorPart {
  type: "error"
  error: string
  retryable?: boolean
}

/** Structured delegation result — rendered as a rich card in the chat. */
export interface DelegationResultPart {
  type: "delegation-result"
  groupId: string
  single: boolean
  timedOut: boolean
  totalDuration: string
  succeeded: number
  failed: number
  runs: Record<string, {
    agentName: string
    phase: string
    output: string
    toolCalls: number
    model: string
    traceID?: string
    duration: string
    pullRequestURL?: string
    commits?: number
    branch?: string
    failureReason?: string
  }>
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | StepFinishPart
  | SourcePart
  | ErrorPart
  | DelegationResultPart

// ---- Messages ----

export interface ChatMessage {
  role: "user" | "assistant"
  content?: string // plain text for user messages
  parts?: MessagePart[] // assembled parts for assistant messages
  timestamp: number
}


