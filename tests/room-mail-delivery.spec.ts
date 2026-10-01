import { describe, expect, it } from 'vitest';

import { ConnectionMailQueue } from '../src/services/mail/connection-mail-queue';
import type {
	MailConnection,
	MailProvider,
	MailProviderAdapter,
	MailReceipt,
	MailScope,
} from '../src/services/mail/mail-contracts';
import type { MailConnectionRepository } from '../src/services/mail/mail-connection-repository';
import { MailRoomLock } from '../src/services/mail/mail-room-lock';
import type { ConnectionTags, NangoGateway, ProxyRequest, ProxyResponse } from '../src/services/mail/nango-gateway';
import { RoomMailDeliveryGateway } from '../src/services/mail/room-mail-delivery-gateway';

const message = {
	toName: 'Candidate',
	toEmail: 'candidate@example.com',
	subject: 'Interview',
	htmlContent: '<p>Hello</p>',
};

function connection(roomId: string, provider: MailProvider, id: string, revision: string): MailConnection {
	return {
		roomId,
		provider,
		connectionId: id,
		senderEmail: `${roomId}@example.com`,
		status: 'connected',
		revision,
		updatedBy: 'user-a',
		updatedAt: '2026-09-30T01:00:00.000Z',
	};
}

class MemoryRepository implements MailConnectionRepository {
	readonly rows = new Map<string, MailConnection>();

	async read(scope: MailScope): Promise<MailConnection | null> {
		return this.rows.get(scope.roomId) ?? null;
	}

	async write(scope: MailScope, value: MailConnection): Promise<void> {
		this.rows.set(scope.roomId, value);
	}
}

class Broker implements NangoGateway {
	async createSession(): Promise<never> {
		throw new Error('unused');
	}

	async findConnection(scope: MailScope, provider: MailProvider, connectionId: string) {
		const tags: ConnectionTags = {
			installation_id: scope.installationId,
			room_id: scope.roomId,
			actor_id: 'user-a',
			attempt_id: 'attempt-a',
		};
		return {
			connectionId,
			integrationId: provider === 'google' ? 'hr-google-mail' : 'hr-microsoft-mail',
			tags,
			authError: false,
		};
	}

	async proxy(_request: ProxyRequest): Promise<ProxyResponse> {
		throw new Error('unused');
	}

	async deleteConnection(): Promise<void> {}
}

function adapters(send: (connection: MailConnection) => Promise<MailReceipt>) {
	const make = (): MailProviderAdapter => ({
		identity: async connectionId => `${connectionId.startsWith('a') ? 'room-a' : 'room-b'}@example.com`,
		send: async value => send(value),
	});
	return { google: make(), microsoft: make() } as const;
}

describe('RoomMailDeliveryGateway', () => {
	it('routes identical content in two Rooms to their independent connections', async () => {
		const repository = new MemoryRepository();
		repository.rows.set('room-a', connection('room-a', 'google', 'a-connection', 'revision-a'));
		repository.rows.set('room-b', connection('room-b', 'microsoft', 'b-connection', 'revision-b'));
		const providerCalls: string[] = [];
		const shared = {
			broker: new Broker(),
			adapters: adapters(async value => {
				providerCalls.push(value.connectionId);
				return {
					status: 'accepted',
					provider: value.provider,
					senderEmail: value.senderEmail,
					connectionRevision: value.revision,
				};
			}),
			queue: new ConnectionMailQueue(),
			lock: new MailRoomLock(),
		};
		const roomA = new RoomMailDeliveryGateway(
			{ installationId: 'installation-a', roomId: 'room-a' }, repository, shared.broker, shared.adapters, shared.queue, shared.lock,
		);
		const roomB = new RoomMailDeliveryGateway(
			{ installationId: 'installation-a', roomId: 'room-b' }, repository, shared.broker, shared.adapters, shared.queue, shared.lock,
		);

		await Promise.all([roomA.queueMail(message), roomB.queueMail(message)]);
		expect(providerCalls.sort()).toEqual(['a-connection', 'b-connection']);
	});

	it('joins the same pending message within one captured connection revision', async () => {
		const repository = new MemoryRepository();
		repository.rows.set('room-a', connection('room-a', 'google', 'a-connection', 'revision-a'));
		let release = (): void => undefined;
		let markStarted = (): void => undefined;
		const started = new Promise<void>(resolve => { markStarted = resolve; });
		let calls = 0;
		const gateway = new RoomMailDeliveryGateway(
			{ installationId: 'installation-a', roomId: 'room-a' },
			repository,
			new Broker(),
			adapters(async value => {
				calls += 1;
				markStarted();
				await new Promise<void>(resolve => {
					release = resolve;
				});
				return { status: 'accepted', provider: value.provider, senderEmail: value.senderEmail, connectionRevision: value.revision };
			}),
			new ConnectionMailQueue(),
			new MailRoomLock(),
		);
		const first = gateway.queueMail(message);
		const joined = gateway.queueMail(message);
		await started;
		release();
		await Promise.all([first, joined]);
		expect(calls).toBe(1);
	});

	it('rejects a queued request when the Room swaps revision before dispatch', async () => {
		const repository = new MemoryRepository();
		repository.rows.set('room-a', connection('room-a', 'google', 'a-connection', 'revision-a'));
		let release = (): void => undefined;
		let markStarted = (): void => undefined;
		const started = new Promise<void>(resolve => { markStarted = resolve; });
		const subjects: string[] = [];
		const gateway = new RoomMailDeliveryGateway(
			{ installationId: 'installation-a', roomId: 'room-a' },
			repository,
			new Broker(),
			adapters(async value => {
				subjects.push(value.revision);
				if (subjects.length === 1) {
					markStarted();
					await new Promise<void>(resolve => { release = resolve; });
				}
				return { status: 'accepted', provider: value.provider, senderEmail: value.senderEmail, connectionRevision: value.revision };
			}),
			new ConnectionMailQueue(),
			new MailRoomLock(),
		);
		const first = gateway.queueMail(message);
		await started;
		const queuedBeforeSwap = gateway.queueMail({ ...message, subject: 'Second' });
		repository.rows.set('room-a', connection('room-a', 'google', 'new-connection', 'revision-b'));
		release();
		await first;
		await expect(queuedBeforeSwap).rejects.toMatchObject({ code: 'MAIL_CONNECTION_CHANGED' });
		expect(subjects).toEqual(['revision-a']);
	});
});
