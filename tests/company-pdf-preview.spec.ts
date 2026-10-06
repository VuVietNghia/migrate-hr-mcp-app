import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanyPdfPreview, fitPdfPageScale } from '../src/ui/company/CompanyPdfPreview';

describe('Company PDF preview', () => {
  it('starts with an accessible in-app rendering surface', () => {
    const html = renderToStaticMarkup(createElement(CompanyPdfPreview, {
      blob: new Blob(['pdf bytes'], { type: 'application/pdf' }),
    }));

    expect(html).toContain('company-pdf-preview');
    expect(html).toContain('Đang dựng bản xem trước PDF...');
    expect(html).toContain('Nội dung tài liệu PDF');
  });

  it('does not navigate a sandboxed iframe to a blob URL', () => {
    const source = readFileSync(resolve('src/ui/company-home.tsx'), 'utf8');

    expect(source).toContain('<CompanyPdfPreview blob={preview.blob} />');
    expect(source).not.toMatch(/<iframe[^>]*company-pdf-preview/);
  });

  it('fits pages to the popup without excessive upscaling', () => {
    expect(fitPdfPageScale(700, 1000)).toBeCloseTo(0.668);
    expect(fitPdfPageScale(2000, 500)).toBe(1.5);
    expect(fitPdfPageScale(700, 0)).toBe(1);
  });

  it('renders pages near the viewport and releases distant canvases', () => {
    const source = readFileSync(resolve('src/ui/company/CompanyPdfPreview.tsx'), 'utf8');

    expect(source).toContain('new IntersectionObserver');
    expect(source).toContain('else releasePage(slot)');
    expect(source).toContain('canvas.width = 0');
  });
});
