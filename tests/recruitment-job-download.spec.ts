import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it, vi } from 'vitest';

import type { RecruitmentJob } from '../src/ui/recruitment/recruitment-jobs';

const job: RecruitmentJob = {
  fileId: 'file/id',
  fileName: 'JD_Backend.md',
  downloadUrl: 'http://unreachable-minio/JD_Backend.md',
  title: 'Backend Developer',
  departmentKey: 'it',
  departmentLabel: 'IT',
  location: 'Hà Nội',
  employmentType: 'Full-time',
  salary: '20–30 triệu',
  summary: 'Xây dựng nền tảng tuyển dụng',
  description: 'Xây API',
  requirements: 'TypeScript',
  benefits: 'Bảo hiểm sức khỏe',
  contactEmail: 'hr@example.com',
  emailSubject: '[Backend]',
};

async function loadDownloadModule() {
  return import('../src/ui/recruitment/recruitment-job-download').catch(() => null);
}

describe('readRecruitmentJobDownload', () => {
  it('downloads markdown through the authenticated PrivOS content route', async () => {
    const downloadModule = await loadDownloadModule();
    expect(downloadModule).not.toBeNull();
    if (!downloadModule) return;

    const rest = vi.fn(async () => ({
      statusCode: 200,
      body: { result: '# TUYỂN DỤNG: BACKEND DEVELOPER' },
    }));
    const result = await downloadModule.readRecruitmentJobDownload(
      { rest } as unknown as McpApp,
      job,
    );

    expect(rest).toHaveBeenCalledWith({
      method: 'GET',
      path: 'file-management.files/file/id/content',
      query: undefined,
      body: undefined,
      timeoutMs: 15000,
    });
    expect(result.fileName).toBe('JD_Backend.md');
    expect(result.blob.type).toBe('text/markdown;charset=utf-8');
    expect(await result.blob.text()).toBe('# TUYỂN DỤNG: BACKEND DEVELOPER');
  });

  it('surfaces the authenticated read failure instead of silently opening the MinIO URL', async () => {
    const downloadModule = await loadDownloadModule();
    expect(downloadModule).not.toBeNull();
    if (!downloadModule) return;

    const rest = vi.fn(async () => ({
      statusCode: 500,
      body: { error: 'Hub unavailable' },
    }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('MinIO unreachable'); }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(downloadModule.readRecruitmentJobDownload(
        { rest } as unknown as McpApp,
        job,
      )).rejects.toThrow('Hub unavailable');
    } finally {
      warning.mockRestore();
    }
  });
});
