import { describe, expect, it, vi } from 'vitest';

import {
  RecruitmentJobMetadataSaveError,
  submitRecruitmentJobUpload,
} from '../src/ui/recruitment/recruitment-job-upload';

const input = {
  file: new File(['content'], 'role.pdf'),
  departmentKey: 'it',
  createdAt: '2026-10-09T02:00:00.000Z',
};

describe('submitRecruitmentJobUpload', () => {
  it('uploads once and persists metadata', async () => {
    const dependencies = {
      upload: vi.fn().mockResolvedValue({ _id: 'file-1', name: 'role.pdf', downloadUrl: '/role' }),
      listFiles: vi.fn(),
      upsert: vi.fn().mockImplementation(async (value) => value),
    };
    await expect(submitRecruitmentJobUpload(input, dependencies)).resolves.toEqual({
      file: { fileId: 'file-1', fileName: 'role.pdf', downloadUrl: '/role' },
      metadata: { fileId: 'file-1', fileName: 'role.pdf', departmentKey: 'it', source: 'uploaded', createdAt: input.createdAt },
    });
    expect(dependencies.upload).toHaveBeenCalledTimes(1);
    expect(dependencies.upsert).toHaveBeenCalledTimes(1);
  });

  it('retries metadata without uploading the file again', async () => {
    const uploadedFile = { fileId: 'file-1', fileName: 'role.pdf' };
    const dependencies = { upload: vi.fn(), listFiles: vi.fn(), upsert: vi.fn().mockImplementation(async (value) => value) };
    await submitRecruitmentJobUpload({ ...input, uploadedFile }, dependencies);
    expect(dependencies.upload).not.toHaveBeenCalled();
    expect(dependencies.upsert).toHaveBeenCalledTimes(1);
  });

  it('exposes the uploaded file when metadata persistence fails', async () => {
    const dependencies = {
      upload: vi.fn().mockResolvedValue({ _id: 'file-1', name: 'role.pdf' }),
      listFiles: vi.fn(),
      upsert: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const error = await submitRecruitmentJobUpload(input, dependencies).catch((reason) => reason);
    expect(error).toBeInstanceOf(RecruitmentJobMetadataSaveError);
    expect(error.file).toEqual({ fileId: 'file-1', fileName: 'role.pdf', downloadUrl: undefined });
    expect(error.metadata.departmentKey).toBe('it');
  });

  it('resolves a missing upload id from the refreshed list', async () => {
    const dependencies = {
      upload: vi.fn().mockResolvedValue({ _id: '', name: 'role(1).pdf' }),
      listFiles: vi.fn().mockResolvedValue([{ _id: 'resolved', name: 'role(1).pdf' }]),
      upsert: vi.fn().mockImplementation(async (value) => value),
    };
    await expect(submitRecruitmentJobUpload(input, dependencies)).resolves.toMatchObject({ file: { fileId: 'resolved' } });
  });

  it('does not write metadata when the file id cannot be resolved', async () => {
    const dependencies = {
      upload: vi.fn().mockResolvedValue({ _id: '', name: 'role.pdf' }),
      listFiles: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    };
    await expect(submitRecruitmentJobUpload(input, dependencies)).rejects.toThrow('mã file JD');
    expect(dependencies.upsert).not.toHaveBeenCalled();
  });
});
