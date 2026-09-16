import { useCallback, useEffect, useState } from 'react';
import type { McpApp } from '@privos_ai/app-react';
import { hasPayrollOwnerRole } from './owner-role-policy';
import { isPayrollOwnerFromContextResult } from './payroll-access-context';
import { usePolling } from '../../hooks/usePolling';

const PAYROLL_ACCESS_POLL_INTERVAL_MS = 30000;

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
  // A prior 5s interval spammed the network tab with mcpapp.context.get; 30s still catches a
  // mid-session owner-role revocation within a session without that volume. `immediate: false`
  // because the mount-time effect below already covers the first check.
  usePolling(refreshAccess, {
    enabled: app !== null,
    interval: PAYROLL_ACCESS_POLL_INTERVAL_MS,
    immediate: false,
  });

  useEffect(() => {
    if (app !== null) void refreshAccess();
  }, [app, refreshAccess]);

  return canAccessPayroll;
}
