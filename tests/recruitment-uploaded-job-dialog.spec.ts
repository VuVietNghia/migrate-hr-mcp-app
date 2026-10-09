import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RecruitmentUploadedJobDialog } from '../src/ui/recruitment/RecruitmentUploadedJobDialog';

const base = {
  job: { kind: 'uploaded' as const, fileId: 'f1', fileName: 'role.pdf', departmentKey: 'it', departmentLabel: 'IT', format: 'pdf' as const },
  loading: false,
  error: '',
  blob: new Blob(['x']),
  isDownloading: false,
  downloadError: '',
  onClose: vi.fn(),
  onDownload: vi.fn(),
  onEditWithAI: vi.fn(),
  onUseInPipeline: vi.fn(),
};

describe('RecruitmentUploadedJobDialog', () => {
  it('shows file identity and only the actions valid for PDF', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentUploadedJobDialog, base));
    expect(html).toContain('role.pdf');
    expect(html).toContain('IT');
    expect(html).toContain('Tải JD');
    expect(html).toContain('Dùng để sàng lọc CV');
    expect(html).not.toContain('Chỉnh với AI');
    expect(html).not.toContain('Mức lương');
  });

  it('offers AI editing only for Markdown', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentUploadedJobDialog, {
      ...base,
      job: { ...base.job, fileName: 'role.md', format: 'markdown' as const },
      blob: null,
      text: '# Role',
    }));
    expect(html).toContain('Chỉnh với AI');
  });
});
