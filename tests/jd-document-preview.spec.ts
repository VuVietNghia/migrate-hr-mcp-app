import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JDDocumentPreview } from '../src/ui/jd-document/JDDocumentPreview';

describe('JDDocumentPreview', () => {
  it('renders markdown, docx, and pdf with the shared viewers', () => {
    expect(renderToStaticMarkup(createElement(JDDocumentPreview, { fileName: 'role.md', text: '# Role' }))).toContain('<h1>Role</h1>');
    expect(renderToStaticMarkup(createElement(JDDocumentPreview, { fileName: 'role.docx', blob: new Blob(['x']) }))).toContain('company-docx-preview');
    expect(renderToStaticMarkup(createElement(JDDocumentPreview, { fileName: 'role.pdf', blob: new Blob(['x']) }))).toContain('company-pdf-preview');
  });

  it('prioritizes loading and error states', () => {
    expect(renderToStaticMarkup(createElement(JDDocumentPreview, { fileName: 'role.md', loading: true }))).toContain('Đang dựng bản xem trước JD');
    expect(renderToStaticMarkup(createElement(JDDocumentPreview, { fileName: 'role.md', error: 'Không đọc được' }))).toContain('Không đọc được');
  });
});
