import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CompanyMarkdownPreviewProps {
  content: string;
  highlightedLineIndexes?: ReadonlySet<number>;
}

interface MarkdownSourceNode {
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
}

function changeClassName(
  node: MarkdownSourceNode | undefined,
  highlightedLineIndexes: ReadonlySet<number> | undefined,
  className?: string,
) {
  const startLine = node?.position?.start?.line;
  const endLine = node?.position?.end?.line;
  if (!highlightedLineIndexes?.size || !startLine || !endLine) return className;

  for (let line = startLine - 1; line < endLine; line += 1) {
    if (highlightedLineIndexes.has(line)) {
      return [className, 'jd-studio-change-block', 'is-changed'].filter(Boolean).join(' ');
    }
  }
  return className;
}

export const CompanyMarkdownPreview = memo(function CompanyMarkdownPreview({
  content,
  highlightedLineIndexes,
}: CompanyMarkdownPreviewProps) {
  return (
    <article
      className='company-markdown-preview'
      aria-label={'N\u1ed9i dung t\u00e0i li\u1ec7u Markdown'}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target='_blank' rel='noreferrer noopener' />
          ),
          h1: ({ node, className, ...props }) => <h1 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          h2: ({ node, className, ...props }) => <h2 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          h3: ({ node, className, ...props }) => <h3 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          h4: ({ node, className, ...props }) => <h4 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          h5: ({ node, className, ...props }) => <h5 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          h6: ({ node, className, ...props }) => <h6 {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          p: ({ node, className, ...props }) => <p {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          li: ({ node, className, ...props }) => <li {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          blockquote: ({ node, className, ...props }) => <blockquote {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          table: ({ node, className, ...props }) => <table {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
          pre: ({ node, className, ...props }) => <pre {...props} className={changeClassName(node, highlightedLineIndexes, className)} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});
