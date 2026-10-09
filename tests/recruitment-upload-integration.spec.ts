import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => undefined,
  usePrivosContext: () => ({ roomId: undefined }),
  parseToolResult: (value: unknown) => value,
}));

import RecruitmentPanel, * as panelModule from '../src/ui/recruitment-panel';
import { shouldApplyRecruitmentPreviewResult } from '../src/ui/recruitment-panel';

describe('recruitment uploaded JD integration', () => {
  it('orders the compact header actions around Tải JD', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentPanel, { active: true, onNavigate: vi.fn() }));
    expect(html.indexOf('Phòng ban')).toBeLessThan(html.indexOf('Tải JD'));
    expect(html.indexOf('Tải JD')).toBeLessThan(html.indexOf('Tạo JD thủ công'));
    expect(html).toContain('recruitment-studio-header-action');
  });

  it('renders uploaded cards without invented structured business fields', () => {
    const Card = (panelModule as Record<string, any>).RecruitmentJobCard;
    expect(Card).toBeTypeOf('function');
    const html = renderToStaticMarkup(createElement(Card, {
      job: { kind: 'uploaded', fileId: 'f1', fileName: 'role.pdf', departmentKey: 'it', departmentLabel: 'IT', format: 'pdf' },
      onOpen: vi.fn(),
    }));
    expect(html).toContain('role.pdf');
    expect(html).toContain('PDF');
    expect(html).toContain('IT');
    expect(html).not.toContain('Mức lương');
    expect(html).not.toContain('Chưa có mô tả ngắn');
    expect(html).toContain('JD được người dùng tải lên từ máy');
  });

  it('rejects preview results from an older request in the same Room', () => {
    expect(shouldApplyRecruitmentPreviewResult(1, 2, true)).toBe(false);
    expect(shouldApplyRecruitmentPreviewResult(2, 2, false)).toBe(false);
    expect(shouldApplyRecruitmentPreviewResult(2, 2, true)).toBe(true);
  });
});
