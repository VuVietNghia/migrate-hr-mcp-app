import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');

describe('existing candidate invite form', () => {
  it('preserves the existing fields, actions and send guards', () => {
    for (const label of [
      'Tên ứng viên', 'Email ứng viên', 'Tên vị trí', 'Tên công ty', 'Thời gian phỏng vấn',
      'Tiêu đề (Cập nhật tự động)', 'Nội dung thư mời (Cập nhật tự động)', 'Tải email về', 'Gửi email',
    ]) expect(source).toContain(label);
    expect(source).toContain('disabled={!inviteTemplateSendReady || Boolean(inviteValidationError)}');
    expect(source).toContain('onClick={handleSendInviteEmail}');
  });

  it('adds only the read-only Room account summary to that form', () => {
    expect(source).toContain('<RoomMailAccountSummary');
    expect(source).not.toContain('<MailConnectionPanel');
  });
});
