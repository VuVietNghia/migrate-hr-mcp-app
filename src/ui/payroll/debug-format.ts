import { PAYROLL_COLLECTION } from '../../services/payroll/payroll-repository';
import { PAYROLL_PAGE_SIZE } from '../../services/payroll/payroll-schema';

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
 * The exact request the payroll debug panel sends: the first page of the very query
 * `PayrollService.getRecords` runs, so the panel reproduces the real read path instead of
 * a parallel one that can succeed or fail for different reasons. Kept in sync with
 * `PayrollService.getRecords` — the shared constants below are the same ones it sends.
 */
export function buildPayrollDebugRequest(roomId: string): PayrollDebugRequest {
  return {
    name: 'mcpapp.db.query',
    arguments: {
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: roomId }],
      orderBy: [{ field: 'employeeId', direction: 'asc' }],
      limit: PAYROLL_PAGE_SIZE,
      offset: 0,
    },
  };
}
