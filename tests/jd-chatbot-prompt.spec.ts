import { describe, expect, it } from 'vitest';
import { buildJDChatbotPrompt } from '../src/ui/jd-chatbot-prompt';

describe('JD chatbot prompt contract', () => {
  it('keeps company context disabled by default', () => {
    const prompt = buildJDChatbotPrompt({
      draft: '',
      includeCompany: false,
      history: 'Người dùng: Xin chào',
      department: { key: 'it', label: 'IT' },
    });

    expect(prompt).toContain('Không thêm thông tin công ty vào JD.');
    expect(prompt).toContain('Hỏi đến khi đủ Vị trí, Địa điểm, Mức lương, Yêu cầu/kinh nghiệm');
    expect(prompt).toContain('<jd_content>...</jd_content>');
    expect(prompt).toContain('Người dùng: Xin chào');
    expect(prompt).toContain('Phòng ban bắt buộc: IT (mã: it)');
    expect(prompt).toContain('không được tự đổi phòng ban');
  });

  it('includes read-only company guidance and the selected draft while editing', () => {
    const prompt = buildJDChatbotPrompt({
      selectedName: 'frontend.md',
      draft: '# Frontend\nNội dung cũ',
      includeCompany: true,
      history: 'Người dùng: Bổ sung công ty',
    });

    expect(prompt).toContain('chỉ được dùng công cụ ĐỌC');
    expect(prompt).toContain('TUYỆT ĐỐI không ghi, sửa, tạo hay lưu bất kỳ file nào');
    expect(prompt).toContain('<saved_file>frontend.md</saved_file>');
    expect(prompt).toContain('# Frontend\nNội dung cũ');
    expect(prompt).toContain('QUY TẮC CHỈNH SỬA');
  });
});
