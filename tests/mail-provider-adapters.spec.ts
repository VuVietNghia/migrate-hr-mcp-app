import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { GoogleMailAdapter } from '../src/services/mail/google-mail-adapter';
import { MicrosoftMailAdapter } from '../src/services/mail/microsoft-mail-adapter';
import type { NangoGateway, ProxyRequest, ProxyResponse } from '../src/services/mail/nango-gateway';

const message = {
	toName: 'Ứng viên',
	toEmail: 'candidate@example.com',
	subject: 'Lịch phỏng vấn',
	htmlContent: '<p>Xin chào ứng viên.</p>',
};

const googleConnection = {
	roomId: 'room-a',
	provider: 'google' as const,
	connectionId: 'google-a',
	senderEmail: 'hr@example.test',
	status: 'connected' as const,
	revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
	updatedAt: '2026-09-30T01:02:03.000Z',
	updatedBy: 'user-a',
};

class FakeGateway implements NangoGateway {
	readonly requests: ProxyRequest[] = [];

	constructor(private readonly respond: (request: ProxyRequest) => ProxyResponse | Promise<ProxyResponse>) {}

	async createSession(): Promise<never> {
		throw new Error('unused');
	}

	async findConnection(): Promise<null> {
		return null;
	}

	async findConnectionForAttempt(): Promise<null> {
		return null;
	}

	async proxy(request: ProxyRequest): Promise<ProxyResponse> {
		this.requests.push(request);
		return this.respond(request);
	}

	async deleteConnection(): Promise<void> {}
}

describe('mail provider adapters', () => {
	it.each([401, 403])('verifies a Gmail-only grant through Gmail Profile after UserInfo returns %s', async status => {
		const gateway = new FakeGateway(request => request.endpoint === 'https://openidconnect.googleapis.com/v1/userinfo'
			? { status, data: { error: 'invalid_request' } }
			: { status: 200, data: { emailAddress: 'hr@example.test' } });
		await expect(new GoogleMailAdapter(gateway).identity('google-a', 8000)).resolves.toBe('hr@example.test');
		expect(gateway.requests.map(request => request.endpoint)).toEqual([
			'https://openidconnect.googleapis.com/v1/userinfo',
			'https://gmail.googleapis.com/gmail/v1/users/me/profile',
		]);
	});

	it('requires reconnection when both Google identity endpoints reject the grant', async () => {
		const gateway = new FakeGateway(() => ({ status: 401, data: { error: 'invalid_token' } }));
		await expect(new GoogleMailAdapter(gateway).identity('google-a', 8000)).rejects.toMatchObject({ code: 'MAIL_RECONNECT_REQUIRED' });
		expect(gateway.requests).toHaveLength(2);
	});

	it('does not use Gmail Profile after a rate-limited UserInfo response', async () => {
		const gateway = new FakeGateway(() => ({ status: 429, data: {}, retryAfterSeconds: 12 }));
		await expect(new GoogleMailAdapter(gateway).identity('google-a', 8000)).rejects.toMatchObject({ code: 'MAIL_RATE_LIMITED', retryAfterSeconds: 12 });
		expect(gateway.requests).toHaveLength(1);
	});

	it('does not start a Gmail Profile request after the identity deadline expires', async () => {
		let now = 1000;
		const gateway = new FakeGateway(() => {
			now = 2001;
			return { status: 401, data: {} };
		});
		await expect(new GoogleMailAdapter(gateway, () => now).identity('google-a', 1000)).rejects.toMatchObject({ code: 'MAIL_TIMEOUT_BEFORE_SEND' });
		expect(gateway.requests).toHaveLength(1);
	});

	it('builds a Vietnamese Gmail MIME message with the verified sender', async () => {
		const gateway = new FakeGateway(request => {
			if (request.method === 'GET') return { status: 200, data: { email: 'hr@example.test', email_verified: true } };
			return { status: 200, data: { id: 'gmail-message-id' } };
		});
		const adapter = new GoogleMailAdapter(gateway);

		await expect(adapter.send(googleConnection, message, 8000)).resolves.toEqual({
			status: 'accepted',
			provider: 'google',
			senderEmail: 'hr@example.test',
			connectionRevision: googleConnection.revision,
			providerMessageId: 'gmail-message-id',
		});
		const send = gateway.requests.find(request => request.method === 'POST');
		const raw = (send?.data as { raw: string }).raw;
		const decoded = Buffer.from(raw.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString('utf8');
		expect(decoded).toContain('From: hr@example.test');
		expect(decoded).toContain('candidate@example.com');
		expect(send?.endpoint).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
	});

	it('accepts Microsoft Graph 202 with an empty body and saves to Sent Items', async () => {
		const gateway = new FakeGateway(request => {
			if (request.method === 'GET') return { status: 200, data: { id: 'user-a', mail: 'hr@example.test' } };
			return { status: 202, data: '' };
		});
		const adapter = new MicrosoftMailAdapter(gateway);
		const connection = { ...googleConnection, provider: 'microsoft' as const, connectionId: 'microsoft-a' };

		await expect(adapter.send(connection, message, 8000)).resolves.toEqual({
			status: 'accepted',
			provider: 'microsoft',
			senderEmail: 'hr@example.test',
			connectionRevision: connection.revision,
		});
		const send = gateway.requests.find(request => request.method === 'POST');
		expect(send?.endpoint).toBe('/v1.0/me/sendMail');
		expect(send?.data).toMatchObject({ saveToSentItems: true });
	});

	it('does not fall back to Microsoft userPrincipalName when mail is absent', async () => {
		const gateway = new FakeGateway(() => ({
			status: 200,
			data: { id: 'user-a', userPrincipalName: 'fallback@example.test' },
		}));
		await expect(new MicrosoftMailAdapter(gateway).identity('microsoft-a', 8000)).rejects.toMatchObject({
			code: 'MAIL_RECONNECT_REQUIRED',
		});
	});

	it('maps a provider rate limit without exposing response data', async () => {
		const gateway = new FakeGateway(request => {
			if (request.method === 'GET') return { status: 200, data: { email: 'hr@example.test', email_verified: true } };
			return { status: 429, data: { access_token: 'secret' }, retryAfterSeconds: 12 };
		});
		await expect(new GoogleMailAdapter(gateway).send(googleConnection, message, 8000)).rejects.toMatchObject({
			code: 'MAIL_RATE_LIMITED',
			retryAfterSeconds: 12,
		});
	});

	it('maps a post-dispatch transport failure to an unknown send result', async () => {
		let calls = 0;
		const gateway = new FakeGateway(request => {
			calls += 1;
			if (request.method === 'GET') return { status: 200, data: { email: 'hr@example.test', email_verified: true } };
			throw new Error('socket timeout token=secret');
		});
		await expect(new GoogleMailAdapter(gateway).send(googleConnection, message, 8000)).rejects.toMatchObject({
			code: 'MAIL_SEND_UNKNOWN',
		});
		expect(calls).toBe(2);
	});

	it('does not dispatch after identity consumes the remaining deadline', async () => {
		let now = 1_000;
		const gateway = new FakeGateway(request => {
			if (request.method === 'POST') throw new Error('POST must not run');
			now = 2_001;
			return { status: 200, data: { email: 'hr@example.test', email_verified: true } };
		});
		const adapter = new GoogleMailAdapter(gateway, () => now);
		await expect(adapter.send(googleConnection, message, 1_000)).rejects.toMatchObject({
			code: 'MAIL_TIMEOUT_BEFORE_SEND',
		});
		expect(gateway.requests.map(request => request.method)).toEqual(['GET']);
	});
});
