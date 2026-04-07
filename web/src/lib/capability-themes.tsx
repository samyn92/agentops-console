/**
 * Capability/tool theming module.
 *
 * Provides branded SVG icons, category detection, color themes, and labels
 * for tool call cards and agent detail panels. Ported from the old codebase
 * with full support for Kubernetes, Helm, GitHub, GitLab, Terraform, etc.
 */
import type { Component } from "solid-js";

// =============================================================================
// SVG ICONS — Branded tool/platform icons
// =============================================================================

export const KubernetesIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    {/* Heptagon outline */}
    <path d="M12 2l6.93 3.2 2.83 7.3-1.76 7.5-6 4.5h-4L4 20l-1.76-7.5L5.07 5.2z" />
    {/* Center hub */}
    <circle cx="12" cy="12" r="2.5" />
    {/* 7 spokes radiating from center */}
    <line x1="12" y1="9.5" x2="12" y2="3.5" />
    <line x1="14.2" y1="10.2" x2="18.5" y2="6" />
    <line x1="14.5" y1="12.5" x2="20" y2="11.5" />
    <line x1="13.5" y1="14.2" x2="17.5" y2="18.5" />
    <line x1="11" y1="14.5" x2="8" y2="19.5" />
    <line x1="9.8" y1="12.2" x2="4" y2="11.5" />
    <line x1="10.2" y1="10.2" x2="6.5" y2="6" />
  </svg>
);

export const HelmIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 32 32" class={props.class} fill="currentColor">
    <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 2c7.732 0 14 6.268 14 14s-6.268 14-14 14S2 23.732 2 16 8.268 2 16 2zm-1 5v3h2V7h-2zm-5.5 2.134l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm13 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM16 12a4 4 0 100 8 4 4 0 000-8zm-8.5 4.268l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm17 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM9.768 20.232l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zm12.464 0l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zM15 23v3h2v-3h-2z"/>
  </svg>
);

export const GitHubIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

export const GitLabIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

export const TerraformIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M1.5 0v8.35l7.24 4.18V4.18L1.5 0zm8.74 4.18v8.35l7.24-4.18V0L10.24 4.18zM10.24 13.7v8.35l7.24-4.18V9.52L10.24 13.7zM18.98 4.18v8.35L22.5 10.5V2.15L18.98 4.18z"/>
  </svg>
);

// =============================================================================
// TOOL CATEGORY DETECTION
// =============================================================================

export type ToolCategory =
  | "kubernetes"
  | "helm"
  | "github"
  | "gitlab"
  | "terraform"
  | "database"
  | "slack"
  | "mcp"
  | "builtin"
  | "generic";

/**
 * Detect the category of a tool or capability by name.
 * When a capability spec is provided, uses the CRD's authoritative
 * type and containerType fields instead of name-guessing.
 */
export function detectToolCategory(
  name: string,
  capability?: { spec: { type?: string; container?: { containerType?: string } } },
): ToolCategory {
  // If we have CRD data, use it authoritatively
  if (capability?.spec?.type) {
    const crdType = capability.spec.type;

    if (crdType === "Container" && capability.spec.container?.containerType) {
      const ct = capability.spec.container.containerType;
      if (ct === "kubernetes") return "kubernetes";
      if (ct === "helm") return "helm";
      if (ct === "github") return "github";
      if (ct === "gitlab") return "gitlab";
    }

    if (crdType === "MCP" || crdType === "Skill" || crdType === "Tool" || crdType === "Plugin") {
      const domain = detectDomainFromName(name);
      if (domain) return domain;
      if (crdType === "MCP") return "mcp";
      return "generic";
    }
  }

  const lower = name.toLowerCase();

  // Built-in tools
  const builtins = [
    "bash", "read", "write", "edit", "glob", "grep", "ls",
    "webfetch", "fetch", "task", "todowrite", "todoread", "question", "skill",
    "run_agent", "get_agent_run",
  ];
  if (builtins.includes(lower)) return "builtin";

  // Capability-based tools (substring match)
  return detectDomainFromName(name) || "generic";
}

/** Try to detect a domain category from a capability/tool name via substring matching. */
function detectDomainFromName(name: string): ToolCategory | null {
  const lower = name.toLowerCase();
  if (lower.includes("kubectl") || lower.includes("kubernetes") || lower.includes("k8s")) return "kubernetes";
  if (lower.includes("helm")) return "helm";
  if (lower.includes("github") || lower.includes("gh-")) return "github";
  if (lower.includes("gitlab") || lower.includes("glab")) return "gitlab";
  if (lower.includes("git") && !lower.includes("github") && !lower.includes("gitlab")) return "generic";
  if (lower.includes("terraform") || lower.includes("tf-")) return "terraform";
  if (lower.includes("postgres") || lower.includes("mysql") || lower.includes("database") || lower.includes("redis") || lower.includes("mongo")) return "database";
  if (lower.includes("slack")) return "slack";
  if (lower.includes("mcp-") || lower.includes("mcp_")) return "mcp";
  return null;
}

// =============================================================================
// THEMED ACCENT MAPS — gradient backgrounds, branded borders, watermarks
// =============================================================================

export interface ToolTheme {
  border: string;
  bg: string;
  headerBg: string;
  iconColor: string;
  badge: string;
  watermark: string;
}

export const toolThemes: Record<ToolCategory, ToolTheme> = {
  kubernetes: {
    border: "border-blue-500/30",
    bg: "bg-gradient-to-br from-blue-500/5 to-blue-600/2",
    headerBg: "bg-gradient-to-r from-blue-500/10 to-transparent",
    iconColor: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400",
    watermark: "text-blue-400/[0.04]",
  },
  helm: {
    border: "border-cyan-500/30",
    bg: "bg-gradient-to-br from-cyan-500/5 to-cyan-600/2",
    headerBg: "bg-gradient-to-r from-cyan-500/10 to-transparent",
    iconColor: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-400",
    watermark: "text-cyan-400/[0.04]",
  },
  github: {
    border: "border-white/15",
    bg: "bg-gradient-to-br from-white/[0.03] to-white/[0.01]",
    headerBg: "bg-gradient-to-r from-white/[0.06] to-transparent",
    iconColor: "text-gray-300",
    badge: "bg-white/10 text-gray-300",
    watermark: "text-white/[0.03]",
  },
  gitlab: {
    border: "border-orange-500/30",
    bg: "bg-gradient-to-br from-orange-500/5 to-orange-600/2",
    headerBg: "bg-gradient-to-r from-orange-500/10 to-transparent",
    iconColor: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-400",
    watermark: "text-orange-400/[0.04]",
  },
  terraform: {
    border: "border-purple-500/30",
    bg: "bg-gradient-to-br from-purple-500/5 to-purple-600/2",
    headerBg: "bg-gradient-to-r from-purple-500/10 to-transparent",
    iconColor: "text-purple-400",
    badge: "bg-purple-500/15 text-purple-400",
    watermark: "text-purple-400/[0.04]",
  },
  database: {
    border: "border-emerald-500/30",
    bg: "bg-gradient-to-br from-emerald-500/5 to-emerald-600/2",
    headerBg: "bg-gradient-to-r from-emerald-500/10 to-transparent",
    iconColor: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400",
    watermark: "text-emerald-400/[0.04]",
  },
  slack: {
    border: "border-pink-500/30",
    bg: "bg-gradient-to-br from-pink-500/5 to-pink-600/2",
    headerBg: "bg-gradient-to-r from-pink-500/10 to-transparent",
    iconColor: "text-pink-400",
    badge: "bg-pink-500/15 text-pink-400",
    watermark: "text-pink-400/[0.04]",
  },
  mcp: {
    border: "border-indigo-500/30",
    bg: "bg-gradient-to-br from-indigo-500/5 to-indigo-600/2",
    headerBg: "bg-gradient-to-r from-indigo-500/10 to-transparent",
    iconColor: "text-indigo-400",
    badge: "bg-indigo-500/15 text-indigo-400",
    watermark: "text-indigo-400/[0.04]",
  },
  builtin: {
    border: "",
    bg: "",
    headerBg: "",
    iconColor: "text-text-muted",
    badge: "",
    watermark: "",
  },
  generic: {
    border: "border-text-muted/20",
    bg: "bg-gradient-to-br from-text-muted/[0.03] to-transparent",
    headerBg: "bg-gradient-to-r from-text-muted/[0.06] to-transparent",
    iconColor: "text-text-muted",
    badge: "bg-text-muted/10 text-text-muted",
    watermark: "text-text-muted/[0.03]",
  },
};

// =============================================================================
// CATEGORY HELPERS
// =============================================================================

/** Return the branded SVG icon component for a tool category. */
export function getCategoryIcon(category: ToolCategory): Component<{ class?: string }> {
  switch (category) {
    case "kubernetes": return KubernetesIcon;
    case "helm":       return HelmIcon;
    case "github":     return GitHubIcon;
    case "gitlab":     return GitLabIcon;
    case "terraform":  return TerraformIcon;
    case "database":   return (p) => <svg class={p.class} fill="none" stroke="currentColor" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
    case "slack":      return (p) => <svg class={p.class} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 15a2 2 0 01-2 2h-2v2a2 2 0 01-4 0v-6a2 2 0 012-2h4a2 2 0 012 2zM3 9a2 2 0 012-2h2V5a2 2 0 014 0v6a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>;
    case "mcp":        return (p) => <svg class={p.class} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25"/></svg>;
    default:           return (p) => <svg class={p.class} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M12 5l7 7-7 7"/></svg>;
  }
}

/** Friendly display name for a tool category, or null for builtin/generic. */
export function getCategoryLabel(category: ToolCategory): string | null {
  switch (category) {
    case "kubernetes": return "Kubernetes";
    case "helm":       return "Helm";
    case "github":     return "GitHub";
    case "gitlab":     return "GitLab";
    case "terraform":  return "Terraform";
    case "database":   return "Database";
    case "slack":      return "Slack";
    case "mcp":        return "MCP";
    default:           return null;
  }
}

/** Human-readable display name for built-in tools */
export function getToolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    bash: "Terminal",
    read: "Read File",
    write: "Write File",
    edit: "Edit File",
    glob: "Find Files",
    ls: "List Files",
    grep: "Search",
    fetch: "Web Fetch",
    webfetch: "Web Fetch",
    task: "Sub-Agent",
    todowrite: "Todo List",
    todoread: "Todo List",
    question: "Question",
    skill: "Skill",
    run_agent: "Run Agent",
    get_agent_run: "Agent Run",
  };
  return names[toolName] || toolName.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
