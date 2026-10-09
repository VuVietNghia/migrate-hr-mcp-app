import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { loadRoomMailAccount, RoomMailAccountSummary } from '../src/ui/mail-connection/RoomMailAccountSummary';

describe('Room mail account summary', () => {
  it('loads only the current Room account after joining the Room', async () => {
    const callServerTool = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ connection: null, cleanupPending: false }) }] });
    await expect(loadRoomMailAccount({ callServerTool } as never, 'room-a')).resolves.toEqual({ connection: null, cleanupPending: false });
    expect(callServerTool.mock.calls.map(([call]) => call.name)).toEqual(['mcpapp.bot.joinCurrentRoom', 'hrm.mail.connection.get']);
  });

  it('is read-only and preserves explicit disconnected/loading UI', () => {
    const html = renderToStaticMarkup(createElement(RoomMailAccountSummary, { app: null, roomId: '', active: false }));
    expect(html).toContain('TÀI KHOẢN GỬI CHUNG CỦA ROOM');
    expect(html).not.toContain('Thay tài khoản');
    expect(html).not.toContain('Ngắt kết nối');
  });
});
