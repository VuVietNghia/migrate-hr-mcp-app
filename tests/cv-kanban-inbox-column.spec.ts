import { describe, expect, it } from 'vitest';
import { getCVColumnsForStages } from '../src/ui/cv-scored/kanban-stages';

describe('CVScoredTab an cot Dau vao khi board van co the o 01_Dau_Vao', () => {
  it('chi tra ve cac cot kanban duoc phep hien thi', () => {
    const columns = getCVColumnsForStages({ s01: '01_Dau_Vao', s02: '02_Loai_CV', s09: '09_CV_Cu' }, true);

    expect(columns.map((column) => column.status)).toEqual([
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
  });
});
