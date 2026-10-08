import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  RecruitmentJobDetailDialog,
  RecruitmentJobFormDialog,
} from '../src/ui/recruitment/RecruitmentJobDialogs';
import { EMPTY_RECRUITMENT_JOB_DRAFT, type RecruitmentJob } from '../src/ui/recruitment/recruitment-jobs';

const job: RecruitmentJob = {
  fileId: 'file-1',
  fileName: 'JD_Backend.md',
  downloadUrl: 'https://files.example.test/JD_Backend.md',
  title: 'Backend Developer',
  departmentKey: 'it',
  departmentLabel: 'IT',
  location: 'Hà Nội',
  employmentType: 'Full-time',
  salary: '20–30 triệu',
  summary: 'Xây dựng nền tảng tuyển dụng',
  description: 'Xây API\nReview code',
  requirements: 'TypeScript\nKinh nghiệm 2 năm',
  benefits: 'Bảo hiểm sức khỏe',
  contactEmail: 'hr@example.com',
  emailSubject: '[Backend]',
};

describe('RecruitmentJobFormDialog', () => {
  it('renders every existing JD input and the save error in a shared dialog', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobFormDialog, {
      open: true,
      draft: EMPTY_RECRUITMENT_JOB_DRAFT,
      departments: [
        { key: 'it', label: 'IT', order: 0 },
        { key: 'marketing', label: 'Marketing', order: 1 },
      ],
      departmentKey: '',
      isSaving: false,
      saveError: 'Room Files unavailable',
      onDepartmentChange: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(html).toContain('<dialog');
    expect(html).toContain('Tạo JD mới');
    expect(html).toMatch(/name=.title./);
    expect(html).toMatch(/name=.professionalSkills./);
    expect(html).toMatch(/name=.contactEmail./);
    expect(html).toMatch(/role=.alert./);
    expect(html).toContain('Room Files unavailable');
  });

  it('requires a department choice and keeps the all-departments launch unselected', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobFormDialog, {
      open: true,
      draft: EMPTY_RECRUITMENT_JOB_DRAFT,
      departments: [
        { key: 'it', label: 'IT', order: 0 },
        { key: 'marketing', label: 'Marketing', order: 1 },
      ],
      departmentKey: '',
      isSaving: false,
      saveError: '',
      onDepartmentChange: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(html).toMatch(/<select[^>]*name="departmentKey"[^>]*required/);
    expect(html).toContain('<option value="" selected="">Chọn phòng ban</option>');
    expect(html).toContain('<option value="it">IT</option>');
    expect(html).toContain('<option value="marketing">Marketing</option>');
  });

  it('preselects the current department while still allowing another department', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobFormDialog, {
      open: true,
      draft: EMPTY_RECRUITMENT_JOB_DRAFT,
      departments: [
        { key: 'it', label: 'IT', order: 0 },
        { key: 'marketing', label: 'Marketing', order: 1 },
      ],
      departmentKey: 'marketing',
      isSaving: false,
      saveError: '',
      onDepartmentChange: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(html).toContain('<option value="marketing" selected="">Marketing</option>');
    expect(html).toContain('<option value="it">IT</option>');
  });

  it('restores the quick-fill choices from the previous manual JD form', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobFormDialog, {
      open: true,
      draft: EMPTY_RECRUITMENT_JOB_DRAFT,
      departments: [{ key: 'it', label: 'IT', order: 0 }],
      departmentKey: 'it',
      isSaving: false,
      saveError: '',
      onDepartmentChange: vi.fn(),
      onDraftChange: vi.fn(),
      onSubmit: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(html).toMatch(/name="title"[^>]*list="recruitment-title-options"/);
    expect(html).toMatch(/name="employmentType"[^>]*list="recruitment-employment-type-options"/);
    expect(html).toMatch(/name="salary"[^>]*list="recruitment-salary-options"/);
    expect(html).toMatch(/name="location"[^>]*list="recruitment-location-options"/);
    expect(html).toMatch(/name="experience"[^>]*list="recruitment-experience-options"/);
    expect(html).toMatch(/name="education"[^>]*list="recruitment-education-options"/);
    expect(html).toContain('<option value="Lập trình viên Back-end"></option>');
    expect(html).toContain('<option value="Thực tập sinh (Intern)"></option>');
    expect(html).toContain('<option value="Thỏa thuận theo năng lực"></option>');
    expect(html).toContain('<option value="Remote"></option>');
    expect(html).toContain('<option value="1-2 năm kinh nghiệm"></option>');
    expect(html).toContain('<option value="Tốt nghiệp Đại học trở lên"></option>');
  });
});

describe('RecruitmentJobDetailDialog', () => {
  it('shows the complete preview content with recognizable metadata icons and colors', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobDetailDialog, {
      job,
      isDownloading: false,
      downloadError: '',
      onClose: vi.fn(),
      onDownload: vi.fn(),
      onEditWithAI: vi.fn(),
      onUseInPipeline: vi.fn(),
    }));

    expect(html).toContain('Backend Developer');
    expect(html).toContain('TUYỂN DỤNG:');
    expect(html).toContain('Tổng quan');
    expect(html).toContain('Mô tả công việc');
    expect(html).toContain('Yêu cầu');
    expect(html).toContain('Quyền lợi');
    expect(html).toContain('Ứng tuyển');
    expect(html).toContain('hr@example.com');
    expect(html).toContain('[Backend]');
    expect(html).toMatch(/aria-label=.apartment./);
    expect(html).toMatch(/aria-label=.environment./);
    expect(html).toMatch(/aria-label=.clock-circle./);
    expect(html).toMatch(/aria-label=.dollar-circle./);
    expect(html).toContain('recruitment-job-detail__pill--department');
    expect(html).toContain('recruitment-job-detail__pill--salary');
    expect(html).toContain('Chỉnh với AI');
    expect(html).toContain('Dùng để sàng lọc CV');
    expect(html).toContain('Tải JD');
    expect(html).not.toContain('https://files.example.test/JD_Backend.md');
    expect(html).toContain('Xây API');
    expect(html).toContain('TypeScript');
  });

  it('shows download progress and an inline authenticated-download error', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobDetailDialog, {
      job,
      isDownloading: true,
      downloadError: 'Không thể tải JD qua PrivOS.',
      onClose: vi.fn(),
      onDownload: vi.fn(),
      onEditWithAI: vi.fn(),
      onUseInPipeline: vi.fn(),
    }));

    expect(html).toContain('Đang tải…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Đang tải…/);
    expect(html).toContain('Không thể tải JD qua PrivOS.');
    expect(html).toMatch(/role=.alert./);
  });

  it('does not render when no job is selected', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobDetailDialog, {
      job: null,
      isDownloading: false,
      downloadError: '',
      onClose: vi.fn(),
      onDownload: vi.fn(),
      onEditWithAI: vi.fn(),
      onUseInPipeline: vi.fn(),
    }));
    expect(html).toBe('');
  });
});
