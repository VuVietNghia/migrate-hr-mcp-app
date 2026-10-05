import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  StudioCard,
  StudioDialog,
  StudioInlineState,
  StudioPage,
  StudioPageHeader,
  StudioToast,
} from '../src/ui/studio/StudioPrimitives';

describe('Studio primitives', () => {
  it('renders the shared page hierarchy and semantic class names', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioPage,
        null,
        createElement(StudioPageHeader, {
          eyebrow: 'Công ty',
          title: 'Không gian tuyển dụng',
          description: 'Dữ liệu dùng chung của đội ngũ.',
        }),
        createElement(StudioCard, { title: 'Tài liệu' }, 'Nội dung'),
      ),
    );

    expect(html).toContain('class="studio-page"');
    expect(html).toContain('class="studio-page-header');
    expect(html).toContain('<h1');
    expect(html).toContain('Không gian tuyển dụng');
    expect(html).toContain('class="studio-card');
    expect(html).toContain('<h2');
  });

  it('announces inline state and toast messages with appropriate live roles', () => {
    const statusHtml = renderToStaticMarkup(
      createElement(StudioInlineState, { tone: 'info' }, 'Đang tải'),
    );
    const alertHtml = renderToStaticMarkup(
      createElement(StudioToast, { tone: 'danger' }, 'Không thể tải dữ liệu'),
    );

    expect(statusHtml).toContain('role="status"');
    expect(statusHtml).toContain('studio-inline-state--info');
    expect(alertHtml).toContain('role="alert"');
    expect(alertHtml).toContain('studio-toast--danger');
  });

  it('labels the shared dialog and exposes a close action', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioDialog,
        { open: true, title: 'Xem tài liệu', onClose: vi.fn() },
        'Nội dung tài liệu',
      ),
    );

    expect(html).toContain('<dialog');
    expect(html).toContain('open=""');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain('aria-label="Đóng"');
    expect(html).toContain('Nội dung tài liệu');
  });
});
