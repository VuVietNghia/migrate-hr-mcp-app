import type { CVFile } from '../pipeline-service';
import type { RecruitmentDepartment } from '../recruitment-departments';
import type { RecruitmentJob, StructuredRecruitmentJob } from './recruitment-jobs';

export type RecruitmentJobFormat = 'markdown' | 'word' | 'pdf';

export interface RecruitmentJobFileMetadata {
  fileId: string;
  fileName: string;
  departmentKey: string;
  source: 'uploaded';
  createdAt: string;
}

export interface UploadedRecruitmentJob {
  kind: 'uploaded';
  fileId: string;
  fileName: string;
  downloadUrl?: string;
  departmentKey: string;
  departmentLabel: string;
  format: RecruitmentJobFormat;
}

export function getRecruitmentJobFormat(fileName: string): RecruitmentJobFormat | null {
  const extension = fileName.trim().toLocaleLowerCase().match(/\.[^.]+$/)?.[0];
  if (extension === '.md') return 'markdown';
  if (extension === '.docx') return 'word';
  if (extension === '.pdf') return 'pdf';
  return null;
}

export function getRecruitmentPositionFromFileName(fileName: string): string {
  let position = fileName.replace(/\.(md|pdf|docx|doc)$/i, '').trim();
  position = position.replace(/(?:[\(_\-]\d+\)?)+$/, '').trim();
  position = position.replace(/^(?:JD(?:[_\-\s]+(?:AI)?)?|Job[_\-\s]*Description|Mo[_\-\s]*ta[_\-\s]*cong[_\-\s]*viec)[_\-\s]*/i, '').trim();
  return position.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'UNKNOWN';
}

export function getScreeningListNameFromRecruitmentFile(fileName: string): string {
  const cleanPosition = getRecruitmentPositionFromFileName(fileName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase() || 'UNKNOWN';
  return `SCREENING_${cleanPosition}`;
}

export function validateRecruitmentJobFiles(files: readonly File[]): string | null {
  if (files.length !== 1) return 'Vui lòng chọn đúng một file JD.';
  const [file] = files;
  if (file.size === 0) return 'File JD đang rỗng.';
  if (!getRecruitmentJobFormat(file.name)) return 'Chỉ hỗ trợ file .md, .docx hoặc .pdf.';
  return null;
}

export function mergeRecruitmentJobs(
  files: readonly CVFile[],
  structuredJobs: readonly StructuredRecruitmentJob[],
  metadata: readonly RecruitmentJobFileMetadata[],
  departments: readonly RecruitmentDepartment[],
): RecruitmentJob[] {
  const filesById = new Map(files.map((file) => [file._id, file]));
  const departmentsByKey = new Map(departments.map((department) => [department.key, department]));
  const uploadedJobs = metadata.flatMap<UploadedRecruitmentJob>((record) => {
    const file = filesById.get(record.fileId);
    const department = departmentsByKey.get(record.departmentKey);
    const format = getRecruitmentJobFormat(record.fileName);
    if (!file || !department || !format) return [];
    return [{
      kind: 'uploaded',
      fileId: record.fileId,
      fileName: record.fileName,
      downloadUrl: file.downloadUrl,
      departmentKey: record.departmentKey,
      departmentLabel: department.label,
      format,
    }];
  });
  const uploadedIds = new Set(uploadedJobs.map((job) => job.fileId));
  return [
    ...structuredJobs.filter((job) => !uploadedIds.has(job.fileId)),
    ...uploadedJobs,
  ];
}
