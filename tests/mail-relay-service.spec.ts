import { describe, expect, it, vi } from 'vitest';
import { MailRelayService, readMailRelayEnv } from '../src/services/mail/mail-relay-service';

const fullEnv = { serviceId: 'svc', templateId: 'tpl', publicKey: 'pub', privateKey: 'priv' };
const params = { toName: 'A', toEmail: 'a@x.vn', subject: 'Hi', htmlContent: '<p>x</p>' };

describe('readMailRelayEnv', () => {
  it('reads the four EMAILJS_* variables', () => {
    expect(
      readMailRelayEnv({
        EMAILJS_SERVICE_ID: 'a',
        EMAILJS_TEMPLATE_ID: 'b',
        EMAILJS_PUBLIC_KEY: 'c',
        EMAILJS_PRIVATE_KEY: 'd',
      } as NodeJS.ProcessEnv),
    ).toEqual({ serviceId: 'a', templateId: 'b', publicKey: 'c', privateKey: 'd' });
  });
});

describe('MailRelayService', () => {
  it('fails before any network call when a variable is missing', async () => {
    const fetchImpl = vi.fn();
    const svc = new MailRelayService({
      env: { ...fullEnv, privateKey: undefined },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayMs: 0,
    });
    await expect(svc.queueMail(params)).rejects.toThrow('EMAILJS_PRIVATE_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the EmailJS payload with accessToken and never logs the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => 'OK' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });
    await svc.queueMail(params);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      service_id: 'svc',
      template_id: 'tpl',
      user_id: 'pub',
      accessToken: 'priv',
      template_params: { name: 'A', to_name: 'A', to_email: 'a@x.vn', subject: 'Hi', message: '<p>x</p>' },
    });
  });

  it('masks every credential EmailJS echoes back in a rejection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'accessToken=priv user_id=pub service_id=svc template_id=tpl is invalid',
    });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });

    const error = await svc.queueMail(params).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('EmailJS rejected the message (403)');
    for (const secret of ['priv', 'pub', 'svc', 'tpl']) expect(message).not.toContain(secret);
    expect(message).toContain('[redacted]');
  });

  it("carries EmailJS's own explanation, which says how to fix the rejection", async () => {
    // Verbatim from EmailJS on 2026-09-18, when the connected Gmail account lost its OAuth grant.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
      text: async () => 'Gmail_API: Invalid grant. Please reconnect your Gmail account',
    });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });

    await expect(svc.queueMail(params)).rejects.toThrow(
      'EmailJS rejected the message (412): Gmail_API: Invalid grant. Please reconnect your Gmail account',
    );
  });

  it('sends sequentially through the queue', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      order.push(JSON.parse(init.body as string).template_params.subject);
      return { ok: true, text: async () => '' };
    });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });
    await Promise.all([svc.queueMail({ ...params, subject: '1' }), svc.queueMail({ ...params, subject: '2' })]);
    expect(order).toEqual(['1', '2']);
  });
});

describe('MailRelayService bounds and deduplication', () => {
  it('fails the attempt instead of blocking the queue when EmailJS never answers', async () => {
    const fetchImpl = vi.fn().mockImplementation((_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason));
      }),
    );
    const svc = new MailRelayService({
      env: fullEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      delayMs: 0,
      timeoutMs: 20,
    });

    await expect(svc.queueMail(params)).rejects.toThrow('EmailJS không phản hồi trong 20ms');
    // The queue is free again: the next message still goes out.
    fetchImpl.mockResolvedValue({ ok: true, text: async () => '' });
    await expect(svc.queueMail({ ...params, subject: 'sau khi timeout' })).resolves.toBeUndefined();
  });

  it('sends an identical message again once the first attempt has finished', async () => {
    // Resending an invite is a normal operator action. An earlier version swallowed identical
    // messages for 10 minutes and reported them as sent while nothing went out.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });

    await svc.queueMail(params);
    await svc.queueMail(params);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('joins the pending attempt instead of queueing a second copy', async () => {
    let release = () => {};
    const fetchImpl = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ ok: true, text: async () => '' });
      }),
    );
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });

    const first = svc.queueMail(params);
    const retryWhileQueued = svc.queueMail(params);
    release();
    await Promise.all([first, retryWhileQueued]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed message resendable', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, text: async () => '' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });

    await expect(svc.queueMail(params)).rejects.toThrow('500');
    await expect(svc.queueMail(params)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
