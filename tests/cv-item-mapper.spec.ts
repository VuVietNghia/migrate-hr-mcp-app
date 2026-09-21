import { describe, expect, it } from 'vitest';
import { mapItemsToCVProfiles } from '../src/ui/cv-scored/cv-item-mapper';

const FIELDS = {
  f1: 'Tổng điểm',
  f2: 'Phân loại',
  f3: 'Lý do',
  f4: 'Email',
  f5: 'SĐT',
};

describe('mapItemsToCVProfiles', () => {
  it('đọc customFields dạng mảng theo tên field', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{
        _id: 'cv-1',
        name: 'CV Nguyen Van A',
        stageId: 's3',
        customFields: [
          { fieldId: 'f1', value: 82 },
          { fieldId: 'f2', value: 'ĐẠT' },
          { fieldId: 'f3', value: 'Kinh nghiệm tốt' },
          { fieldId: 'f4', value: 'a@company.com' },
          { fieldId: 'f5', value: '0901234567' },
          { fieldId: 'interview_invite_sent', value: true },
        ],
      }],
      FIELDS,
      { s3: '03_Tiem_Nang' },
    );

    expect(cvs).toHaveLength(1);
    expect(cvs[0]).toMatchObject({
      _id: 'cv-1',
      name: 'CV Nguyen Van A',
      status: '03_Tiem_Nang',
      score: 82,
      category: 'ĐẠT',
      reason: 'Kinh nghiệm tốt',
      email: 'a@company.com',
      sdt: '0901234567',
      inviteMailSent: true,
    });
  });

  it('đọc customFields dạng object theo key khi fieldsMap không có tên', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{ _id: 'cv-2', name: 'CV B', stageId: 's2', customFields: { tong_diem: 55, phan_loai: 'KHÔNG ĐẠT' } }],
      {},
      { s2: '02_Loai_CV' },
    );

    expect(cvs[0]).toMatchObject({ score: 55, category: 'KHÔNG ĐẠT', status: '02_Loai_CV', inviteMailSent: false });
  });

  it('dò email và SĐT từ text khi không có field', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{ _id: 'cv-3', name: 'CV Tran C nva@gmail.com', description: 'Liên hệ 0912 345 678', stageId: 's3' }],
      {},
      { s3: '03_Tiem_Nang' },
    );

    expect(cvs[0].email).toBe('nva@gmail.com');
    expect(cvs[0].sdt).toBe('0912345678');
  });

  it('đoán stage theo phân loại cho stageId lạ, không sửa stagesMap đầu vào', () => {
    const input: Record<string, string> = {};
    const { cvs, stagesMap } = mapItemsToCVProfiles(
      [
        { _id: 'cv-4', name: 'CV D', stageId: 'sx', customFields: [{ fieldId: 'f2', value: 'SAI JD' }] },
        { _id: 'cv-5', name: 'CV E', stageId: 'sx', customFields: [{ fieldId: 'f2', value: 'ĐẠT' }] },
      ],
      FIELDS,
      input,
    );

    expect(cvs.map((cv) => cv.status)).toEqual(['06_Sai_JD', '06_Sai_JD']);
    expect(stagesMap).toEqual({ sx: '06_Sai_JD' });
    expect(input).toEqual({});
  });

  it('dùng giá trị mặc định khi item thiếu tên và stage', () => {
    const { cvs } = mapItemsToCVProfiles([{ id: 'cv-6' }], {}, {});

    expect(cvs[0]).toMatchObject({ _id: 'cv-6', name: 'Không tên', status: '01_Dau_Vao', email: '', sdt: '' });
  });

  it('đoán stage cho KHONG DAT, KHONG TUYEN, và branch else', () => {
    const input: Record<string, string> = {};
    const { cvs, stagesMap } = mapItemsToCVProfiles(
      [
        { _id: 'cv-7', name: 'CV SA', stageId: 'sa', customFields: [{ fieldId: 'f2', value: 'KHÔNG ĐẠT' }] },
        { _id: 'cv-8', name: 'CV SB', stageId: 'sb', customFields: [{ fieldId: 'f2', value: 'Không tuyển' }] },
        { _id: 'cv-9', name: 'CV SC', stageId: 'sc', customFields: [{ fieldId: 'f2', value: 'Chờ xét' }] },
      ],
      FIELDS,
      input,
    );

    expect(cvs.map((cv) => cv.status)).toEqual(['02_Loai_CV', '02_Loai_CV', '01_Dau_Vao']);
    expect(stagesMap).toEqual({ sa: '02_Loai_CV', sb: '02_Loai_CV', sc: '01_Dau_Vao' });
    expect(input).toEqual({});
  });
});
