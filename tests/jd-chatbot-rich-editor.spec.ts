// @vitest-environment happy-dom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JDChatbotDocumentPanel } from '../src/ui/jd-chatbot/JDChatbotDocumentPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('JD manual rich editor', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('writes edited formatted content back immediately without losing hidden metadata', async () => {
    const onDraftChange = vi.fn();
    const draft = `# Lập trình viên Mobile

<!-- DEPARTMENT_ID: it -->
<!-- JD_LOCATION: Hà Nội -->

**Phòng ban:** IT

- Phát triển ứng dụng`;

    await act(async () => {
      root.render(createElement(JDChatbotDocumentPanel, {
        mode: 'manual',
        onModeChange: vi.fn(),
        fileName: 'JD_AI_LapTrinhVienMobile.md',
        draft,
        saved: draft,
        loading: false,
        loadError: null,
        isSaving: false,
        saveMessage: null,
        onDraftChange,
        onOpenLibrary: vi.fn(),
        onRestore: vi.fn(),
        onSave: vi.fn(),
      }));
    });

    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    if (!editor) return;

    editor.innerHTML = `<article>
      <h1>Lập trình viên Mobile cao cấp</h1>
      <p><strong>Phòng ban:</strong> IT</p>
      <ul><li>Phát triển ứng dụng iOS và Android</li></ul>
    </article>`;

    await act(async () => {
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    const updated = String(onDraftChange.mock.calls[0]?.[0] || '');
    expect(updated).toContain('# Lập trình viên Mobile cao cấp');
    expect(updated).toContain('**Phòng ban:** IT');
    expect(updated).toContain('- Phát triển ứng dụng iOS và Android');
    expect(updated).toContain('<!-- DEPARTMENT_ID: it -->');
    expect(updated).toContain('<!-- JD_LOCATION: Hà Nội -->');
  });

  it('keeps typed content mounted while parent state enables actions', async () => {
    const saved = '# Lập trình viên Mobile\n\nNội dung ban đầu';

    function Harness() {
      const [draft, setDraft] = useState(saved);
      return createElement(JDChatbotDocumentPanel, {
        mode: 'manual',
        onModeChange: vi.fn(),
        fileName: 'JD_AI_LapTrinhVienMobile.md',
        draft,
        saved,
        loading: false,
        loadError: null,
        isSaving: false,
        saveMessage: null,
        onDraftChange: setDraft,
        onOpenLibrary: vi.fn(),
        onRestore: vi.fn(),
        onSave: vi.fn(),
      });
    }

    await act(async () => root.render(createElement(Harness)));

    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editor).not.toBeNull();
    if (!editor) return;
    editor.focus();
    const paragraph = editor.querySelector('p');
    expect(paragraph).not.toBeNull();
    if (!paragraph) return;
    paragraph.textContent = 'Nội dung đã sửa';

    await act(async () => editor.dispatchEvent(new InputEvent('input', { bubbles: true })));

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    const restoreButton = buttons.find((button) => button.textContent?.includes('Khôi phục chỉnh sửa'));
    const saveButton = buttons.find((button) => button.textContent?.includes('Lưu thay đổi'));
    const currentEditor = host.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(currentEditor).toBe(editor);
    expect(currentEditor?.textContent).toContain('Nội dung đã sửa');
    expect(currentEditor?.textContent).not.toContain('Nội dung ban đầu');
    expect(document.activeElement).toBe(editor);
    expect(restoreButton?.disabled).toBe(false);
    expect(saveButton?.disabled).toBe(false);
  });
});
