import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  PrivosAppProvider: ({ children }: { children: ReactNode }) => children,
  usePrivosApp: () => ({ callServerTool: vi.fn() }),
  usePrivosContext: () => ({
    theme: 'dark',
    roomId: 'room-1',
    roomName: 'Phòng Tuyển dụng Sài Gòn',
    username: 'Nguyễn Minh Anh',
    userRoles: ['owner'],
  }),
}));

vi.mock('../src/ui/payroll/access/usePayrollAccessPolling', () => ({
  usePayrollAccessPolling: () => true,
}));

vi.mock('../src/ui/email-templates/interview-email-template-default', () => ({
  createEmployeeEmailTemplateRepository: () => ({ ensureInitialized: vi.fn() }),
  createInterviewEmailTemplateRepository: () => ({ ensureInitialized: vi.fn() }),
}));

vi.mock('../src/ui/pipeline-service', () => ({ ensureTemplatesExistGlobal: vi.fn() }));
vi.mock('../src/ui/company-home', () => ({ default: () => createElement('p', null, 'Company screen') }));
vi.mock('../src/ui/recruitment-panel', () => ({ default: () => null }));
vi.mock('../src/ui/pipeline-dashboard', () => ({ default: () => null }));
vi.mock('../src/ui/lifecycle/LifecycleDashboard', () => ({ default: () => null }));
vi.mock('../src/ui/payroll/PayrollTab', () => ({ default: () => null }));
vi.mock('../src/ui/bot-drafting-tab', () => ({ default: () => null }));
vi.mock('../src/ui/cv-scored/CVScoredTab', () => ({ default: () => null }));
vi.mock('../src/ui/jd-chatbot-functional', () => ({ default: () => null }));
vi.mock('../src/ui/email-history/EmailTab', () => ({ default: () => null }));

import App from '../src/ui/App';

describe('App Studio shell integration', () => {
  it('wraps the existing workspace in StudioShell with real host context', () => {
    const html = renderToStaticMarkup(createElement(App));

    expect(html).toContain('class="studio-root');
    expect(html).toContain('Phòng Tuyển dụng Sài Gòn');
    expect(html).toContain('Nguyễn Minh Anh');
    expect(html).toContain('Company screen');
    expect(html).not.toContain('class="app-header"');
  });

  it('keeps the renamed candidate route and owner-only Payroll in navigation', () => {
    const html = renderToStaticMarkup(createElement(App));

    expect(html).toContain('Ứng viên');
    expect(html).toContain('Lương &amp; thanh toán');
  });
});
