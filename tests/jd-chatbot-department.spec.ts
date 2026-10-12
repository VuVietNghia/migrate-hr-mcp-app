import { describe, expect, it } from 'vitest';
import { applyJDDepartment, prepareCreatedJD } from '../src/ui/jd-chatbot-department';

describe('AI-created JD department normalization', () => {
  it('adds stable metadata and replaces the AI list department with the selected department', () => {
    const content = `# THÔNG TIN TUYỂN DỤNG: BLOCKCHAIN DEVELOPER

## 1. Thông Tin Chung
- **Vị trí:** Blockchain Developer
- **Phòng ban:** Blockchain
- **Địa điểm làm việc:** TP. Hồ Chí Minh`;

    expect(applyJDDepartment(content, { key: 'it', label: 'IT' })).toBe(`# THÔNG TIN TUYỂN DỤNG: BLOCKCHAIN DEVELOPER

<!-- DEPARTMENT_ID: it -->

## 1. Thông Tin Chung
- **Vị trí:** Blockchain Developer
- **Phòng ban:** IT
- **Địa điểm làm việc:** TP. Hồ Chí Minh`);
  });

  it('replaces conflicting metadata and a canonical table department row', () => {
    const content = `# TUYỂN DỤNG: CONTENT CREATOR

<!-- DEPARTMENT_ID: marketing -->

| **Phòng ban** | Marketing |
| **Địa điểm làm việc** | Hà Nội |`;
    const normalized = applyJDDepartment(content, { key: 'hr', label: 'HR' });

    expect(normalized).toContain('<!-- DEPARTMENT_ID: hr -->');
    expect(normalized).toContain('| **Phòng ban** | HR |');
    expect(normalized).not.toContain('marketing');
    expect(normalized).not.toContain('Marketing');
  });

  it('injects only the position name when the AI payload has no H1', () => {
    const content = `## 1. Thông Tin Chung
- **Vị trí:** Kỹ sư dữ liệu
- **Phòng ban:** Khác`;

    expect(prepareCreatedJD(content, 'Kỹ sư dữ liệu', { key: 'it', label: 'IT' })).toMatch(
      /^# Kỹ sư dữ liệu\n\n<!-- DEPARTMENT_ID: it -->/,
    );
  });

  it('replaces an AI recruitment-label H1 with only the position name', () => {
    const content = `# TIN TUYỂN DỤNG: LẬP TRÌNH VIÊN MOBILE

## Mô tả công việc
- Phát triển ứng dụng di động`;

    const normalized = prepareCreatedJD(
      content,
      'Lập trình viên Mobile',
      { key: 'it', label: 'IT' },
    );

    expect(normalized).toMatch(/^# Lập trình viên Mobile\n\n<!-- DEPARTMENT_ID: it -->/);
    expect(normalized).not.toContain('TIN TUYỂN DỤNG');
  });

  it('stores AI display metadata as hidden comments without changing the visible JD layout', () => {
    const normalized = prepareCreatedJD(
      '# Blockchain Developer\n\nNội dung JD do AI tự trình bày.',
      'Blockchain Developer',
      { key: 'it', label: 'IT' },
      {
        location: 'TP. Hồ Chí Minh',
        employmentType: 'Hybrid',
        salary: '25–35 triệu',
        summary: 'Phát triển nền tảng blockchain cho khách hàng doanh nghiệp.',
        description: 'Phát triển smart contract\nTối ưu hiệu năng hệ thống',
      },
    );

    expect(normalized).toContain('<!-- JD_LOCATION: TP. Hồ Chí Minh -->');
    expect(normalized).toContain('<!-- JD_EMPLOYMENT_TYPE: Hybrid -->');
    expect(normalized).toContain('<!-- JD_SALARY: 25–35 triệu -->');
    expect(normalized).toContain('<!-- SUMMARY: Phát triển nền tảng blockchain cho khách hàng doanh nghiệp. -->');
    expect(normalized).toContain('<!-- JD_DESCRIPTION:\nPhát triển smart contract\nTối ưu hiệu năng hệ thống\n-->');
    expect(normalized).toContain('Nội dung JD do AI tự trình bày.');
  });
});
