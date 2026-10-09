import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JDChatbotDocumentPanel } from '../src/ui/jd-chatbot/JDChatbotDocumentPanel';
import { JDChatbotLibraryDialog } from '../src/ui/jd-chatbot/JDChatbotLibraryDialog';
import { JDChatbotHeader } from '../src/ui/jd-chatbot-header';
import {
  JDChatbotCompanyOption,
  JDChatbotComposer,
  JDChatbotDepartmentSelect,
} from '../src/ui/jd-chatbot-interaction-controls';
import JDChatbotFunctional from '../src/ui/jd-chatbot-functional';

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => ({}),
  usePrivosContext: () => ({ roomId: 'room-1' }),
}));

const noop = vi.fn();

function renderPanel(overrides: Partial<Parameters<typeof JDChatbotDocumentPanel>[0]> = {}) {
  return renderToStaticMarkup(createElement(JDChatbotDocumentPanel, {
    mode: 'preview',
    onModeChange: noop,
    fileName: 'frontend-developer.md',
    draft: '# TUYỂN DỤNG: Frontend Developer\n\nPhòng ban: IT',
    saved: '# TUYỂN DỤNG: Frontend Developer\n\nPhòng ban: Engineering',
    loading: false,
    loadError: null,
    isSaving: false,
    saveMessage: null,
    onDraftChange: noop,
    onOpenLibrary: noop,
    onRestore: noop,
    onSave: noop,
    ...overrides,
  }));
}

describe('JD assistant Studio view', () => {
  it('renders the approved page header and actions without a download feature', () => {
    const html = renderToStaticMarkup(createElement(JDChatbotHeader, {
      busy: false,
      canSave: true,
      isSaving: false,
      onOpenLibrary: noop,
      onCreateNew: noop,
      onSave: noop,
    }));

    expect(html).toContain('TUYỂN DỤNG');
    expect(html).toContain('Trợ lý JD');
    expect(html).toContain('Soạn và chỉnh sửa mô tả công việc cùng AI.');
    expect(html).toContain('Thư viện JD');
    expect(html).toContain('Tạo mới');
    expect(html).toContain('Lưu thay đổi');
    expect(html).not.toContain('Tải .md');
    expect(html).not.toContain('jd-download');
  });

  it('keeps the three document modes in the exact approved order', () => {
    const html = renderPanel({ mode: 'changes' });
    const preview = html.indexOf('Xem trước');
    const changes = html.indexOf('Xem thay đổi');
    const manual = html.indexOf('Chỉnh sửa thủ công');

    expect(preview).toBeGreaterThan(-1);
    expect(changes).toBeGreaterThan(preview);
    expect(manual).toBeGreaterThan(changes);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Các dòng được thêm hoặc thay đổi có nền xanh.');
    expect(html).toContain('jd-studio-change-row is-changed');
  });

  it('renders Markdown in preview and a controlled textarea in manual mode', () => {
    expect(renderPanel()).toContain('<h1>TUYỂN DỤNG: Frontend Developer</h1>');

    const manual = renderPanel({ mode: 'manual' });
    expect(manual).toContain('<textarea');
    /*
    expect(manual).toContain('value="# TUYỂN DỤNG: Frontend Developer');
    expect(manual).toContain('51 ký tự');
    */
    expect(manual).toContain('Frontend Developer');
    expect(manual).toContain('47 k\u00fd t\u1ef1');
  });

  it('renders the empty document state with a library action', () => {
    const html = renderPanel({ fileName: null, draft: '', saved: '' });

    expect(html).toContain('Bản mô tả công việc mới');
    expect(html).toContain('JD tiếp theo bắt đầu từ đây.');
    expect(html).toContain('Mở thư viện JD');
  });

  it('renders a controlled Markdown-only library dialog', () => {
    const html = renderToStaticMarkup(createElement(JDChatbotLibraryDialog, {
      open: true,
      files: [
        { _id: '1', name: 'frontend.md' },
        { _id: '2', name: 'backend.md' },
      ],
      selectedId: '2',
      searchValue: 'back',
      refreshing: false,
      onClose: noop,
      onSearchChange: noop,
      onRefresh: noop,
      onSelect: noop,
    }));

    expect(html).toContain('Thư viện JD');
    expect(html).toContain('value="back"');
    expect(html).toContain('frontend.md');
    expect(html).toContain('backend.md');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('Làm mới');
  });

  it('keeps the company option opt-in and renders a fixed single-line composer', () => {
    const company = renderToStaticMarkup(createElement(JDChatbotCompanyOption, {
      busy: false,
      checked: false,
      onChange: noop,
    }));
    const composer = renderToStaticMarkup(createElement(JDChatbotComposer, {
      busy: false,
      input: '   ',
      onInputChange: noop,
      onSend: noop,
    }));

    expect(company).not.toContain('checked=""');
    expect(company).toContain('Thêm thông tin công ty vào JD');
    expect(composer).toContain('<input');
    expect(composer).toContain('type="text"');
    expect(composer).not.toContain('<textarea');
    expect(composer).toContain('<svg');
    expect(composer).toContain('viewBox="0 0 20 20"');
    expect(composer).not.toContain('>Gửi</button>');
    expect(composer).toContain('disabled=""');
  });

  it('renders a required department selector and blocks new-JD sending until selection', () => {
    const department = renderToStaticMarkup(createElement(JDChatbotDepartmentSelect, {
      busy: false,
      departments: [
        { key: 'it', label: 'IT', order: 0 },
        { key: 'marketing', label: 'Marketing', order: 1 },
      ],
      value: '',
      onChange: noop,
    }));
    const composer = renderToStaticMarkup(createElement(JDChatbotComposer, {
      busy: false,
      canSend: false,
      input: 'Tạo JD Blockchain',
      onInputChange: noop,
      onSend: noop,
    }));

    expect(department).toContain('aria-label="Phòng ban của JD"');
    expect(department).toContain('required=""');
    expect(department).toContain('Chọn phòng ban');
    expect(department).toContain('Marketing');
    expect(composer).toContain('disabled=""');
  });

  it('styles the whole composer focus, compact placeholder, icon button, and slim panel scrollbars', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.jd-studio-assistant-footer \.jd-chatbot-composer:focus-within\s*\{[^}]*border-color:\s*var\(--studio-accent\)[^}]*box-shadow:\s*var\(--studio-focus\)/s);
    expect(css).toMatch(/\.jd-studio-assistant-footer \.jd-chatbot-chat-input::placeholder\s*\{[^}]*font-size:\s*\.7rem/s);
    expect(css).toMatch(/\.jd-studio-assistant-footer \.jd-chatbot-composer button\s*\{[^}]*width:\s*36px[^}]*height:\s*36px[^}]*border-radius:\s*9px/s);
    expect(css).toMatch(/\.jd-studio-messages,\s*\.jd-studio-document-body,\s*\.jd-studio-manual-editor\s*\{[^}]*scrollbar-width:\s*thin[^}]*scrollbar-color:/s);
    expect(css).toMatch(/:is\(\.jd-studio-messages, \.jd-studio-document-body, \.jd-studio-manual-editor\)::\-webkit-scrollbar\s*\{[^}]*width:\s*6px/s);
  });

  it('defines responsive two-pane layout and semantic change highlighting', () => {
    const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');

    expect(css).toMatch(/\.jd-studio-workspace\s*\{[^}]*grid-template-columns:\s*350px minmax\(0, 1fr\)/s);
    expect(css).toMatch(/\.jd-studio-workspace\s*\{[^}]*height:\s*calc\(100vh - 170px\)[^}]*min-height:\s*760px/s);
    expect(css).toMatch(/\.jd-studio-change-row\.is-changed\s*\{[^}]*background:\s*var\(--studio-success-soft\)/s);
    expect(css).toMatch(/@media \(max-width:\s*1000px\)[\s\S]*?\.jd-studio-workspace\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.jd-studio-document-tabs/s);
  });

  it('renders the assistant heading without the blue AI pill', () => {
    const html = renderToStaticMarkup(createElement(JDChatbotFunctional));

    expect(html).toContain('studio-eyebrow');
    expect(html).not.toContain('jd-studio-ai-pill');
  });
});
