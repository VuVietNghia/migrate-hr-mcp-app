import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

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
 * A handler may opt out of that wrapping via `rawResult(...)` to hand back a
 * tool-result object verbatim (e.g. an `isError` response).
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
  return { app, calls };
}

const STAGES = [{ _id: 'stage-1', name: 'Mới nhận việc' }];

const HR_LIST = {
  _id: 'list-1',
  name: '[HR-MCP-App] Hồ sơ nhân sự',
  fieldDefinitions: [{ _id: 'fd-1', name: 'Email', type: 'TEXT' }],
};

const CONFIG_ITEM = {
  _id: 'cfg-1',
  name: '[Hệ thống] Không xoá - Cấu hình Kanban',
  description: JSON.stringify(STAGES),
};

const EMPLOYEE_ITEM = {
  _id: 'emp-1',
  name: 'Nguyen Van A',
  stageId: 'stage-1',
  customFields: [{ fieldId: 'fd-1', value: 'a@example.com' }],
};

/** `n` employee items with ids starting at `offset`, so a paging read can be asserted. */
function itemPage(offset: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `emp-${offset + i}`,
    name: `NV ${offset + i}`,
    stageId: 'stage-1',
    customFields: [],
  }));
}

function healthyRoom(items: unknown[]) {
  return {
    'mcpapp.lists.getAll': () => [HR_LIST],
    'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
    'mcpapp.lists.getItems': () => items,
  };
}

describe('PrivOSLifecycleService.loadProfiles', () => {
  it('propagates a Hub failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => {
        throw new Error('mcp-apps.rest-call 403');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('mcp-apps.rest-call 403');
  });

  it('propagates a list-creation failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [],
      'mcpapp.lists.create': () => {
        throw new Error('lists.create denied');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('lists.create denied');
  });

  it('returns an empty roster when the list loaded fine but holds no employee items', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([]);
  });

  it('maps employee items to profiles on the happy path', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);
  });

  it('rejects a tool-level (isError) failure from mcpapp.lists.getAll instead of silently provisioning a duplicate list', async () => {
    // Error text is deliberately valid JSON ('{}'). A hand-rolled `JSON.parse(text)` treats
    // this as an empty success payload and masks the failure — the exact bug being asserted
    // against. Only checking `isError` first (as parseToolResult does) catches it.
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => rawResult({
        isError: true,
        content: [{ type: 'text', text: '{}' }],
      }),
      'mcpapp.lists.create': () => ({ list: { _id: 'list-2' } }),
      'mcpapp.lists.getItems': () => [],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow();
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('rejects a tool-level (isError) failure from mcpapp.lists.getItems instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // Same valid-JSON-error-text trap as above, this time on the getItems path.
      'mcpapp.lists.getItems': () => rawResult({
        isError: true,
        content: [{ type: 'text', text: '{}' }],
      }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow();
  });

  it('rejects when mcpapp.lists.create resolves successfully but with no usable list id', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [],
      'mcpapp.lists.create': () => ({}),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/no usable list id/);
  });

  it('never deletes the employee list when the Kanban config JSON is corrupt', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '{not json' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/cấu hình kanban/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('never deletes the employee list when the config item holds an empty stage array', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '[]' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/stage/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('repairs a MISSING Kanban config item from the list stages instead of bricking the room', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{ ...HR_LIST, stages: STAGES }],
      // No config item at all — the state `createNewList` leaves behind when `mcpapp.lists.create`
      // echoes back no stages. Throwing here would make the room permanently unreadable.
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'cfg-new' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);

    const created = calls.find(c => c.name === 'mcpapp.lists.createItem')!;
    expect(created).toBeDefined();
    expect(created.arguments!.description).toBe(JSON.stringify(STAGES));
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('repairs a MISSING Kanban config item by fetching the stages when the list carries none', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.stages.getByList': () => STAGES,
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'cfg-new' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);
    expect(calls.some(c => c.name === 'mcpapp.stages.getByList')).toBe(true);
    expect(calls.find(c => c.name === 'mcpapp.lists.createItem')!.arguments!.description)
      .toBe(JSON.stringify(STAGES));
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
  });

  it('still throws, and deletes nothing, when no stages can be recovered from any source', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.stages.getByList': () => [],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/stage/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.createItem')).toBe(false);
  });

  it('keeps serving the roster when re-creating the repaired config item fails', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [{ ...HR_LIST, stages: STAGES }],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.lists.createItem': () => { throw new Error('lists.createItem denied'); },
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toHaveLength(1);
  });
});

describe('PrivOSLifecycleService roster paging', () => {
  it('reads past the first page instead of truncating the roster at 100', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': (args) => (Number(args.offset ?? 0) === 0 ? itemPage(0, 100) : itemPage(100, 7)),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toHaveLength(107);
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('throws instead of returning a partial roster when the hub ignores offset', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // The same full page every time — what a hub that silently drops `offset` produces.
      'mcpapp.lists.getItems': () => itemPage(0, 100),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/offset/i);
  });

  it('stops on a short first page without asking for a second', async () => {
    const { app, calls } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await service.loadProfiles('room-1');
    expect(calls.filter(c => c.name === 'mcpapp.lists.getItems')).toHaveLength(1);
  });

  it('throws instead of accepting a roster item that has no id to match a payroll row against', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{ name: 'Khong co id', stageId: 'stage-1', customFields: [] }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/không mang _id/i);
  });
});
