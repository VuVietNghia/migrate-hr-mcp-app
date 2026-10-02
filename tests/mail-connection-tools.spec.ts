import type { VerifiedActor } from '@privos_ai/app-server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	handleMailConnectionTool,
	setMailConnectionToolDependencies,
} from '../src/mail-connection-tools';

const actor = {
	userId: 'user-a',
	username: 'member',
	roomId: 'room-a',
	claims: Object.freeze({}),
	provenance: 'user-token',
} as unknown as VerifiedActor;

function parse(result: { content: Array<{ text: string }>; isError?: boolean }) {
	return { ...result, body: JSON.parse(result.content[0].text) as Record<string, unknown> };
}

describe('hrm.mail.connection.* tools', () => {
	const get = vi.fn(async () => ({ connection: null, cleanupPending: false }));
	const begin = vi.fn(async () => ({
		attemptId: 'attempt-a',
		sessionToken: 'session-token',
		connectLink: 'https://connect.nango.dev/?session_token=short-lived',
		expiresAt: '2026-09-30T01:10:00.000Z',
	}));
	const complete = vi.fn(async () => ({ connection: null, cleanupPending: false }));
	const poll = vi.fn(async () => null);
	const disconnect = vi.fn(async () => ({ connection: null, cleanupPending: false }));

	beforeEach(() => {
		vi.clearAllMocks();
		setMailConnectionToolDependencies({
			getService: () => ({ get, begin, complete, poll, disconnect }),
			resolveInstallationId: async () => 'installation-a',
		});
	});

	it('uses the existing complete tool as a tag-bound discovery poll without changing its manifest schema', async () => {
		const result = parse(await handleMailConnectionTool(
			'hrm.mail.connection.complete',
			{ roomId: 'room-a', attemptId: 'attempt-a', candidateConnectionId: '__discover__' },
			actor,
		));
		expect(result.isError).not.toBe(true);
		expect(poll).toHaveBeenCalledWith(
			{ installationId: 'installation-a', roomId: 'room-a', userId: 'user-a' },
			'attempt-a',
		);
		expect(complete).not.toHaveBeenCalled();
	});

	it('allows a non-owner Room member to begin a provider-restricted connection', async () => {
		const result = parse(
			await handleMailConnectionTool(
				'hrm.mail.connection.begin',
				{ roomId: 'room-a', provider: 'google', expectedRevision: null },
				actor,
			),
		);
		expect(result.isError).not.toBe(true);
		expect(begin).toHaveBeenCalledWith(
			{ installationId: 'installation-a', roomId: 'room-a', userId: 'user-a' },
			'google',
			null,
		);
		expect(result.body.sessionToken).toBe('session-token');
	});

	it('fails closed without a verified actor or with a mismatched Room', async () => {
		const missing = parse(await handleMailConnectionTool('hrm.mail.connection.get', {}, undefined));
		const wrongRoom = parse(
			await handleMailConnectionTool('hrm.mail.connection.get', { roomId: 'room-b' }, actor),
		);
		expect(missing.isError).toBe(true);
		expect(wrongRoom.isError).toBe(true);
		expect(get).not.toHaveBeenCalled();
	});

	it('returns structured safe errors without leaking the underlying failure', async () => {
		get.mockRejectedValueOnce(new Error('database password=secret'));
		const result = parse(await handleMailConnectionTool('hrm.mail.connection.get', {}, actor));
		expect(result.isError).toBe(true);
		expect(result.body).toEqual({
			code: 'MAIL_CONFIGURATION_UNAVAILABLE',
			message: 'Chức năng email chưa được cấu hình đầy đủ.',
		});
		expect(result.content[0].text).not.toContain('secret');
	});
});
