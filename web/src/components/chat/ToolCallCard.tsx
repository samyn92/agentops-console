// ToolCallCard — dispatches to the correct tool-specific renderer based on metadata.ui
import { Show, Switch, Match, Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { ToolPart } from '../../types';
import type { ToolMetadata } from '../../types';
import Badge from '../shared/Badge';
import Spinner from '../shared/Spinner';
import GenericCard from '../tools/GenericCard';
import TerminalCard from '../tools/TerminalCard';
import DiffCard from '../tools/DiffCard';
import CodeCard from '../tools/CodeCard';
import FileTreeCard from '../tools/FileTreeCard';
import SearchResultsCard from '../tools/SearchResultsCard';
import FileCreatedCard from '../tools/FileCreatedCard';
import WebFetchCard from '../tools/WebFetchCard';
import AgentRunCard from '../tools/AgentRunCard';
import KubernetesCard from '../tools/KubernetesCard';
import HelmCard from '../tools/HelmCard';

interface ToolCallCardProps {
  part: ToolPart;
  class?: string;
}

interface ToolCardProps {
  toolName: string;
  input: string;
  output: string;
  isError: boolean;
  metadata?: ToolMetadata;
  class?: string;
}

// Tool renderer dispatch map — maps metadata.ui hint to component
const renderers: Record<string, Component<ToolCardProps>> = {
  terminal: TerminalCard,
  diff: DiffCard,
  code: CodeCard,
  'file-tree': FileTreeCard,
  'search-results': SearchResultsCard,
  'file-created': FileCreatedCard,
  'web-fetch': WebFetchCard,
  'agent-run': AgentRunCard,
  'agent-run-status': AgentRunCard,
  'kubernetes-resources': KubernetesCard,
  'helm-release': HelmCard,
};

export default function ToolCallCard(props: ToolCallCardProps) {
  const part = () => props.part;

  // Show pending/running state
  if (part().status === 'running' || part().status === 'pending') {
    return (
      <div class={`border border-border rounded-lg overflow-hidden my-1 ${props.class || ''}`}>
        <div class="flex items-center gap-2 px-3 py-2 bg-surface-2">
          <Spinner size="sm" />
          <span class="text-xs font-medium text-text-secondary">{part().toolName}</span>
          <Badge variant="info" class="ml-auto">running</Badge>
        </div>
      </div>
    );
  }

  // Dispatch to typed renderer
  const uiHint = () => part().metadata?.ui as string | undefined;
  const Renderer = () => {
    const hint = uiHint();
    if (hint && renderers[hint]) return renderers[hint];
    // Fallback: infer from tool name when no metadata.ui hint
    switch (part().toolName) {
      case 'bash': return TerminalCard;
      case 'edit': return DiffCard;
      case 'read': return CodeCard;
      case 'glob': case 'ls': return FileTreeCard;
      case 'grep': return SearchResultsCard;
      case 'write': return FileCreatedCard;
      case 'fetch': return WebFetchCard;
      case 'run_agent': case 'get_agent_run': return AgentRunCard;
      default: return GenericCard;
    }
  };

  return (
    <Dynamic
      component={Renderer()}
      toolName={part().toolName}
      input={part().input}
      output={part().output}
      isError={part().isError}
      metadata={part().metadata}
      class={props.class}
    />
  );
}
