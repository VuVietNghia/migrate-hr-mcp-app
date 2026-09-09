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
