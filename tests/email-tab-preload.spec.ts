// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailHistoryRecord } from '../src/services/mail/email-history-model';

const loadEmailHistory = vi.fn<() => Promise<EmailHistoryRecord[]>>();

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => ({ callServerTool: vi.fn() }),
  usePrivosContext: () => ({ roomId: 'room-preload' }),
}));

vi.mock('../src/ui/email-history/email-history-service', () => ({
  EmailHistoryService: class {
    load() {
      return loadEmailHistory();
    }
  },
}));

vi.mock('../src/ui/email-templates/interview-email-template-default', () => ({
  createEmployeeEmailTemplateRepository: () => ({}),
  createInterviewEmailTemplateRepository: () => ({}),
}));

vi.mock('../src/ui/mail-connection/MailConnectionPanel', () => ({
  MailConnectionPanel: () => null,
}));

import EmailTab from '../src/ui/email-history/EmailTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PRELOADED_RECORD: EmailHistoryRecord = {
  id: 'email-1',
  listId: 'list-1',
  stageId: 'sent-stage',
  status: 'sent',
  source: 'cv_scored',
  recipientName: 'Nguyễn Minh Anh',
  recipientEmail: 'minh.anh@example.com',
  subject: 'Lịch phỏng vấn Full Stack Developer',
  htmlContent: '<p>Nội dung thư mời</p>',
  createdAt: '2026-10-09T08:00:00.000Z',
  updatedAt: '2026-10-09T08:00:00.000Z',
  attemptCount: 1,
};

describe('Email tab startup preload', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    loadEmailHistory.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('loads and exposes email history while the tab is inactive', async () => {
    loadEmailHistory.mockResolvedValue([PRELOADED_RECORD]);

    await act(async () => {
      root.render(createElement(EmailTab, { active: false }));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Lịch phỏng vấn Full Stack Developer');
  });
});
