import { describe, expect, it } from 'vitest';
import * as responseModel from '../src/ui/jd-chatbot-view-model';

type InterpretedResponse = {
  chatText: string;
  documentContent: string | null;
  nextMode: 'preview' | 'changes' | null;
};

const interpretJDAIResponse = (responseModel as typeof responseModel & {
  interpretJDAIResponse?: (text: string, hasSelectedJD: boolean) => InterpretedResponse;
}).interpretJDAIResponse;

describe('JD assistant AI response interpretation', () => {
  it('keeps the document unchanged when AI asks for missing information with NULL content', () => {
    expect(interpretJDAIResponse?.(
      'Bạn vui lòng bổ sung mức lương.\n\nNội dung JD mới được hiển thị ở bên phải màn hình, bạn có muốn chỉnh sửa thêm không? Hãy nói cho tôi biết nhé.\n<jd_content>NULL</jd_content>',
      false,
    )).toEqual({
      chatText: 'Bạn vui lòng bổ sung mức lương.',
      documentContent: null,
      nextMode: null,
    });
  });

  it('replaces repeated AI completion prose with one deterministic creation message', () => {
    expect(interpretJDAIResponse?.(
      'Tuyệt vời, bạn đã cung cấp đầy đủ thông tin cần thiết! Dưới đây là JD.\n\nTuyệt vời, bạn đã cung cấp đủ thông tin. Tôi đã soạn JD hoàn chỉnh.\n\nBạn có muốn tôi chỉnh sửa gì thêm không?\n<position_name>Lập trình viên Blockchain</position_name>\n<jd_content># Lập trình viên Blockchain</jd_content>',
      false,
    )).toEqual({
      chatText: 'Đã tạo JD cho vị trí Lập trình viên Blockchain. Nội dung được hiển thị ở bên phải.',
      documentContent: '# Lập trình viên Blockchain',
      nextMode: 'preview',
    });
  });

  it('opens an AI update to an existing JD in the changes view', () => {
    expect(interpretJDAIResponse?.(
      'Đã cập nhật địa điểm.\n<jd_content># Frontend Developer\nĐịa điểm: Hà Nội</jd_content>',
      true,
    )).toEqual({
      chatText: 'Đã cập nhật JD. Bạn có thể xem thay đổi ở bên phải.',
      documentContent: '# Frontend Developer\nĐịa điểm: Hà Nội',
      nextMode: 'changes',
    });
  });
});
