import { describe, expect, it, vi } from 'vitest';
import { TrackedMailService } from '../src/services/mail/tracked-mail-service';
import type { EmailHistoryRecord } from '../src/services/mail/email-history-model';

const payload = {
  source: 'lifecycle' as const,
  recipientName: 'A',
  recipientEmail: 'a@x.vn',
  subject: 'S',
  htmlContent: '<p>x</p>',
};
const record: EmailHistoryRecord = {
  id: 'I1',
  listId: 'L',
  stageId: 's',
  status: 'failed',
  createdAt: '',
  updatedAt: '',
  attemptCount: 1,
  ...payload,
};
const receipt = {
  status: 'accepted' as const,
  provider: 'google' as const,
  senderEmail: 'hr@example.com',
  connectionRevision: 'revision-a',
};

function history() {
  return {
    createResult: vi.fn(async (_r: string, _p: unknown, status: EmailHistoryRecord['status']) => ({ ...record, status })),
    markSent: vi.fn(async () => ({ ...record, status: 'sent' as const })),
    markFailed: vi.fn(async () => record),
    prepareRetry: vi.fn(async () => ({ record, payload })),
  };
}

describe('TrackedMailService', () => {
  it('records a failed attempt when delivery throws, then rethrows', async () => {
    const h = history();
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockRejectedValue(new Error('smtp down')) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).rejects.toThrow('smtp down');
    expect(h.createResult).toHaveBeenCalledWith('r', payload, 'failed', expect.any(Error), 'u1');
  });

  it('records a sent result on success', async () => {
    const h = history();
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockResolvedValue(receipt) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).resolves.toMatchObject({ status: 'sent', receipt });
  });

  it('returns accepted-but-unlogged when history creation fails', async () => {
    const h = history();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.createResult.mockRejectedValueOnce(new Error('accessToken=secret-value'));
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockResolvedValue(receipt) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).resolves.toEqual({
      status: 'sent_unlogged',
      receipt,
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-value');
    warning.mockRestore();
  });

  it('records an ambiguous post-dispatch result as failed and rethrows it', async () => {
    const h = history();
    const unknown = Object.assign(new Error('safe'), { code: 'MAIL_SEND_UNKNOWN' });
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockRejectedValue(unknown) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).rejects.toBe(unknown);
    expect(h.createResult).toHaveBeenCalledWith('r', payload, 'failed', unknown, 'u1');
  });

  it('retry: blocks a concurrent retry of the same item', async () => {
    const h = history();
    let release!: () => void;
    const delivery = {
      queueMail: vi.fn(
        () =>
          new Promise<typeof receipt>((res) => {
            release = () => res(receipt);
          }),
      ),
    };
    const svc = new TrackedMailService(h, delivery);
    const first = svc.retry('r', 'I1');
    await expect(svc.retry('r', 'I1')).rejects.toThrow('đang được gửi lại');
    release();
    await expect(first).resolves.toMatchObject({ status: 'sent' });
  });
});
