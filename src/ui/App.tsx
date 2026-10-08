import { useEffect, useState, type ReactNode } from 'react';
import { PrivosAppProvider, usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider } from './theme-provider';
import CompanyHome from './company-home';
import RecruitmentPanel from './recruitment-panel';
import PipelineDashboard from './pipeline-dashboard';
import LifecycleDashboard from './lifecycle/LifecycleDashboard';
import PayrollTab from './payroll/PayrollTab';
import BotDraftingTab from './bot-drafting-tab';
import CVScoredTab from './cv-scored/CVScoredTab';
import JDChatbotTab from './jd-chatbot-functional';
import EmailTab from './email-history/EmailTab';
import {
  createEmployeeEmailTemplateRepository,
  createInterviewEmailTemplateRepository,
} from './email-templates/interview-email-template-default';
import { ensureTemplatesExistGlobal } from './pipeline-service';
import { usePayrollAccessPolling } from './payroll/access/usePayrollAccessPolling';
import {
  canSelectPayrollTab,
  removePayrollFromVisited,
  resolveTabAfterPayrollRevocation,
} from './payroll/access/payroll-navigation-policy';
import { StudioShell } from './studio/StudioShell';
import {
  buildStudioNavGroups,
  createInitialMountedTabs,
  type AppTab,
} from './studio/studio-navigation';
import {
  nextStudioNavigationIntent,
  type StudioNavigationIntent,
} from './studio/studio-navigation-intent';

declare global {
  interface Window {
    /** Set once React has committed the first render — the shell watchdog's success signal. */
    __privosUiBooted?: boolean;
  }
}

type Tab = AppTab;
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
      { id: 'recruitment', label: 'Tuyển dụng', scopes: ['files:read', 'lists:read'] },
      {
        id: 'pipeline',
        label: 'CV Pipeline',
        scopes: ['files:read', 'files:write', 'lists:write', 'sandbox:ai-chat', 'sandbox:ai-chat:write'],
      },
      { id: 'cvScored', label: 'Ứng viên', scopes: ['lists:read', 'lists:write'] },
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
void TAB_SECTIONS;

function ThemedApp() {
  const app = usePrivosApp();
  const { theme, roomId, roomName, username, userRoles } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(createInitialMountedTabs);
  const [navigationIntent, setNavigationIntent] = useState<StudioNavigationIntent | null>(null);
  const canAccessPayroll = usePayrollAccessPolling(app, userRoles);
  const payrollAccessRoles = canAccessPayroll ? ['owner'] : [];
  const navigationGroups = buildStudioNavGroups(canAccessPayroll);

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
    createEmployeeEmailTemplateRepository(app, roomId)
      .ensureInitialized()
      .catch((error) => {
        console.error('[EmployeeEmailTemplates] Initialization failed', error);
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
  };

  const handleNavigate = (
    target: AppTab,
    context?: Pick<StudioNavigationIntent, 'jd'>,
  ) => {
    if (!canSelectPayrollTab(target, payrollAccessRoles)) return;
    setNavigationIntent((previous) => nextStudioNavigationIntent(previous, target, context));
    setTab(target);
    setVisitedTabs((previous) => previous.has(target) ? previous : new Set(previous).add(target));
  };

  const panel = (id: Tab, node: ReactNode) =>
    visitedTabs.has(id) ? (
      <div className={tab === id ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== id}>
        {node}
      </div>
    ) : null;

  return (
    <ThemeProvider hostTheme={theme}>
      <StudioShell
        activeTab={tab}
        groups={navigationGroups}
        onSelectTab={handleSelectTab}
        roomName={roomName}
        username={username}
        userRoles={userRoles}
      >
        <div className={tab === 'home' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'home'}>
          <CompanyHome />
        </div>
        {panel('email', <EmailTab active={tab === 'email'} />)}
        {panel('recruitment', <RecruitmentPanel active={tab === 'recruitment'} onNavigate={handleNavigate} />)}
        {panel('pipeline', <PipelineDashboard active={tab === 'pipeline'} navigationIntent={navigationIntent} />)}
        {panel('cvScored', <CVScoredTab active={tab === 'cvScored'} />)}
        {panel('chatbotJD', <JDChatbotTab navigationIntent={navigationIntent} />)}
        {panel('lifecycle', <LifecycleDashboard active={tab === 'lifecycle'} />)}
        {canAccessPayroll &&
          panel(
            'payroll',
            <PayrollTab key={roomId} roomId={roomId} userRoles={payrollAccessRoles} active={tab === 'payroll'} />,
          )}
        {panel('botDrafting', <BotDraftingTab />)}
      </StudioShell>
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
