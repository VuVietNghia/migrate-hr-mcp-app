import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CandidateDetailDialog } from '../src/ui/cv-scored/CandidateDetailDialog';

const candidate = {
  _id: 'cv-1',
  applicationKey: 'list-a:cv-1',
  sourceListId: 'list-a',
  sourceListName: 'SCREENING_DESIGN_09_2026',
  name: '2026-09-12_CV_Nguyen_Van_A.md',
  position: 'TECHNOLOGY',
  jobTitle: 'Full Stack Developer',
  departmentLabel: 'IT',
  recruitmentPeriod: 'Ngày 12/09/2026',
  status: '05_Moi_Phong_Van',
  score: 88,
  category: 'ĐẠT',
  reason: 'Kinh nghiệm phù hợp và có bằng chứng.',
  email: 'a@example.com',
  sdt: '0900000010',
};

describe('CandidateDetailDialog', () => {
  it('renders real candidate data, stage action, lifecycle action and only real criteria', () => {
    const html = renderToStaticMarkup(createElement(CandidateDetailDialog, {
      open: true,
      candidate,
      stageOptions: [{ value: '05_Moi_Phong_Van', label: 'Mời phỏng vấn' }],
      evaluation: {
        file: { fileId: 'f-1', fileName: 'candidate.md' },
        fullMarkdown: '# evaluation',
        criteria: [{ id: 'core_jd_fit', label: 'Phù hợp yêu cầu cốt lõi', maxPoints: 35, awardedPoints: 30, evidence: ['React'] }],
      },
      evaluationLoading: false,
      evaluationError: null,
      onClose: () => undefined,
      onStageChange: () => undefined,
      onInvite: () => undefined,
      onOpenEmployeeCreate: () => undefined,
      onDownload: () => undefined,
    }));
    expect(html).toContain('Hồ sơ ứng viên');
    expect(html).toContain('Nguyen Van A');
    expect(html).toContain('Full Stack Developer');
    expect(html).toContain('Ngày 12/09/2026');
    expect(html).toContain('candidate-detail-summary__identity');
    expect(html).toContain('candidate-detail-position');
    expect(html).toContain('candidate-detail-period');
    expect(html).toContain('candidate-detail-department');
    expect(html).toContain('>IT<');
    expect(html).not.toContain('TECHNOLOGY');
    expect(html).not.toContain('Điểm theo tiêu chí');
    expect(html).not.toContain('Lý do đánh giá');
    expect(html).toContain('candidate-detail-contact-grid');
    expect(html).toContain('candidate-detail-reason-panel');
    expect(html).toContain('Tạo hồ sơ nhân sự');
    expect(html).not.toContain('Tải đánh giá .md');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('candidate-studio-select-menu');
    expect(html).not.toContain('<select');
  });

  it('keeps evaluation details and the removed download action hidden when the file is unavailable', () => {
    const html = renderToStaticMarkup(createElement(CandidateDetailDialog, {
      open: true, candidate, stageOptions: [], evaluation: null, evaluationLoading: false,
      evaluationError: 'Không tìm thấy file đánh giá Markdown của ứng viên.',
      onClose: () => undefined, onStageChange: () => undefined, onInvite: () => undefined,
      onOpenEmployeeCreate: () => undefined, onDownload: () => undefined,
    }));
    expect(html).not.toContain('Không tìm thấy file đánh giá');
    expect(html).not.toContain('<progress');
    expect(html).not.toContain('Tải đánh giá .md');
  });
});
