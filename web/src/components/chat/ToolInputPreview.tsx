// ToolInputPreview — Live tool argument composition
// For run_agent: a sleek orchestration animation showing the agent being invoked
// For other tools: a compact inline preview with streaming args
import { Show, createMemo } from 'solid-js';
import { getToolStyle, parsePartialArgs, parseAgentName, parseAgentPrompt } from '../../lib/detect';

interface ToolInputPreviewProps {
  toolName: string;
  args: string;
  class?: string;
}

// ── run_agent composing — the "neural handoff" ──
function AgentComposingPreview(props: { args: string }) {
  const agentName = createMemo(() => parseAgentName(props.args));
  const prompt = createMemo(() => parseAgentPrompt(props.args));

  return (
    <div class="composing-agent fade-in">
      {/* Neural trace beam — the orchestration pulse */}
      <div class="neural-trace neural-trace--sm neural-trace--composing">
        <div class="neural-trace__rail" />
        <div class="neural-trace__beam" />
        <div class="neural-trace__glow" />
      </div>

      {/* Content row */}
      <div class="composing-agent__body">
        {/* Left: animated icon + label */}
        <div class="composing-agent__header">
          <div class="composing-agent__icon">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082" />
            </svg>
          </div>
          <span class="composing-agent__label">Delegating</span>
          <Show when={agentName()}>
            <span class="composing-agent__name">{agentName()}</span>
          </Show>
          <Show when={!agentName()}>
            <span class="composing-agent__dots">
              <span class="typing-dot w-1 h-1 rounded-full bg-indigo-400" />
              <span class="typing-dot w-1 h-1 rounded-full bg-indigo-400" style="animation-delay: 0.2s" />
              <span class="typing-dot w-1 h-1 rounded-full bg-indigo-400" style="animation-delay: 0.4s" />
            </span>
          </Show>
        </div>

        {/* Right: streaming prompt preview */}
        <Show when={prompt()}>
          <div class="composing-agent__prompt">
            <span class="composing-agent__prompt-text">
              {prompt()}
            </span>
            <span class="streaming-cursor" />
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── Default composing preview (bash, file ops, etc.) ──
function DefaultComposingPreview(props: { toolName: string; args: string }) {
  const style = () => getToolStyle(props.toolName);
  const parsed = () => parsePartialArgs(props.toolName, props.args);

  return (
    <div class="composing-default fade-in">
      <div class="composing-default__indicator">
        <span class={`composing-default__label ${style().color}`}>
          {style().label}
        </span>
        <Show
          when={parsed()}
          fallback={
            <span class="composing-default__dots">
              <span class="typing-dot w-1 h-1 rounded-full bg-accent" />
              <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.2s" />
              <span class="typing-dot w-1 h-1 rounded-full bg-accent" style="animation-delay: 0.4s" />
            </span>
          }
        >
          {(p) => (
            <span class="composing-default__value">
              <Show when={props.toolName === 'bash'}>
                <span class="text-text-muted select-none mr-1">$</span>
              </Show>
              {p().value}
              <span class="streaming-cursor" />
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}

export default function ToolInputPreview(props: ToolInputPreviewProps) {
  const isAgentTool = () => props.toolName === 'run_agent';

  return (
    <div class={props.class || ''}>
      <Show
        when={isAgentTool()}
        fallback={<DefaultComposingPreview toolName={props.toolName} args={props.args} />}
      >
        <AgentComposingPreview args={props.args} />
      </Show>
    </div>
  );
}
