import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CompanyMarkdownPreviewProps {
  content: string;
}

export function CompanyMarkdownPreview({ content }: CompanyMarkdownPreviewProps) {
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
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
