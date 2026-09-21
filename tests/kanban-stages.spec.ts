import { describe, expect, it } from 'vitest';
import { getCVColumnLabel, getCVColumnsForStages } from '../src/ui/cv-scored/kanban-stages';

const NEW_LIST_STAGES: Record<string, string> = {
  s01: '01_Dau_Vao',
  s02: '02_Loai_CV',
  s03: '03_Tiem_Nang',
  s04: '04_Phone_Screening',
  s05: '05_Moi_Phong_Van',
  s06: '06_Sai_JD',
  s07: '07_Chua_Phong_Van',
  s08: '08_Da_Phong_Van',
  s09: '09_CV_Cu',
};

const statuses = (stagesMap: Record<string, string>, hasInboxCards?: boolean) =>
  getCVColumnsForStages(stagesMap, hasInboxCards).map((column) => column.status);

describe('getCVColumnsForStages - cot Dau vao', () => {
  it('list moi co stage 01_Dau_Vao: Dau vao dung dau, tong 8 cot', () => {
    expect(statuses(NEW_LIST_STAGES)).toEqual([
      '01_Dau_Vao',
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
    expect(getCVColumnsForStages(NEW_LIST_STAGES)[0]).toEqual({
      status: '01_Dau_Vao',
      label: 'Đầu vào',
      color: '#6b7280',
    });
  });

  it('list legacy co stage 01_Dau_Vao: Dau vao dung truoc 5 cot legacy', () => {
    expect(statuses({ a: '01_Dau_Vao', b: '02_Loai_CV', c: '07_CV_Cu' })).toEqual([
      '01_Dau_Vao',
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_CV_Cu',
    ]);
  });

  it('khong co stage va khong co the o Dau vao: khong co cot Dau vao', () => {
    expect(statuses({ b: '02_Loai_CV', c: '09_CV_Cu' })).toEqual([
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
  });

  it('khong co stage nhung board co the o Dau vao: van hien cot Dau vao', () => {
    expect(statuses({ b: '02_Loai_CV', c: '09_CV_Cu' }, true)[0]).toBe('01_Dau_Vao');
    expect(statuses({}, true)[0]).toBe('01_Dau_Vao');
  });

  it('getCVColumnLabel tra label Dau vao ke ca khi list khong co stage do', () => {
    expect(getCVColumnLabel({}, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '03_Tiem_Nang')).toBe('Tiềm năng');
  });
});
