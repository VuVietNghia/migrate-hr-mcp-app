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

describe('getCVColumnsForStages - an cot Dau vao', () => {
  it('khong hien cot Dau vao tren list moi du stage van ton tai trong privos.lists', () => {
    expect(statuses(NEW_LIST_STAGES)).toEqual([
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
  });

  it('khong hien cot Dau vao tren list legacy', () => {
    expect(statuses({ a: '01_Dau_Vao', b: '02_Loai_CV', c: '07_CV_Cu' })).toEqual([
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_CV_Cu',
    ]);
  });

  it('giu nguyen cac cot con lai khi list khong co stage Dau vao', () => {
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

  it('khong hien cot Dau vao ke ca khi board van co the o trang thai do', () => {
    expect(statuses({ b: '02_Loai_CV', c: '09_CV_Cu' }, true)).not.toContain('01_Dau_Vao');
    expect(statuses({}, true)).not.toContain('01_Dau_Vao');
  });

  it('van doc duoc nhan Dau vao ma khong them no vao cac cot hien thi', () => {
    expect(getCVColumnLabel({}, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '03_Tiem_Nang')).toBe('Tiềm năng');
  });
});
