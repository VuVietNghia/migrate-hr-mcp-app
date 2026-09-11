import { hasPayrollOwnerRole } from './owner-role-policy';

type ContextToolResult = Readonly<{
  content?: ReadonlyArray<Readonly<{ text?: unknown }>>;
  userRoles?: unknown;
}>;

function readContextPayload(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return null;

  const typedResult = result as ContextToolResult;
  const text = typedResult.content?.[0]?.text;

  if (typeof text !== 'string') return result;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isPayrollOwnerFromContextResult(result: unknown): boolean {
  const context = readContextPayload(result);

  if (typeof context !== 'object' || context === null) return false;

  const userRoles = (context as ContextToolResult).userRoles;
  return hasPayrollOwnerRole(Array.isArray(userRoles) ? userRoles : undefined);
}
