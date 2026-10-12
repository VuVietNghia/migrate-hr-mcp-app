// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const askAI = vi.fn();
const { createOrUpdateFileMock, privosApp, runtime } = vi.hoisted(() => ({
  createOrUpdateFileMock: vi.fn(),
  privosApp: {
    callServerTool: () => Promise.resolve({ records: [] }),
  },
  runtime: { roomId: 'room-1' },
}));
const readRoomFileText = vi.hoisted(() => vi.fn());

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => privosApp,
  usePrivosContext: () => ({ roomId: runtime.roomId }),
  parseToolResult: (value: unknown) => value,
}));

vi.mock('../src/ui/pipeline-service', () => ({
  PipelineService: class {
    fetchAvailableJDs() {
      return Promise.resolve([{ _id: 'jd-1', name: 'frontend.md' }]);
    }

    askAI(...args: unknown[]) {
      return askAI(...args);
    }
  },
}));

vi.mock('../src/ui/privos-rest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/privos-rest')>();
  return {
    ...actual,
    createOrUpdateFile: (...args: unknown[]) => createOrUpdateFileMock(...args),
    readRoomFileText: (...args: unknown[]) => readRoomFileText(...args),
  };
});

import JDChatbotFunctional from '../src/ui/jd-chatbot-functional';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('JD assistant response integration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    askAI.mockReset();
    createOrUpdateFileMock.mockReset();
    runtime.roomId = 'room-1';
    readRoomFileText.mockReset();
    readRoomFileText.mockResolvedValue('# Frontend Developer\n\nNội dung gốc');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('uses robot and person icons for AI and user chat avatars', async () => {
    askAI.mockResolvedValue({
      text: 'Bạn vui lòng bổ sung hình thức làm việc.\n<jd_content>NULL</jd_content>',
    });

    await act(async () => {
      root.render(createElement(JDChatbotFunctional));
      await Promise.resolve();
    });

    const department = host.querySelector<HTMLSelectElement>('[aria-label="Phòng ban của JD"]');
    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (department) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(department, 'it');
        department.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'Tạo JD Mobile');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.jd-studio-message--ai [data-icon="robot"]')).not.toBeNull();
    expect(host.querySelector('.jd-studio-message--user [data-icon="user"]')).not.toBeNull();
    expect(
      [...host.querySelectorAll('.jd-studio-message-avatar')].every((avatar) => !avatar.textContent?.trim()),
    ).toBe(true);
  });

  it('does not replace the preview or show a completion notice for NULL JD content', async () => {
    askAI.mockResolvedValue({
      text: 'Bạn vui lòng bổ sung mức lương.\n<jd_content>NULL</jd_content>',
    });

    await act(async () => {
      root.render(createElement(JDChatbotFunctional, {
        navigationIntent: {
          sequence: 1,
          target: 'chatbotJD',
          jd: { fileId: 'jd-1', fileName: 'frontend.md' },
        },
      }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.jd-studio-document-body')?.textContent).toContain('Nội dung gốc');

    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    expect(input).not.toBeNull();

    await act(async () => {
      if (!input) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'Tạo JD Frontend');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const sendButton = host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button');
    expect(sendButton?.disabled).toBe(false);

    await act(async () => {
      sendButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.jd-studio-document-body')?.textContent).toContain('Nội dung gốc');
    expect(host.querySelector('.jd-studio-document-body')?.textContent).not.toContain('NULL');
    expect(host.textContent).toContain('Bạn vui lòng bổ sung mức lương.');
    expect(host.textContent).not.toContain('Nội dung JD mới được hiển thị ở bên phải màn hình');
  });

  it('renders an existing-JD response as one update confirmation instead of a creation message', async () => {
    askAI.mockResolvedValue({
      text: 'Đã cập nhật địa điểm.\n<position_name>Frontend Developer</position_name>\n<jd_content># Frontend Developer\n\nĐịa điểm: Hà Nội</jd_content>',
    });

    await act(async () => {
      root.render(createElement(JDChatbotFunctional, {
        navigationIntent: {
          sequence: 2,
          target: 'chatbotJD',
          jd: { fileId: 'jd-1', fileName: 'frontend.md' },
        },
      }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (!input) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'Đổi địa điểm sang Hà Nội');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Đã cập nhật JD. Bạn có thể xem thay đổi ở bên phải.');
    expect(host.textContent).not.toContain('Đã tạo JD cho vị trí Frontend Developer');
    expect(host.textContent).not.toContain('Đã cập nhật địa điểm.');
  });

  it('discards an in-flight AI result after the Room changes', async () => {
    let resolveAI: ((value: { text: string }) => void) | undefined;
    askAI.mockImplementation(() => new Promise((resolve) => {
      resolveAI = resolve;
    }));

    await act(async () => {
      root.render(createElement(JDChatbotFunctional));
      await Promise.resolve();
    });

    const department = host.querySelector<HTMLSelectElement>('[aria-label="Phòng ban của JD"]');
    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (department) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(department, 'it');
        department.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'Tạo JD Blockchain');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
    });

    await act(async () => {
      runtime.roomId = 'room-2';
      root.render(createElement(JDChatbotFunctional));
      await Promise.resolve();
    });

    await act(async () => {
      resolveAI?.({
        text: '<position_name>Blockchain Developer</position_name><jd_content># Blockchain Developer</jd_content>',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('.jd-studio-document-body')?.textContent).not.toContain('Blockchain Developer');
    expect(createOrUpdateFileMock).not.toHaveBeenCalled();
  });

  it('keeps the generated filename so a failed autosave can be retried', async () => {
    askAI.mockResolvedValue({
      text: '<position_name>Data Engineer</position_name><jd_content># Data Engineer\n\n- **Phòng ban:** Other</jd_content>',
    });
    createOrUpdateFileMock
      .mockRejectedValueOnce(new Error('Room Files unavailable'))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      root.render(createElement(JDChatbotFunctional));
      await Promise.resolve();
    });

    const department = host.querySelector<HTMLSelectElement>('[aria-label="Phòng ban của JD"]');
    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (department) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(department, 'it');
        department.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'Tạo JD Data Engineer');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('JD_AI_DataEngineer.md');
    const retryButton = host.querySelector<HTMLButtonElement>('.jd-studio-document-footer .studio-button--primary');
    expect(retryButton?.disabled).toBe(false);

    await act(async () => {
      retryButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createOrUpdateFileMock).toHaveBeenCalledTimes(2);
    expect(createOrUpdateFileMock.mock.calls[0]?.[1]).toBe(createOrUpdateFileMock.mock.calls[1]?.[1]);
  });

  it('persists hidden display metadata when creating a new AI JD', async () => {
    askAI.mockResolvedValue({
      text: `<position_name>Blockchain Developer</position_name>
<jd_location>TP. Hồ Chí Minh</jd_location>
<jd_employment_type>Hybrid</jd_employment_type>
<jd_salary>25–35 triệu</jd_salary>
<jd_summary>Phát triển nền tảng blockchain cho khách hàng doanh nghiệp.</jd_summary>
<jd_description>Phát triển smart contract
Tối ưu hiệu năng hệ thống</jd_description>
<jd_content># Blockchain Developer

Nội dung JD linh hoạt.</jd_content>`,
    });
    createOrUpdateFileMock.mockResolvedValue(undefined);

    await act(async () => {
      root.render(createElement(JDChatbotFunctional));
      await Promise.resolve();
    });

    const department = host.querySelector<HTMLSelectElement>('[aria-label="Phòng ban của JD"]');
    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (department) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(department, 'it');
        department.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'Tạo JD Blockchain Developer');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const savedContent = String(createOrUpdateFileMock.mock.calls[0]?.[2] || '');
    expect(savedContent).toContain('<!-- JD_LOCATION: TP. Hồ Chí Minh -->');
    expect(savedContent).toContain('<!-- JD_EMPLOYMENT_TYPE: Hybrid -->');
    expect(savedContent).toContain('<!-- SUMMARY: Phát triển nền tảng blockchain cho khách hàng doanh nghiệp. -->');
    expect(savedContent).toContain('<!-- JD_DESCRIPTION:\nPhát triển smart contract\nTối ưu hiệu năng hệ thống\n-->');
  });

  it('reapplies the loaded department when AI edits an existing JD', async () => {
    readRoomFileText.mockResolvedValue(`# Frontend Developer

<!-- DEPARTMENT_ID: hr -->

- **Phòng ban:** HR`);
    askAI.mockResolvedValue({
      text: '<jd_content># Frontend Developer\n\n<!-- DEPARTMENT_ID: it -->\n\n- **Phòng ban:** IT\n- Địa điểm: Hà Nội</jd_content>',
    });

    await act(async () => {
      root.render(createElement(JDChatbotFunctional, {
        navigationIntent: {
          sequence: 3,
          target: 'chatbotJD',
          jd: { fileId: 'jd-1', fileName: 'frontend.md' },
        },
      }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = host.querySelector<HTMLInputElement>('.jd-chatbot-chat-input');
    await act(async () => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Đổi địa điểm');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.jd-chatbot-composer button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const departmentLabel = Array.from(
      host.querySelectorAll<HTMLElement>('.jd-studio-document-body .company-markdown-preview strong'),
    ).find((element) => element.textContent === 'Phòng ban:');
    const departmentRow = departmentLabel?.closest('li')?.textContent || '';
    expect(departmentRow).toContain('Phòng ban: HR');
    expect(departmentRow).not.toContain('Phòng ban: IT');
  });
});
