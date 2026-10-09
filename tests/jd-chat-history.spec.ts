import { describe, expect, it } from 'vitest';
import { buildCompactJDChatHistory } from '../src/ui/jd-chat-history';

describe('compact JD chat history', () => {
  it('removes internal document and filename tags from AI context', () => {
    const history = buildCompactJDChatHistory([
      { role: 'user', content: 'Thêm địa điểm Hà Nội' },
      {
        role: 'ai',
        content: 'Đã cập nhật. <jd_content># Nội dung bí mật</jd_content><position_name>Frontend</position_name><saved_file>JD_AI_Frontend.md</saved_file>',
      },
    ]);

    expect(history).toContain('Thêm địa điểm Hà Nội');
    expect(history).toContain('Đã cập nhật.');
    expect(history).not.toContain('Nội dung bí mật');
    expect(history).not.toContain('JD_AI_Frontend.md');
  });

  it('prioritizes the newest context when the character budget is exceeded', () => {
    const history = buildCompactJDChatHistory(Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? 'ai' as const : 'user' as const,
      content: `Tin nhắn ${index}: ${'nội dung '.repeat(220)}`,
    })));

    expect(history).toContain('Tin nhắn 11');
    expect(history).toContain('Tin nhắn 10');
    expect(history).not.toContain('Tin nhắn 0:');
    expect(Array.from(history).length).toBeLessThanOrEqual(6000);
  });
});
