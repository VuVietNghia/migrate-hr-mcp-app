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
    expect(html).toContain('Kéo &amp; thả');
    expect(html).toContain('multiple=""');
    expect(html).toContain('0 tài liệu');
  });

  it('does not render preview-only organization data', () => {
    const html = renderToStaticMarkup(createElement(CompanyHome));
    expect(html).not.toContain('Aster Studio');
    expect(html).not.toContain('PROTOTYPE');
  });
});
