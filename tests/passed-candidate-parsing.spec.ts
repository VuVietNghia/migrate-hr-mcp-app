import { describe, expect, it } from 'vitest';
import {
  normalizePosition,
  parseCandidateName,
  positionFromScreeningListName,
} from '../src/ui/lifecycle/passed-candidate-parsing';

describe('normalizePosition', () => {
  it('khớp theo nguyên từ nên tên người không bị coi là vị trí', () => {
    // Bản cũ dùng includes: "Pham" chứa "pm", "Bui" chứa "ui".
    expect(normalizePosition('Pham Van Bui')).toBe('Pham Van Bui');
    expect(normalizePosition('Tuan Devi')).toBe('Tuan Devi');
  });

  it('chuẩn hoá các vị trí có trong danh sách chọn', () => {
    expect(normalizePosition('BACKEND DEVELOPER')).toBe('Developer');
    expect(normalizePosition('QA ENGINEER')).toBe('Tester');
    expect(normalizePosition('UX DESIGNER')).toBe('Designer');
    expect(normalizePosition('PRODUCT OWNER')).toBe('Product Manager');
    expect(normalizePosition('Nhân sự tổng hợp')).toBe('HR');
    expect(normalizePosition('SALES EXECUTIVE')).toBe('Sales');
    expect(normalizePosition('DIGITAL MARKETING')).toBe('Marketing');
  });

  it('giữ nguyên vị trí không nhận diện được', () => {
    expect(normalizePosition(' KE TOAN ')).toBe('KE TOAN');
  });
});

describe('positionFromScreeningListName', () => {
  it('lấy vị trí từ tên list SCREENING_<VI_TRI>', () => {
    expect(positionFromScreeningListName('SCREENING_UX_DESIGNER')).toBe('Designer');
    expect(positionFromScreeningListName('SCREENING_BACKEND_DEVELOPER')).toBe('Developer');
    expect(positionFromScreeningListName('SCREENING_QA_ENGINEER')).toBe('Tester');
    expect(positionFromScreeningListName('SCREENING_KE_TOAN')).toBe('KE TOAN');
  });

  it('trả về undefined khi list không mang vị trí', () => {
    expect(positionFromScreeningListName('SCREENING_UNKNOWN')).toBeUndefined();
    expect(positionFromScreeningListName('SCREENING_')).toBeUndefined();
    expect(positionFromScreeningListName('')).toBeUndefined();
  });
});

describe('parseCandidateName', () => {
  it('lấy toàn bộ họ tên sau tiền tố ngày và CV_', () => {
    expect(parseCandidateName('2026-09-11_CV_Vu_Viet_Nghia.md')).toBe('Vu Viet Nghia');
  });

  it('không chèn khoảng trắng giữa các chữ hoa liền nhau', () => {
    expect(parseCandidateName('2026-09-17_CV_LUU_SON_TRUONG.md')).toBe('LUU SON TRUONG');
  });

  it('tách tên viết liền kiểu CamelCase', () => {
    expect(parseCandidateName('CV_NguyenVanA.pdf')).toBe('Nguyen Van A');
  });

  it('trả về tên mặc định khi tiêu đề rỗng sau khi làm sạch', () => {
    expect(parseCandidateName('2026-09-11_CV_.md')).toBe('Không có tên');
    expect(parseCandidateName('')).toBe('Không có tên');
  });
});
