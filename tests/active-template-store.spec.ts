import { describe, expect, it } from 'vitest';

import {
  AppDbActiveTemplateStore,
  EMAIL_TEMPLATE_SETTINGS_COLLECTION,
} from '../src/ui/email-templates/active-template-store';

type ToolCall = { name: string; arguments?: Record<string, unknown> };
type Row = { _id: string; roomId: string; category: string; activeTemplateId: string };

/** A tool-level failure shape: `callServerTool` resolves, `parseToolResult` throws with this text. */
function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** In-memory stand-in for the hub's `mcpapp.db.*` tools on one room-scoped collection. */
function createDbStub({ registered = true }: { registered?: boolean } = {}) {
  const calls: ToolCall[] = [];
  const rows: Row[] = [];
  let isRegistered = registered;
  const missing = () => toolError(`Collection "${EMAIL_TEMPLATE_SETTINGS_COLLECTION}" not found for app "app-1" in the exact room scope`);
  const ok = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const args = call.arguments ?? {};
      switch (call.name) {
        case 'mcpapp.db.registerCollection':
          if (isRegistered) return toolError('Collection is already registered for this room identity');
          isRegistered = true;
          return ok({ collection: args.collection });
        case 'mcpapp.db.query': {
          if (!isRegistered) return missing();
          const where = args.where as Array<{ field: keyof Row; value: string }>;
          return ok({ records: rows.filter(row => where.every(clause => row[clause.field] === clause.value)) });
        }
        case 'mcpapp.db.create': {
          if (!isRegistered) return missing();
          const row = { _id: `row-${rows.length + 1}`, ...(args.data as Omit<Row, '_id'>) };
          rows.push(row);
          return ok(row);
        }
        case 'mcpapp.db.update': {
          const row = rows.find(item => item._id === args.id);
          if (!row) return toolError('Record not found');
          Object.assign(row, args.data);
          return ok(row);
        }
        default:
          throw new Error(`unexpected tool call: ${call.name}`);
      }
    },
  };
  return { app: app as never, calls, rows };
}

describe('AppDbActiveTemplateStore', () => {
  it('reads null from a room whose collection was never registered, without registering it', async () => {
    const { app, calls } = createDbStub({ registered: false });
    const store = new AppDbActiveTemplateStore(app, 'room-1', 'lifecycle');

    await expect(store.read()).resolves.toBeNull();
    expect(calls.map(call => call.name)).toEqual(['mcpapp.db.query']);
  });

  it('registers the collection on the first write, then creates one row per category', async () => {
    const { app, rows } = createDbStub({ registered: false });
    const interview = new AppDbActiveTemplateStore(app, 'room-1', 'cv_scored');
    const employee = new AppDbActiveTemplateStore(app, 'room-1', 'lifecycle');

    await interview.write('moi-phong-van-mac-dinh');
    await employee.write('yeu-cau-bo-sung-ho-so-nhan-su');

    expect(rows).toEqual([
      { _id: 'row-1', roomId: 'room-1', category: 'cv_scored', activeTemplateId: 'moi-phong-van-mac-dinh' },
      { _id: 'row-2', roomId: 'room-1', category: 'lifecycle', activeTemplateId: 'yeu-cau-bo-sung-ho-so-nhan-su' },
    ]);
    await expect(interview.read()).resolves.toBe('moi-phong-van-mac-dinh');
    await expect(employee.read()).resolves.toBe('yeu-cau-bo-sung-ho-so-nhan-su');
  });

  it('updates the existing row instead of adding another when the choice changes', async () => {
    const { app, rows } = createDbStub();
    const store = new AppDbActiveTemplateStore(app, 'room-1', 'lifecycle');

    await store.write('yeu-cau-bo-sung-ho-so-nhan-su');
    await store.write('thong-bao-ky-gia-han-hop-dong');

    expect(rows).toHaveLength(1);
    await expect(store.read()).resolves.toBe('thong-bao-ky-gia-han-hop-dong');
  });
});
