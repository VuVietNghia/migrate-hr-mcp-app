import { describe, expect, it } from 'vitest';

import type { CVFile } from '../src/ui/pipeline-service';
import type { RecruitmentDepartment } from '../src/ui/recruitment-departments';
import {
  filterRecruitmentJobs,
  type RecruitmentJob,
} from '../src/ui/recruitment/recruitment-jobs';
import {
  getRecruitmentJobFormat,
  mergeRecruitmentJobs,
  validateRecruitmentJobFiles,
  type RecruitmentJobFileMetadata,
} from '../src/ui/recruitment/recruitment-uploaded-jobs';
import * as UploadedJobModel from '../src/ui/recruitment/recruitment-uploaded-jobs';

const departments: RecruitmentDepartment[] = [
  { key: 'it', label: 'Kỹ thuật', order: 0 },
  { key: 'marketing', label: 'Marketing', order: 1 },
];

const metadata: RecruitmentJobFileMetadata = {
  fileId: 'file-uploaded',
  fileName: 'JD_BACKEND.md',
  departmentKey: 'it',
  source: 'uploaded',
  createdAt: '2026-10-09T02:00:00.000Z',
};

const structured = {
  kind: 'structured',
  fileId: 'file-uploaded',
  fileName: 'JD_BACKEND.md',
  title: 'Backend Developer',
  departmentKey: 'it',
  departmentLabel: 'IT',
  location: 'Hà Nội',
  employmentType: 'Full-time',
  salary: 'Thỏa thuận',
  summary: 'Xây API',
  description: '',
  requirements: '',
  benefits: '',
  contactEmail: '',
  emailSubject: '',
} as RecruitmentJob;

describe('recruitment JD upload validation', () => {
  it.each([
    ['role.md', 'markdown'],
    ['role.DOCX', 'word'],
    ['role.pdf', 'pdf'],
  ] as const)('accepts one supported %s file', (name, format) => {
    const file = new File(['JD content'], name);

    expect(validateRecruitmentJobFiles([file])).toBeNull();
    expect(getRecruitmentJobFormat(name)).toBe(format);
  });

  it('rejects no file, multiple files, empty files and unsupported extensions', () => {
    expect(validateRecruitmentJobFiles([])).toContain('một file');
    expect(validateRecruitmentJobFiles([
      new File(['one'], 'one.md'),
      new File(['two'], 'two.pdf'),
    ])).toContain('một file');
    expect(validateRecruitmentJobFiles([new File([], 'empty.md')])).toContain('rỗng');
    expect(validateRecruitmentJobFiles([new File(['x'], 'role.txt')])).toContain('.md, .docx hoặc .pdf');
  });
});

describe('uploaded JD screening identity', () => {
  it.each([
    ['JD Full Stack Developer.pdf', 'Full Stack Developer'],
    ['JD_Full_Stack_Developer.docx', 'Full Stack Developer'],
    ['JD-Full-Stack-Developer.md', 'Full Stack Developer'],
  ])('derives the same readable position from %s', (fileName, expectedTitle) => {
    const getPosition = (UploadedJobModel as Record<string, any>).getRecruitmentPositionFromFileName;
    const getListName = (UploadedJobModel as Record<string, any>).getScreeningListNameFromRecruitmentFile;

    expect(getPosition).toBeTypeOf('function');
    expect(getListName).toBeTypeOf('function');
    expect(getPosition(fileName)).toBe(expectedTitle);
    expect(getListName(fileName)).toBe('SCREENING_FULL_STACK_DEVELOPER');
  });
});

describe('mergeRecruitmentJobs', () => {
  const files: CVFile[] = [
    { _id: 'file-uploaded', name: 'JD_BACKEND.md', downloadUrl: '/files/backend' },
    { _id: 'file-stale-target', name: 'role.pdf', downloadUrl: '/files/role' },
  ];

  it('gives uploaded metadata precedence over structured parsing for the same file', () => {
    expect(mergeRecruitmentJobs(files, [structured], [metadata], departments)).toEqual([
      {
        kind: 'uploaded',
        fileId: 'file-uploaded',
        fileName: 'JD_BACKEND.md',
        downloadUrl: '/files/backend',
        departmentKey: 'it',
        departmentLabel: 'Kỹ thuật',
        format: 'markdown',
      },
    ]);
  });

  it('ignores stale metadata and metadata whose department no longer exists', () => {
    expect(mergeRecruitmentJobs(files, [], [
      { ...metadata, fileId: 'missing-file', fileName: 'missing.pdf' },
      { ...metadata, fileId: 'file-stale-target', fileName: 'role.pdf', departmentKey: 'removed' },
    ], departments)).toEqual([]);
  });

  it('resolves the current department label instead of persisting an old display label', () => {
    const [job] = mergeRecruitmentJobs(files, [], [metadata], departments);

    expect(job).toMatchObject({ departmentKey: 'it', departmentLabel: 'Kỹ thuật' });
  });

  it('searches uploaded JDs by file name and current department label', () => {
    const jobs = mergeRecruitmentJobs(files, [], [metadata], departments);

    expect(filterRecruitmentJobs(jobs, 'all', 'backend')).toHaveLength(1);
    expect(filterRecruitmentJobs(jobs, 'all', 'ky thuat')).toHaveLength(1);
    expect(filterRecruitmentJobs(jobs, 'marketing', '')).toEqual([]);
  });
});
