import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CompanyMarkdownPreview } from '../src/ui/company/CompanyMarkdownPreview';

const SAMPLE_MARKDOWN = `# Overview

Text with **bold**, *italic*, and a [website](https://example.com).

- Unordered item

1. Ordered item

> Important note

| Field | Value |
| --- | --- |
| Department | People |

\`\`\`ts
const active = true;
\`\`\`
`;

describe('CompanyMarkdownPreview', () => {
  it('renders common Markdown structure and typography semantics', () => {
    const html = renderToStaticMarkup(createElement(CompanyMarkdownPreview, { content: SAMPLE_MARKDOWN }));

    expect(html).toContain('<article');
    expect(html).toContain('<h1>Overview</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<table>');
    expect(html).toContain('language-ts');
  });

  it('opens links safely without executing raw HTML from documents', () => {
    const content = '[Company](https://example.com)\n\n<script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = renderToStaticMarkup(createElement(CompanyMarkdownPreview, { content }));

    expect(html).toMatch(/target=._blank./);
    expect(html).toMatch(/rel=.noreferrer noopener./);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<img\b[^>]*onerror/i);
  });

  it('provides a themed typography surface with one inner scrollbar', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.company-markdown-preview\s*\{[^}]*height:\s*100%[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.company-markdown-preview h1[^\{]*\{[^}]*font-size:/s);
    expect(css).toMatch(/\.company-markdown-preview blockquote\s*\{[^}]*border-left:/s);
    expect(css).toMatch(/\.company-markdown-preview table\s*\{[^}]*border-collapse:\s*collapse/s);
    expect(css).toMatch(/\.company-markdown-preview pre\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.company-document-dialog :is\(\.company-docx-preview, \.company-pdf-preview, \.company-markdown-preview\)/);
  });
});
