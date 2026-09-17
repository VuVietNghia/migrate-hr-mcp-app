import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSITION_OPTIONS, withCurrentOption } from '../src/ui/lifecycle/profile-form-options';

/**
 * Project không có môi trường DOM test (`vitest.config.ts` đặt `environment: 'node'`), nên phần
 * nối dây trong `.tsx` được kiểm qua mã nguồn như `tests/ui-error-surfacing.spec.ts`.
 * Trước khi sửa, select vị trí chỉ render `POSITION_OPTIONS`; vị trí JD ngoài danh sách
 * khiến ô hiện "Developer" trong khi giá trị lưu xuống là chuỗi khác.
 */
function source(relative: string): string {
  return fs.readFileSync(path.resolve(relative), 'utf8');
}

describe('CreateDetailedProfileForm position select', () => {
  const form = source('src/ui/lifecycle/components/CreateDetailedProfileForm.tsx');

  it('render option cho vị trí hiện tại kể cả khi ngoài danh sách chuẩn', () => {
    expect(form).toContain('withCurrentOption(POSITION_OPTIONS, formData.position)');
  });

  it('không còn render thẳng POSITION_OPTIONS', () => {
    expect(form).not.toContain('{POSITION_OPTIONS.map(');
  });

  it('withCurrentOption đưa vị trí JD lạ lên đầu danh sách', () => {
    const options = withCurrentOption(POSITION_OPTIONS, 'KE TOAN');
    expect(options[0]).toEqual({ value: 'KE TOAN', label: 'KE TOAN' });
    expect(options).toHaveLength(POSITION_OPTIONS.length + 1);
  });
});
