// Shared formatting utilities — extracted from inline usage across components

// ---- Time ----

/** Format a date string as relative time (e.g. "just now", "5m ago", "2h ago", "3d ago") */
export function relativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

/** Format a date string as a localized date+time */
export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString();
}

// ---- Tokens ----

/** Format a token count as a human-readable string (e.g. "1.2M", "45.3k", "500") */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ---- Bytes ----

/** Format a byte count as human-readable (e.g. "512 B", "1.5 KB", "3.2 MB") */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ---- Cost ----

/** Format a dollar cost string (e.g. "$0.0042" → "$0.004", "$1.50") */
export function formatCost(cost: string | number | undefined): string {
  if (cost === undefined || cost === null) return '';
  const n = typeof cost === 'string' ? parseFloat(cost) : cost;
  if (isNaN(n)) return typeof cost === 'string' ? cost : '';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

// ---- Phase / Status badges ----

/** Map a K8s resource phase to a badge variant */
export function phaseVariant(
  phase: string | undefined,
): 'success' | 'warning' | 'error' | 'muted' {
  switch (phase) {
    case 'Ready':
    case 'Active':
    case 'Running':
    case 'Completed':
    case 'Succeeded':
      return 'success';
    case 'Pending':
      return 'warning';
    case 'Failed':
      return 'error';
    default:
      return 'muted';
  }
}
