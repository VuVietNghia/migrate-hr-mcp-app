import { describe, expect, it } from 'vitest';

import type {
	MailActor,
	MailConnection,
	MailProvider,
	MailProviderAdapter,
	MailScope,
} from '../src/services/mail/mail-contracts';
import type { MailConnectionRepository } from '../src/services/mail/mail-connection-repository';
import { MailConnectionService } from '../src/services/mail/mail-connection-service';
import { MailRoomLock } from '../src/services/mail/mail-room-lock';
import type {
	BrokerConnection,
	ConnectionTags,
	NangoGateway,
	ProxyRequest,
	ProxyResponse,
} from '../src/services/mail/nango-gateway';

const actor: MailActor = { installationId: 'installation-a', roomId: 'room-a', userId: 'user-a' };

class MemoryRepository implements MailConnectionRepository {
	connection: MailConnection | null = null;
	writeCount = 0;
	writeError: Error | null = null;

	async read(scope: MailScope): Promise<MailConnection | null> {
		if (this.connection && this.connection.roomId !== scope.roomId) throw new Error('foreign room');
		return this.connection;
	}

	async write(scope: MailScope, connection: MailConnection): Promise<void> {
		if (scope.roomId !== connection.roomId) throw new Error('foreign room');
		if (this.writeError) throw this.writeError;
		this.writeCount += 1;
		this.connection = connection;
	}
}

class FakeBroker implements NangoGateway {
	connection: BrokerConnection | null = null;
	deleteError: Error | null = null;
	readonly deleted: string[] = [];
	createSessionCount = 0;

	async createSession(provider: MailProvider, tags: ConnectionTags) {
		this.createSessionCount += 1;
		this.connection = {
			connectionId: 'candidate-a',
			integrationId: provider === 'google' ? 'hr-google-mail' : 'hr-microsoft-mail',
			tags,
			authError: false,
		};
		return {
			sessionToken: 'session-token',
			connectLink: 'https://connect.nango.dev/?session_token=short-lived',
			expiresAt: '2026-09-30T01:10:00.000Z',
		};
	}

	async findConnection(): Promise<BrokerConnection | null> {
		return this.connection;
	}

	async findConnectionForAttempt(): Promise<BrokerConnection | null> {
		return this.connection;
	}

	async proxy(_request: ProxyRequest): Promise<ProxyResponse> {
		throw new Error('unused');
	}

	async deleteConnection(_provider: MailProvider, connectionId: string): Promise<void> {
		if (this.deleteError) throw this.deleteError;
		this.deleted.push(connectionId);
	}
}

function adapter(identity = 'sender@example.com'): MailProviderAdapter {
	return {
		identity: async () => identity,
		send: async () => {
			throw new Error('unused');
		},
	};
}

function fixture(now = Date.parse('2026-09-30T01:00:00.000Z'), maxPendingCleanups?: number) {
	const repository = new MemoryRepository();
	const broker = new FakeBroker();
	let id = 0;
	const service = new MailConnectionService({
		repository,
		broker,
		adapters: { google: adapter(), microsoft: adapter() },
		lock: new MailRoomLock(),
		now: () => now,
		uuid: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
		maxPendingCleanups,
	});
	return { broker, repository, service };
}

describe('MailConnectionService', () => {
	it('uses the default runtime UUID generator without losing its receiver', async () => {
		const repository = new MemoryRepository();
		const service = new MailConnectionService({
			repository,
			broker: new FakeBroker(),
			adapters: { google: adapter(), microsoft: adapter() },
			lock: new MailRoomLock(),
			now: () => Date.parse('2026-09-30T01:00:00.000Z'),
		});

		await expect(service.begin(actor, 'google', null)).resolves.toMatchObject({
			attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
		});
	});

	it('allows a regular verified Room member to connect a mailbox', async () => {
		const { repository, service } = fixture();
		const started = await service.begin(actor, 'google', null);
		const view = await service.complete(actor, started.attemptId, 'candidate-a');

		expect(view.cleanupPending).toBe(false);
		expect(view.connection).toMatchObject({
			roomId: 'room-a',
			provider: 'google',
			senderEmail: 'sender@example.com',
			status: 'connected',
		});
		expect(view.connection).not.toHaveProperty('connectionId');
		expect(view.connection).not.toHaveProperty('updatedBy');
		expect(repository.writeCount).toBe(1);
	});

	it('returns pending until the connect-link connection exists, then completes the exact tagged attempt', async () => {
		const { broker, repository, service } = fixture();
		const started = await service.begin(actor, 'google', null);
		const candidate = broker.connection;
		broker.connection = null;

		await expect(service.poll(actor, started.attemptId)).resolves.toBeNull();
		expect(repository.writeCount).toBe(0);

		broker.connection = candidate;
		await expect(service.poll(actor, started.attemptId)).resolves.toMatchObject({
			connection: { provider: 'google', senderEmail: 'sender@example.com' },
		});
		expect(repository.writeCount).toBe(1);
	});

	it('rejects a candidate tagged for another Room without writing', async () => {
		const { broker, repository, service } = fixture();
		const started = await service.begin(actor, 'google', null);
		broker.connection = { ...broker.connection!, tags: { ...broker.connection!.tags, room_id: 'room-b' } };

		await expect(service.complete(actor, started.attemptId, 'candidate-a')).rejects.toMatchObject({
			code: 'MAIL_RECONNECT_REQUIRED',
		});
		expect(repository.writeCount).toBe(0);
	});

	it('rejects an expired attempt and keeps the old mailbox', async () => {
		let now = Date.parse('2026-09-30T01:00:00.000Z');
		const { repository, service } = fixture(now);
		repository.connection = {
			roomId: 'room-a',
			provider: 'google',
			connectionId: 'old',
			senderEmail: 'old@example.com',
			status: 'connected',
			revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z',
			updatedBy: 'user-a',
		};
		const dynamic = new MailConnectionService({
			repository,
			broker: new FakeBroker(),
			adapters: { google: adapter(), microsoft: adapter() },
			lock: new MailRoomLock(),
			now: () => now,
			uuid: () => '00000000-0000-4000-8000-000000000001',
		});
		const started = await dynamic.begin(actor, 'google', repository.connection.revision);
		now += 11 * 60_000;

		await expect(dynamic.complete(actor, started.attemptId, 'candidate-a')).rejects.toMatchObject({
			code: 'MAIL_CONNECT_EXPIRED',
		});
		expect(repository.connection.connectionId).toBe('old');
	});

	it('allows only one concurrent completion for the same revision and attempt', async () => {
		const { repository, service } = fixture();
		const started = await service.begin(actor, 'google', null);
		const results = await Promise.allSettled([
			service.complete(actor, started.attemptId, 'candidate-a'),
			service.complete(actor, started.attemptId, 'candidate-a'),
		]);

		expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
		expect(repository.writeCount).toBe(1);
	});

	it('makes the mailbox inactive even when remote cleanup fails', async () => {
		const { broker, repository, service } = fixture();
		repository.connection = {
			roomId: 'room-a',
			provider: 'microsoft',
			connectionId: 'old',
			senderEmail: 'old@example.com',
			status: 'connected',
			revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z',
			updatedBy: 'user-a',
		};
		broker.deleteError = new Error('nango token=secret');
		broker.connection = {
			connectionId: 'old',
			integrationId: 'hr-microsoft-mail',
			tags: { installation_id: 'installation-a', room_id: 'room-a', actor_id: 'user-a', attempt_id: 'old' },
			authError: false,
		};

		const view = await service.disconnect(actor, repository.connection.revision);
		expect(view.connection?.status).toBe('disconnected');
		expect(view.cleanupPending).toBe(true);
		expect(repository.connection.status).toBe('disconnected');
	});

	it('never deletes a connection whose broker tags belong to another Room', async () => {
		const { broker, repository, service } = fixture();
		repository.connection = {
			roomId: 'room-a', provider: 'google', connectionId: 'foreign', senderEmail: 'x@example.com',
			status: 'connected', revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z', updatedBy: 'user-a',
		};
		broker.connection = {
			connectionId: 'foreign', integrationId: 'hr-google-mail',
			tags: { installation_id: 'installation-a', room_id: 'room-b', actor_id: 'user-b', attempt_id: 'foreign' },
			authError: false,
		};

		await service.disconnect(actor, repository.connection.revision);
		expect(broker.deleted).toEqual([]);
	});

	it('does not overwrite a pending cleanup when another disconnect starts', async () => {
		const { broker, repository, service } = fixture();
		repository.connection = {
			roomId: 'room-a', provider: 'google', connectionId: 'old-a', senderEmail: 'a@example.com',
			status: 'connected', revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z', updatedBy: 'user-a',
		};
		broker.connection = {
			connectionId: 'old-a', integrationId: 'hr-google-mail',
			tags: { installation_id: 'installation-a', room_id: 'room-a', actor_id: 'user-a', attempt_id: 'old-a' },
			authError: false,
		};
		broker.deleteError = new Error('temporary failure');
		await service.disconnect(actor, repository.connection.revision);

		repository.connection = {
			roomId: 'room-a', provider: 'microsoft', connectionId: 'new-b', senderEmail: 'b@example.com',
			status: 'connected', revision: '3d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:01:00.000Z', updatedBy: 'user-a',
		};
		await expect(service.disconnect(actor, repository.connection.revision)).rejects.toMatchObject({
			code: 'MAIL_CONFIGURATION_UNAVAILABLE',
		});
		expect(repository.connection).toMatchObject({ connectionId: 'new-b', status: 'connected' });
	});

	it('checks cleanup capacity before creating a replacement Connect Session', async () => {
		const { broker, repository, service } = fixture(Date.parse('2026-09-30T01:00:00.000Z'), 1);
		repository.connection = {
			roomId: 'room-a', provider: 'google', connectionId: 'old-a', senderEmail: 'a@example.com',
			status: 'connected', revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z', updatedBy: 'user-a',
		};
		broker.connection = {
			connectionId: 'old-a', integrationId: 'hr-google-mail',
			tags: { installation_id: 'installation-a', room_id: 'room-a', actor_id: 'user-a', attempt_id: 'old-a' },
			authError: false,
		};
		broker.deleteError = new Error('temporary failure');
		await service.disconnect(actor, repository.connection.revision);

		const actorB: MailActor = { installationId: 'installation-a', roomId: 'room-b', userId: 'user-b' };
		repository.connection = {
			roomId: 'room-b', provider: 'microsoft', connectionId: 'old-b', senderEmail: 'b@example.com',
			status: 'connected', revision: '3d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:01:00.000Z', updatedBy: 'user-b',
		};
		await expect(service.begin(actorB, 'microsoft', repository.connection.revision)).rejects.toMatchObject({
			code: 'MAIL_QUEUE_FULL',
		});
		expect(broker.createSessionCount).toBe(0);
	});

	it('releases a cleanup reservation when OAuth completes with the existing connection id', async () => {
		const { broker, repository, service } = fixture(Date.parse('2026-09-30T01:00:00.000Z'), 1);
		repository.connection = {
			roomId: 'room-a', provider: 'google', connectionId: 'candidate-a', senderEmail: 'a@example.com',
			status: 'connected', revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z', updatedBy: 'user-a',
		};
		const started = await service.begin(actor, 'google', repository.connection.revision);
		await service.complete(actor, started.attemptId, 'candidate-a');

		const actorB: MailActor = { installationId: 'installation-a', roomId: 'room-b', userId: 'user-b' };
		repository.connection = {
			roomId: 'room-b', provider: 'microsoft', connectionId: 'old-b', senderEmail: 'b@example.com',
			status: 'connected', revision: '3d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:01:00.000Z', updatedBy: 'user-b',
		};
		await expect(service.begin(actorB, 'microsoft', repository.connection.revision)).resolves.toMatchObject({
			sessionToken: 'session-token',
		});
		expect(broker.createSessionCount).toBe(2);
	});

	it('restores an OAuth cleanup reservation when disconnect persistence fails', async () => {
		const { broker, repository, service } = fixture(Date.parse('2026-09-30T01:00:00.000Z'), 1);
		repository.connection = {
			roomId: 'room-a', provider: 'google', connectionId: 'old-a', senderEmail: 'a@example.com',
			status: 'connected', revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:00:00.000Z', updatedBy: 'user-a',
		};
		await service.begin(actor, 'microsoft', repository.connection.revision);
		repository.writeError = new Error('database unavailable');
		await expect(service.disconnect(actor, repository.connection.revision)).rejects.toThrow('database unavailable');

		repository.writeError = null;
		const actorB: MailActor = { installationId: 'installation-a', roomId: 'room-b', userId: 'user-b' };
		repository.connection = {
			roomId: 'room-b', provider: 'microsoft', connectionId: 'old-b', senderEmail: 'b@example.com',
			status: 'connected', revision: '3d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
			updatedAt: '2026-09-30T00:01:00.000Z', updatedBy: 'user-b',
		};
		await expect(service.begin(actorB, 'microsoft', repository.connection.revision)).rejects.toMatchObject({
			code: 'MAIL_QUEUE_FULL',
		});
		expect(broker.createSessionCount).toBe(1);
	});
});
