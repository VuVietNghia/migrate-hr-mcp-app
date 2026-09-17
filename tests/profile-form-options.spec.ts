import { describe, expect, it } from 'vitest';
import { POSITION_OPTIONS, withCurrentOption } from '../src/ui/lifecycle/profile-form-options';

describe('withCurrentOption', () => {
  it('tra nguyen mang khi gia tri hien tai nam trong danh sach', () => {
    expect(withCurrentOption(POSITION_OPTIONS, 'Developer')).toBe(POSITION_OPTIONS);
  });

  it('chen gia tri la len dau khi khong nam trong danh sach', () => {
    // Khong hien gia tri nay thi chi mo form roi luu cung da doi vi tri cua nhan su.
    const result = withCurrentOption(POSITION_OPTIONS, 'Kế toán');
    expect(result[0]).toEqual({ value: 'Kế toán', label: 'Kế toán' });
    expect(result.slice(1)).toEqual(POSITION_OPTIONS);
  });

  it('tra nguyen mang khi gia tri hien tai rong', () => {
    expect(withCurrentOption(POSITION_OPTIONS, '')).toBe(POSITION_OPTIONS);
  });
});
