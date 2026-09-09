import { hasPayrollOwnerRole } from './owner-role-policy';

export interface AccessControlledTab {
  readonly id: string;
}

export function filterPayrollTab<T extends AccessControlledTab>(
  tabs: readonly T[],
  userRoles: readonly string[] | null | undefined,
): T[] {
  if (hasPayrollOwnerRole(userRoles)) return [...tabs];
  return tabs.filter((tab) => tab.id !== 'payroll');
}

export function canSelectPayrollTab(
  selectedTab: string,
  userRoles: readonly string[] | null | undefined,
): boolean {
  return selectedTab !== 'payroll' || hasPayrollOwnerRole(userRoles);
}

export function resolveTabAfterPayrollRevocation<T extends string>(activeTab: T): T | 'home' {
  return activeTab === 'payroll' ? 'home' : activeTab;
}

export function removePayrollFromVisited<T extends string>(visitedTabs: ReadonlySet<T>): Set<T> {
  const next = new Set(visitedTabs);
  next.delete('payroll' as T);
  return next;
}
