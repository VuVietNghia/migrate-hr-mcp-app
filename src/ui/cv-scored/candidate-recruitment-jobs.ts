import type { McpApp } from '@privos_ai/app-react';

import type { CVFile } from '../pipeline-service';
import { findFolderPath, readRoomFileText, readToolList } from '../privos-rest';
import {
  AppDbRecruitmentDepartmentStore,
  mergeRecruitmentDepartments,
  type RecruitmentDepartment,
} from '../recruitment-departments';
import { AppDbRecruitmentJobFileRepository } from '../recruitment/recruitment-job-file-repository';
import {
  parseRecruitmentJob,
  type StructuredRecruitmentJob,
} from '../recruitment/recruitment-jobs';
import {
  mergeRecruitmentJobs,
  type RecruitmentJobFileMetadata,
} from '../recruitment/recruitment-uploaded-jobs';
import {
  toCandidateRecruitmentJobs,
  type CandidateRecruitmentJob,
} from './candidate-view-model';

interface ResolveCandidateRecruitmentJobsInput {
  files: readonly CVFile[];
  uploadedMetadata: readonly RecruitmentJobFileMetadata[];
  storedDepartments: RecruitmentDepartment[];
  readText: (file: CVFile) => Promise<string>;
}

export async function resolveCandidateRecruitmentJobs(
  input: ResolveCandidateRecruitmentJobsInput,
): Promise<CandidateRecruitmentJob[]> {
  const uploadedIds = new Set(input.uploadedMetadata.map((item) => item.fileId));
  const structuredJobs = (await Promise.all(input.files.map(async (file) => {
    if (uploadedIds.has(file._id) || !/^JD_(?!AI_)/i.test(file.name)) return null;
    try {
      const content = await input.readText(file);
      return content ? parseRecruitmentJob(file, content) : null;
    } catch (error) {
      console.warn('[Candidates] Không đọc được JD để hiển thị phòng ban:', error);
      return null;
    }
  }))).filter((job): job is StructuredRecruitmentJob => job !== null);

  const departments = mergeRecruitmentDepartments(
    input.storedDepartments,
    structuredJobs.map((job) => ({ key: job.departmentKey, label: job.departmentLabel })),
  );
  return toCandidateRecruitmentJobs(mergeRecruitmentJobs(
    input.files,
    structuredJobs,
    input.uploadedMetadata,
    departments,
  ));
}

export async function loadCandidateRecruitmentJobsFromRoom(
  app: McpApp,
  roomId: string,
): Promise<CandidateRecruitmentJob[]> {
  const folderId = await findFolderPath(app, roomId, ['hr-miniapp', 'jds']);
  if (!folderId) return [];

  const [fileResponse, uploadedMetadata, storedDepartments] = await Promise.all([
    app.callServerTool({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: roomId, folderId },
    }),
    new AppDbRecruitmentJobFileRepository(app, roomId).list(),
    new AppDbRecruitmentDepartmentStore(app, roomId).list(),
  ]);
  const files = readToolList(fileResponse, 'files') as CVFile[];
  return resolveCandidateRecruitmentJobs({
    files,
    uploadedMetadata,
    storedDepartments,
    readText: (file) => readRoomFileText(app, { _id: file._id, downloadUrl: file.downloadUrl }),
  });
}
