// Markdown renderer with syntax highlighting
import { createMemo, createEffect, onCleanup } from 'solid-js';
import { Marked } from 'marked';
import hljs from 'highlight.js';

interface MarkdownProps {
  content: string;
  class?: string;
}

// Configure marked with syntax highlighting
const marked = new Marked({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;

      return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${language}</span></div><pre><code class="hljs ${language ? `language-${language}` : ''}">${highlighted}</code></pre></div>`;
    },
    codespan({ text }: { text: string }) {
      return `<code>${text}</code>`;
    },
  },
});

export default function Markdown(props: MarkdownProps) {
  let ref: HTMLDivElement | undefined;

  const html = createMemo(() => {
    try {
      return marked.parse(props.content || '', { async: false }) as string;
    } catch {
      return props.content || '';
    }
  });

  return (
    <div
      ref={ref}
      class={`md-prose ${props.class || ''}`}
      innerHTML={html()}
    />
  );
}
