import { describe, expect, it, vi } from 'vitest';

import { MailError } from '../src/services/mail/mail-errors';
import { MailConnectionClient } from '../src/ui/mail-connection/mail-connection-client';

const connection = {
	roomId: 'room-a',
	provider: 'google' as const,
	senderEmail: 'sender@example.test',
	status: 'connected' as const,
	revision: '11111111-1111-4111-8111-111111111111',
	updatedAt: '2026-09-30T03:00:00.000Z',
};

function result(value: unknown): unknown {
	return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

describe('MailConnectionClient', () => {
	it('binds every tool call to its Room and parses successful responses', async () => {
		const callServerTool = vi.fn(async ({ name }: { name: string }) => {
			if (name === 'hrm.mail.connection.begin') {
				return result({
					attemptId: 'attempt-a',
					sessionToken: 'session-token',
					expiresAt: '2026-09-30T03:10:00.000Z',
				});
			}
			return result({ connection, cleanupPending: false });
		});
		const client = new MailConnectionClient({ callServerTool }, 'room-a');

		await expect(client.get()).resolves.toEqual({ connection, cleanupPending: false });
		await expect(client.begin('google', connection.revision)).resolves.toMatchObject({
			attemptId: 'attempt-a',
			sessionToken: 'session-token',
		});
		await client.complete('attempt-a', 'candidate-a');
		await client.disconnect(connection.revision);

		expect(callServerTool).toHaveBeenNthCalledWith(1, {
			name: 'hrm.mail.connection.get',
			arguments: { roomId: 'room-a' },
		});
		expect(callServerTool).toHaveBeenNthCalledWith(2, {
			name: 'hrm.mail.connection.begin',
			arguments: { roomId: 'room-a', provider: 'google', expectedRevision: connection.revision },
		});
		expect(callServerTool).toHaveBeenNthCalledWith(3, {
			name: 'hrm.mail.connection.complete',
			arguments: { roomId: 'room-a', attemptId: 'attempt-a', candidateConnectionId: 'candidate-a' },
		});
		expect(callServerTool).toHaveBeenNthCalledWith(4, {
			name: 'hrm.mail.connection.disconnect',
			arguments: { roomId: 'room-a', expectedRevision: connection.revision },
		});
	});

	it('rejects an MCP tool error instead of parsing it as connection state', async () => {
		const callServerTool = vi.fn(async () => ({
			isError: true,
			content: [{
				type: 'text',
				text: JSON.stringify({ code: 'MAIL_CONNECTION_CHANGED', message: 'safe' }),
			}],
		}));
		const client = new MailConnectionClient({ callServerTool }, 'room-a');

		await expect(client.get()).rejects.toMatchObject<Partial<MailError>>({
			code: 'MAIL_CONNECTION_CHANGED',
		});
	});

	it('fails closed on malformed connection data', async () => {
		const callServerTool = vi.fn(async () => result({
			connection: { ...connection, roomId: 'room-b' },
			cleanupPending: false,
		}));
		const client = new MailConnectionClient({ callServerTool }, 'room-a');

		await expect(client.get()).rejects.toThrow();
	});

	it('rejects internal connection and updater identifiers in the public response', async () => {
		const callServerTool = vi.fn(async () => result({
			connection: { ...connection, connectionId: 'private', updatedBy: 'user-a' },
			cleanupPending: false,
		}));
		const client = new MailConnectionClient({ callServerTool }, 'room-a');
		await expect(client.get()).rejects.toThrow();
	});
});
