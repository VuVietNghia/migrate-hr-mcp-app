import { describe, expect, it } from 'vitest';
import { isSelectedCandidateGone } from '../src/ui/lifecycle/candidate-selection';

describe('isSelectedCandidateGone', () => {
  const candidates = [{ _id: 'cv-1' }, { _id: 'cv-2' }];

  it('false khi chưa chọn ứng viên nào', () => {
    expect(isSelectedCandidateGone('', candidates)).toBe(false);
    expect(isSelectedCandidateGone('', [])).toBe(false);
  });

  it('false khi ứng viên đang chọn vẫn còn trong danh sách', () => {
    expect(isSelectedCandidateGone('cv-2', candidates)).toBe(false);
  });

  it('true khi ứng viên đang chọn không còn trong danh sách', () => {
    expect(isSelectedCandidateGone('cv-3', candidates)).toBe(true);
    expect(isSelectedCandidateGone('cv-1', [])).toBe(true);
  });
});
