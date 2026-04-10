// API response types — mirrors K8s CRDs exposed by the console backend

// ---- Agent CR ----

export interface AgentSpec {
  mode: "daemon" | "task"
  image?: string
  imagePullPolicy?: string
  model: string
  primaryProvider?: string
  titleModel?: string
  providers: Array<{ name: string; apiKeySecret: { name: string; key: string } }>
  fallbackModels?: string[]
  systemPrompt?: string
  builtinTools?: string[]
  temperature?: number
  maxOutputTokens?: number
  maxSteps?: number
  toolRefs?: Array<{ oci?: object; configMap?: object; inline?: object }>
  permissionTools?: string[]
  enableQuestionTool?: boolean
  env?: Record<string, string>
  secrets?: Array<{ name: string; secretKeyRef: { name: string; key: string } }>
  storage?: { size: string; storageClassName?: string }
  tools?: Array<{ name: string; permissions?: object; directTools?: string[]; autoContext?: boolean }>
  toolHooks?: {
    blockedCommands?: string[]
    allowedPaths?: string[]
    auditTools?: string[]
  }
  contextFiles?: Array<{ path: string; configMapRef: { name: string; key: string } }>
  concurrency?: { maxRuns?: number; policy?: string }
  schedule?: string
  schedulePrompt?: string
  networkPolicy?: { enabled: boolean }
  resources?: object
  serviceAccountName?: string
  timeout?: string
}

export interface AgentStatus {
  phase: string
  readyReplicas: number
  serviceURL?: string
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
  image: string
  phase: string
  readyReplicas: number
  schedule?: string
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
    git?: {
      resourceRef: string
      branch: string
      baseBranch?: string
    }
  }
  status?: {
    phase: string
    output?: string
    toolCalls?: number
    tokensUsed?: number
    cost?: string
    model?: string
    traceID?: string
    startTime?: string
    completionTime?: string
    error?: string
    // Git workspace fields (populated when spec.git is set)
    pullRequestURL?: string
    commits?: number
    branch?: string
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

// ---- AgentTool CR ----

export type AgentToolSourceType = 'oci' | 'configMap' | 'inline' | 'mcpServer' | 'mcpEndpoint' | 'skill';

export interface AgentToolResponse {
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
  }
  spec: {
    description?: string
    category?: string
    oci?: { ref: string; digest?: string; pullPolicy?: string }
    configMap?: { name: string; key: string }
    inline?: { content: string }
    mcpServer?: { image: string; port?: number; command?: string[]; env?: Record<string, string>; serviceAccountName?: string }
    mcpEndpoint?: { url: string; transport?: string; headers?: Record<string, string> }
    skill?: { ref: string; digest?: string; pullPolicy?: string }
    defaultPermissions?: { requireApproval?: boolean; mode?: string; rules?: string[] }
  }
  status?: {
    phase: string
    sourceType?: AgentToolSourceType
    serviceURL?: string
    conditions?: Array<{
      type: string
      status: string
      reason?: string
      message?: string
      lastTransitionTime?: string
    }>
  }
}

// ---- AgentResource CR ----

export type AgentResourceKind =
  | 'github-repo'
  | 'github-org'
  | 'gitlab-project'
  | 'gitlab-group'
  | 'git-repo'
  | 's3-bucket'
  | 'documentation';

export interface AgentResourceBinding {
  name: string
  namespace: string
  kind: AgentResourceKind
  displayName: string
  description?: string
  phase: string
  readOnly: boolean
  autoContext: boolean
  hasCredentials: boolean
  github?: {
    owner: string
    repo: string
    defaultBranch?: string
    apiURL?: string
  }
  githubOrg?: {
    org: string
    repoFilter?: string[]
    apiURL?: string
  }
  gitlab?: {
    baseURL: string
    project: string
    defaultBranch?: string
  }
  gitlabGroup?: {
    baseURL: string
    group: string
    projects?: string[]
  }
}

/** Check if a resource kind supports file/commit/branch/MR/issue browsing */
export function isBrowsableResource(kind: AgentResourceKind): boolean {
  return kind === 'github-repo' || kind === 'gitlab-project';
}

/** Get the display icon type for a resource kind */
export function resourceKindIcon(kind: AgentResourceKind): 'github' | 'gitlab' | 'git' | 's3' | 'docs' {
  switch (kind) {
    case 'github-repo':
    case 'github-org':
      return 'github';
    case 'gitlab-project':
    case 'gitlab-group':
      return 'gitlab';
    case 'git-repo':
      return 'git';
    case 's3-bucket':
      return 's3';
    case 'documentation':
      return 'docs';
  }
}

// ---- Git Forge Browser Types ----

export interface GitFile {
  name: string
  path: string
  type: 'file' | 'dir' | 'tree' | 'blob' | 'submodule' | 'symlink' // GitHub uses file/dir, GitLab uses tree/blob
  size?: number
  sha?: string
  id?: string // GitLab
}

export interface GitCommit {
  sha?: string         // GitHub
  id?: string          // GitLab
  short_id?: string    // GitLab
  message: string
  title?: string       // GitLab
  author_name?: string // GitLab
  authored_date?: string // GitLab
  committed_date?: string // GitLab
  commit?: {           // GitHub nested
    author: { name: string; email: string; date: string }
    committer: { name: string; email: string; date: string }
    message: string
  }
  author?: {           // GitHub top-level
    login?: string
    avatar_url?: string
  }
}

export interface GitBranch {
  name: string
  commit?: { sha?: string; id?: string }
  protected?: boolean
  default?: boolean   // GitLab
}

export interface GitMergeRequest {
  // Common
  title: string
  state: string
  // GitHub PR fields
  number?: number
  html_url?: string
  user?: { login: string; avatar_url?: string }
  created_at?: string
  updated_at?: string
  draft?: boolean
  // GitLab MR fields
  iid?: number
  web_url?: string
  author?: { username: string; avatar_url?: string }
  source_branch?: string
  target_branch?: string
}

export interface GitIssue {
  // Common
  title: string
  state: string
  // GitHub
  number?: number
  html_url?: string
  user?: { login: string; avatar_url?: string }
  labels?: Array<{ name: string; color?: string }>
  created_at?: string
  updated_at?: string
  // GitLab
  iid?: number
  web_url?: string
  author?: { username: string; avatar_url?: string }
}

// ---- Resource Context (per-turn dynamic context sent to runtime) ----

export interface ResourceContext {
  resource_name: string        // AgentResource name
  kind: string                 // e.g. "github-repo"
  item_type: string            // file, commit, branch, issue, merge_request
  path?: string                // file path or branch name
  ref?: string                 // git ref
  title?: string               // issue/MR title
  number?: number              // issue/MR number
  sha?: string                 // commit SHA
  url?: string                 // web URL for the item
  description?: string         // extra description text
}

/** Unique key for a selected resource item (for deduplication) */
export function resourceContextKey(ctx: ResourceContext): string {
  // Kubernetes resources use kind=kubernetes
  if (ctx.kind === 'kubernetes') {
    return `k8s:${ctx.item_type}:${ctx.path || ctx.title || ''}`;
  }
  switch (ctx.item_type) {
    case 'file':
      return `${ctx.resource_name}:file:${ctx.path}:${ctx.ref || ''}`;
    case 'commit':
      return `${ctx.resource_name}:commit:${ctx.sha}`;
    case 'branch':
      return `${ctx.resource_name}:branch:${ctx.path}`;
    case 'issue':
      return `${ctx.resource_name}:issue:${ctx.number}`;
    case 'merge_request':
      return `${ctx.resource_name}:mr:${ctx.number}`;
    default:
      return `${ctx.resource_name}:${ctx.item_type}:${ctx.path || ctx.sha || ctx.number}`;
  }
}

// ---- Session (legacy — types kept for potential future use with Engram memory) ----

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

// ---- Runtime Messages ----
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
  metadata?: string // ClientMetadata JSON — renderer hints, duration, etc.
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
  agentTools: number
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

// ---- Kubernetes Resource Browser Types ----

export interface K8sNamespace {
  name: string
  status: string
  age: string
}

export interface K8sNamespaceSummary {
  pods: number
  deployments: number
  statefulSets: number
  daemonSets: number
  jobs: number
  cronJobs: number
  services: number
  ingresses: number
  configMaps: number
  secrets: number
}

export interface K8sPod {
  name: string
  namespace: string
  phase: string
  ready: string
  restarts: number
  node: string
  age: string
  ip?: string
  containers: Array<{
    name: string
    image: string
    ready: boolean
    state: string
    reason?: string
  }>
  labels?: Record<string, string>
}

export interface K8sDeployment {
  name: string
  namespace: string
  ready: string
  upToDate: number
  available: number
  age: string
  images: string[]
  labels?: Record<string, string>
}

export interface K8sStatefulSet {
  name: string
  namespace: string
  ready: string
  age: string
  images: string[]
  labels?: Record<string, string>
}

export interface K8sDaemonSet {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  available: number
  age: string
  labels?: Record<string, string>
}

export interface K8sJob {
  name: string
  namespace: string
  status: string
  succeeded: number
  failed: number
  age: string
  duration?: string
  labels?: Record<string, string>
}

export interface K8sCronJob {
  name: string
  namespace: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule?: string
  age: string
}

export interface K8sService {
  name: string
  namespace: string
  type: string
  clusterIP: string
  externalIP?: string
  ports: Array<{
    port: number
    targetPort: string
    protocol: string
    name?: string
  }>
  age: string
  selector?: Record<string, string>
  labels?: Record<string, string>
}

export interface K8sIngress {
  name: string
  namespace: string
  class?: string
  hosts: Array<{ host: string; path?: string }>
  tls: boolean
  age: string
  labels?: Record<string, string>
}

export interface K8sConfigMap {
  name: string
  namespace: string
  keys: string[]
  age: string
}

export interface K8sSecret {
  name: string
  namespace: string
  type: string
  keys: string[]
  age: string
}

export interface K8sEvent {
  type: string
  reason: string
  object: string
  message: string
  count: number
  firstSeen: string
  lastSeen: string
  source?: string
}

/** Kubernetes resource kind identifier for the browser */
export type K8sResourceKind =
  | 'pods'
  | 'deployments'
  | 'statefulsets'
  | 'daemonsets'
  | 'jobs'
  | 'cronjobs'
  | 'services'
  | 'ingresses'
  | 'configmaps'
  | 'secrets'
  | 'events';

/** Unique key for a K8s resource context item */
export function k8sResourceContextKey(ns: string, kind: string, name: string): string {
  return `k8s:${ns}:${kind}:${name}`;
}

// ---- Runtime Status ----

export interface RuntimeStatus {
  busy: boolean
  output: string
  model: string
  steps: number
  messages?: number
  window_size?: number
  turns?: number
  memory_enabled?: boolean
}

// ---- Memory (Engram) ----

export interface MemoryEnabledResponse {
  enabled: boolean
  project: string
}

export type MemoryObservationType =
  | 'decision'
  | 'architecture'
  | 'bugfix'
  | 'pattern'
  | 'config'
  | 'discovery'
  | 'learning'
  | 'preference'
  | string  // Engram allows custom types

export interface MemoryObservation {
  id: number
  session_id: string
  type: MemoryObservationType
  title: string
  content: string
  tool_name?: string
  project?: string
  scope?: 'project' | 'personal'
  topic_key?: string
  revision_count?: number
  duplicate_count?: number
  last_seen_at?: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface MemorySearchResult {
  id: number
  type: MemoryObservationType
  title: string
  content: string
  rank: number
  project?: string
  created_at?: string
}

export interface MemorySession {
  id: string
  project: string
  directory?: string
  started_at: string
  ended_at?: string
  summary?: string
  status: 'active' | 'completed'
}

export interface MemoryContext {
  recent_observations: Array<{
    id?: number
    type: string
    title: string
    content: string
  }>
  recent_sessions: Array<{
    id?: string
    summary: string
    started_at?: string
    ended_at?: string
  }>
  recent_prompts?: Array<{
    content: string
    created_at: string
  }>
}

export interface MemoryStats {
  total_sessions: number
  total_observations: number
  total_prompts: number
  total_projects: number
  active_sessions?: number
}

// ---- Tempo Trace Types ----

/** A span from a Tempo trace response. */
export interface TraceSpan {
  traceID: string
  spanID: string
  parentSpanID?: string
  operationName: string
  serviceName?: string
  processID?: string
  startTime: number       // microseconds since epoch
  duration: number        // microseconds
  tags?: Array<{ key: string; type: string; value: unknown }>
  logs?: Array<{ timestamp: number; fields: Array<{ key: string; type?: string; value: unknown }> }>
  links?: Array<TraceSpanLink>
  status?: { code: number; message?: string }
}

/** A span link — used for cross-agent trace delegation. */
export interface TraceSpanLink {
  traceID: string
  spanID: string
  tags?: Array<{ key: string; type: string; value: unknown }>
}

/** A process/service in a Tempo trace. */
export interface TraceProcess {
  serviceName: string
  tags?: Array<{ key: string; type: string; value: unknown }>
}

/** Full trace response from Tempo (Jaeger format). */
export interface TempoTraceResponse {
  batches?: unknown[]   // OTLP format
  // Jaeger-compatible format (returned by Tempo by default):
  data?: Array<{
    traceID: string
    spans: TraceSpan[]
    processes: Record<string, TraceProcess>
  }>
}

/** A trace summary from Tempo search results. */
export interface TraceSearchResult {
  traceID: string
  rootServiceName?: string
  rootTraceName?: string
  startTimeUnixNano?: string
  durationMs?: number
  spanSets?: Array<{
    spans: Array<{
      spanID: string
      startTimeUnixNano: string
      durationNanos: string
      attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>
    }>
  }>
}

/** Tempo search response envelope. */
export interface TempoSearchResponse {
  traces: TraceSearchResult[]
  metrics?: {
    totalBlocks?: number
    completedJobs?: number
    totalJobs?: number
  }
}
