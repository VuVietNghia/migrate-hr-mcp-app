import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RecruitmentJobUploadDialog } from '../src/ui/recruitment/RecruitmentJobUploadDialog';

const props = {
  open: true,
  file: null,
  departmentKey: '',
  departments: [{ key: 'it', label: 'IT', order: 0 }],
  error: '',
  isSaving: false,
  onFileChange: vi.fn(),
  onDepartmentChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn(),
};

describe('RecruitmentJobUploadDialog', () => {
  it('renders a single supported file picker and required department', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobUploadDialog, props));
    expect(html).toContain('accept=".md,.docx,.pdf"');
    expect(html).not.toContain(' multiple');
    expect(html).toContain('Kéo thả JD vào đây');
    expect(html).toContain('Chọn phòng ban');
    expect(html).toContain('disabled');
  });

  it('shows the selected file and enables submit when valid', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobUploadDialog, {
      ...props,
      file: new File(['content'], 'role.DOCX'),
      departmentKey: 'it',
    }));
    expect(html).toContain('role.DOCX');
    expect(html).toContain('Word');
    expect(html).not.toMatch(/type="submit"[^>]*disabled/);
  });

  it('changes submit copy when retrying metadata persistence', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobUploadDialog, {
      ...props,
      file: new File(['content'], 'role.pdf'),
      departmentKey: 'it',
      uploadedFile: { fileId: 'f1', fileName: 'role.pdf' },
      error: 'Chưa lưu được phòng ban',
    }));
    expect(html).toContain('Thử lưu phòng ban lại');
    expect(html).toContain('File đã được tải lên');
  });

  it('disables submit when the selected department no longer exists', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentJobUploadDialog, {
      ...props,
      file: new File(['content'], 'role.pdf'),
      departmentKey: 'removed',
    }));
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });
});
