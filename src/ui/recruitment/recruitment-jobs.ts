import type { CVFile } from '../pipeline-service';
import { resolveJdDepartment } from '../recruitment-departments';
import type { UploadedRecruitmentJob } from './recruitment-uploaded-jobs';

export interface StructuredRecruitmentJob {
  kind: 'structured';
  fileId: string;
  fileName: string;
  downloadUrl?: string;
  title: string;
  departmentKey: string;
  departmentLabel: string;
  location: string;
  employmentType: string;
  salary: string;
  summary: string;
  description: string;
  requirements: string;
  benefits: string;
  contactEmail: string;
  emailSubject: string;
}

export type RecruitmentJob = StructuredRecruitmentJob | UploadedRecruitmentJob;

export interface RecruitmentJobDraft {
  title: string;
  location: string;
  employmentType: string;
  salary: string;
  summary: string;
  description: string;
  experience: string;
  professionalSkills: string;
  softSkills: string;
  education: string;
  benefits: string;
  contactEmail: string;
  emailSubject: string;
}

export const EMPTY_RECRUITMENT_JOB_DRAFT: RecruitmentJobDraft = {
  title: '',
  location: '',
  employmentType: '',
  salary: '',
  summary: '',
  description: '',
  experience: '',
  professionalSkills: '',
  softSkills: '',
  education: '',
  benefits: '',
  contactEmail: '',
  emailSubject: '',
};

function tableValue(content: string, label: string): string {
  const match = content.match(new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|\\s*(.*?)\\s*\\|`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function legacyValue(content: string, label: string): string {
  const match = content.match(new RegExp(`^-\\s*${label}:\\s*(.*)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

function boldListValue(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^\\s*[-*]\\s+\\*\\*${escaped}:\\*\\*\\s*(.*)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

function boldValue(content: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(
    `^\\s*(?:[-*]\\s+)?\\*\\*${escaped}\\s*(?::\\s*)?\\*\\*\\s*:?\\s*(.+?)\\s*$`,
    'im',
  ));
  return match?.[1]?.trim() ?? '';
}

function fieldValue(content: string, labels: string[]): string {
  for (const label of labels) {
    const value = tableValue(content, label) || boldValue(content, label) || legacyValue(content, label);
    if (value) return value;
  }
  return '';
}

function sectionBody(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^#{2,3}\\s*(?:\\d+\\.\\s*)?${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=^#{2,3}\\s|^\\*{3}\\s*$|(?![\\s\\S]))`, 'im'));
  if (!match) return '';
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^(?:\*{3}|-{3,})$/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .map((line) => line.replace(/^\*\*(.+?):\*\*\s*/, '$1: '))
    .filter(Boolean)
    .join('\n');
}

function firstMatch(content: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

export function isStructuredRecruitmentJDFileName(name: string): boolean {
  return /^JD_.+\.md$/i.test(name);
}

export function parseRecruitmentJob(file: CVFile, content: string): StructuredRecruitmentJob | null {
  if (!isStructuredRecruitmentJDFileName(file.name)) return null;
  const title = firstMatch(content, [
    /^#\s+(?:THÔNG TIN\s+)?TUYỂN DỤNG:\s*(.*)$/im,
    /^#\s+(.*)$/m,
  ]) || boldListValue(content, 'Vị trí');
  if (!title) return null;

  const department = resolveJdDepartment(content);
  const modernRequirements = [
    sectionBody(content, 'Kinh nghiệm'),
    sectionBody(content, 'Kỹ năng chuyên môn'),
    sectionBody(content, 'Kỹ năng mềm'),
    sectionBody(content, 'Học vấn'),
  ].filter(Boolean);
  const legacyRequirements = [
    sectionBody(content, 'Yêu cầu ứng viên'),
    sectionBody(content, 'Yêu cầu'),
    sectionBody(content, 'Điểm cộng'),
  ].filter(Boolean);
  const description = sectionBody(content, 'Mô tả công việc');

  return {
    kind: 'structured',
    fileId: file._id,
    fileName: file.name,
    downloadUrl: file.downloadUrl,
    title,
    departmentKey: department.key,
    departmentLabel: department.label,
    location: fieldValue(content, ['Địa điểm làm việc', 'Địa điểm']) || 'Không xác định',
    employmentType: fieldValue(content, ['Thời gian làm việc', 'Hình thức làm việc', 'Hình thức']) || 'Thỏa thuận',
    salary: fieldValue(content, ['Mức lương', 'Thu nhập']) || 'Thỏa thuận',
    summary: firstMatch(content, [/<!--\s*SUMMARY:\s*(.*?)\s*-->/i])
      || fieldValue(content, ['Mô tả ngắn', 'Tóm tắt'])
      || description.split('\n')[0]
      || '',
    description,
    requirements: [...modernRequirements, ...legacyRequirements].join('\n'),
    benefits: sectionBody(content, 'Quyền lợi'),
    contactEmail: firstMatch(content, [
      /\*\*Email nhận CV:\*\*\s*_?([^_\r\n]+)_?/i,
      /^\s*[-*]\s+Gửi CV về email:\s*(.+)$/im,
    ]),
    emailSubject: firstMatch(content, [
      /\*\*Tiêu đề email:\*\*\s*_?([^_\r\n]+)_?/i,
      /^\s*[-*]\s+Tiêu đề email:\s*(.+)$/im,
    ]),
  };
}

function lines(value: string, fallback: string): string {
  const values = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return (values.length > 0 ? values : [fallback]).map((item) => `* ${item}`).join('\n');
}

function safeMetadata(value: string): string {
  return value.replace(/-->/g, '—>').trim();
}

function filenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_ -]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'Untitled';
}

export function buildRecruitmentJobDocument(
  draft: RecruitmentJobDraft,
  department: { key: string; label: string },
  isoDate: string,
): { fileName: string; content: string; job: RecruitmentJobDraft } {
  const normalized = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, value.trim()]),
  ) as unknown as RecruitmentJobDraft;
  const date = isoDate.slice(0, 10);
  const fileName = `JD_${filenamePart(normalized.title)}.md`;
  const content = `# TUYỂN DỤNG: ${normalized.title.toUpperCase()}

<!-- DEPARTMENT_ID: ${safeMetadata(department.key)} -->

***

## 1. Thông tin chung

| Hạng mục | Chi tiết |
| --- | --- |
| **Vị trí tuyển dụng** | ${normalized.title} |
| **Phòng ban** | ${department.label} |
| **Địa điểm làm việc** | ${normalized.location || 'Không xác định'} |
| **Thời gian làm việc** | ${normalized.employmentType || 'Thỏa thuận'} |
| **Mức lương** | ${normalized.salary || 'Thỏa thuận'} |

<!-- SUMMARY: ${safeMetadata(normalized.summary)} -->

***

## 2. Mô tả công việc

${lines(normalized.description, '(Chưa cập nhật)')}

***

## 3. Yêu cầu ứng viên

### Kinh nghiệm

${lines(normalized.experience, 'Không yêu cầu')}

### Kỹ năng chuyên môn

${lines(normalized.professionalSkills, 'Không yêu cầu')}

### Kỹ năng mềm

${lines(normalized.softSkills, 'Không yêu cầu')}

### Học vấn

${lines(normalized.education, 'Không yêu cầu')}

***

## 4. Quyền lợi

${lines(normalized.benefits, 'Trao đổi khi phỏng vấn')}

***

## 5. Cách thức ứng tuyển

* **Email nhận CV:** _${normalized.contactEmail || 'Không xác định'}_
* **Tiêu đề email:** _${normalized.emailSubject || 'Không xác định'}_

_Đăng ngày: ${date}_

<!-- GENERATED_AT: ${isoDate} -->
`;

  return {
    fileName,
    content,
    job: normalized,
  };
}

function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');
}

export function filterRecruitmentJobs(
  jobs: readonly RecruitmentJob[],
  departmentKey: string,
  query: string,
): RecruitmentJob[] {
  const normalizedQuery = searchable(query.trim());
  return jobs.filter((job) => {
    if (departmentKey !== 'all' && job.departmentKey !== departmentKey) return false;
    if (!normalizedQuery) return true;
    const values = job.kind === 'uploaded'
      ? [job.fileName, job.departmentLabel]
      : [job.title, job.departmentLabel, job.location, job.employmentType, job.summary];
    return searchable(values.join(' ')).includes(normalizedQuery);
  });
}

export interface RecruitmentJobsPage {
  jobs: RecruitmentJob[];
  page: number;
  pageCount: number;
}

export function paginateRecruitmentJobs(
  jobs: readonly RecruitmentJob[],
  requestedPage: number,
  isMobile: boolean,
): RecruitmentJobsPage {
  const pageSize = isMobile ? 3 : 6;
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const normalizedPage = Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0;
  const page = Math.min(normalizedPage, pageCount - 1);

  return {
    jobs: jobs.slice(page * pageSize, (page + 1) * pageSize),
    page,
    pageCount,
  };
}

export interface RecruitmentEmptyState {
  title: string;
  description: string;
  showCreateAction: boolean;
}

export function getRecruitmentEmptyState(input: {
  totalJobCount: number;
  departmentJobCount: number;
  hasQuery: boolean;
}): RecruitmentEmptyState {
  if (input.totalJobCount === 0) {
    return {
      title: 'Room chưa có JD',
      description: 'Tạo JD đầu tiên để bắt đầu quản lý vị trí tuyển dụng.',
      showCreateAction: true,
    };
  }
  if (input.departmentJobCount === 0) {
    return {
      title: 'Phòng ban này chưa có JD',
      description: 'Tạo JD đầu tiên cho phòng ban này để bắt đầu tuyển dụng.',
      showCreateAction: true,
    };
  }
  return {
    title: 'Không có kết quả phù hợp',
    description: 'Thử thay đổi từ khóa hoặc chọn phòng ban khác.',
    showCreateAction: false,
  };
}

export function getInitialJobDepartmentKey(departmentKey: string): string {
  return departmentKey === 'all' ? '' : departmentKey;
}
