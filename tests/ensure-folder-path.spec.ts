import { describe, expect, it } from 'vitest';
import { ensureFolderPath } from '../src/ui/privos-rest';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Tool result the SDK hands back: payload JSON inside `content[0].text`, or a raw `isError` shape. */
function ok(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function folderApp(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return handler(call.arguments ?? {});
    },
  };
  return { app: app as never, calls };
}

describe('ensureFolderPath', () => {
  it('reuses existing folders without creating any', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': (args) =>
        ok({ folders: args.parentId ? [{ _id: 'jds', name: 'jds' }] : [{ _id: 'root', name: 'hr-miniapp' }] }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).resolves.toBe('jds');
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('creates only the missing segment', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': (args) => ok({ folders: args.parentId ? [] : [{ _id: 'root', name: 'hr-miniapp' }] }),
      'mcpapp.folders.create': () => ok({ _id: 'new-jds' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).resolves.toBe('new-jds');
    expect(calls.filter((call) => call.name === 'mcpapp.folders.create').map((call) => call.arguments)).toEqual([
      { channelId: 'room-1', name: 'jds', parentId: 'root' },
    ]);
  });

  it('never creates a duplicate folder when the listing returns a tool error', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': () => toolError('Hub tam thoi loi'),
      'mcpapp.folders.create': () => ok({ _id: 'duplicate' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp'])).rejects.toThrow('Hub tam thoi loi');
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('never creates a duplicate folder when the listing is unreadable', async () => {
    const { app, calls } = folderApp({
      'mcpapp.folders.getByChannel': () => ({ content: [{ type: 'text', text: 'not json' }] }),
      'mcpapp.folders.create': () => ok({ _id: 'duplicate' }),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp'])).rejects.toThrow();
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('fails instead of returning the parent when a nested create is refused', async () => {
    const { app } = folderApp({
      'mcpapp.folders.getByChannel': (args) => ok({ folders: args.parentId ? [] : [{ _id: 'root', name: 'hr-miniapp' }] }),
      'mcpapp.folders.create': () => toolError('tao thu muc bi tu choi'),
    });
    await expect(ensureFolderPath(app, 'room-1', ['hr-miniapp', 'jds'])).rejects.toThrow('tao thu muc bi tu choi');
  });
});
