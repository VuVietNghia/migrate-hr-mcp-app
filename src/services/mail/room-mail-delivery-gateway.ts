import { createHash } from 'node:crypto';

import type {
	MailConnection,
	MailMessage,
	MailProvider,
	MailProviderAdapter,
	MailReceipt,
	MailScope,
} from './mail-contracts';
import { parseMailMessage } from './mail-contracts';
import { MailError } from './mail-errors';
import type { MailConnectionRepository } from './mail-connection-repository';
import type { MailRoomLock } from './mail-room-lock';
import { NANGO_INTEGRATION_IDS, type NangoGateway } from './nango-gateway';
import type { ConnectionMailQueue } from './connection-mail-queue';

const SEND_DEADLINE_MS = 15_000;

export interface MailDeliveryGateway {
	queueMail(message: MailMessage): Promise<MailReceipt>;
}

function keyFor(scope: MailScope, connection: MailConnection): string {
	return `${scope.installationId}\u0000${scope.roomId}\u0000${connection.provider}\u0000${connection.connectionId}`;
}

function fingerprint(scope: MailScope, connection: MailConnection, message: MailMessage): string {
	const hash = createHash('sha256');
	for (const value of [
		scope.installationId,
		scope.roomId,
		connection.provider,
		connection.connectionId,
		connection.revision,
		message.toName,
		message.toEmail,
		message.subject,
		message.htmlContent,
	]) {
		hash.update(`${value.length}:${value}`);
	}
	return hash.digest('hex');
}

function requireActive(connection: MailConnection | null): MailConnection {
	if (!connection || connection.status === 'disconnected') throw new MailError('MAIL_NOT_CONFIGURED');
	if (connection.status === 'error') throw new MailError('MAIL_RECONNECT_REQUIRED');
	return connection;
}

export class RoomMailDeliveryGateway implements MailDeliveryGateway {
	constructor(
		private readonly scope: MailScope,
		private readonly repository: MailConnectionRepository,
		private readonly broker: NangoGateway,
		private readonly adapters: Readonly<Record<MailProvider, MailProviderAdapter>>,
		private readonly queue: ConnectionMailQueue,
		private readonly lock: MailRoomLock,
		private readonly now: () => number = Date.now,
	) {}

	async queueMail(rawMessage: MailMessage): Promise<MailReceipt> {
		const deadline = this.now() + SEND_DEADLINE_MS;
		const message = parseMailMessage(rawMessage);
		const captured = requireActive(await this.repository.read(this.scope));
		this.remaining(deadline);
		return this.queue.enqueue(
			keyFor(this.scope, captured),
			fingerprint(this.scope, captured, message),
			deadline,
			() => this.dispatch(captured, message, deadline),
		);
	}

	private async dispatch(
		captured: MailConnection,
		message: MailMessage,
		deadline: number,
	): Promise<MailReceipt> {
		return this.lock.run(this.scope, async () => {
			let remainingMs = this.remaining(deadline);
			const current = requireActive(await this.repository.read(this.scope));
			remainingMs = this.remaining(deadline);
			if (
				current.revision !== captured.revision ||
				current.connectionId !== captured.connectionId ||
				current.provider !== captured.provider
			) {
				throw new MailError('MAIL_CONNECTION_CHANGED');
			}

			const brokerConnection = await this.broker.findConnection(
				this.scope,
				current.provider,
				current.connectionId,
				remainingMs,
			);
			remainingMs = this.remaining(deadline);
			if (
				!brokerConnection ||
				brokerConnection.authError ||
				brokerConnection.integrationId !== NANGO_INTEGRATION_IDS[current.provider] ||
				brokerConnection.tags.installation_id !== this.scope.installationId ||
				brokerConnection.tags.room_id !== this.scope.roomId
			) {
				throw new MailError('MAIL_RECONNECT_REQUIRED');
			}

			const sender = await this.adapters[current.provider].identity(current.connectionId, remainingMs);
			remainingMs = this.remaining(deadline);
			if (sender.toLowerCase() !== current.senderEmail.toLowerCase()) {
				throw new MailError('MAIL_RECONNECT_REQUIRED');
			}
			return this.adapters[current.provider].send(current, message, remainingMs, sender);
		});
	}

	private remaining(deadline: number): number {
		const value = deadline - this.now();
		if (value <= 0) throw new MailError('MAIL_TIMEOUT_BEFORE_SEND');
		return value;
	}
}
