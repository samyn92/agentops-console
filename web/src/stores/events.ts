// Global SSE event store — connects to the multiplexed SSE stream
// and dispatches events to subscribers.
import { createSignal } from 'solid-js';
import { connectGlobalSSE } from '../lib/api';
import type { FEPEvent, AgentEventEnvelope } from '../types';

export type AgentKey = { namespace: string; name: string };

// Subscriber callback type
type FEPSubscriber = (agentKey: AgentKey, event: FEPEvent) => void;
type ResourceSubscriber = () => void;

// ── Singleton state ──

let eventSource: EventSource | null = null;
const fepSubscribers = new Set<FEPSubscriber>();
const resourceSubscribers = new Set<ResourceSubscriber>();

const [connected, setConnected] = createSignal(false);

// ── Public API ──

export { connected };

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

/** Subscribe to K8s resource change notifications (triggers refetch). */
export function onResourceChanged(callback: ResourceSubscriber): () => void {
  resourceSubscribers.add(callback);
  return () => resourceSubscribers.delete(callback);
}
