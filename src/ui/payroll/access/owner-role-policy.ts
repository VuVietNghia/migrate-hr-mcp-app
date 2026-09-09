export function hasPayrollOwnerRole(
  userRoles: readonly string[] | null | undefined,
): boolean {
  return Array.isArray(userRoles) && userRoles.some((role) => role === 'owner');
}
