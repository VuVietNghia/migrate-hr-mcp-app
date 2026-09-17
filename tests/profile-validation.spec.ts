import { describe, expect, it } from 'vitest';
import { createEmptyEmployeeMdDocument, EmployeeMdDocument } from '../src/ui/lifecycle/employee-md-document';
import { findEmployeeDocError } from '../src/ui/lifecycle/profile-validation';

function validDoc(overrides: Partial<EmployeeMdDocument> = {}): EmployeeMdDocument {
  return {
    ...createEmptyEmployeeMdDocument(),
    fullName: 'Nguyễn Văn A',
    phone: '0901 234 567',
    email: 'an.nguyen@company.com',
    bankAccount: '1903456789',
    ...overrides,
  };
}

describe('findEmployeeDocError', () => {
  it('tra null khi ho so hop le', () => {
    expect(findEmployeeDocError(validDoc())).toBeNull();
  });

  it('bao loi khi thieu ho ten', () => {
    expect(findEmployeeDocError(validDoc({ fullName: '   ' }))).toBe('Vui lòng nhập Họ và Tên nhân sự.');
  });

  it('bao loi khi thieu so dien thoai', () => {
    expect(findEmployeeDocError(validDoc({ phone: '' }))).toBe('Vui lòng nhập Số điện thoại liên hệ.');
  });

  it('bao loi khi so dien thoai sai dinh dang', () => {
    expect(findEmployeeDocError(validDoc({ phone: 'abc' })))
      .toBe('Số điện thoại không hợp lệ (hỗ trợ số di động, cố định hoặc quốc tế có +).');
  });

  it('bao loi khi email sai dinh dang', () => {
    expect(findEmployeeDocError(validDoc({ email: 'khong-phai-email' })))
      .toBe('Email không đúng định dạng (VD: an.nguyen@company.com).');
  });

  it('cho phep email rong', () => {
    expect(findEmployeeDocError(validDoc({ email: '' }))).toBeNull();
  });

  it('bao loi khi so tai khoan chua " - "', () => {
    // Dong ngan hang trong file tach o " - " dau tien, nen so tai khoan chua no se bi cat.
    expect(findEmployeeDocError(validDoc({ bankAccount: '123 - 456' })))
      .toBe('Số tài khoản ngân hàng không được chứa " - ".');
  });
});
