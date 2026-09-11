import { describe, expect, it } from 'vitest';
import { PAYROLL_COLLECTION } from '../src/services/payroll/payroll-repository';
import { PAYROLL_PAGE_SIZE } from '../src/services/payroll/payroll-schema';
import { buildPayrollDebugRequest, formatPayrollDebugOutput } from '../src/ui/payroll/debug-format';

describe('buildPayrollDebugRequest', () => {
  it('reproduces the first page PayrollService reads, not a different tool', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(request.name).toBe('mcpapp.db.query');
    expect(request.arguments).toEqual({
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: 'room-1' }],
      orderBy: [{ field: 'employeeId', direction: 'asc' }],
      limit: PAYROLL_PAGE_SIZE,
      offset: 0,
    });
  });

  it('never orders by a hub-assigned underscore field', () => {
    const orderBy = buildPayrollDebugRequest('room-1').arguments.orderBy as Array<{ field: string }>;
    expect(orderBy.some((clause) => clause.field.startsWith('_'))).toBe(false);
  });
});

describe('formatPayrollDebugOutput', () => {
  it('reports success with the result and the request that produced it', () => {
    const request = buildPayrollDebugRequest('room-1');
    const parsed = JSON.parse(formatPayrollDebugOutput({ roomId: 'room-1', request, result: { records: [] } }));
    expect(parsed.status).toBe('success');
    expect(parsed.roomId).toBe('room-1');
    expect(parsed.request).toEqual(request);
    expect(parsed.result).toEqual({ records: [] });
    expect(parsed.error).toBeUndefined();
  });

  it('serializes an Error into a readable object instead of {}', () => {
    const request = buildPayrollDebugRequest('room-1');
    const parsed = JSON.parse(
      formatPayrollDebugOutput({ roomId: 'room-1', request, error: new Error('boom') }),
    );
    expect(parsed.status).toBe('error');
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(parsed.result).toBeUndefined();
  });
});
