import { describe, expect, it } from 'vitest';
import { AppDbPayrollRepository } from '../src/services/payroll/app-db-payroll-repository';
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

  it('queries only the given room and returns records', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': { records: [{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }], total: 1 },
    });
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toEqual([{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }]);
    expect(calls[0].args).toEqual({
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: 'room-1' }],
      orderBy: [{ field: '_createdAt', direction: 'desc' }],
      limit: 1000,
    });
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
