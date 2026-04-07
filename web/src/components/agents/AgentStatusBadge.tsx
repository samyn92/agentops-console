// Agent status badge — Online/Offline/Busy/Error with dot indicator
import Badge from '../shared/Badge';
import type { BadgeVariant } from '../shared/Badge';

interface AgentStatusBadgeProps {
  phase: string;
  isOnline: boolean;
  class?: string;
}

function getStatusInfo(phase: string, isOnline: boolean): { label: string; variant: BadgeVariant } {
  if (!isOnline) return { label: 'Offline', variant: 'muted' };

  switch (phase.toLowerCase()) {
    case 'running':
    case 'ready':
      return { label: 'Online', variant: 'success' };
    case 'busy':
    case 'processing':
      return { label: 'Busy', variant: 'info' };
    case 'error':
    case 'failed':
      return { label: 'Error', variant: 'error' };
    case 'pending':
    case 'creating':
      return { label: 'Pending', variant: 'warning' };
    default:
      return { label: phase || 'Unknown', variant: 'muted' };
  }
}

export default function AgentStatusBadge(props: AgentStatusBadgeProps) {
  const info = () => getStatusInfo(props.phase, props.isOnline);

  return (
    <Badge variant={info().variant} dot class={props.class}>
      {info().label}
    </Badge>
  );
}
