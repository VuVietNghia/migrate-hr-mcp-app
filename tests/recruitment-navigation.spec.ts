import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => undefined,
  usePrivosContext: () => ({ roomId: undefined }),
  parseToolResult: (value: unknown) => value,
}));

import {
  recruitmentJobNavigationContext,
  resolveJobDetailAfterTabActivityChange,
} from '../src/ui/recruitment-panel';
import type { RecruitmentJob } from '../src/ui/recruitment/recruitment-jobs';

describe('recruitment navigation contract', () => {
  it('passes stable PrivOS file identity to downstream JD workflows', () => {
    const job = {
      fileId: 'file-42',
      fileName: 'JD_Backend.md',
      title: 'Backend Developer',
    } as RecruitmentJob;

    expect(recruitmentJobNavigationContext(job)).toEqual({
      jd: { fileId: 'file-42', fileName: 'JD_Backend.md' },
    });
  });

  it('clears the selected JD when the recruitment tab becomes inactive', () => {
    const job = {
      fileId: 'file-42',
      fileName: 'JD_Backend.md',
      title: 'Backend Developer',
    } as RecruitmentJob;

    expect(resolveJobDetailAfterTabActivityChange(false, job)).toBeNull();
    expect(resolveJobDetailAfterTabActivityChange(true, job)).toBe(job);
  });
});
