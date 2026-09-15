import { describe, expect, it } from 'vitest';
import { PayrollService } from '../src/ui/payroll/services/PayrollService';
import { PAYROLL_COLLECTION } from '../src/services/payroll/payroll-repository';
import { PAYROLL_MAX_PAGES, PAYROLL_PAGE_SIZE } from '../src/services/payroll/payroll-schema';
import type { PayrollRecord } from '../src/ui/payroll/types';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * Marks a handler's return value as an already-shaped tool-result object (e.g.
 * `{ isError: true, content: [...] }`) instead of a plain payload to be JSON-wrapped.
 * `callServerTool` resolves normally even for tool-level failures — it only rejects
 * on a transport error — so this is what lets a test reproduce that resolved-but-failed shape.
 */
function rawResult(result: unknown) {
  return { __rawToolResult: true as const, result };
}

/**
 * The service only ever touches `app.callServerTool`, so a name→payload map is a
 * complete stand-in for `McpApp`. The real SDK wraps every payload as JSON inside
 * `content[0].text`; the stub reproduces that shape because the service parses it.
 */
function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      const value = handler(call.arguments ?? {});
      if (value && typeof value === 'object' && (value as any).__rawToolResult) {
        return (value as any).result;
      }
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    },
  };
  return { app: app as never, calls };
}

/** A tool-level failure: `callServerTool` resolves, `parseToolResult` throws on it. */
function toolError(message: string) {
  return rawResult({ isError: true, content: [{ type: 'text', text: message }] });
}

/** `n` distinct payroll rows, `_createdAt` ascending so a desc sort has to reverse them. */
function fullPage(n: number, prefix: string): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}-${i}`,
    roomId: 'room-1',
    employeeId: `${prefix}-emp-${i}`,
    baseSalary: 1,
    _createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

/** Serves `pages[n]` on the n-th `mcpapp.db.query`, then empty pages forever. */
function pagingHandlers(pages: Array<Array<Record<string, unknown>>>) {
  let index = 0;
  return {
    'mcpapp.db.query': () => {
      const page = pages[index] ?? [];
      index += 1;
      return { records: page, total: pages.flat().length };
    },
  };
}

function service(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const { app, calls } = createAppStub(handlers);
  return { svc: new PayrollService(app, 'room-1'), calls };
}

describe('PayrollService', () => {
  describe('initializeSchema', () => {
    it('registers the room-scoped collection with the unique (roomId, employeeId) index', async () => {
      const { svc, calls } = service({
        'mcpapp.db.registerCollection': () => ({ ok: true }),
        'mcpapp.db.updateSchema': () => ({ ok: true }),
      });
      await svc.initializeSchema();

      const register = calls.find((call) => call.name === 'mcpapp.db.registerCollection')!;
      const args = register.arguments!;
      expect(args.collection).toBe(PAYROLL_COLLECTION);
      expect(args.scope).toBe('room');
      expect(args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
      const fields = args.fields as Array<{ name: string; required?: boolean }>;
      expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
      expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    });

    it('migrates an already-registered room by adding the new field list', async () => {
      const { svc, calls } = service({
        'mcpapp.db.registerCollection': () => toolError('Collection already registered'),
        'mcpapp.db.updateSchema': () => ({ ok: true }),
      });
      await svc.initializeSchema();

      const update = calls.find((call) => call.name === 'mcpapp.db.updateSchema')!;
      expect(update).toBeDefined();
      const fields = update.arguments!.fields as Array<{ name: string }>;
      expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    });

    it('treats "already registered" as success', async () => {
      const { svc } = service({
        'mcpapp.db.registerCollection': () => toolError('Collection already registered'),
        'mcpapp.db.updateSchema': () => ({ ok: true }),
      });
      await expect(svc.initializeSchema()).resolves.toBeUndefined();
    });

    it('propagates any other registration failure', async () => {
      const { svc } = service({
        'mcpapp.db.registerCollection': () => toolError('Insufficient scope'),
      });
      await expect(svc.initializeSchema()).rejects.toThrow(/insufficient scope/i);
    });
  });

  describe('getRecords', () => {
    it('queries one room with an index-backed sort and an explicit first-page offset', async () => {
      const row = { _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 };
      const { svc, calls } = service({ 'mcpapp.db.query': () => ({ records: [row], total: 1 }) });

      expect(await svc.getRecords()).toEqual([row]);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('mcpapp.db.query');
      expect(calls[0].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        where: [{ field: 'roomId', op: '==', value: 'room-1' }],
        orderBy: [{ field: 'employeeId', direction: 'asc' }],
        limit: PAYROLL_PAGE_SIZE,
        offset: 0,
      });
    });

    it('never sends a hub-assigned underscore field as an orderBy field', async () => {
      const { svc, calls } = service({ 'mcpapp.db.query': () => ({ records: [], total: 0 }) });
      await svc.getRecords();
      const orderBy = calls[0].arguments!.orderBy as Array<{ field: string }>;
      expect(orderBy.some((clause) => clause.field.startsWith('_'))).toBe(false);
    });

    it('keeps paging while a full page comes back and stops on the first short page', async () => {
      const { svc, calls } = service(
        pagingHandlers([
          fullPage(PAYROLL_PAGE_SIZE, 'p0'),
          fullPage(PAYROLL_PAGE_SIZE, 'p1'),
          fullPage(3, 'p2'),
        ]),
      );

      expect(await svc.getRecords()).toHaveLength(PAYROLL_PAGE_SIZE * 2 + 3);
      expect(calls).toHaveLength(3);
      expect(calls.map((call) => call.arguments!.offset)).toEqual([
        0,
        PAYROLL_PAGE_SIZE,
        PAYROLL_PAGE_SIZE * 2,
      ]);
    });

    it('throws instead of returning a truncated list when the page budget runs out', async () => {
      const pages = Array.from({ length: PAYROLL_MAX_PAGES + 5 }, (_, i) =>
        fullPage(PAYROLL_PAGE_SIZE, `p${i}`),
      );
      const { svc, calls } = service(pagingHandlers(pages));

      await expect(svc.getRecords()).rejects.toThrow(/vượt quá/i);
      expect(calls).toHaveLength(PAYROLL_MAX_PAGES);
    });

    it('does not throw when the read ends on a short page inside the budget', async () => {
      const { svc } = service(pagingHandlers([fullPage(PAYROLL_PAGE_SIZE, 'p0'), fullPage(1, 'p1')]));
      expect(await svc.getRecords()).toHaveLength(PAYROLL_PAGE_SIZE + 1);
    });

    it('returns records newest first regardless of the order the hub sent them', async () => {
      const { svc } = service(
        pagingHandlers([
          [
            { _id: 'old', roomId: 'room-1', employeeId: 'a', baseSalary: 1, _createdAt: '2026-01-01T00:00:00.000Z' },
            { _id: 'new', roomId: 'room-1', employeeId: 'b', baseSalary: 1, _createdAt: '2026-03-01T00:00:00.000Z' },
            { _id: 'mid', roomId: 'room-1', employeeId: 'c', baseSalary: 1, _createdAt: '2026-02-01T00:00:00.000Z' },
            { _id: 'none', roomId: 'room-1', employeeId: 'd', baseSalary: 1 },
          ],
        ]),
      );

      expect((await svc.getRecords()).map((row) => row._id)).toEqual(['new', 'mid', 'old', 'none']);
    });

    it('rejects a tool-level failure instead of reporting an empty roster', async () => {
      const { svc } = service({ 'mcpapp.db.query': () => toolError('Insufficient scope') });
      await expect(svc.getRecords()).rejects.toThrow(/insufficient scope/i);
    });

    it('hides tombstoned rows', async () => {
      const { svc } = service(
        pagingHandlers([
          [
            { _id: 'live', roomId: 'room-1', employeeId: 'a', baseSalary: 1 },
            { _id: 'dead', roomId: 'room-1', employeeId: 'b', baseSalary: 1, deletedAt: '2026-09-15T00:00:00.000Z' },
          ],
        ]),
      );

      expect((await svc.getRecords()).map((row) => row._id)).toEqual(['live']);
    });
  });

  describe('saveRecord', () => {
    it('creates with roomId stamped from the service, never from the record', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({ records: [] }),
        'mcpapp.db.create': () => ({ _id: 'new' }),
      });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: 't',
        bankAccount: 'b',
        ...({ roomId: 'room-EVIL' } as object),
      } as PayrollRecord);

      expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
      expect(calls[1].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        data: { employeeId: 'e1', baseSalary: 5, taxId: 't', bankAccount: 'b', roomId: 'room-1' },
      });
    });

    it('never sends hub-assigned timestamps or a tombstone back on a write', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({ records: [] }),
        'mcpapp.db.create': () => ({ _id: 'new' }),
      });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: '',
        bankAccount: '',
        _createdAt: '2026-01-01T00:00:00.000Z',
        _updatedAt: '2026-01-02T00:00:00.000Z',
        deletedAt: '2026-01-03T00:00:00.000Z',
      });

      const data = calls[1].arguments!.data as Record<string, unknown>;
      expect(data).not.toHaveProperty('_createdAt');
      expect(data).not.toHaveProperty('_updatedAt');
      expect(data).not.toHaveProperty('_id');
      expect(data).not.toHaveProperty('deletedAt');
    });

    it('revives a tombstoned row instead of creating a duplicate the unique index would reject', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({
          records: [{ _id: 'tomb-1', roomId: 'room-1', employeeId: 'e1', baseSalary: 1, deletedAt: '2026-09-01T00:00:00.000Z' }],
        }),
        'mcpapp.db.update': () => ({ ok: true }),
      });
      await svc.saveRecord({ employeeId: 'e1', baseSalary: 7, taxId: '', bankAccount: '' });

      expect(calls.some((call) => call.name === 'mcpapp.db.create')).toBe(false);
      const update = calls.find((call) => call.name === 'mcpapp.db.update')!;
      expect(update.arguments!.id).toBe('tomb-1');
      const data = update.arguments!.data as Record<string, unknown>;
      expect(data.baseSalary).toBe(7);
      expect(data.deletedAt).toBe('');
    });

    it('updates by id, re-pins roomId and clears any tombstone in the payload', async () => {
      const { svc, calls } = service({ 'mcpapp.db.update': () => ({ ok: true }) });
      await svc.saveRecord({ _id: 'id-1', employeeId: 'e1', baseSalary: 9, taxId: '', bankAccount: '' });

      expect(calls[0].name).toBe('mcpapp.db.update');
      expect(calls[0].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        id: 'id-1',
        // Without `deletedAt: ''` a save made while the row was tombstoned by a GC pass elsewhere
        // reports "thành công" and then vanishes from the table.
        data: { employeeId: 'e1', baseSalary: 9, taxId: '', bankAccount: '', roomId: 'room-1', deletedAt: '' },
      });
    });

    it('never overwrites a LIVE row — the unique index must reject the duplicate', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({
          records: [{ _id: 'live-1', roomId: 'room-1', employeeId: 'e1', baseSalary: 30000000 }],
        }),
        'mcpapp.db.create': () => toolError('E11000 duplicate key error'),
      });

      await expect(
        svc.saveRecord({ employeeId: 'e1', baseSalary: 8000000, taxId: '', bankAccount: '' }),
      ).rejects.toThrow(/duplicate key/i);

      expect(calls.some((call) => call.name === 'mcpapp.db.update')).toBe(false);
      expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
    });

    it('rejects a tool-level write failure instead of reporting success', async () => {
      const { svc } = service({
        'mcpapp.db.query': () => ({ records: [] }),
        'mcpapp.db.create': () => toolError('Validation failed'),
      });
      await expect(
        svc.saveRecord({ employeeId: 'e1', baseSalary: 5, taxId: '', bankAccount: '' }),
      ).rejects.toThrow(/validation failed/i);
    });
  });

  describe('deleteRecord', () => {
    it('writes a deletedAt tombstone and never calls mcpapp.db.delete', async () => {
      const { svc, calls } = service({ 'mcpapp.db.update': () => ({ ok: true }) });
      await svc.deleteRecord('id-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('mcpapp.db.update');
      expect(calls[0].arguments!.collection).toBe(PAYROLL_COLLECTION);
      expect(calls[0].arguments!.id).toBe('id-1');
      const data = calls[0].arguments!.data as Record<string, unknown>;
      expect(data.roomId).toBe('room-1');
      expect(Number.isNaN(Date.parse(data.deletedAt as string))).toBe(false);
    });

    it('rejects a tool-level delete failure', async () => {
      const { svc } = service({ 'mcpapp.db.update': () => toolError('Not found') });
      await expect(svc.deleteRecord('id-1')).rejects.toThrow(/not found/i);
    });
  });
});
