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

  it('surfaces a non-OK response as an error without the response body verbatim', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'accessToken=priv is invalid' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as unknown as typeof fetch, delayMs: 0 });
    await expect(svc.queueMail(params)).rejects.toThrow('EmailJS rejected the message (403)');
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
