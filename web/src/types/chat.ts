// Chat types — UI-side message representations

import type { Usage, ToolMetadata, Question } from "./fep"

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

export interface ToolInputPart {
  type: "tool-input"
  id: string
  toolName: string
  argsPreview: string // partial JSON being composed
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

export interface StepStartPart {
  type: "step-start"
  stepNumber: number
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

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolInputPart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SourcePart
  | ErrorPart

// ---- Messages ----

export interface ChatMessage {
  role: "user" | "assistant"
  content?: string // plain text for user messages
  parts?: MessagePart[] // assembled parts for assistant messages
  timestamp: number
}

// ---- Pending interactive elements ----

export interface PendingPermission {
  id: string
  sessionId: string
  toolName: string
  input: string
  description: string
}

export interface PendingQuestion {
  id: string
  sessionId: string
  questions: Question[]
}

// ---- Context attachments ----

export interface K8sResourceContext {
  type: "k8s-resource"
  kind: string
  name: string
  namespace: string
}

export interface MCPServerContext {
  type: "mcp-server"
  name: string
  namespace: string
}

export type SelectedContext = K8sResourceContext | MCPServerContext
