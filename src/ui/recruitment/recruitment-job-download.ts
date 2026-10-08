import type { McpApp } from '@privos_ai/app-react';

import { readRoomFileText } from '../privos-rest';
import type { RecruitmentJob } from './recruitment-jobs';

export interface RecruitmentJobDownload {
  blob: Blob;
  fileName: string;
}

export async function readRecruitmentJobDownload(
  app: McpApp,
  job: RecruitmentJob,
): Promise<RecruitmentJobDownload> {
  const content = await readRoomFileText(app, {
    _id: job.fileId,
    downloadUrl: job.downloadUrl,
  });

  return {
    blob: new Blob([content], { type: 'text/markdown;charset=utf-8' }),
    fileName: job.fileName,
  };
}
