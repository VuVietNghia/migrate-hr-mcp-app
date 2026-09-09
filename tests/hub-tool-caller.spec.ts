import { describe, expect, it, vi } from 'vitest';
import { createRoomHubToolCaller, resolveRequiredScope } from '../src/services/hub-tool-caller';

describe('resolveRequiredScope', () => {
  it('maps db tools to the four db scopes', () => {
    expect(resolveRequiredScope('mcpapp.db.registerCollection')).toBe('db:schema:write');
    expect(resolveRequiredScope('mcpapp.db.getSchema')).toBe('db:schema:read');
    expect(resolveRequiredScope('mcpapp.db.query')).toBe('db:read');
    expect(resolveRequiredScope('mcpapp.db.count')).toBe('db:read');
    expect(resolveRequiredScope('mcpapp.db.create')).toBe('db:write');
    expect(resolveRequiredScope('mcpapp.db.update')).toBe('db:write');
    expect(resolveRequiredScope('mcpapp.db.delete')).toBe('db:write');
  });

  it('maps list read tools to lists:read and everything else under lists to lists:write', () => {
    expect(resolveRequiredScope('mcpapp.lists.getAll')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.getItems')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.getItem')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.stages.getByList')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.create')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.createItem')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.updateItem')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.moveItemToStage')).toBe('lists:write');
  });

  it('throws on a tool outside the allowlist', () => {
    expect(() => resolveRequiredScope('mcpapp.files.delete')).toThrow('not allowed from the server');
  });
});

describe('createRoomHubToolCaller', () => {
  it('pins roomId and passes the resolved scope to the transport', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const call = createRoomHubToolCaller('room-1', transport);
    await expect(call('mcpapp.db.query', { collection: 'x' })).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledWith('mcpapp.db.query', { collection: 'x' }, 'db:read', 'room-1');
  });

  it('defaults args to an empty object', async () => {
    const transport = vi.fn().mockResolvedValue(null);
    await createRoomHubToolCaller('room-1', transport)('mcpapp.lists.getAll');
    expect(transport).toHaveBeenCalledWith('mcpapp.lists.getAll', {}, 'lists:read', 'room-1');
  });
});
