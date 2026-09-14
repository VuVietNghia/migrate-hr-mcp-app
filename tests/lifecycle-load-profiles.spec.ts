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
});
