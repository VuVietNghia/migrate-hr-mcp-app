import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateApplication } from '../src/ui/cv-scored/candidate-model';
import {
  CandidateStudioScreen,
  parseCandidateDragData,
  serializeCandidateDragData,
} from '../src/ui/cv-scored/CandidateStudioViews';
import { ALL_SCREENING_LISTS } from '../src/ui/cv-scored/candidate-selection-state';

const candidates: CandidateApplication[] = [
  {
    _id: 'same',
    applicationKey: 'list-a:same',
    sourceListId: 'list-a',
    sourceListName: 'SCREENING_DESIGN_09_2026',
    name: 'Nguyễn Minh Anh',
    email: 'anh@example.com',
    position: 'Senior Product Designer',
    jobTitle: 'Senior Product Designer',
    status: '03_Tiem_Nang',
    score: 92,
    category: 'ĐẠT',
  },
  {
    _id: 'same',
    applicationKey: 'list-b:same',
    sourceListId: 'list-b',
    sourceListName: 'SCREENING_FRONTEND_10_2026',
    name: 'Trần Hoàng Nam',
    email: 'nam@example.com',
    position: 'TECHNOLOGY',
    jobTitle: 'Full Stack Developer',
    departmentLabel: 'Engineering',
    recruitmentPeriod: 'Ngày 10/10/2026',
    status: '05_Moi_Phong_Van',
    score: 88,
    category: 'CÂN NHẮC',
  },
];

function render(viewMode: 'kanban' | 'list', sentApplicationKeys: ReadonlySet<string> = new Set()) {
  return renderToStaticMarkup(createElement(CandidateStudioScreen, {
    lists: [
      { _id: 'list-b', name: 'SCREENING_FRONTEND_10_2026', createdAt: '2026-10-01T00:00:00Z' },
      { _id: 'list-a', name: 'SCREENING_DESIGN_09_2026', createdAt: '2026-09-01T00:00:00Z' },
    ],
    selectedListId: ALL_SCREENING_LISTS,
    candidates,
    metrics: { total: 2, passed: 1, awaitingInterview: 0, interviewed: 0 },
    viewMode,
    searchQuery: '',
    resultFilter: 'all',
    loading: false,
    showCampaignLabel: true,
    onScopeChange: () => undefined,
    onSearchChange: () => undefined,
    onResultFilterChange: () => undefined,
    onViewModeChange: () => undefined,
    onRefresh: () => undefined,
    onMove: () => undefined,
    onInvite: () => undefined,
    onDetail: () => undefined,
    isInviteSent: (applicationKey) => sentApplicationKeys.has(applicationKey),
  }));
}

describe('CandidateStudioScreen', () => {
  it('renders the production header, metrics, filters, and real all-campaign option', () => {
    const html = render('kanban');

    expect(html).toContain('TUYỂN DỤNG');
    expect(html).toContain('Ứng viên');
    expect(html).toContain('Tất cả ứng viên');
    expect(html).toContain('Đạt yêu cầu');
    expect(html).toContain('Chờ phỏng vấn');
    expect(html).toContain('Đã phỏng vấn');
    expect(html).toContain('Tìm ứng viên, vị trí hoặc email...');
    expect(html).toContain('Tất cả đợt tuyển dụng');
    expect(html).toContain('Tất cả kết quả');
    expect(html).toContain('Kanban');
    expect(html).toContain('Danh sách');
    expect(html).toContain('2 ứng viên phù hợp');
    expect(html).not.toContain('PROTOTYPE');
    expect(html).not.toContain('Aster Studio');
  });

  it('renders both candidate filters with the shared custom dropdown instead of native selects', () => {
    const html = render('kanban');

    expect(html.match(/role=.combobox./g)).toHaveLength(2);
    expect(html).toContain('candidate-studio-select-menu');
    expect(html).not.toContain('<select');
  });

  it('renders both applications with campaign labels in Kanban even when item ids match', () => {
    const html = render('kanban');

    expect(html).toContain('Nguyễn Minh Anh');
    expect(html).toContain('Trần Hoàng Nam');
    expect(html).toContain('Full Stack Developer');
    expect(html).toContain('Engineering · Ngày 10/10/2026');
    expect(html).not.toContain('TECHNOLOGY');
    expect(html).toContain('DESIGN 09 2026');
    expect(html).toContain('FRONTEND 10 2026');
    expect(html).toContain('Gửi email phỏng vấn');
    expect(html).not.toContain('Gửi thư mời phỏng vấn');
  });

  it('shows a compact green sent-email state after an interview email was sent', () => {
    const html = render('kanban', new Set(['list-b:same']));

    expect(html).toContain('Đã gửi email');
    expect(html).toContain('candidate-studio-invite is-sent');
    expect(html).not.toContain('Đã gửi thư mời');
  });

  it('renders the list columns and source campaign without fetching another dataset', () => {
    const html = render('list');

    expect(html).toContain('Vị trí / đợt');
    expect(html).toContain('Điểm');
    expect(html).toContain('Kết quả');
    expect(html).toContain('Trạng thái');
    expect(html).toContain('Chi tiết');
    expect(html).toContain('Senior Product Designer');
    expect(html).toContain('Engineering · Ngày 10/10/2026');
  });
});

describe('candidate drag payload', () => {
  it('round-trips both list and item identity', () => {
    const payload = serializeCandidateDragData(candidates[0]);
    expect(parseCandidateDragData(payload)).toEqual({ listId: 'list-a', itemId: 'same' });
  });

  it('rejects malformed payloads', () => {
    expect(parseCandidateDragData('same')).toBeNull();
    expect(parseCandidateDragData('{"listId":"list-a"}')).toBeNull();
  });
});
