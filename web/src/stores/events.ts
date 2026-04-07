// Global SSE event store — connects to the multiplexed SSE stream
// and dispatches events to subscribers.
import { createSignal, onCleanup } from 'solid-js';
import { connectGlobalSSE } from '../lib/api';
import type { FEPEvent, AgentEventEnvelope } from '../types';

export type AgentKey = { namespace: string; name: string };
export type AgentStatus = 'online' | 'offline' | 'unknown';

// Subscriber callback type
type FEPSubscriber = (agentKey: AgentKey, event: FEPEvent) => void;
type StatusSubscriber = (agentKey: AgentKey, status: AgentStatus) => void;
type ResourceSubscriber = () => void;

// ── Singleton state ──

let eventSource: EventSource | null = null;
const fepSubscribers = new Set<FEPSubscriber>();
const statusSubscribers = new Set<StatusSubscriber>();
const resourceSubscribers = new Set<ResourceSubscriber>();

const [connected, setConnected] = createSignal(false);
const [agentStatuses, setAgentStatuses] = createSignal<Record<string, AgentStatus>>({});

// ── Public API ──

export { connected, agentStatuses };

/** Start the global SSE connection. Call once at app mount. */
export function startEventStream() {
  if (eventSource) return;

  eventSource = connectGlobalSSE(
    (eventType, data) => {
      switch (eventType) {
        case 'connected':
          setConnected(true);
          break;

        case 'agent.event': {
          const envelope = data as AgentEventEnvelope;
          const key: AgentKey = {
            namespace: envelope.agent.namespace,
            name: envelope.agent.name,
          };
          fepSubscribers.forEach((fn) => fn(key, envelope.event));
          break;
        }

        case 'agent.online':
        case 'agent.offline': {
          const d = data as { namespace?: string; name?: string };
          if (d.namespace && d.name) {
            const status: AgentStatus = eventType === 'agent.online' ? 'online' : 'offline';
            updateAgentStatus(d.namespace, d.name, status);
            statusSubscribers.forEach((fn) =>
              fn({ namespace: d.namespace!, name: d.name! }, status),
            );
          }
          break;
        }

        case 'agent.status': {
          const d = data as { namespace: string; name: string; status: string };
          updateAgentStatus(d.namespace, d.name, d.status as AgentStatus);
          break;
        }

        case 'resource.changed':
          resourceSubscribers.forEach((fn) => fn());
          break;

        case 'heartbeat':
          // keepalive, no action needed
          break;
      }
    },
    () => {
      setConnected(false);
      // Auto-reconnect is handled by EventSource natively
    },
  );
}

/** Stop the global SSE connection. */
export function stopEventStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    setConnected(false);
  }
}

// ── Subscribe helpers ──

/** Subscribe to FEP events for a specific agent (or all agents if key is null). */
export function onFEPEvent(
  agentKey: AgentKey | null,
  callback: (event: FEPEvent) => void,
): () => void {
  const fn: FEPSubscriber = (key, event) => {
    if (!agentKey || (key.namespace === agentKey.namespace && key.name === agentKey.name)) {
      callback(event);
    }
  };
  fepSubscribers.add(fn);
  return () => fepSubscribers.delete(fn);
}

/** Subscribe to agent online/offline status changes. */
export function onAgentStatus(callback: StatusSubscriber): () => void {
  statusSubscribers.add(callback);
  return () => statusSubscribers.delete(callback);
}

/** Subscribe to K8s resource change notifications (triggers refetch). */
export function onResourceChanged(callback: ResourceSubscriber): () => void {
  resourceSubscribers.add(callback);
  return () => resourceSubscribers.delete(callback);
}

// ── Internal ──

function updateAgentStatus(namespace: string, name: string, status: AgentStatus) {
  const key = `${namespace}/${name}`;
  setAgentStatuses((prev) => ({ ...prev, [key]: status }));
}

/** SolidJS helper: auto-cleanup subscription on component unmount. */
export function useEventSubscription(
  agentKey: () => AgentKey | null,
  callback: (event: FEPEvent) => void,
) {
  let unsub: (() => void) | null = null;

  // Re-subscribe when agentKey changes
  const subscribe = () => {
    if (unsub) unsub();
    unsub = onFEPEvent(agentKey(), callback);
  };

  subscribe();
  onCleanup(() => unsub?.());
}
