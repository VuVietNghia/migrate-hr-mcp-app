import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  RecruitmentDepartmentForm,
  RecruitmentDepartmentRenameForm,
} from '../src/ui/recruitment-department-form';

describe('RecruitmentDepartmentForm', () => {
  it('renders the create workflow in the shared accessible dialog', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentDepartmentForm, {
      departmentName: '',
      errorMessage: 'Không thể lưu phòng ban',
      isLoading: false,
      isSaving: false,
      onCancel: vi.fn(),
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('<dialog');
    expect(html).toContain('Tạo phòng ban');
    expect(html).toContain('aria-label="Tên phòng ban"');
    expect(html).toContain('placeholder="Nhập tên phòng ban"');
    expect(html).toContain('Lưu phòng ban');
    expect(html).toContain('Không thể lưu phòng ban');
    expect(html).toContain('role="alert"');
  });

  it('renders the current name and an empty new-name input in the shared dialog', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentDepartmentRenameForm, {
      currentDepartmentName: 'Kinh doanh',
      departmentName: '',
      errorMessage: '',
      isSaving: false,
      onCancel: vi.fn(),
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('<dialog');
    expect(html).toContain('Đổi tên phòng ban');
    expect(html).toContain('Tên hiện tại');
    expect(html).toContain('aria-label="Tên phòng ban hiện tại"');
    expect(html).toContain('value="Kinh doanh"');
    expect(html).toContain('readonly=""');
    expect(html).toContain('aria-label="Tên phòng ban mới"');
    expect(html).toContain('Lưu tên');
    expect(html).toContain('Hủy');
  });

  it('keeps the rename error inside the dialog and disables saving while busy', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentDepartmentRenameForm, {
      currentDepartmentName: 'Kinh doanh',
      departmentName: 'Tên mới',
      errorMessage: 'Không thể đổi tên',
      isSaving: true,
      onCancel: vi.fn(),
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('Không thể đổi tên');
    expect(html).toContain('Đang lưu…');
    expect(html).toContain('disabled=""');
  });
});
