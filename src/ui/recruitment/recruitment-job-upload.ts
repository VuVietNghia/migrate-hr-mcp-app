import type { CVFile } from '../pipeline-service';
import type { RecruitmentJobFileMetadata } from './recruitment-uploaded-jobs';

export interface UploadedRecruitmentFileRef {
  fileId: string;
  fileName: string;
  downloadUrl?: string;
}

export interface RecruitmentJobUploadInput {
  file: File;
  departmentKey: string;
  createdAt: string;
  uploadedFile?: UploadedRecruitmentFileRef;
}

export interface RecruitmentJobUploadDependencies {
  upload(file: File): Promise<CVFile>;
  listFiles(): Promise<CVFile[]>;
  upsert(metadata: RecruitmentJobFileMetadata): Promise<RecruitmentJobFileMetadata>;
}

export class RecruitmentJobMetadataSaveError extends Error {
  public readonly cause: unknown;

  constructor(
    public readonly file: UploadedRecruitmentFileRef,
    public readonly metadata: RecruitmentJobFileMetadata,
    cause?: unknown,
  ) {
    super('File JD đã tải lên nhưng chưa lưu được phòng ban. Hãy thử lưu lại.');
    this.name = 'RecruitmentJobMetadataSaveError';
    this.cause = cause;
  }
}

export async function submitRecruitmentJobUpload(
  input: RecruitmentJobUploadInput,
  dependencies: RecruitmentJobUploadDependencies,
): Promise<{ file: UploadedRecruitmentFileRef; metadata: RecruitmentJobFileMetadata }> {
  if (!input.file || !input.departmentKey.trim() || !input.createdAt.trim()) {
    throw new Error('Thiếu file, phòng ban hoặc thời điểm tải JD.');
  }

  let file = input.uploadedFile;
  if (!file) {
    const uploaded = await dependencies.upload(input.file);
    let resolved = uploaded;
    if (!uploaded._id) {
      resolved = (await dependencies.listFiles()).find((candidate) => candidate.name === uploaded.name) as CVFile;
    }
    if (!resolved?._id) throw new Error('Không lấy được mã file JD sau khi tải lên.');
    file = { fileId: resolved._id, fileName: resolved.name, downloadUrl: resolved.downloadUrl };
  }

  const metadata: RecruitmentJobFileMetadata = {
    fileId: file.fileId,
    fileName: file.fileName,
    departmentKey: input.departmentKey.trim(),
    source: 'uploaded',
    createdAt: input.createdAt,
  };
  try {
    await dependencies.upsert(metadata);
  } catch (cause) {
    throw new RecruitmentJobMetadataSaveError(file, metadata, cause);
  }
  return { file, metadata };
}
