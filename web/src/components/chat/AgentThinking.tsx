// AgentThinking — "Orbital Trace" thinking indicator for the chat.
// Dots orbit an elliptical path with staggered timing and trailing glow,
// evoking an agent assembling thoughts. No bubble border — floats freely.
import { Show } from 'solid-js';

interface AgentThinkingProps {
  active: boolean;
}

export default function AgentThinking(props: AgentThinkingProps) {
  return (
    <Show when={props.active}>
      <div class="agent-thinking mt-4">
        <div class="agent-thinking__orbit">
          {/* Orbit track — subtle ellipse */}
          <div class="agent-thinking__track" />

          {/* Orbiting dots — 3 particles at staggered phase offsets */}
          <div class="agent-thinking__dot agent-thinking__dot--1" />
          <div class="agent-thinking__dot agent-thinking__dot--2" />
          <div class="agent-thinking__dot agent-thinking__dot--3" />

          {/* Center anchor — faint pulse */}
          <div class="agent-thinking__core" />
        </div>
      </div>
    </Show>
  );
}
