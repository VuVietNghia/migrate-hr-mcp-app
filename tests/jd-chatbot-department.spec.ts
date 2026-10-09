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

  it('injects a canonical recruitment title when the AI payload has no H1', () => {
    const content = `## 1. Thông Tin Chung
- **Vị trí:** Kỹ sư dữ liệu
- **Phòng ban:** Khác`;

    expect(prepareCreatedJD(content, 'Kỹ sư dữ liệu', { key: 'it', label: 'IT' })).toMatch(
      /^# THÔNG TIN TUYỂN DỤNG: KỸ SƯ DỮ LIỆU\n\n<!-- DEPARTMENT_ID: it -->/,
    );
  });
});
