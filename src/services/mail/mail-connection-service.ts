import type {
	BeginResult,
	ConnectionView,
	MailActor,
	MailConnection,
	MailProvider,
	MailProviderAdapter,
	MailScope,
} from './mail-contracts';
import { MailError } from './mail-errors';
import type { MailConnectionRepository } from './mail-connection-repository';
import type { MailRoomLock } from './mail-room-lock';
import { NANGO_INTEGRATION_IDS, type BrokerConnection, type ConnectionTags, type NangoGateway } from './nango-gateway';

const ATTEMPT_TTL_MS = 10 * 60_000;
const CONTROL_TIMEOUT_MS = 15_000;
const MAX_PENDING_ATTEMPTS = 1000;
const MAX_PENDING_CLEANUPS = 1000;

interface PendingAttempt {
	attemptId: string;
	actor: MailActor;
	provider: MailProvider;
	expectedRevision: string | null;
	expiresAtMs: number;
	cleanupReserved: boolean;
}

interface PendingCleanup {
	provider: MailProvider;
	connectionId: string;
}

export interface MailConnectionServiceOptions {
	repository: MailConnectionRepository;
	broker: NangoGateway;
	adapters: Readonly<Record<MailProvider, MailProviderAdapter>>;
	lock: MailRoomLock;
	now?: () => number;
	uuid?: () => string;
	maxPendingCleanups?: number;
}

function namespace(scope: MailScope): string {
	return `${scope.installationId}\u0000${scope.roomId}`;
}

function sameRevision(connection: MailConnection | null, expectedRevision: string | null): boolean {
	return (connection?.revision ?? null) === expectedRevision;
}

function tagsMatch(connection: BrokerConnection, attempt: PendingAttempt): boolean {
	const expected: ConnectionTags = {
		installation_id: attempt.actor.installationId,
		room_id: attempt.actor.roomId,
		actor_id: attempt.actor.userId,
		attempt_id: attempt.attemptId,
	};
	return (
		connection.tags.installation_id === expected.installation_id &&
		connection.tags.room_id === expected.room_id &&
		connection.tags.actor_id === expected.actor_id &&
		connection.tags.attempt_id === expected.attempt_id
	);
}

export class MailConnectionService {
	private readonly pendingAttempts = new Map<string, PendingAttempt>();
	private readonly pendingCleanups = new Map<string, PendingCleanup>();
	private readonly cleanupReservations = new Set<string>();
	private readonly now: () => number;
	private readonly uuid: () => string;
	private readonly maxPendingCleanups: number;

	constructor(private readonly options: MailConnectionServiceOptions) {
		this.now = options.now ?? Date.now;
		this.uuid = options.uuid ?? crypto.randomUUID;
		this.maxPendingCleanups = options.maxPendingCleanups ?? MAX_PENDING_CLEANUPS;
	}

	async get(actor: MailActor): Promise<ConnectionView> {
		return this.options.lock.run(actor, async () => {
			await this.retryCleanup(actor);
			const connection = await this.options.repository.read(actor);
			if (!connection || connection.status === 'disconnected') return this.view(actor, connection);

			const brokerConnection = await this.options.broker.findConnection(
				actor,
				connection.provider,
				connection.connectionId,
				CONTROL_TIMEOUT_MS,
			);
			if (!brokerConnection || brokerConnection.authError) {
				return this.view(actor, { ...connection, status: 'error' });
			}
			try {
				const sender = await this.options.adapters[connection.provider].identity(
					connection.connectionId,
					CONTROL_TIMEOUT_MS,
				);
				if (sender.toLowerCase() !== connection.senderEmail.toLowerCase()) {
					return this.view(actor, { ...connection, status: 'error' });
				}
			} catch (error) {
				if (error instanceof MailError && error.code === 'MAIL_RECONNECT_REQUIRED') {
					return this.view(actor, { ...connection, status: 'error' });
				}
				throw error;
			}
			return this.view(actor, connection);
		});
	}

	async begin(actor: MailActor, provider: MailProvider, expectedRevision: string | null): Promise<BeginResult> {
		return this.options.lock.run(actor, async () => {
			this.purgeExpiredAttempts();
			await this.retryCleanup(actor);
			const key = namespace(actor);
			if (this.pendingCleanups.has(key)) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			const current = await this.options.repository.read(actor);
			if (!sameRevision(current, expectedRevision)) throw new MailError('MAIL_CONNECTION_CHANGED');
			const cleanupReserved = Boolean(current?.connectionId && current.status !== 'disconnected');
			if (
				cleanupReserved
				&& !this.cleanupReservations.has(key)
				&& this.pendingCleanups.size + this.cleanupReservations.size >= this.maxPendingCleanups
			) throw new MailError('MAIL_QUEUE_FULL');
			if (!this.pendingAttempts.has(key) && this.pendingAttempts.size >= MAX_PENDING_ATTEMPTS) {
				throw new MailError('MAIL_QUEUE_FULL');
			}

			const attemptId = this.uuid();
			const session = await this.options.broker.createSession(provider, {
				installation_id: actor.installationId,
				room_id: actor.roomId,
				actor_id: actor.userId,
				attempt_id: attemptId,
			});
			const providerExpiry = Date.parse(session.expiresAt);
			if (!Number.isFinite(providerExpiry)) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			const expiresAtMs = Math.min(providerExpiry, this.now() + ATTEMPT_TTL_MS);
			if (cleanupReserved) this.cleanupReservations.add(key);
			this.pendingAttempts.set(key, {
				attemptId, actor: { ...actor }, provider, expectedRevision, expiresAtMs, cleanupReserved,
			});
			return { ...session, attemptId, expiresAt: new Date(expiresAtMs).toISOString() };
		});
	}

	async complete(actor: MailActor, attemptId: string, candidateConnectionId: string): Promise<ConnectionView> {
		return this.options.lock.run(actor, async () => {
			const key = namespace(actor);
			const attempt = this.pendingAttempts.get(key);
			if (!attempt || attempt.attemptId !== attemptId || attempt.actor.userId !== actor.userId) {
				throw new MailError('MAIL_CONNECT_EXPIRED');
			}
			if (this.now() >= attempt.expiresAtMs) {
				this.pendingAttempts.delete(key);
				this.cleanupReservations.delete(key);
				throw new MailError('MAIL_CONNECT_EXPIRED');
			}

			const candidate = await this.options.broker.findConnection(
				actor,
				attempt.provider,
				candidateConnectionId,
				CONTROL_TIMEOUT_MS,
			);
			if (!candidate || candidate.authError || !tagsMatch(candidate, attempt)) {
				throw new MailError('MAIL_RECONNECT_REQUIRED');
			}
			const senderEmail = await this.options.adapters[attempt.provider].identity(
				candidateConnectionId,
				CONTROL_TIMEOUT_MS,
			);
			if (this.now() >= attempt.expiresAtMs) {
				this.pendingAttempts.delete(key);
				this.cleanupReservations.delete(key);
				throw new MailError('MAIL_CONNECT_EXPIRED');
			}

			const current = await this.options.repository.read(actor);
			if (!sameRevision(current, attempt.expectedRevision)) throw new MailError('MAIL_CONNECTION_CHANGED');
			const next: MailConnection = {
				roomId: actor.roomId,
				provider: attempt.provider,
				connectionId: candidateConnectionId,
				senderEmail,
				status: 'connected',
				revision: this.uuid(),
				updatedBy: actor.userId,
				updatedAt: new Date(this.now()).toISOString(),
			};
			const previous = current?.connectionId
				&& current.status !== 'disconnected'
				&& current.connectionId !== next.connectionId
				? { provider: current.provider, connectionId: current.connectionId }
				: null;
			if (previous) this.reserveCleanup(actor, previous);
			try {
				await this.options.repository.write(actor, next);
			} catch (error) {
				if (previous) this.pendingCleanups.delete(key);
				if (attempt.cleanupReserved) this.cleanupReservations.add(key);
				throw error;
			}
			this.pendingAttempts.delete(key);
			this.cleanupReservations.delete(key);

			if (previous) await this.deleteOrRemember(actor, previous.provider, previous.connectionId);
			return this.view(actor, next);
		});
	}

	async disconnect(actor: MailActor, expectedRevision: string): Promise<ConnectionView> {
		return this.options.lock.run(actor, async () => {
			await this.retryCleanup(actor);
			if (this.pendingCleanups.has(namespace(actor))) {
				throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			}
			const current = await this.options.repository.read(actor);
			if (!current || current.revision !== expectedRevision) throw new MailError('MAIL_CONNECTION_CHANGED');
			const disconnected: MailConnection = {
				...current,
				status: 'disconnected',
				revision: this.uuid(),
				updatedBy: actor.userId,
				updatedAt: new Date(this.now()).toISOString(),
			};
			const cleanup = { provider: current.provider, connectionId: current.connectionId };
			const hadCleanupReservation = this.cleanupReservations.has(namespace(actor));
			this.reserveCleanup(actor, cleanup);
			try {
				await this.options.repository.write(actor, disconnected);
			} catch (error) {
				this.pendingCleanups.delete(namespace(actor));
				if (hadCleanupReservation) this.cleanupReservations.add(namespace(actor));
				throw error;
			}
			this.pendingAttempts.delete(namespace(actor));
			await this.deleteOrRemember(actor, cleanup.provider, cleanup.connectionId);
			return this.view(actor, disconnected);
		});
	}

	private view(scope: MailScope, connection: MailConnection | null): ConnectionView {
		return {
			connection: connection
				? {
					roomId: connection.roomId,
					provider: connection.provider,
					senderEmail: connection.senderEmail,
					status: connection.status,
					revision: connection.revision,
					updatedAt: connection.updatedAt,
				}
				: null,
			cleanupPending: this.pendingCleanups.has(namespace(scope)),
		};
	}

	private async deleteOrRemember(scope: MailScope, provider: MailProvider, connectionId: string): Promise<void> {
		const key = namespace(scope);
		try {
			const connection = await this.options.broker.findConnection(scope, provider, connectionId, CONTROL_TIMEOUT_MS);
			if (connection && this.ownedBy(connection, scope, provider, connectionId)) {
				await this.options.broker.deleteConnection(provider, connectionId);
			}
			this.pendingCleanups.delete(key);
		} catch {
			this.pendingCleanups.set(key, { provider, connectionId });
		}
	}

	private async retryCleanup(scope: MailScope): Promise<void> {
		const key = namespace(scope);
		const cleanup = this.pendingCleanups.get(key);
		if (!cleanup) return;
		try {
			const connection = await this.options.broker.findConnection(
				scope,
				cleanup.provider,
				cleanup.connectionId,
				CONTROL_TIMEOUT_MS,
			);
			if (connection && this.ownedBy(connection, scope, cleanup.provider, cleanup.connectionId)) {
				await this.options.broker.deleteConnection(cleanup.provider, cleanup.connectionId);
			}
			this.pendingCleanups.delete(key);
		} catch {
			// The connection remains locally inactive; the bounded registry exposes cleanupPending.
		}
	}

	private reserveCleanup(scope: MailScope, cleanup: PendingCleanup): void {
		const key = namespace(scope);
		const reserved = this.cleanupReservations.delete(key);
		if (
			!reserved
			&& !this.pendingCleanups.has(key)
			&& this.pendingCleanups.size + this.cleanupReservations.size >= this.maxPendingCleanups
		) {
			throw new MailError('MAIL_QUEUE_FULL');
		}
		this.pendingCleanups.set(key, cleanup);
	}

	private ownedBy(
		connection: BrokerConnection,
		scope: MailScope,
		provider: MailProvider,
		connectionId: string,
	): boolean {
		return connection.connectionId === connectionId
			&& connection.integrationId === NANGO_INTEGRATION_IDS[provider]
			&& connection.tags.installation_id === scope.installationId
			&& connection.tags.room_id === scope.roomId;
	}

	private purgeExpiredAttempts(): void {
		const currentTime = this.now();
		for (const [key, attempt] of this.pendingAttempts) {
			if (currentTime >= attempt.expiresAtMs) {
				this.pendingAttempts.delete(key);
				if (attempt.cleanupReserved) this.cleanupReservations.delete(key);
			}
		}
	}
}
