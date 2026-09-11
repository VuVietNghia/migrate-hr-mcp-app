export interface PayrollDebugRequest {
  name: string;
  arguments: Record<string, unknown>;
}

interface PayrollDebugInput {
  roomId: string;
  request: PayrollDebugRequest;
  result?: unknown;
  error?: unknown;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...Object.fromEntries(Object.entries(error))
    };
  }

  return error;
}

export function formatPayrollDebugOutput({ roomId, request, result, error }: PayrollDebugInput): string {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: error === undefined ? 'success' : 'error',
    roomId,
    request,
    ...(error === undefined ? { result } : { error: serializeError(error) })
  }, null, 2);
}

/**
 * The exact request the payroll debug panel sends. `hrm.payroll.query` accepts only `roomId`
 * (`src/payroll-tools.ts` — PAYROLL_TOOL_DEFINITIONS); `collection` and `where` are arguments of
 * the server-side `mcpapp.db.query` call and are dropped on the floor if sent from the UI. The
 * server still re-derives the room from the verified actor — `roomId` is sent so a mismatch is a
 * loud error rather than a silent redirect.
 */
export function buildPayrollDebugRequest(roomId: string): PayrollDebugRequest {
  return { name: 'hrm.payroll.query', arguments: { roomId } };
}
