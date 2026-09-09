import { useCallback, useEffect, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { usePolling } from '../../hooks/usePolling';
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
  usePolling(refreshAccess, {
    enabled: app !== null,
    interval: 5000,
    immediate: true,
  });

  return canAccessPayroll;
}
