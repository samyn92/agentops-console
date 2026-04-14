// AgentThinking — configurable thinking indicator for the chat.
// Three styles: "orbital" (orbiting dots), "waveform" (audio bars), "helix" (DNA strands).
// Style is controlled via the thinkingStyle setting.
import { Show, Switch, Match } from 'solid-js';
import { thinkingStyle } from '../../stores/settings';

interface AgentThinkingProps {
  active: boolean;
}

/** Orbital Trace — 3 dots orbiting a circular path with staggered phase */
function OrbitalThinking() {
  return (
    <div class="agent-thinking--orbital">
      <div class="agent-thinking--orbital__track" />
      <div class="agent-thinking--orbital__dot agent-thinking--orbital__dot--1" />
      <div class="agent-thinking--orbital__dot agent-thinking--orbital__dot--2" />
      <div class="agent-thinking--orbital__dot agent-thinking--orbital__dot--3" />
      <div class="agent-thinking--orbital__core" />
    </div>
  );
}

/** Waveform — 4 bars oscillating like an audio equalizer */
function WaveformThinking() {
  return (
    <div class="agent-thinking--waveform">
      <div class="agent-thinking--waveform__bar agent-thinking--waveform__bar--1" />
      <div class="agent-thinking--waveform__bar agent-thinking--waveform__bar--2" />
      <div class="agent-thinking--waveform__bar agent-thinking--waveform__bar--3" />
      <div class="agent-thinking--waveform__bar agent-thinking--waveform__bar--4" />
    </div>
  );
}

/** DNA Helix — two intertwined strands rotating in pseudo-3D */
function HelixThinking() {
  return (
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
  );
}

export default function AgentThinking(props: AgentThinkingProps) {
  return (
    <Show when={props.active}>
      <div class="agent-thinking mt-3">
        <Switch>
          <Match when={thinkingStyle() === 'orbital'}>
            <OrbitalThinking />
          </Match>
          <Match when={thinkingStyle() === 'waveform'}>
            <WaveformThinking />
          </Match>
          <Match when={thinkingStyle() === 'helix'}>
            <HelixThinking />
          </Match>
        </Switch>
      </div>
    </Show>
  );
}
