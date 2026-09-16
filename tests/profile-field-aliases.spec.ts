import { describe, expect, it } from 'vitest';
import { normalizeFieldName, resolveProfileFieldKey } from '../src/ui/lifecycle/profile-field-aliases';

describe('normalizeFieldName', () => {
  it('xoa dau, doi d gach ngang, viet hoa, gop khoang trang', () => {
    expect(normalizeFieldName('Ngày bắt  đầu')).toBe('NGAY BAT DAU');
    expect(normalizeFieldName('  sđt ')).toBe('SDT');
    expect(normalizeFieldName('Phòng ban')).toBe('PHONG BAN');
  });

  it('chiu duoc chuoi rong', () => {
    expect(normalizeFieldName('')).toBe('');
  });
});

describe('resolveProfileFieldKey', () => {
  it('khop ten chuan trong getInitialFieldDefinitions', () => {
    expect(resolveProfileFieldKey('Số điện thoại')).toBe('phone');
    expect(resolveProfileFieldKey('Email')).toBe('email');
    expect(resolveProfileFieldKey('Vị trí')).toBe('position');
    expect(resolveProfileFieldKey('Phòng ban')).toBe('department');
    expect(resolveProfileFieldKey('Ngày bắt đầu')).toBe('startDate');
    expect(resolveProfileFieldKey('Hồ sơ đính kèm')).toBe('attachedFileObj');
  });

  it('khop bat ke hoa thuong va dau', () => {
    expect(resolveProfileFieldKey('NGAY BAT DAU')).toBe('startDate');
    expect(resolveProfileFieldKey('ngày vào làm')).toBe('startDate');
    expect(resolveProfileFieldKey('SĐT')).toBe('phone');
  });

  it('KHONG khop Ngay sinh vao startDate', () => {
    // Day chinh la loi cu: `includes('ngày')` khop ca hai, nen ngay vao lam bi ghi de len ngay sinh.
    expect(resolveProfileFieldKey('Ngày sinh')).toBeUndefined();
    expect(resolveProfileFieldKey('Ngày ký hợp đồng')).toBeUndefined();
  });

  it('tra undefined cho ten khong nam trong bang alias', () => {
    expect(resolveProfileFieldKey('Ghi chú nội bộ')).toBeUndefined();
    expect(resolveProfileFieldKey('')).toBeUndefined();
  });

  it('khong khop nham khi ten chi CHUA mot alias', () => {
    // `includes` cu se khop het nhung cai nay; khop chinh xac thi khong.
    expect(resolveProfileFieldKey('Email cá nhân')).toBeUndefined();
    expect(resolveProfileFieldKey('Số phòng')).toBeUndefined();
  });
});
