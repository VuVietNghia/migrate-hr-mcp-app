import { describe, expect, it } from 'vitest';

import { AppDbMailConnectionRepository } from '../src/services/mail/app-db-mail-connection-repository';
import {
	MAIL_CONNECTION_COLLECTION,
	MAIL_CONNECTION_INDEXES,
} from '../src/services/mail/mail-connection-schema';

type Call = { roomId: string; name: string; args: Record<string, unknown> };

const connection = {
	roomId: 'room-a',
	provider: 'google' as const,
	connectionId: 'connection-a',
	senderEmail: 'sender@example.com',
	status: 'connected' as const,
	revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
	updatedAt: '2026-09-30T01:02:03.000Z',
	updatedBy: 'user-a',
};

const scope = { installationId: 'installation-a', roomId: 'room-a' };

function caller(responses: Record<string, unknown>) {
	const calls: Call[] = [];
	const factory = (roomId: string) => async (name: string, args: Record<string, unknown> = {}) => {
		calls.push({ roomId, name, args });
		const response = responses[name];
		if (response instanceof Error) throw response;
		if (typeof response === 'function') {
			return (response as (call: Call) => unknown)({ roomId, name, args });
		}
		return response ?? {};
	};
	return { calls, factory };
}

describe('AppDbMailConnectionRepository', () => {
	it('reads one record through the unique roomId index and strips Hub metadata', async () => {
		const { calls, factory } = caller({
			'mcpapp.db.query': { records: [{ _id: 'row-a', _createdAt: 'ignored', ...connection }] },
		});

		await expect(new AppDbMailConnectionRepository(factory).read(scope)).resolves.toEqual(connection);
		expect(calls).toEqual([
			{
				roomId: 'room-a',
				name: 'mcpapp.db.query',
				args: {
					collection: MAIL_CONNECTION_COLLECTION,
					where: [{ field: 'roomId', op: '==', value: 'room-a' }],
					limit: 1,
				},
			},
		]);
	});

	it('returns null only when the room collection is missing', async () => {
		const { factory } = caller({
			'mcpapp.db.query': new Error(`Collection "${MAIL_CONNECTION_COLLECTION}" not found`),
		});
		await expect(new AppDbMailConnectionRepository(factory).read(scope)).resolves.toBeNull();
	});

	it('accepts a verified mail actor carrying userId as a MailScope superset', async () => {
		const { factory } = caller({
			'mcpapp.db.query': new Error('Collection not found'),
		});

		await expect(
			new AppDbMailConnectionRepository(factory).read({ ...scope, userId: 'user-a' }),
		).resolves.toBeNull();
	});

	it('propagates permission failures instead of treating them as no configuration', async () => {
		const { factory } = caller({ 'mcpapp.db.query': new Error('Insufficient scope: db:read') });
		await expect(new AppDbMailConnectionRepository(factory).read(scope)).rejects.toThrow(/insufficient scope/i);
	});

	it('rejects a foreign-room row returned by the Hub', async () => {
		const { factory } = caller({
			'mcpapp.db.query': { records: [{ _id: 'row-b', ...connection, roomId: 'room-b' }] },
		});
		await expect(new AppDbMailConnectionRepository(factory).read(scope)).rejects.toThrow(/room/i);
	});

	it('registers the room collection lazily and creates a whitelisted record', async () => {
		let registered = false;
		const { calls, factory } = caller({
			'mcpapp.db.query': () => {
				if (!registered) throw new Error(`Collection "${MAIL_CONNECTION_COLLECTION}" not found`);
				return { records: [] };
			},
			'mcpapp.db.registerCollection': () => {
				registered = true;
				return {};
			},
			'mcpapp.db.create': {},
		});
		const repository = new AppDbMailConnectionRepository(factory);

		await repository.write(scope, { ...connection, ...({ accessToken: 'secret' } as object) });

		const register = calls.find(call => call.name === 'mcpapp.db.registerCollection');
		expect(register?.args).toMatchObject({
			collection: MAIL_CONNECTION_COLLECTION,
			scope: 'room',
			indexes: MAIL_CONNECTION_INDEXES,
		});
		const create = calls.find(call => call.name === 'mcpapp.db.create');
		expect(create?.args.data).toEqual(connection);
	});

	it('updates the existing bounded record instead of creating an array or second row', async () => {
		const { calls, factory } = caller({
			'mcpapp.db.query': { records: [{ _id: 'row-a', ...connection }] },
			'mcpapp.db.update': {},
		});

		await new AppDbMailConnectionRepository(factory).write(scope, {
			...connection,
			provider: 'microsoft',
			connectionId: 'connection-b',
			senderEmail: 'sender-b@example.com',
		});

		expect(calls.map(call => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.update']);
		expect(calls[1].args.id).toBe('row-a');
	});

	it('does not swallow a non-duplicate create failure', async () => {
		const { calls, factory } = caller({
			'mcpapp.db.query': { records: [] },
			'mcpapp.db.create': new Error('Insufficient scope: db:write'),
		});
		await expect(new AppDbMailConnectionRepository(factory).write(scope, connection)).rejects.toThrow(
			/insufficient scope/i,
		);
		expect(calls.map(call => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
	});
});
