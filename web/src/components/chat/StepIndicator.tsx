// StepIndicator — "Step N" progress marker with optional usage info
import { Show } from 'solid-js';
import type { Usage } from '../../types';
import CostDisplay from '../shared/CostDisplay';

interface StepIndicatorProps {
  stepNumber: number;
  usage?: Usage;
  finishReason?: string;
  toolCallCount?: number;
  class?: string;
}

export default function StepIndicator(props: StepIndicatorProps) {
  const hasDetails = () => props.usage || props.toolCallCount;

  return (
    <div class={`flex items-center gap-2 py-1 ${props.class || ''}`}>
      {/* Step marker */}
      <div class="flex items-center gap-1.5">
        <div class="w-5 h-5 rounded-full bg-surface-2 border border-border flex items-center justify-center">
          <span class="text-[10px] font-medium text-text-muted">{props.stepNumber}</span>
        </div>
        <span class="text-xs text-text-muted">Step {props.stepNumber}</span>
      </div>

      {/* Details (shown for step_finish) */}
      <Show when={hasDetails()}>
        <div class="flex items-center gap-2 text-xs text-text-muted">
          <Show when={props.toolCallCount && props.toolCallCount > 0}>
            <span>{props.toolCallCount} tool{props.toolCallCount! > 1 ? 's' : ''}</span>
          </Show>

          <Show when={props.usage}>
            <CostDisplay usage={props.usage!} compact />
          </Show>
        </div>
      </Show>
    </div>
  );
}
