import { readFileSync } from 'node:fs';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CVFile, ProcessingStatus } from '../src/ui/pipeline-service';
import * as PipelineSections from '../src/ui/pipeline/PipelineStudioSections';
import {
  PipelineCVQueue,
  PipelineFlowStrip,
  PipelineJDPanel,
  PipelineProgressPanel,
  PipelineResultsPanel,
} from '../src/ui/pipeline/PipelineStudioSections';

const studioCss = readFileSync('src/ui/studio/studio.css', 'utf8');

const cv = (_id: string, name = `${_id}.pdf`): CVFile => ({ _id, name });
const status = (
  fileId: string,
  value: ProcessingStatus['status'],
): ProcessingStatus => ({ fileId, originalName: `${fileId}.pdf`, status: value });

describe('Pipeline Studio sections', () => {
  it('renders the page heading without duplicate upload or score actions', () => {
    const Header = (PipelineSections as Record<string, any>).PipelinePageHeader;
    expect(Header).toBeTypeOf('function');
    const html = renderToStaticMarkup(createElement(Header));

    expect(html).toContain('Sàng lọc CV');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Tải CV');
    expect(html).not.toContain('Đánh giá CV');
  });

  it('renders the three-step workflow', () => {
    const html = renderToStaticMarkup(createElement(PipelineFlowStrip, {
      jdReady: true,
      selectedCount: 2,
      completedCount: 0,
    }));

    expect(html).toContain('Chọn mô tả công việc');
    expect(html).toContain('Chọn CV');
    expect(html).toContain('Đánh giá &amp; kết quả');
    expect(html).toContain('is-active');
  });

  it('uses the selected JD summary as the viewer trigger and only offers file upload', () => {
    const html = renderToStaticMarkup(createElement(PipelineJDPanel, {
      jds: [cv('jd-1', 'JD Frontend.md')],
      selectedName: 'JD Frontend.md',
      loadStatus: 'success',
      loading: false,
      disabled: false,
      fileInputRef: createRef<HTMLInputElement>(),
      onSelect: vi.fn(),
      onOpenSelected: vi.fn(),
      onUpload: vi.fn(),
      onRetry: vi.fn(),
    }));

    expect(html).toContain('aria-label="Mở nội dung JD JD Frontend.md"');
    expect(html).toContain('Tải JD');
    expect(html).not.toContain('Xem JD');
    expect(html).not.toContain('Chỉnh với AI');
    expect(html).not.toContain('Tạo bằng form');
  });

  it('shows the current JD content load state in the card header', () => {
    const renderPanel = (
      loadStatus: 'idle' | 'loading' | 'success' | 'error',
      selectedName = 'JD Frontend.md',
    ) => renderToStaticMarkup(createElement(PipelineJDPanel, {
      jds: [cv('jd-1', 'JD Frontend.md')],
      selectedName,
      loadStatus,
      loading: false,
      disabled: false,
      fileInputRef: createRef<HTMLInputElement>(),
      onSelect: vi.fn(),
      onOpenSelected: vi.fn(),
      onUpload: vi.fn(),
      onRetry: vi.fn(),
    }));

    expect(renderPanel('idle', '')).toContain('Chưa chọn JD');
    expect(renderPanel('loading')).toContain('Đang nạp JD');
    expect(renderPanel('success')).toContain('Đã nạp JD');
    expect(renderPanel('error')).toContain('Nạp JD thất bại');
    expect(renderPanel('idle', '')).toContain('pipeline-studio-jd-status is-idle');
    expect(renderPanel('loading')).toContain('pipeline-studio-jd-status is-loading');
    expect(renderPanel('success')).toContain('pipeline-studio-jd-status is-success');
    expect(renderPanel('error')).toContain('pipeline-studio-jd-status is-error');
  });

  it('renders a custom grouped listbox instead of the native JD select popup', () => {
    const html = renderToStaticMarkup(createElement(PipelineJDPanel, {
      jds: [
        cv('jd-regular', 'JD Frontend.md'),
        cv('jd-generated', 'JD_AI_Backend.md'),
      ],
      selectedName: 'JD Frontend.md',
      loadStatus: 'success',
      loading: false,
      disabled: false,
      fileInputRef: createRef<HTMLInputElement>(),
      onSelect: vi.fn(),
      onOpenSelected: vi.fn(),
      onUpload: vi.fn(),
      onRetry: vi.fn(),
    }));

    expect(html).not.toContain('<select');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="group"');
    expect(html).toContain('role="option"');
    expect(html).toContain('JD Frontend.md');
    expect(html).toContain('JD_AI_Backend.md');
  });

  it('supports listbox arrow, home, and end navigation', () => {
    const getNextIndex = (PipelineSections as Record<string, any>).getNextPipelineJDOptionIndex;
    expect(getNextIndex).toBeTypeOf('function');
    expect(getNextIndex(1, 'ArrowDown', 3)).toBe(2);
    expect(getNextIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(getNextIndex(0, 'ArrowUp', 3)).toBe(2);
    expect(getNextIndex(2, 'Home', 3)).toBe(0);
    expect(getNextIndex(0, 'End', 3)).toBe(2);
    expect(getNextIndex(1, 'Enter', 3)).toBeNull();
  });

  it('uses the shared document viewers for Markdown, PDF, and DOCX job descriptions', () => {
    const Preview = (PipelineSections as Record<string, any>).PipelineJDPreview;
    expect(Preview).toBeTypeOf('function');

    const markdown = renderToStaticMarkup(createElement(Preview, {
      fileName: 'JD Backend.md',
      text: '# Backend Engineer',
    }));
    const pdf = renderToStaticMarkup(createElement(Preview, {
      fileName: 'JD Backend.pdf',
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
    }));
    const docx = renderToStaticMarkup(createElement(Preview, {
      fileName: 'JD Backend.docx',
      blob: new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    }));

    expect(markdown).toContain('company-markdown-preview');
    expect(markdown).toContain('<h1>Backend Engineer</h1>');
    expect(pdf).toContain('company-pdf-preview');
    expect(docx).toContain('company-docx-preview');
  });

  it('keeps all CV rows while the queue viewport is capped at three visible items', () => {
    const html = renderToStaticMarkup(createElement(PipelineCVQueue, {
      files: [cv('a'), cv('b'), cv('c'), cv('d')],
      selectedIds: new Set<string>(),
      loading: false,
      processing: false,
      deletingId: null,
      pendingDeleteId: null,
      fileInputRef: createRef<HTMLInputElement>(),
      onToggleFile: vi.fn(),
      onToggleAll: vi.fn(),
      onArmDelete: vi.fn(),
      onDelete: vi.fn(),
      onUpload: vi.fn(),
      onStart: vi.fn(),
      canStart: false,
    }));

    expect(html).toContain('a.pdf');
    expect(html).toContain('d.pdf');
    expect(studioCss).toMatch(/\.pipeline-studio-file-list\s*\{[^}]*--pipeline-cv-row-height:\s*52px[^}]*max-height:\s*calc\(var\(--pipeline-cv-row-height\) \* 3 \+ 14px\)[^}]*overflow-y:\s*auto/s);
  });

  it('stretches the cards equally and presents a compact pill-shaped JD select', () => {
    expect(studioCss).toMatch(/\.pipeline-studio-grid\s*\{[^}]*align-items:\s*stretch/s);
    expect(studioCss).toMatch(/\.pipeline-studio-jd,\s*\.pipeline-studio-queue\s*\{[^}]*height:\s*100%/s);
    expect(studioCss).toMatch(
      /\.studio-root\s+\.pipeline-studio-select\s*\{[^}]*min-height:\s*38px[^}]*border-radius:\s*999px[^}]*padding:\s*8px 14px[^}]*font-size:\s*0\.62rem/s,
    );
    expect(studioCss).toMatch(
      /\.pipeline-studio-select\s*>\s*\.anticon\s*\{[^}]*font-size:\s*0\.54rem/s,
    );
    expect(studioCss).toMatch(
      /\.pipeline-studio-select-menu\s*\{[^}]*max-height:\s*260px[^}]*overflow-y:\s*auto[^}]*border-radius:\s*14px[^}]*padding:\s*6px/s,
    );
    expect(studioCss).toMatch(
      /\.pipeline-studio-select-menu\s*\{[^}]*scrollbar-width:\s*thin[^}]*scrollbar-color:/s,
    );
    expect(studioCss).toMatch(
      /\.pipeline-studio-select-menu::-webkit-scrollbar\s*\{[^}]*width:\s*5px/s,
    );
    expect(studioCss).toMatch(
      /\.pipeline-studio-select-menu::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*999px/s,
    );
    expect(studioCss).toMatch(
      /\.studio-root\s+\.pipeline-studio-select-option\s*\{[^}]*font-size:\s*0\.61rem/s,
    );
  });

  it('keeps the JD select border unchanged while focused', () => {
    expect(studioCss).toMatch(
      /\.studio-root\s+\.pipeline-studio-select:focus,\s*\.studio-root\s+\.pipeline-studio-select:focus-visible\s*\{[^}]*border-color:\s*var\(--studio-border\)[^}]*box-shadow:\s*none[^}]*outline:\s*none/s,
    );
  });

  it('keeps select-all, upload, delete, and score actions in the CV queue', () => {
    const html = renderToStaticMarkup(createElement(PipelineCVQueue, {
      files: [cv('a'), cv('b')],
      selectedIds: new Set(['a']),
      loading: false,
      processing: false,
      deletingId: null,
      pendingDeleteId: null,
      fileInputRef: createRef<HTMLInputElement>(),
      onToggleFile: vi.fn(),
      onToggleAll: vi.fn(),
      onArmDelete: vi.fn(),
      onDelete: vi.fn(),
      onUpload: vi.fn(),
      onStart: vi.fn(),
      canStart: true,
    }));

    expect(html).toContain('Chọn tất cả');
    expect(html).toContain('1/2 CV đã chọn');
    expect(html).toContain('Tải CV');
    expect(html).toContain('Chấm điểm 1 CV');
    expect(html).toContain('aria-label="Xóa a.pdf"');
  });

  it('exposes safe stop while running and candidate navigation only after saved results', () => {
    const running = renderToStaticMarkup(createElement(PipelineProgressPanel, {
      progress: { total: 3, processed: 1, completed: 1, failed: [], active: status('b', 'scoring') },
      outcome: 'running',
      savedResultCount: 0,
      onStop: vi.fn(),
      onOpenCandidates: vi.fn(),
    }));
    const completed = renderToStaticMarkup(createElement(PipelineProgressPanel, {
      progress: { total: 3, processed: 3, completed: 2, failed: [status('c', 'error')] },
      outcome: 'completed-with-errors',
      savedResultCount: 2,
      onStop: vi.fn(),
      onOpenCandidates: vi.fn(),
    }));

    expect(running).toContain('Dừng sau CV hiện tại');
    expect(running).not.toContain('Xem bảng ứng viên');
    expect(completed).toContain('Xem bảng ứng viên');
    expect(completed).not.toContain('Dừng sau CV hiện tại');
  });

  it('renders only statuses supplied by the real processing state', () => {
    const html = renderToStaticMarkup(createElement(PipelineResultsPanel, {
      statuses: [status('a', 'completed'), status('b', 'error')],
    }));

    expect(html).toContain('a.pdf');
    expect(html).toContain('b.pdf');
    expect(html).toContain('Hoàn thành');
    expect(html).toContain('Lỗi');
  });
});
