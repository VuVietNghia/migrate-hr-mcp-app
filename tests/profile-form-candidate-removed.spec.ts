import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../src/ui/lifecycle/components/CreateDetailedProfileForm.tsx'),
  'utf8',
);

describe('CreateDetailedProfileForm — ứng viên bị kéo khỏi cột', () => {
  it('dùng isSelectedCandidateGone với danh sách ứng viên mới nhất', () => {
    expect(source).toContain("import { isSelectedCandidateGone } from '../candidate-selection';");
    expect(source).toContain('isSelectedCandidateGone(selectedCandidateId, passedCandidates)');
  });

  it('không reset khi đang lưu hoặc vừa lưu xong', () => {
    expect(source).toContain('if (isSubmitting || isSuccess) return;');
  });

  it('reset toàn bộ form, ảnh CCCD và báo lý do', () => {
    expect(source).toContain('setFormData(createInitialFormData());');
    expect(source).toContain('setIdPhoto(null);');
    expect(source).toContain('đã bị chuyển khỏi cột Mời phỏng vấn / Đã phỏng vấn nên thông tin đã nhập được xoá.');
  });
});
