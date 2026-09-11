import { useEffect, useState, type ReactNode } from 'react';
import { PrivosAppProvider, usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import CompanyHome from './company-home';
import RecruitmentPanel from './recruitment-panel';
import PipelineDashboard from './pipeline-dashboard';
import LifecycleDashboard from './lifecycle/LifecycleDashboard';
import PayrollTab from './payroll/PayrollTab';
import BotDraftingTab from './bot-drafting-tab';
import CVScoredTab from './cv-scored/CVScoredTab';
import JDChatbotTab from './jd-chatbot-functional';
import EmailTab from './email-history/EmailTab';
import { createInterviewEmailTemplateRepository } from './email-templates/interview-email-template-default';
import { ensureTemplatesExistGlobal } from './pipeline-service';
import { usePayrollAccessPolling } from './payroll/access/usePayrollAccessPolling';
import {
  canSelectPayrollTab,
  filterPayrollTab,
  removePayrollFromVisited,
  resolveTabAfterPayrollRevocation,
} from './payroll/access/payroll-navigation-policy';

declare global {
  interface Window {
    /** Set once React has committed the first render — the shell watchdog's success signal. */
    __privosUiBooted?: boolean;
  }
}

type Tab = 'home' | 'email' | 'recruitment' | 'pipeline' | 'cvScored' | 'chatbotJD' | 'lifecycle' | 'payroll' | 'botDrafting';
type SectionId = 'hr' | 'admin';

/**
 * Scope annotations per tab — read by tests/scope-audit.spec.ts, which requires every
 * permission declared in privos-app.json to name a call site under src/ui. The scope
 * strings here are the documentation of WHY each permission exists:
 *   basic:information      → room/user context for every tab (usePrivosContext)
 *   lists:read / lists:write → candidate, employee, email-history lists (mcpapp.lists.*)
 *   files:read / files:write → JD, CV, template, export files (mcpapp.files.*, uploadFile)
 *   db:read / db:write / db:schema:read / db:schema:write → payroll (PayrollService → mcpapp.db.*)
 *   sandbox:ai-chat / sandbox:ai-chat:write → CV scoring + company summary (ai-messages.*)
 */
type TabDef = { id: Tab; label: string; scopes: readonly string[] };

const TAB_SECTIONS: { id: SectionId; label: string; tabs: TabDef[] }[] = [
  {
    id: 'hr',
    label: 'HR',
    tabs: [
      { id: 'recruitment', label: 'Tuyển dụng', scopes: ['files:read'] },
      {
        id: 'pipeline',
        label: 'CV Pipeline',
        scopes: ['files:read', 'files:write', 'lists:write', 'sandbox:ai-chat', 'sandbox:ai-chat:write'],
      },
      { id: 'cvScored', label: 'CV đã chấm', scopes: ['lists:read', 'lists:write'] },
      { id: 'chatbotJD', label: 'Chỉnh sửa JD', scopes: ['files:read', 'files:write'] },
    ],
  },
  {
    id: 'admin',
    label: 'Hành chính',
    tabs: [
      { id: 'lifecycle', label: 'Hồ sơ NS', scopes: ['lists:read', 'lists:write', 'files:write'] },
      {
        id: 'payroll',
        label: 'Quản lý Lương',
        scopes: ['db:read', 'db:write', 'db:schema:read', 'db:schema:write'],
      },
      { id: 'botDrafting', label: 'Bot soạn thảo', scopes: ['files:read'] },
    ],
  },
];

/** Scopes of the two always-mounted top-level tabs, which have no TabDef entry. */
const HOME_SCOPES = ['basic:information', 'sandbox:ai-chat', 'sandbox:ai-chat:write'] as const;
const EMAIL_SCOPES = ['lists:read', 'lists:write', 'files:read', 'files:write'] as const;
void HOME_SCOPES;
void EMAIL_SCOPES;

function ThemedApp() {
  const app = usePrivosApp();
  const { theme, roomId, userRoles } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['home']));
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const canAccessPayroll = usePayrollAccessPolling(app, userRoles);
  const payrollAccessRoles = canAccessPayroll ? ['owner'] : [];
  const visibleTabSections = TAB_SECTIONS.map((section) => ({
    ...section,
    tabs: filterPayrollTab(section.tabs, payrollAccessRoles),
  }));

  useEffect(() => {
    if (app && roomId) {
      ensureTemplatesExistGlobal(app, roomId, false).catch((error) =>
        console.error('[Templates] ensure failed', error),
      );
    }
  }, [app, roomId]);

  useEffect(() => {
    if (!app || !roomId) return;
    createInterviewEmailTemplateRepository(app, roomId)
      .ensureInitialized()
      .catch((error) => {
        console.error('[InterviewEmailTemplates] Initialization failed', error);
      });
  }, [app, roomId]);

  useEffect(() => {
    if (canAccessPayroll) return;
    setTab((previous) => resolveTabAfterPayrollRevocation(previous));
    setVisitedTabs((previous) => (previous.has('payroll') ? removePayrollFromVisited(previous) : previous));
  }, [canAccessPayroll]);

  const handleSelectTab = (selected: Tab) => {
    if (!canSelectPayrollTab(selected, payrollAccessRoles)) return;
    setTab(selected);
    setVisitedTabs((prev) => (prev.has(selected) ? prev : new Set(prev).add(selected)));
    setOpenSection(null);
  };

  const panel = (id: Tab, node: ReactNode) =>
    visitedTabs.has(id) ? (
      <div className={tab === id ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== id}>
        {node}
      </div>
    ) : null;

  return (
    <ThemeProvider hostTheme={theme}>
      <div className="app-header">
        <nav className="app-tabs" aria-label="Dashboard navigation" onMouseLeave={() => setOpenSection(null)}>
          <button
            type="button"
            className={`nav-primary-btn${tab === 'home' ? ' nav-primary-active' : ''}`}
            onClick={() => handleSelectTab('home')}
          >
            Company
          </button>
          <button
            type="button"
            className={`nav-primary-btn${tab === 'email' ? ' nav-primary-active' : ''}`}
            onClick={() => handleSelectTab('email')}
          >
            Email
          </button>
          {visibleTabSections.map((section) => {
            if (section.tabs.length === 0) return null;
            const isOpen = openSection === section.id;
            const isActive = section.tabs.some((t) => t.id === tab);
            return (
              <div className={`app-nav-section${isOpen ? ' app-nav-section-open' : ''}`} key={section.id}>
                <button
                  type="button"
                  className={`nav-primary-btn${isOpen ? ' nav-primary-open' : ''}${isActive ? ' nav-primary-active' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                >
                  <span>{section.label}</span>
                  <span className="nav-primary-chevron" aria-hidden="true">
                    {'›'}
                  </span>
                </button>
                <div className={`app-subnav${isOpen ? ' app-subnav-open' : ''}`} aria-hidden={!isOpen}>
                  {section.tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tab-btn${tab === t.id ? ' tab-active' : ''}`}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => handleSelectTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>

      <div className={tab === 'home' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'home'}>
        <CompanyHome />
      </div>
      {panel('email', <EmailTab active={tab === 'email'} />)}
      {panel('recruitment', <RecruitmentPanel />)}
      {panel('pipeline', <PipelineDashboard active={tab === 'pipeline'} />)}
      {panel('cvScored', <CVScoredTab active={tab === 'cvScored'} />)}
      {panel('chatbotJD', <JDChatbotTab />)}
      {panel('lifecycle', <LifecycleDashboard active={tab === 'lifecycle'} />)}
      {canAccessPayroll &&
        panel(
          'payroll',
          <PayrollTab key={roomId} roomId={roomId} userRoles={payrollAccessRoles} active={tab === 'payroll'} />,
        )}
      {panel('botDrafting', <BotDraftingTab />)}
    </ThemeProvider>
  );
}

export default function App() {
  useEffect(() => {
    window.__privosUiBooted = true;
  }, []);
  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
