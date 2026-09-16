import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedActor } from '@privos_ai/app-server';
import { handleMailTool, setMailToolDependencies } from '../src/mail-tools';

const actor = Object.freeze({
  userId: 'u1',
  username: 'alice',
  roomId: 'room-1',
  claims: Object.freeze({}),
  provenance: 'user-token',
}) as unknown as VerifiedActor;

const base = {
  toName: 'A',
  toEmail: 'a@x.vn',
  subject: 'Hi',
  htmlContent: '<p>x</p><script>1</script>',
  source: 'cv_scored',
  roomId: 'room-1',
  cvItemId: 'c1',
  cvListId: 'l1',
};

describe('hrm.mail.* tools', () => {
  let send: ReturnType<typeof vi.fn>;
  let retry: ReturnType<typeof vi.fn>;
  let seenRoom: string | undefined;
  beforeEach(() => {
    send = vi.fn(async () => ({ status: 'sent', record: { id: 'I1', status: 'sent' } }));
    retry = vi.fn(async () => ({ id: 'I1', status: 'sent' }));
    seenRoom = undefined;
    setMailToolDependencies({
      createTrackedMail: (roomId: string) => {
        seenRoom = roomId;
        return { send, retry } as never;
      },
    });
  });

  it('fails closed without a verified actor', async () => {
    await expect(handleMailTool('hrm.mail.send', base, undefined)).rejects.toThrow('verified caller identity');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a mismatched roomId', async () => {
    await expect(handleMailTool('hrm.mail.send', { ...base, roomId: 'room-2' }, actor)).rejects.toThrow('does not match');
  });

  it('validates recipient, subject, source and size', async () => {
    await expect(handleMailTool('hrm.mail.send', { ...base, toEmail: 'nope' }, actor)).rejects.toThrow(
      'Recipient email is invalid',
    );
    await expect(handleMailTool('hrm.mail.send', { ...base, subject: '' }, actor)).rejects.toThrow('subject is required');
    await expect(handleMailTool('hrm.mail.send', { ...base, source: 'other' }, actor)).rejects.toThrow('source must be');
    await expect(handleMailTool('hrm.mail.send', { ...base, htmlContent: 'x'.repeat(200_001) }, actor)).rejects.toThrow(
      'htmlContent exceeds',
    );
  });

  it('sends with sanitized html, actor room, and requestedBy = actor.userId (caller value ignored)', async () => {
    const result = await handleMailTool('hrm.mail.send', { ...base, requestedBy: 'spoofed' }, actor);
    expect(seenRoom).toBe('room-1');
    expect(send).toHaveBeenCalledWith({
      roomId: 'room-1',
      source: 'cv_scored',
      recipientName: 'A',
      recipientEmail: 'a@x.vn',
      subject: 'Hi',
      htmlContent: '<p>x</p>',
      cvItemId: 'c1',
      cvListId: 'l1',
      jdName: undefined,
      requestedBy: 'u1',
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ itemId: 'I1', status: 'sent' });
  });

  it('reports a delivered-but-unlogged email as sent_unlogged instead of failing', async () => {
    send.mockResolvedValueOnce({ status: 'sent_unlogged', historyError: 'agent_bot_credential_absent' });

    const result = await handleMailTool('hrm.mail.send', base, actor);

    // A thrown error here would make the operator resend and the recipient get a duplicate.
    expect(JSON.parse(result.content[0].text)).toEqual({ itemId: null, status: 'sent_unlogged' });
  });

  it('never forwards the internal history error to the caller', async () => {
    send.mockResolvedValueOnce({ status: 'sent_unlogged', historyError: 'mcpapp.lists.createItem failed: secret detail' });

    const result = await handleMailTool('hrm.mail.send', base, actor);

    expect(result.content[0].text).not.toContain('secret detail');
  });

  it('with recordHistory: false only delivers (sanitized) and returns the verified requestedBy', async () => {
    const deliver = vi.fn(async () => undefined);
    setMailToolDependencies({ createTrackedMail: () => ({ send, retry, deliver }) as never });

    const result = await handleMailTool('hrm.mail.send', { ...base, recordHistory: false, requestedBy: 'spoofed' }, actor);

    expect(send).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ htmlContent: '<p>x</p>', recipientEmail: 'a@x.vn' }));
    expect(JSON.parse(result.content[0].text)).toEqual({ itemId: null, status: 'delivered', requestedBy: 'u1' });
  });

  it('rejects a non-boolean recordHistory', async () => {
    await expect(handleMailTool('hrm.mail.send', { ...base, recordHistory: 'no' }, actor)).rejects.toThrow('recordHistory');
  });

  it('retry requires itemId and uses the actor room', async () => {
    await expect(handleMailTool('hrm.mail.retry', {}, actor)).rejects.toThrow('itemId is required');
    await handleMailTool('hrm.mail.retry', { itemId: 'I1', roomId: 'room-1' }, actor);
    expect(retry).toHaveBeenCalledWith('room-1', 'I1');
  });
});
