import { describe, expect, it } from 'vitest';
import { areCvListsEqual, areStageMapsEqual } from '../src/ui/cv-scored/cv-poll-diff';
import type { CVProfile } from '../src/ui/cv-scored/CVScoredTab';

function cv(id: string, overrides: Partial<CVProfile> = {}): CVProfile {
  return {
    _id: id,
    name: `CV ${id}`,
    status: '03_Tiem_Nang',
    score: 80,
    category: 'ĐẠT',
    reason: 'ok',
    email: `${id}@x.com`,
    sdt: '0901234567',
    customFields: [{ fieldId: 'f1', value: 80 }],
    inviteMailSent: false,
    ...overrides,
  };
}

describe('areCvListsEqual', () => {
  it('true khi không có gì đổi, kể cả là object khác', () => {
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('a'), cv('b')])).toBe(true);
  });

  it('false khi thẻ đổi cột', () => {
    expect(areCvListsEqual([cv('a')], [cv('a', { status: '05_Moi_Phong_Van' })])).toBe(false);
  });

  it('false khi có thẻ mới hoặc thẻ bị xoá', () => {
    expect(areCvListsEqual([cv('a')], [cv('a'), cv('b')])).toBe(false);
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('a')])).toBe(false);
  });

  it('false khi đổi thứ tự hoặc thay thẻ khác cùng số lượng', () => {
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('b'), cv('a')])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('c')])).toBe(false);
  });

  it('false khi đổi điểm, cờ đã gửi mail hoặc customFields', () => {
    expect(areCvListsEqual([cv('a')], [cv('a', { score: 90 })])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('a', { inviteMailSent: true })])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('a', { customFields: [{ fieldId: 'f1', value: 81 }] })])).toBe(false);
  });
});

describe('areStageMapsEqual', () => {
  it('true khi cùng key và giá trị, không phụ thuộc thứ tự key', () => {
    expect(areStageMapsEqual({ s1: '01_Dau_Vao', s2: '02_Loai_CV' }, { s2: '02_Loai_CV', s1: '01_Dau_Vao' })).toBe(true);
  });

  it('false khi thêm key hoặc đổi giá trị', () => {
    expect(areStageMapsEqual({ s1: '01_Dau_Vao' }, { s1: '01_Dau_Vao', sx: '06_Sai_JD' })).toBe(false);
    expect(areStageMapsEqual({ s1: '01_Dau_Vao' }, { s1: '02_Loai_CV' })).toBe(false);
  });
});
