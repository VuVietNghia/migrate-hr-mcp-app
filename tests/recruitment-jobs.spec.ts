import { describe, expect, it } from 'vitest';

import * as recruitmentJobsModule from '../src/ui/recruitment/recruitment-jobs';
import {
  buildRecruitmentJobDocument,
  filterRecruitmentJobs,
  parseRecruitmentJob,
  type RecruitmentJob,
} from '../src/ui/recruitment/recruitment-jobs';

const canonicalJd = `# TUYỂN DỤNG: BACKEND DEVELOPER

<!-- DEPARTMENT_ID: it -->

| **Phòng ban** | IT |
| **Địa điểm làm việc** | Hà Nội |
| **Thời gian làm việc** | Full-time |
| **Mức lương** | 20–30 triệu |

<!-- SUMMARY: Xây dựng dịch vụ tuyển dụng -->

## 2. Mô tả công việc
* Xây dựng API
* Review code

## 3. Yêu cầu ứng viên
### Kinh nghiệm
* Tối thiểu 2 năm
### Kỹ năng chuyên môn
* TypeScript
### Kỹ năng mềm
* Giao tiếp
### Học vấn
* Đại học

## 4. Quyền lợi
* Bảo hiểm đầy đủ

## 5. Cách thức ứng tuyển
* **Email nhận CV:** _hr@example.com_
* **Tiêu đề email:** _[Backend Developer]_
`;

describe('parseRecruitmentJob', () => {
  it('keeps the PrivOS file identity while parsing the canonical JD document', () => {
    expect(parseRecruitmentJob({ _id: 'file-1', name: 'JD_BACKEND_DEVELOPER.md', downloadUrl: '/files/1' }, canonicalJd)).toEqual({
      fileId: 'file-1',
      fileName: 'JD_BACKEND_DEVELOPER.md',
      downloadUrl: '/files/1',
      title: 'BACKEND DEVELOPER',
      departmentKey: 'it',
      departmentLabel: 'IT',
      location: 'Hà Nội',
      employmentType: 'Full-time',
      salary: '20–30 triệu',
      summary: 'Xây dựng dịch vụ tuyển dụng',
      description: 'Xây dựng API\nReview code',
      requirements: 'Tối thiểu 2 năm\nTypeScript\nGiao tiếp\nĐại học',
      benefits: 'Bảo hiểm đầy đủ',
      contactEmail: 'hr@example.com',
      emailSubject: '[Backend Developer]',
    });
  });

  it('keeps loading a legacy JD with list metadata and legacy section names', () => {
    const legacy = `# TUYỂN DỤNG: CONTENT CREATOR
- Phòng ban: Marketing
- Địa điểm: Đà Nẵng
- Hình thức: Hybrid
- Thu nhập: Thỏa thuận
- Mô tả ngắn: Sáng tạo nội dung thương hiệu

## Mô tả công việc
- Lên kế hoạch nội dung
## Yêu cầu
- Viết tốt
## Điểm cộng
- Biết quay dựng
## Quyền lợi
- MacBook làm việc
`;

    expect(parseRecruitmentJob({ _id: 'legacy-1', name: 'JD_CONTENT.md' }, legacy)).toMatchObject({
      fileId: 'legacy-1',
      fileName: 'JD_CONTENT.md',
      title: 'CONTENT CREATOR',
      departmentKey: 'marketing',
      departmentLabel: 'Marketing',
      location: 'Đà Nẵng',
      employmentType: 'Hybrid',
      salary: 'Thỏa thuận',
      summary: 'Sáng tạo nội dung thương hiệu',
      description: 'Lên kế hoạch nội dung',
      requirements: 'Viết tốt\nBiết quay dựng',
      benefits: 'MacBook làm việc',
    });
  });

  it('ignores documents without a recruitment title', () => {
    expect(parseRecruitmentJob({ _id: 'file-2', name: 'notes.md' }, '# Ghi chú')).toBeNull();
  });
});

describe('buildRecruitmentJobDocument', () => {
  it('serializes a stable filename, department metadata and generated date', () => {
    const result = buildRecruitmentJobDocument({
      title: 'Kỹ sư dữ liệu',
      location: 'TP. Hồ Chí Minh',
      employmentType: 'Toàn thời gian',
      salary: '25 triệu',
      summary: 'Xây nền tảng dữ liệu',
      description: 'Thiết kế pipeline',
      experience: 'Tối thiểu 2 năm',
      professionalSkills: 'Thành thạo SQL',
      softSkills: 'Giao tiếp rõ ràng',
      education: 'Đại học',
      benefits: 'Bảo hiểm sức khỏe',
      contactEmail: 'jobs@example.com',
      emailSubject: '[Data Engineer]',
    }, { key: 'data_platform', label: 'Nền tảng dữ liệu' }, '2026-10-08T02:30:00.000Z');

    expect(result.fileName).toBe('JD_Ky_su_du_lieu.md');
    expect(result.content).toContain('<!-- DEPARTMENT_ID: data_platform -->');
    expect(result.content).toContain('| **Phòng ban** | Nền tảng dữ liệu |');
    expect(result.content).toContain('<!-- SUMMARY: Xây nền tảng dữ liệu -->');
    expect(result.content).toContain('<!-- GENERATED_AT: 2026-10-08T02:30:00.000Z -->');
    expect(result.content).toContain('### Kinh nghiệm\n\n* Tối thiểu 2 năm');
    expect(result.content).toContain('### Kỹ năng mềm\n\n* Giao tiếp rõ ràng');
    expect(result.job).toMatchObject({ title: 'Kỹ sư dữ liệu' });
  });
});

describe('filterRecruitmentJobs', () => {
  const jobs: RecruitmentJob[] = [
    {
      fileId: 'job-1', fileName: 'JD_KE_TOAN.md', title: 'Kế toán tổng hợp',
      departmentKey: 'finance', departmentLabel: 'Tài chính', location: 'Hà Nội',
      employmentType: 'Full-time', salary: '', summary: 'Kiểm soát sổ sách', description: '',
      requirements: '', benefits: '', contactEmail: '', emailSubject: '',
    },
    {
      fileId: 'job-2', fileName: 'JD_KE_TOAN_REMOTE.md', title: 'Kế toán tổng hợp',
      departmentKey: 'finance', departmentLabel: 'Tài chính', location: 'Remote',
      employmentType: 'Part-time', salary: '', summary: 'Đối soát báo cáo', description: '',
      requirements: '', benefits: '', contactEmail: '', emailSubject: '',
    },
    {
      fileId: 'job-3', fileName: 'JD_BACKEND.md', title: 'Backend Developer',
      departmentKey: 'it', departmentLabel: 'IT', location: 'Đà Nẵng',
      employmentType: 'Full-time', salary: '', summary: 'Xây API', description: '',
      requirements: '', benefits: '', contactEmail: '', emailSubject: '',
    },
  ];

  it('matches Vietnamese text without accents and supports the all-departments key', () => {
    expect(filterRecruitmentJobs(jobs, 'all', 'ke toan').map((job) => job.fileId)).toEqual(['job-1', 'job-2']);
  });

  it('filters by stable department key and keeps jobs with duplicate titles', () => {
    expect(filterRecruitmentJobs(jobs, 'finance', '').map((job) => job.fileId)).toEqual(['job-1', 'job-2']);
  });
});

describe('paginateRecruitmentJobs', () => {
  const jobs = Array.from({ length: 7 }, (_, index) => ({
    fileId: `job-${index + 1}`,
  })) as RecruitmentJob[];

  it('keeps a desktop page to three two-column rows and clamps the last page', () => {
    const paginate = (recruitmentJobsModule as Record<string, unknown>).paginateRecruitmentJobs;
    const result = typeof paginate === 'function' ? paginate(jobs, 99, false) : undefined;

    expect(result).toEqual({
      jobs: [{ fileId: 'job-7' }],
      page: 1,
      pageCount: 2,
    });
  });

  it('keeps a mobile page to three single-column rows', () => {
    const paginate = (recruitmentJobsModule as Record<string, unknown>).paginateRecruitmentJobs;
    const result = typeof paginate === 'function' ? paginate(jobs, 1, true) : undefined;

    expect(result).toEqual({
      jobs: [{ fileId: 'job-4' }, { fileId: 'job-5' }, { fileId: 'job-6' }],
      page: 1,
      pageCount: 3,
    });
  });
});

describe('Recruitment empty state', () => {
  it('offers manual JD creation when the selected department has no jobs', () => {
    const resolveEmptyState = (recruitmentJobsModule as Record<string, unknown>).getRecruitmentEmptyState;
    const result = typeof resolveEmptyState === 'function'
      ? resolveEmptyState({ totalJobCount: 4, departmentJobCount: 0, hasQuery: false })
      : undefined;

    expect(result).toEqual({
      title: 'Phòng ban này chưa có JD',
      description: 'Tạo JD đầu tiên cho phòng ban này để bắt đầu tuyển dụng.',
      showCreateAction: true,
    });
  });

  it('reports a search miss only when the selected scope already has jobs', () => {
    const resolveEmptyState = (recruitmentJobsModule as Record<string, unknown>).getRecruitmentEmptyState;
    const result = typeof resolveEmptyState === 'function'
      ? resolveEmptyState({ totalJobCount: 4, departmentJobCount: 2, hasQuery: true })
      : undefined;

    expect(result).toEqual({
      title: 'Không có kết quả phù hợp',
      description: 'Thử thay đổi từ khóa hoặc chọn phòng ban khác.',
      showCreateAction: false,
    });
  });

  it('leaves the department blank from all positions and preserves a specific department context', () => {
    const initialDepartment = (recruitmentJobsModule as Record<string, unknown>).getInitialJobDepartmentKey;
    const fromAll = typeof initialDepartment === 'function' ? initialDepartment('all') : undefined;
    const fromIT = typeof initialDepartment === 'function' ? initialDepartment('it') : undefined;

    expect(fromAll).toBe('');
    expect(fromIT).toBe('it');
  });
});
