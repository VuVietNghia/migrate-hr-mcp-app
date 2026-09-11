import { describe, expect, it } from 'vitest';
import {
  AppDbPayrollRepository,
  PAYROLL_MAX_PAGES,
  PAYROLL_PAGE_SIZE,
} from '../src/services/payroll/app-db-payroll-repository';
import { PAYROLL_COLLECTION } from '../src/services/payroll/payroll-repository';

function fakeCaller(responses: Record<string, unknown> = {}) {
  const calls: Array<{ roomId: string; name: string; args: Record<string, unknown> }> = [];
  const factory = (roomId: string) => async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ roomId, name, args });
    if (responses[name] instanceof Error) throw responses[name];
    return responses[name] ?? {};
  };
  return { factory, calls };
}

/**
 * Caller whose `mcpapp.db.query` returns `pages[n]` on the n-th call (and an empty page
 * once the list runs out). Records every call so offset/limit can be asserted.
 */
function pagingCaller(pages: Array<Array<Record<string, unknown>>>) {
  const calls: Array<{ roomId: string; name: string; args: Record<string, unknown> }> = [];
  let queryIndex = 0;
  const factory = (roomId: string) => async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ roomId, name, args });
    if (name !== 'mcpapp.db.query') return {};
    const page = pages[queryIndex] ?? [];
    queryIndex += 1;
    return { records: page, total: pages.flat().length };
  };
  return { factory, calls };
}

/** `n` distinct payroll documents, `_createdAt` ascending so a desc sort has to reverse them. */
function fullPage(n: number, prefix: string): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}-${i}`,
    roomId: 'room-1',
    employeeId: `${prefix}-emp-${i}`,
    baseSalary: 1,
    _createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

describe('AppDbPayrollRepository', () => {
  it('registers a room-scoped collection with the unique (roomId, employeeId) index', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).initializeSchema('room-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].roomId).toBe('room-1');
    expect(calls[0].name).toBe('mcpapp.db.registerCollection');
    expect(calls[0].args.collection).toBe(PAYROLL_COLLECTION);
    expect(calls[0].args.scope).toBe('room');
    expect(calls[0].args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
    const fields = calls[0].args.fields as Array<{ name: string; required?: boolean }>;
    expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
  });

  it('treats "already registered" as success', async () => {
    const { factory } = fakeCaller({ 'mcpapp.db.registerCollection': new Error('Collection already registered') });
    await expect(new AppDbPayrollRepository(factory).initializeSchema('room-1')).resolves.toBeUndefined();
  });

  it('queries one room with an index-backed sort and an explicit first-page offset', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }],
        total: 1,
      },
    });
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toEqual([{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: 'room-1' }],
      orderBy: [{ field: 'employeeId', direction: 'asc' }],
      limit: PAYROLL_PAGE_SIZE,
      offset: 0,
    });
  });

  it('never sends the hub-assigned _createdAt as an orderBy field', async () => {
    const { factory, calls } = fakeCaller({ 'mcpapp.db.query': { records: [], total: 0 } });
    await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    const orderBy = calls[0].args.orderBy as Array<{ field: string }>;
    expect(orderBy.some((clause) => clause.field.startsWith('_'))).toBe(false);
  });

  it('keeps paging while a full page comes back and stops on the first short page', async () => {
    const { factory, calls } = pagingCaller([
      fullPage(PAYROLL_PAGE_SIZE, 'p0'),
      fullPage(PAYROLL_PAGE_SIZE, 'p1'),
      fullPage(3, 'p2'),
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toHaveLength(PAYROLL_PAGE_SIZE * 2 + 3);
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.args.offset)).toEqual([0, PAYROLL_PAGE_SIZE, PAYROLL_PAGE_SIZE * 2]);
  });

  it('stops at PAYROLL_MAX_PAGES instead of paging forever', async () => {
    const pages = Array.from({ length: PAYROLL_MAX_PAGES + 5 }, (_, i) =>
      fullPage(PAYROLL_PAGE_SIZE, `p${i}`),
    );
    const { factory, calls } = pagingCaller(pages);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(calls).toHaveLength(PAYROLL_MAX_PAGES);
    expect(rows).toHaveLength(PAYROLL_PAGE_SIZE * PAYROLL_MAX_PAGES);
  });

  it('returns records newest first regardless of the order the hub sent them', async () => {
    const { factory } = pagingCaller([
      [
        { _id: 'old', roomId: 'room-1', employeeId: 'a', baseSalary: 1, _createdAt: '2026-01-01T00:00:00.000Z' },
        { _id: 'new', roomId: 'room-1', employeeId: 'b', baseSalary: 1, _createdAt: '2026-03-01T00:00:00.000Z' },
        { _id: 'mid', roomId: 'room-1', employeeId: 'c', baseSalary: 1, _createdAt: '2026-02-01T00:00:00.000Z' },
        { _id: 'none', roomId: 'room-1', employeeId: 'd', baseSalary: 1 },
      ],
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows.map((row) => row._id)).toEqual(['new', 'mid', 'old', 'none']);
  });

  it('create stamps roomId from the argument, never from data', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.create': { _id: 'new', roomId: 'room-1', employeeId: 'e1', baseSalary: 5 },
    });
    const created = await new AppDbPayrollRepository(factory).create('room-1', {
      employeeId: 'e1',
      baseSalary: 5,
      ...({ roomId: 'room-EVIL' } as object),
    } as never);
    expect(created._id).toBe('new');
    expect(calls[0].name).toBe('mcpapp.db.create');
    expect((calls[0].args.data as Record<string, unknown>).roomId).toBe('room-1');
  });

  it('update and delete forward id and pin roomId in data', async () => {
    const { factory, calls } = fakeCaller();
    const repo = new AppDbPayrollRepository(factory);
    await repo.update('room-1', 'id-1', { baseSalary: 9 });
    await repo.delete('room-1', 'id-1');
    expect(calls[0]).toEqual({
      roomId: 'room-1',
      name: 'mcpapp.db.update',
      args: { collection: PAYROLL_COLLECTION, id: 'id-1', data: { baseSalary: 9, roomId: 'room-1' } },
    });
    expect(calls[1]).toEqual({
      roomId: 'room-1',
      name: 'mcpapp.db.delete',
      args: { collection: PAYROLL_COLLECTION, id: 'id-1' },
    });
  });
});
