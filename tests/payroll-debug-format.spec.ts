import { describe, expect, it } from 'vitest';
import { PAYROLL_TOOL_NAMES } from '../src/payroll-tools';
import { buildPayrollDebugRequest, formatPayrollDebugOutput } from '../src/ui/payroll/debug-format';

describe('buildPayrollDebugRequest', () => {
  it('targets a real hrm.payroll tool', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(PAYROLL_TOOL_NAMES as readonly string[]).toContain(request.name);
    expect(request.name).toBe('hrm.payroll.query');
  });

  it('sends roomId and nothing else — hrm.payroll.query accepts no other argument', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(request.arguments).toEqual({ roomId: 'room-1' });
  });

  it('does not leak mcpapp.db.query arguments into an app tool call', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(Object.keys(request.arguments)).not.toContain('collection');
    expect(Object.keys(request.arguments)).not.toContain('where');
  });
});

describe('formatPayrollDebugOutput', () => {
  it('reports success with the result and the request that produced it', () => {
    const request = buildPayrollDebugRequest('room-1');
    const parsed = JSON.parse(formatPayrollDebugOutput({ roomId: 'room-1', request, result: { records: [] } }));
    expect(parsed.status).toBe('success');
    expect(parsed.roomId).toBe('room-1');
    expect(parsed.request).toEqual({ name: 'hrm.payroll.query', arguments: { roomId: 'room-1' } });
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
