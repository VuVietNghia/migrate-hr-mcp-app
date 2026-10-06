import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  beginCompanyPreview,
  closeCompanyPreview,
  createCompanyPreviewState,
  settleCompanyPreview,
} from '../src/ui/company/company-preview-state';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => ({ callServerTool: vi.fn(), uploadFile: vi.fn() }),
  usePrivosContext: () => ({ roomId: 'room-1', roomName: 'Công ty Sao Mai' }),
}));

import CompanyHome from '../src/ui/company-home';

describe('Company preview request generation', () => {
  it('ignores an older result after a newer document was selected', () => {
    const initial = createCompanyPreviewState();
    const requestA = beginCompanyPreview(initial, 'document-a');
    const requestB = beginCompanyPreview(requestA.state, 'document-b');
    const stale = settleCompanyPreview(requestB.state, requestA.requestId, { text: 'Nội dung A' });
    const current = settleCompanyPreview(stale, requestB.requestId, { text: 'Nội dung B' });

    expect(stale).toBe(requestB.state);
    expect(current).toMatchObject({ documentId: 'document-b', loading: false, text: 'Nội dung B', error: null });
  });

  it('invalidates an in-flight result when the preview closes', () => {
    const request = beginCompanyPreview(createCompanyPreviewState(), 'document-a');
    const closed = closeCompanyPreview(request.state);

    expect(closed.documentId).toBeNull();
    expect(settleCompanyPreview(closed, request.requestId, { text: 'Đến muộn' })).toBe(closed);
  });
  it('stores binary content and clears it when another preview starts', () => {
    const blob = new Blob(['binary content'], { type: 'application/pdf' });
    const request = beginCompanyPreview(createCompanyPreviewState(), 'document-a');
    const loaded = settleCompanyPreview(request.state, request.requestId, { blob });
    const next = beginCompanyPreview(loaded, 'document-b');

    expect(loaded).toMatchObject({ loading: false, blob, text: null, error: null });
    expect(next.state).toMatchObject({ documentId: 'document-b', loading: true, blob: null });
    expect(closeCompanyPreview(loaded).blob).toBeNull();
  });
});

describe('Company Studio page', () => {
  it('renders the real room context and the new document workflows', () => {
    const html = renderToStaticMarkup(createElement(CompanyHome));

    expect(html).toContain('Công ty Sao Mai');
    expect(html).toContain('Thông tin rõ ràng. Công việc liền mạch.');
    expect(html).toContain('Tìm tài liệu');
    expect(html).toContain('Chọn tài liệu hoặc thả tệp vào đây');
    expect(html).toContain('multiple=""');
    expect(html).toContain('0 tài liệu');
  });

  it('does not render preview-only organization data', () => {
    const html = renderToStaticMarkup(createElement(CompanyHome));
    expect(html).not.toContain('Aster Studio');
    expect(html).not.toContain('PROTOTYPE');
  });

  it('keeps document dialog fixed while only the preview content scrolls', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.company-document-dialog\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.company-document-dialog\[open\]\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
    expect(css).toMatch(/\.company-document-dialog \.studio-dialog__body\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.company-document-dialog :is\(\.company-docx-preview, \.company-pdf-preview, \.company-markdown-preview\)\s*\{[^}]*height:\s*100%[^}]*max-height:\s*none[^}]*overflow:\s*auto/s);
  });

  it('routes Markdown files through the formatted preview instead of plain text', () => {
    const source = readFileSync(resolve('src/ui/company-home.tsx'), 'utf8');

    expect(source).toContain('CompanyMarkdownPreview');
    expect(source).toMatch(/describeCompanyDocumentFormat\(selectedDocument\)\.id === 'markdown'/);
    expect(source).toMatch(/<CompanyMarkdownPreview content=\{preview\.text/);
  });

  it('renders the compact redesigned source cards without an idle upload action', () => {
    const html = renderToStaticMarkup(createElement(CompanyHome));

    expect(html.match(/company-source-card__heading/g) ?? []).toHaveLength(2);
    expect(html).toMatch(/<span class=.studio-prefix-input__prefix. aria-hidden=.true.>https:\/\/<\/span>/);
    expect(html).toContain('B\u1ed5 sung t\u00e0i li\u1ec7u');
    expect(html).toContain('AI t\u1ed5ng h\u1ee3p v\u00e0 l\u01b0u th\u00e0nh t\u00e0i li\u1ec7u Markdown.');
    expect(html).toMatch(/<label class=.company-dropzone./);
    expect(html).not.toContain('company-upload-submit');
  });

  it('keeps the document search visually unchanged while typing', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.studio-search-input input:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*none/s);
  });

  it('draws the website focus ring around the prefix and input as one control', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');
    const focusRule = css.match(/\.studio-prefix-input:focus-within\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(css).toMatch(/\.studio-prefix-input:focus-within\s*\{[^}]*outline:\s*2px solid var\(--studio-accent\)[^}]*box-shadow:\s*var\(--studio-focus\)/s);
    expect(focusRule).not.toContain('border-color');
    expect(css).toMatch(/\.studio-prefix-input input:focus-visible\s*\{[^}]*outline:\s*0[^}]*box-shadow:\s*none/s);
  });

  it('renders the company fields through reusable Studio controls', () => {
    const html = renderToStaticMarkup(createElement(CompanyHome));

    expect(html).toContain('studio-prefix-input');
    expect(html).toContain('studio-prefix-input__prefix');
    expect(html).toContain('studio-search-input');
  });

  it('keeps the website prefix appearance unchanged on hover', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.studio-prefix-input__prefix:hover\s*\{[^}]*color:\s*var\(--studio-text-muted\)[^}]*background:\s*var\(--studio-surface-subtle\)[^}]*border-right-color:\s*var\(--studio-border\)[^}]*box-shadow:\s*none[^}]*transform:\s*none/s);
  });

  it('loads the embedded Montserrat weights from the redesign assets', () => {
    const entry = readFileSync(resolve('src/ui/main.tsx'), 'utf8');

    expect(entry).toContain("import './studio/privos-fonts.css'");

    const fonts = readFileSync(resolve('src/ui/studio/privos-fonts.css'), 'utf8');
    for (const weight of [400, 500, 600]) {
      expect(fonts).toMatch(new RegExp(`font-family: 'Montserrat';[\\s\\S]*?font-weight: ${weight};`));
    }
  });
});
