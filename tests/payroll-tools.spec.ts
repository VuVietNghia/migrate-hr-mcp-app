import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedActor } from '@privos_ai/app-server';
import { handlePayrollTool, setPayrollToolDependencies } from '../src/payroll-tools';
import type { IPayrollRepository } from '../src/services/payroll/payroll-repository';

const actor = Object.freeze({
  userId: 'u1',
  username: 'alice',
  roomId: 'room-1',
  claims: Object.freeze({}),
  provenance: 'user-token',
}) as unknown as VerifiedActor;

function fakeRepo(): IPayrollRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    initializeSchema: vi.fn(async (roomId: string) => {
      calls.push(['init', roomId]);
    }),
    queryByRoom: vi.fn(async (roomId: string) => {
      calls.push(['query', roomId]);
      return [{ roomId, employeeId: 'e1', baseSalary: 1 }];
    }),
    create: vi.fn(async (roomId: string, data: unknown) => {
      calls.push(['create', roomId, data]);
      return { _id: 'n', roomId, ...(data as object) };
    }),
    update: vi.fn(async (roomId: string, id: string, data: unknown) => {
      calls.push(['update', roomId, id, data]);
    }),
    delete: vi.fn(async (roomId: string, id: string) => {
      calls.push(['delete', roomId, id]);
    }),
  } as unknown as IPayrollRepository & { calls: unknown[] };
}

describe('hrm.payroll.* tools', () => {
  let repo: ReturnType<typeof fakeRepo>;
  beforeEach(() => {
    repo = fakeRepo();
    setPayrollToolDependencies({ repository: repo });
  });

  it('refuses every payroll tool without a verified actor', async () => {
    await expect(handlePayrollTool('hrm.payroll.query', {}, undefined)).rejects.toThrow('verified caller identity');
    expect(repo.calls).toEqual([]);
  });

  it('refuses a roomId that differs from the verified actor room', async () => {
    await expect(handlePayrollTool('hrm.payroll.query', { roomId: 'room-OTHER' }, actor)).rejects.toThrow('does not match');
    expect(repo.calls).toEqual([]);
  });

  it('query initializes the schema then reads the actor room', async () => {
    const result = await handlePayrollTool('hrm.payroll.query', { roomId: 'room-1' }, actor);
    expect(repo.calls).toEqual([
      ['init', 'room-1'],
      ['query', 'room-1'],
    ]);
    expect(JSON.parse(result.content[0].text)).toEqual({
      records: [{ roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }],
    });
  });

  it('create validates employeeId and baseSalary and strips unknown keys', async () => {
    await expect(handlePayrollTool('hrm.payroll.create', { data: { baseSalary: 1 } }, actor)).rejects.toThrow(
      'employeeId is required',
    );
    await expect(
      handlePayrollTool('hrm.payroll.create', { data: { employeeId: 'e1', baseSalary: -1 } }, actor),
    ).rejects.toThrow('baseSalary must be a number >= 0');
    const ok = await handlePayrollTool(
      'hrm.payroll.create',
      { data: { employeeId: 'e1', baseSalary: 10, taxId: 'T', roomId: 'room-EVIL', $where: 'x' } },
      actor,
    );
    expect(repo.calls).toEqual([['create', 'room-1', { employeeId: 'e1', baseSalary: 10, taxId: 'T' }]]);
    expect(JSON.parse(ok.content[0].text)._id).toBe('n');
  });

  it('update requires id and forwards a whitelisted partial', async () => {
    await expect(handlePayrollTool('hrm.payroll.update', { data: { baseSalary: 2 } }, actor)).rejects.toThrow(
      'id is required',
    );
    await handlePayrollTool(
      'hrm.payroll.update',
      { id: 'x1', data: { baseSalary: 2, bankName: 'B', roomId: 'room-EVIL' } },
      actor,
    );
    expect(repo.calls).toEqual([['update', 'room-1', 'x1', { baseSalary: 2, bankName: 'B' }]]);
  });

  it('delete requires id', async () => {
    await expect(handlePayrollTool('hrm.payroll.delete', {}, actor)).rejects.toThrow('id is required');
    await handlePayrollTool('hrm.payroll.delete', { id: 'x1' }, actor);
    expect(repo.calls).toEqual([['delete', 'room-1', 'x1']]);
  });
});
