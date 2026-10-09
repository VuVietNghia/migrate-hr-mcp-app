export const ALL_APP_TABS = [
  'home',
  'email',
  'recruitment',
  'pipeline',
  'cvScored',
  'chatbotJD',
  'lifecycle',
  'payroll',
  'botDrafting',
] as const;

export type AppTab = (typeof ALL_APP_TABS)[number];

export function createInitialMountedTabs(): Set<AppTab> {
  return new Set<AppTab>(['home', 'email', 'recruitment', 'pipeline', 'cvScored', 'chatbotJD']);
}

export type StudioNavIcon =
  | 'building'
  | 'briefcase'
  | 'scan'
  | 'users'
  | 'spark'
  | 'badge'
  | 'wallet'
  | 'mail'
  | 'file';

export interface StudioNavItem {
  readonly id: AppTab;
  readonly label: string;
  readonly breadcrumb: string;
  readonly icon: StudioNavIcon;
}

export interface StudioNavGroup {
  readonly id: 'workspace' | 'recruitment' | 'administration';
  readonly label: string;
  readonly items: readonly StudioNavItem[];
}

const NAV_GROUPS: readonly StudioNavGroup[] = [
  {
    id: 'workspace',
    label: 'Dữ liệu',
    items: [
      { id: 'home', label: 'Dữ liệu công ty', breadcrumb: 'Dữ liệu công ty', icon: 'building' },
    ],
  },
  {
    id: 'recruitment',
    label: 'Tuyển dụng',
    items: [
      { id: 'recruitment', label: 'Vị trí tuyển dụng', breadcrumb: 'Vị trí tuyển dụng', icon: 'briefcase' },
      { id: 'pipeline', label: 'Sàng lọc CV', breadcrumb: 'Sàng lọc CV', icon: 'scan' },
      { id: 'cvScored', label: 'Ứng viên', breadcrumb: 'Ứng viên', icon: 'users' },
      { id: 'chatbotJD', label: 'Trợ lý JD', breadcrumb: 'Trợ lý JD', icon: 'spark' },
    ],
  },
  {
    id: 'administration',
    label: 'Nhân sự & hành chính',
    items: [
      { id: 'lifecycle', label: 'Hồ sơ nhân sự', breadcrumb: 'Hồ sơ nhân sự', icon: 'badge' },
      { id: 'payroll', label: 'Lương & thanh toán', breadcrumb: 'Lương & thanh toán', icon: 'wallet' },
      { id: 'email', label: 'Email', breadcrumb: 'Email', icon: 'mail' },
      { id: 'botDrafting', label: 'Soạn thảo văn bản', breadcrumb: 'Soạn thảo văn bản', icon: 'file' },
    ],
  },
];

const ITEMS_BY_TAB = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item] as const),
);

export function buildStudioNavGroups(canAccessPayroll: boolean): StudioNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== 'payroll' || canAccessPayroll),
  }));
}

export function findStudioNavItem(tab: AppTab): StudioNavItem {
  const item = ITEMS_BY_TAB.get(tab);
  if (!item) throw new Error(`Unknown Studio navigation tab: ${tab}`);
  return item;
}
