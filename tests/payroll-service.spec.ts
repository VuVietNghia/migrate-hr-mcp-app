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
      const { svc, calls } = service({ 'mcpapp.db.registerCollection': () => ({ ok: true }) });
      await svc.initializeSchema();

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('mcpapp.db.registerCollection');
      const args = calls[0].arguments!;
      expect(args.collection).toBe(PAYROLL_COLLECTION);
      expect(args.scope).toBe('room');
      expect(args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
      const fields = args.fields as Array<{ name: string; required?: boolean }>;
      expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
    });

    it('treats "already registered" as success', async () => {
      const { svc } = service({
        'mcpapp.db.registerCollection': () => toolError('Collection already registered'),
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

    it('stops at PAYROLL_MAX_PAGES instead of paging forever', async () => {
      const pages = Array.from({ length: PAYROLL_MAX_PAGES + 5 }, (_, i) =>
        fullPage(PAYROLL_PAGE_SIZE, `p${i}`),
      );
      const { svc, calls } = service(pagingHandlers(pages));

      expect(await svc.getRecords()).toHaveLength(PAYROLL_PAGE_SIZE * PAYROLL_MAX_PAGES);
      expect(calls).toHaveLength(PAYROLL_MAX_PAGES);
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
  });

  describe('saveRecord', () => {
    it('creates with roomId stamped from the service, never from the record', async () => {
      const { svc, calls } = service({ 'mcpapp.db.create': () => ({ _id: 'new' }) });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: 't',
        bankAccount: 'b',
        ...({ roomId: 'room-EVIL' } as object),
      } as PayrollRecord);

      expect(calls[0].name).toBe('mcpapp.db.create');
      expect(calls[0].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        data: { employeeId: 'e1', baseSalary: 5, taxId: 't', bankAccount: 'b', roomId: 'room-1' },
      });
    });

    it('never sends hub-assigned timestamps back on a write', async () => {
      const { svc, calls } = service({ 'mcpapp.db.create': () => ({ _id: 'new' }) });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: '',
        bankAccount: '',
        _createdAt: '2026-01-01T00:00:00.000Z',
        _updatedAt: '2026-01-02T00:00:00.000Z',
      });

      const data = calls[0].arguments!.data as Record<string, unknown>;
      expect(data).not.toHaveProperty('_createdAt');
      expect(data).not.toHaveProperty('_updatedAt');
      expect(data).not.toHaveProperty('_id');
    });

    it('updates by id and re-pins roomId in the payload', async () => {
      const { svc, calls } = service({ 'mcpapp.db.update': () => ({ ok: true }) });
      await svc.saveRecord({ _id: 'id-1', employeeId: 'e1', baseSalary: 9, taxId: '', bankAccount: '' });

      expect(calls[0].name).toBe('mcpapp.db.update');
      expect(calls[0].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        id: 'id-1',
        data: { employeeId: 'e1', baseSalary: 9, taxId: '', bankAccount: '', roomId: 'room-1' },
      });
    });

    it('rejects a tool-level write failure instead of reporting success', async () => {
      const { svc } = service({ 'mcpapp.db.create': () => toolError('Validation failed') });
      await expect(
        svc.saveRecord({ employeeId: 'e1', baseSalary: 5, taxId: '', bankAccount: '' }),
      ).rejects.toThrow(/validation failed/i);
    });
  });

  describe('deleteRecord', () => {
    it('deletes by id', async () => {
      const { svc, calls } = service({ 'mcpapp.db.delete': () => ({ ok: true }) });
      await svc.deleteRecord('id-1');

      expect(calls[0].name).toBe('mcpapp.db.delete');
      expect(calls[0].arguments).toEqual({ collection: PAYROLL_COLLECTION, id: 'id-1' });
    });

    it('rejects a tool-level delete failure', async () => {
      const { svc } = service({ 'mcpapp.db.delete': () => toolError('Not found') });
      await expect(svc.deleteRecord('id-1')).rejects.toThrow(/not found/i);
    });
  });
});
