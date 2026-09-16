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
    const register = calls.find((call) => call.name === 'mcpapp.db.registerCollection')!;
    expect(register.roomId).toBe('room-1');
    expect(register.args.collection).toBe(PAYROLL_COLLECTION);
    expect(register.args.scope).toBe('room');
    expect(register.args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
    const fields = register.args.fields as Array<{ name: string; required?: boolean }>;
    expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
    expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
  });

  it('migrates an already-registered room by adding the new field list', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.registerCollection': new Error('Collection already registered'),
    });
    await new AppDbPayrollRepository(factory).initializeSchema('room-1');
    const update = calls.find((call) => call.name === 'mcpapp.db.updateSchema')!;
    expect(update).toBeDefined();
    expect(update.args.collection).toBe(PAYROLL_COLLECTION);
    const fields = update.args.fields as Array<{ name: string }>;
    expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    expect(update.args).not.toHaveProperty('indexes');
  });

  it('propagates an updateSchema failure instead of pretending the room can soft-delete', async () => {
    const { factory } = fakeCaller({ 'mcpapp.db.updateSchema': new Error('Unknown tool') });
    await expect(new AppDbPayrollRepository(factory).initializeSchema('room-1')).rejects.toThrow(/unknown tool/i);
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

  it('throws instead of returning a truncated list when the page budget runs out', async () => {
    const pages = Array.from({ length: PAYROLL_MAX_PAGES + 5 }, (_, i) =>
      fullPage(PAYROLL_PAGE_SIZE, `p${i}`),
    );
    const { factory, calls } = pagingCaller(pages);
    await expect(new AppDbPayrollRepository(factory).queryByRoom('room-1')).rejects.toThrow(/vượt quá/i);
    expect(calls).toHaveLength(PAYROLL_MAX_PAGES);
  });

  it('does not throw when the read ends on a short page inside the budget', async () => {
    const { factory } = pagingCaller([fullPage(PAYROLL_PAGE_SIZE, 'p0'), fullPage(1, 'p1')]);
    await expect(new AppDbPayrollRepository(factory).queryByRoom('room-1')).resolves.toHaveLength(
      PAYROLL_PAGE_SIZE + 1,
    );
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
      'mcpapp.db.query': { records: [] },
      'mcpapp.db.create': { _id: 'new', roomId: 'room-1', employeeId: 'e1', baseSalary: 5 },
    });
    const created = await new AppDbPayrollRepository(factory).create('room-1', {
      employeeId: 'e1',
      baseSalary: 5,
      ...({ roomId: 'room-EVIL' } as object),
    } as never);

    expect(created._id).toBe('new');
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
    expect((calls[1].args.data as Record<string, unknown>).roomId).toBe('room-1');
  });

  it('looks the employee up on both index keys before creating', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': { records: [] },
      'mcpapp.db.create': { _id: 'new' },
    });
    await new AppDbPayrollRepository(factory).create('room-1', { employeeId: 'e1', baseSalary: 5 } as never);

    expect(calls[0].args.where).toEqual([
      { field: 'roomId', op: '==', value: 'room-1' },
      { field: 'employeeId', op: '==', value: 'e1' },
    ]);
    expect(calls[0].args.limit).toBe(1);
  });

  it('revives a tombstoned row instead of creating a duplicate the unique index would reject', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{
          _id: 'tomb-1',
          roomId: 'room-1',
          employeeId: 'e1',
          baseSalary: 1,
          deletedAt: '2026-09-01T00:00:00.000Z',
        }],
      },
    });
    const revived = await new AppDbPayrollRepository(factory).create('room-1', {
      employeeId: 'e1',
      baseSalary: 7,
    } as never);

    expect(calls.some((call) => call.name === 'mcpapp.db.create')).toBe(false);
    const update = calls.find((call) => call.name === 'mcpapp.db.update')!;
    expect(update.args.id).toBe('tomb-1');
    const data = update.args.data as Record<string, unknown>;
    expect(data.baseSalary).toBe(7);
    expect(data.roomId).toBe('room-1');
    expect(data.deletedAt).toBe('');
    expect(revived._id).toBe('tomb-1');
    expect(revived.deletedAt).toBeUndefined();
  });

  it('never overwrites a LIVE row on create — the unique index must reject the duplicate', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{ _id: 'live-1', roomId: 'room-1', employeeId: 'e1', baseSalary: 30000000 }],
      },
      'mcpapp.db.create': new Error('E11000 duplicate key error'),
    });

    await expect(
      new AppDbPayrollRepository(factory).create('room-1', { employeeId: 'e1', baseSalary: 8000000 } as never),
    ).rejects.toThrow(/duplicate key/i);

    // The live row is never touched: no update at all, and the create is left to fail loudly.
    expect(calls.some((call) => call.name === 'mcpapp.db.update')).toBe(false);
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
  });

  it('treats a found row with an empty deletedAt as live, not revivable', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{ _id: 'live-2', roomId: 'room-1', employeeId: 'e1', baseSalary: 1, deletedAt: '' }],
      },
      'mcpapp.db.create': { _id: 'new' },
    });
    await new AppDbPayrollRepository(factory).create('room-1', { employeeId: 'e1', baseSalary: 2 } as never);
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
  });

  it('update forwards id, pins roomId and clears any tombstone in data', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).update('room-1', 'id-1', { baseSalary: 9 });
    expect(calls[0]).toEqual({
      roomId: 'room-1',
      name: 'mcpapp.db.update',
      args: {
        collection: PAYROLL_COLLECTION,
        id: 'id-1',
        // Without `deletedAt: ''` an edit saved after a GC pass tombstoned the row succeeds at the
        // hub while the row stays invisible — a false success that loses the edit from the table.
        data: { baseSalary: 9, roomId: 'room-1', deletedAt: '' },
      },
    });
  });

  it('delete writes a deletedAt tombstone and never calls mcpapp.db.delete', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).delete('room-1', 'id-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('mcpapp.db.update');
    expect(calls[0].args.id).toBe('id-1');
    const data = calls[0].args.data as Record<string, unknown>;
    expect(data.roomId).toBe('room-1');
    expect(Number.isNaN(Date.parse(data.deletedAt as string))).toBe(false);
  });

  it('hides tombstoned rows from queryByRoom', async () => {
    const { factory } = pagingCaller([
      [
        { _id: 'live', roomId: 'room-1', employeeId: 'a', baseSalary: 1 },
        { _id: 'dead', roomId: 'room-1', employeeId: 'b', baseSalary: 1, deletedAt: '2026-09-15T00:00:00.000Z' },
        { _id: 'revived', roomId: 'room-1', employeeId: 'c', baseSalary: 1, deletedAt: '' },
      ],
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows.map((row) => row._id).sort()).toEqual(['live', 'revived']);
  });

  it('counts tombstoned rows toward the page size so paging is not cut short', async () => {
    const tombstoned = fullPage(PAYROLL_PAGE_SIZE, 'p0').map((row) => ({ ...row, deletedAt: '2026-09-15T00:00:00.000Z' }));
    const { factory, calls } = pagingCaller([tombstoned, fullPage(2, 'p1')]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });
});
