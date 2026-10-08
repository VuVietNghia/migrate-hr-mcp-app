import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => ({ callServerTool: vi.fn() }),
  usePrivosContext: () => ({ roomId: 'room-1' }),
  parseToolResult: (value: unknown) => value,
}));

import RecruitmentPanel, * as recruitmentPanelModule from '../src/ui/recruitment-panel';

describe('Recruitment Studio page', () => {
  it('renders the Studio recruitment hierarchy without preview data', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentPanel, { onNavigate: vi.fn() }));

    expect(html).toContain('Vị trí tuyển dụng');
    expect(html).toContain('Tổ chức phòng ban và quản lý mô tả công việc');
    expect(html).toContain('Phòng ban');
    expect(html).toContain('Tạo JD thủ công');
    expect(html).toContain('Tìm vị trí tuyển dụng');
    expect(html).not.toContain('Aster Studio');
    expect(html).not.toContain('PROTOTYPE');
  });

  it('uses the desktop sidebar and two-column job grid, then collapses safely', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.recruitment-studio-layout\s*\{[^}]*grid-template-columns:\s*200px minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.recruitment-studio-job-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/@media[^}]*max-width:\s*1000px[\s\S]*\.recruitment-studio-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it('shows a larger job count, stretches the department panel, and centers pagination below the jobs', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.recruitment-studio-toolbar\s*>\s*div\s*>\s*span\s*\{[^}]*font-size:\s*0\.7rem/s);
    expect(css).toMatch(/\.recruitment-studio-layout\s*\{[^}]*align-items:\s*stretch/s);
    expect(css).toMatch(/\.recruitment-studio-pagination\s*\{[^}]*justify-content:\s*center/s);
  });

  it('renders the current page between previous and next arrow buttons', () => {
    const Pager = (recruitmentPanelModule as Record<string, unknown>).RecruitmentJobPager;
    const html = typeof Pager === 'function'
      ? renderToStaticMarkup(createElement(Pager as never, { page: 1, pageCount: 3, onPageChange: vi.fn() }))
      : '';

    expect(html).toContain('aria-label="Trang trước"');
    expect(html).toContain('Trang 2 / 3');
    expect(html).toContain('aria-label="Trang sau"');
  });

  it('aligns the all-jobs count with department counts and uses the warning color for the AI bulb', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.recruitment-studio-department-list\s*>\s*button\s*\{[^}]*padding-right:\s*34px/s);
    expect(css).toMatch(/\.recruitment-studio-ai-card\s*>\s*svg\s*\{[^}]*color:\s*var\(--studio-warning\)/s);
  });

  it('styles JD metadata pills, the location banner, and the complete document body', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.recruitment-job-detail__pill\s*\{[^}]*display:\s*inline-flex[^}]*gap:/s);
    expect(css).toMatch(/\.recruitment-job-detail__pill--department\s*\{[^}]*background:\s*var\(--studio-info-soft\)/s);
    expect(css).toMatch(/\.recruitment-job-detail__pill--salary\s*\{[^}]*background:\s*var\(--studio-success-soft\)/s);
    expect(css).toMatch(/\.recruitment-job-detail__location\s*\{[^}]*background:\s*var\(--studio-surface-subtle\)/s);
    expect(css).toMatch(/\.recruitment-job-detail__document\s*section\s*\{[^}]*border-top:\s*1px solid var\(--studio-border-subtle\)/s);
  });

  it('uses the embedded app font and semantic Studio tokens', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');
    const fonts = readFileSync(resolve('src/ui/studio/privos-fonts.css'), 'utf8');

    expect(css).toContain('var(--studio-surface)');
    expect(css).toContain('var(--studio-text)');
    expect(fonts).toContain("font-family: 'Montserrat'");
  });
});
