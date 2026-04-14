// AgentThinking — inline thinking indicator.
// Shows "Thinking..." text with a subtle pulse. After 3 seconds,
// adds an elapsed timer. Sits inline within the message flow.
import { Show, onCleanup, createSignal } from 'solid-js';

interface AgentThinkingProps {
  active: boolean;
}

export default function AgentThinking(props: AgentThinkingProps) {
  const [elapsed, setElapsed] = createSignal(0);
  let interval: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;

  // Start/stop timer based on active state
  const startTimer = () => {
    startTime = Date.now();
    setElapsed(0);
    interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    setElapsed(0);
  };

  // Watch active prop changes
  const checkActive = () => {
    if (props.active && !interval) {
      startTimer();
    } else if (!props.active && interval) {
      stopTimer();
    }
  };

  // Use a getter to reactively track props.active
  // SolidJS will re-run this when active changes
  const isActive = () => {
    checkActive();
    return props.active;
  };

  onCleanup(() => stopTimer());

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <Show when={isActive()}>
      <div class="flex items-center gap-2.5 py-2 mt-2 fade-slide-in">
        <div class="agent-thinking--helix">
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-a1" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-a2" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-a3" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-a4" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-b1" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-b2" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-b3" />
          <div class="agent-thinking--helix__dot agent-thinking--helix__dot-b4" />
        </div>
        <span class="text-xs text-text-muted">Thinking</span>
        <Show when={elapsed() >= 3}>
          <span class="text-[10px] text-text-muted/60 tabular-nums">{formatElapsed(elapsed())}</span>
        </Show>
      </div>
    </Show>
  );
}
