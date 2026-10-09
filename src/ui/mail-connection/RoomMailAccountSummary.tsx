import { useEffect, useState } from 'react';
import type { ConnectionView } from '../../services/mail/mail-contracts';
import { MailConnectionClient, type MailConnectionApp } from './mail-connection-client';

export async function loadRoomMailAccount(app: MailConnectionApp, roomId: string): Promise<ConnectionView> {
  const client = new MailConnectionClient(app, roomId);
  await client.joinCurrentRoom();
  return client.get();
}

export function RoomMailAccountSummary({
  app,
  roomId,
  active,
}: {
  app: MailConnectionApp | null;
  roomId: string;
  active: boolean;
}) {
  const [view, setView] = useState<ConnectionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !app || !roomId) return;
    let current = true;
    setLoading(true);
    setError(null);
    void loadRoomMailAccount(app, roomId)
      .then((next) => { if (current) setView(next); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [active, app, roomId]);

  const connection = view?.connection;
  const provider = connection?.provider === 'google' ? 'Google Workspace' : connection?.provider === 'microsoft' ? 'Microsoft 365' : null;
  return (
    <section className='room-mail-summary' aria-live='polite'>
      <span className='studio-eyebrow'>TÀI KHOẢN GỬI CHUNG CỦA ROOM</span>
      {loading ? <p>Đang kiểm tra tài khoản gửi…</p> : error ? <p role='alert'>Không đọc được tài khoản gửi: {error}</p> : connection ? (
        <div><strong>{connection.senderEmail}</strong><span>{provider} · {connection.status === 'connected' ? 'Đã kết nối' : connection.status === 'error' ? 'Có lỗi kết nối' : 'Đã ngắt kết nối'}</span></div>
      ) : <p>Room chưa kết nối tài khoản gửi chung.</p>}
    </section>
  );
}
