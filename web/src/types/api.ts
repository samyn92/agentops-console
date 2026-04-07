// API response types — mirrors K8s CRDs exposed by the console backend

// ---- Agent CR ----

export interface AgentSpec {
  mode: "daemon" | "task"
  runtime: "fantasy" | "pi"
  fantasy?: {
    providers: Array<{ name: string }>
    primaryModel: string
    fallbackModels?: string[]
    systemPrompt?: string
    builtinTools?: string[]
    tools?: Array<{ name: string; path: string }>
    mcpServers?: Array<{ name: string }>
    temperature?: number
    maxOutputTokens?: number
    maxSteps?: number
  }
  storage?: string
  replicas?: number
  toolHooks?: {
    blockedCommands?: string[]
    allowedPaths?: string[]
    auditTools?: string[]
  }
  contextFiles?: Array<{ path: string }>
  concurrencyPolicy?: string
  schedule?: string
}

export interface AgentStatus {
  phase: string
  ready: boolean
  runtime?: string
  model?: string
  conditions?: Array<{
    type: string
    status: string
    reason?: string
    message?: string
    lastTransitionTime?: string
  }>
}

/** Flat agent response from GET /agents (backend flattens CRD fields). */
export interface AgentResponse {
  name: string
  namespace: string
  mode: string
  model: string
  runtime: string
  phase: string
  readyReplicas: number
}

/** Full CRD shape returned by GET /agents/:ns/:name (raw K8s object). */
export interface AgentCRD {
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
  spec: AgentSpec
  status?: AgentStatus
}

// ---- AgentRun CR ----

export interface AgentRunResponse {
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
    labels?: Record<string, string>
  }
  spec: {
    agentRef: string
    prompt: string
    source?: string
    sourceRef?: string
  }
  status?: {
    phase: string
    output?: string
    toolCalls?: number
    tokensUsed?: number
    cost?: string
    model?: string
    startTime?: string
    completionTime?: string
    error?: string
  }
}

// ---- Channel CR ----

export interface ChannelResponse {
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
  }
  spec: {
    type: string
    agentRef: string
    webhook?: { path?: string }
    config?: Record<string, string>
  }
  status?: {
    phase: string
    ready: boolean
  }
}

// ---- MCPServer CR ----

export interface MCPServerResponse {
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
  }
  spec: {
    mode: "deploy" | "external"
    image?: string
    url?: string
    tools?: string[]
  }
  status?: {
    phase: string
    ready: boolean
    tools?: string[]
  }
}

// ---- Session ----

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

export interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  total_usage?: SessionUsage
  model?: string
}

// ---- Runtime Messages (from GET /sessions/{id}/messages) ----
// Mirrors the Go serializableMessage / serializablePartOK / serializableToolOutput types.

export interface RuntimeToolOutput {
  type: "text" | "error" | "media"
  text?: string
  error?: string
  data?: string
  media_type?: string
}

export interface RuntimeMessagePart {
  type: "text" | "reasoning" | "file" | "tool-call" | "tool-result" | "unknown"
  // text / reasoning
  text?: string
  // file
  filename?: string
  data?: string
  media_type?: string
  // tool-call
  tool_call_id?: string
  tool_name?: string
  input?: string
  provider_executed?: boolean
  // tool-result
  output?: RuntimeToolOutput
}

export interface RuntimeMessage {
  role: "user" | "assistant" | "tool"
  content: RuntimeMessagePart[]
}

// ---- Kubernetes ----

export interface NamespaceInfo {
  name: string
  agents: number
  runs: number
  channels: number
  mcpServers: number
}

export interface PodInfo {
  name: string
  namespace: string
  phase: string
  ready: boolean
  restarts: number
  age: string
  containers: Array<{
    name: string
    image: string
    ready: boolean
  }>
}

// ---- Runtime Status ----

export interface RuntimeStatus {
  busy: boolean
  output: string
  model: string
  steps: number
  sessionId?: string
}
