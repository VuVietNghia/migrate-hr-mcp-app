import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StudioShell } from '../src/ui/studio/StudioShell';
import { buildStudioNavGroups } from '../src/ui/studio/studio-navigation';

describe('StudioShell', () => {
  it('renders real context, active navigation and breadcrumb landmarks', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioShell,
        {
          activeTab: 'cvScored',
          groups: buildStudioNavGroups(true),
          onSelectTab: vi.fn(),
          roomName: 'Phòng Nhân sự Miền Nam',
          username: 'Nguyễn An',
          userRoles: ['owner'],
        },
        createElement('p', null, 'Nội dung màn hình'),
      ),
    );

    expect(html).toContain('<nav');
    expect(html).toContain('aria-label="Điều hướng chính"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Phòng Nhân sự Miền Nam');
    expect(html).toContain('Nguyễn An');
    expect(html).toContain('Ứng viên');
    expect(html).toContain('Nội dung màn hình');
  });

  it('provides the mobile menu and all four theme choices', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioShell,
        {
          activeTab: 'home',
          groups: buildStudioNavGroups(false),
          onSelectTab: vi.fn(),
          roomName: 'Room tuyển dụng',
          username: 'Thành viên',
          userRoles: ['member'],
        },
        'Nội dung',
      ),
    );

    expect(html).toContain('aria-label="Mở điều hướng"');
    expect(html).toContain('aria-expanded="false"');
    for (const option of ['Auto', 'Light', 'Dark', 'Brand']) {
      expect(html).toContain(`>${option}</option>`);
    }
  });

  it('does not leak prototype-only labels or data', () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioShell,
        {
          activeTab: 'home',
          groups: buildStudioNavGroups(false),
          onSelectTab: vi.fn(),
          roomName: 'Room thật',
          username: 'Người dùng thật',
          userRoles: [],
        },
        'Nội dung',
      ),
    );

    expect(html).not.toContain('Aster Studio');
    expect(html).not.toContain('PROTOTYPE');
    expect(html).not.toContain('persona');
    expect(html).not.toContain('scenario');
  });
});
