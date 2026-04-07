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
  <svg viewBox="0 0 722 702" class={props.class} fill="currentColor">
    <path d="M358.986 8.248c-8.89-.156-17.86 1.803-26.14 6.066L89.17 147.55c-16.572 8.527-28.262 24.21-31.49 42.236L2.463 461.28c-3.22 18.024 2.478 36.57 15.35 49.93L186.94 685.8c12.862 13.35 31.14 20.36 49.24 18.87l274.1-23.37c18.11-1.48 34.39-11.37 43.84-26.59l147.6-237.88c9.43-15.23 11.88-34.01 6.57-50.55L626.13 101.33c-5.3-16.55-18.02-29.77-34.28-35.58L359 8.25zm-4.29 68.49c2.96-.04 5.96.38 8.87 1.32l14.3 4.64c4.94 1.6 8.71 5.48 10.17 10.45l4.43 15.06 7.77-3.23c5.49-2.29 11.84-.57 15.37 4.15l3.43 4.59 32.3-18c-52.08-25.45-111.14-26.35-164.11-5.45l25.13 24.19 5.08-3.52c4.18-2.9 9.64-3.51 14.38-1.6l7.34 2.94 4.5-15.15c1.47-4.97 5.24-8.84 10.18-10.44l14.31-4.64c2.09-.67 4.22-1.01 6.33-1.04v-.01l-.33.72zm-95.31 39.54c-42.19 26.64-75.69 67.02-92.98 117.21l30.54 11.88 2.15-5.52c1.82-4.67 6.07-8.03 11-8.68l14.93-1.95 1.57-15.27c.53-5.1 3.65-9.56 8.36-11.95l13.44-6.83-.5-14.96c-.18-5.15 2.21-10.04 6.41-13.11l12.03-8.8-.97-5.75c-.83-4.97 1.12-10.01 5.12-13.24l3.87-3.13-14.97-20.9zm200.78.63l-15.86 20.46 4.52 3.76c3.64 3.04 5.43 7.82 4.7 12.57l-.95 6.18 12.53 8.24c4.53 2.98 7.15 8.01 7.03 13.49l-.36 15.64 13.4 6.86c4.71 2.41 7.85 6.87 8.36 11.97l1.56 14.88 14.97 1.97c4.93.64 9.17 4.01 10.99 8.68l2.17 5.57 31.36-11.11c-17.2-50.77-51.07-91.24-94.42-118.16zm-100.73 37.8c-2.62.05-5.22.76-7.53 2.15a15.29 15.29 0 0 0-5.33 20.89c4.55 7.78 14.61 10.4 22.39 5.84 7.79-4.55 10.42-14.62 5.86-22.4-2.95-5.06-8.19-7.99-13.62-6.77l-1.77.29zm0 36.96l-3.88 7.1-1.42 18.65 14.09 3.63 11.5-14.79-.39-7.88-19.9-6.71zM234.886 230.3c-7.53.09-14.02 5.56-15.16 13.2-1.26 8.42 4.53 16.3 12.95 17.57 8.42 1.26 16.31-4.54 17.57-12.96 1.27-8.42-4.53-16.3-12.95-17.57-1.12-.16-2.12-.25-2.41-.24zm246.82 1.98c-.8.01-1.61.08-2.42.21-8.42 1.19-14.26 9.03-13.07 17.45 1.19 8.42 9.02 14.25 17.44 13.06 8.43-1.18 14.27-9.02 13.08-17.44-1.07-7.58-7.5-13.29-15.03-13.28zm-249.72 8.17l-5.63 5.57 8.48 16.33 14.47-.71 6.74-13.56-2.69-7.38-21.37-.25zm252.51 2.08l-20.85 3.55-1.28 7.52 8.63 12.74 14.31-2.56 5.91-17.24-6.72-4.01zm-296.75 20.52l-30.64 6.34c-5.74 24.99-6.44 50.7-2.63 75.5l28.63 13.27.09-.02 5.25-4.07c4.3-3.33 10.17-4.04 15.12-1.84l14.12 6.28 10.13-11.79c3.29-3.83 8.34-5.68 13.28-4.88l1.87.31-8.14-50.6-3.52-.96c-4.2-1.14-7.59-4.19-9.18-8.22l-5.75-14.57-14.63-.45c-5.14-.16-9.85-2.86-12.64-7.24l-1.36-2.26zm340.1.96l-2.22 3.32c-2.82 4.22-7.53 6.64-12.6 6.49l-14.56.01-6.04 13.37c-1.74 3.85-5.1 6.66-9.14 7.74l-5.39 1.44-9.1 50.53 2.65.69c4.86 1.26 8.87 4.86 10.65 9.58l5.16 13.74 13.05 5.35c4.53 1.86 7.93 5.72 9.13 10.38l.53 2.08 29.42-12.17c4.53-25.73 3.46-52.41-3.68-78.16l-7.86-34.33zm-269.23 34.16l7.49 47.04 18.26 3.27 5.3-4.72 29.75-36.02-3.96-5.35-56.84-4.22zm193.72.01l-52.35 7.76-5.64 6.08 27.44 37.28 7.04 1.43 17-5.33 6.51-47.22zM371.336 319l-29.47 33.14 5.87 12.1 44.73 4.11 5.06-3.32 7.91-40.79-4.27-4.95-29.83-.29zm-76.19 34.73l-12.85 14.19 8.11 15.99 18.93 3.06 9.85-12.4-5.59-11.88-18.45-8.96zm156.54.23l-14.13 7.52-7.15 13.64 9.2 13.57 19.21-1.42 9.4-14.92-16.53-18.39zm-124.08 26.71c-1.16 0-2.33.16-3.49.5-8.12 2.42-12.76 10.96-10.34 19.08 2.42 8.12 10.95 12.77 19.07 10.35 8.12-2.43 12.76-10.96 10.35-19.08-1.98-6.64-8.01-10.76-14.6-10.85h-.99zm92.13.34c-6.47.27-12.19 4.63-13.96 11.2-2.18 8.18 2.69 16.6 10.87 18.78 8.19 2.19 16.6-2.68 18.79-10.86 2.18-8.19-2.69-16.6-10.88-18.79a15.5 15.5 0 0 0-4.82-.33zm-177.73 3.97l-3.87 2.65c-7.71 5.28-15.83 9.87-24.25 13.74l5.7 29.03c24 10.2 50.32 14.99 76.59 14.04l14.12-25.64-.04-.03-1.92-6.37c-1.58-5.22-.46-10.87 2.98-14.95l9.84-11.67-5.87-11.28-14.76 2.44c-4.93.82-9.93-1.08-12.98-4.92l-9.69-12.2-13.74 6.09c-4.76 2.11-10.23 1.41-14.32-1.82l-2.45-1.94-5.34 22.83zm262.65 1.02l-6.17-21.89-3.5 2.85c-3.79 3.08-8.95 3.93-13.55 2.22l-14.58-5.44-10.06 12.01c-3.27 3.9-8.45 5.68-13.56 4.65l-14.71-2.97-4.96 10.67 8.81 12.76c3.1 4.49 3.68 10.2 1.55 15.13l-2.79 6.44.09.04 13.14 26.14c26.29 1.48 52.73-2.82 77.01-12.54l5.01-29.1c-7.57-3.82-14.81-8.25-21.73-13.32v.01zm-157.42 47.27l-12.17 22.13c25.33 12.63 54 19.21 83.08 18.87l-11.38-23.69c-2.3.04-4.56.04-6.84.01-18.25-.3-36.11-5.06-52.69-17.32z"/>
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
