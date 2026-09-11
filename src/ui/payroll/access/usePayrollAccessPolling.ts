import { useCallback, useEffect, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { hasPayrollOwnerRole } from './owner-role-policy';
import { isPayrollOwnerFromContextResult } from './payroll-access-context';

type PayrollAccessApp = Pick<McpApp, 'callServerTool'>;

export async function refreshPayrollAccess(app: PayrollAccessApp): Promise<boolean> {
  try {
    const result = await app.callServerTool({
      name: 'mcpapp.context.get',
      arguments: {},
    });
    return isPayrollOwnerFromContextResult(result);
  } catch {
    return false;
  }
}

export function usePayrollAccessPolling(
  app: PayrollAccessApp | null,
  userRoles: readonly string[] | null | undefined,
): boolean {
  const [canAccessPayroll, setCanAccessPayroll] = useState(() => hasPayrollOwnerRole(userRoles));

  useEffect(() => {
    setCanAccessPayroll(hasPayrollOwnerRole(userRoles));
  }, [userRoles]);

  const refreshAccess = useCallback(async () => {
    if (!app) {
      setCanAccessPayroll(false);
      return;
    }

    setCanAccessPayroll(await refreshPayrollAccess(app));
  }, [app]);

  // Runs app-wide, not per tab: this poll decides whether the Payroll tab is shown at all.
  // Disabled: the 5s interval was spamming the network tab with mcpapp.context.get. Kept as a
  // single mount-time check instead — a mid-session role change now requires a reload to reflect.
  // usePolling(refreshAccess, {
  //   enabled: app !== null,
  //   interval: 5000,
  //   immediate: true,
  // });
  useEffect(() => {
    if (app !== null) void refreshAccess();
  }, [app, refreshAccess]);

  return canAccessPayroll;
}
