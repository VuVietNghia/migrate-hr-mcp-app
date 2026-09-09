import { hasPayrollOwnerRole } from './owner-role-policy';

export interface PayrollMountContext {
  readonly hasApp: boolean;
  readonly roomId: string;
  readonly userRoles: readonly string[] | null | undefined;
}

export function canMountPayroll(context: PayrollMountContext): boolean {
  return context.hasApp
    && context.roomId.trim() !== ''
    && hasPayrollOwnerRole(context.userRoles);
}
