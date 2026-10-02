import { z } from 'zod';

import { type HubToolCaller, createRoomHubToolCaller } from '../hub-tool-caller';
import { isAlreadyRegisteredError } from '../payroll/payroll-schema';
import { parseMailConnection, type MailConnection, type MailScope } from './mail-contracts';
import {
	MAIL_CONNECTION_COLLECTION,
	MAIL_CONNECTION_FIELDS,
	MAIL_CONNECTION_INDEXES,
} from './mail-connection-schema';
import type { MailConnectionRepository } from './mail-connection-repository';

interface StoredMailConnection {
	id: string;
	connection: MailConnection;
}

const mailScopeSchema = z
	.object({
		installationId: z.string().min(1).max(256),
		roomId: z.string().min(1).max(64),
	})
	.strict();

function parseMailScope(scope: MailScope): MailScope {
	return mailScopeSchema.parse({
		installationId: scope.installationId,
		roomId: scope.roomId,
	});
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function selectConnection(value: unknown): MailConnection {
	const row = asRecord(value);
	return parseMailConnection({
		roomId: row.roomId,
		provider: row.provider,
		connectionId: row.connectionId,
		senderEmail: row.senderEmail,
		status: row.status,
		revision: row.revision,
		updatedBy: row.updatedBy,
		updatedAt: row.updatedAt,
	});
}

function selectWritePayload(connection: MailConnection): MailConnection {
	const raw = asRecord(connection);
	return selectConnection(raw);
}

function isCollectionMissingError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /collection/iu.test(message) && /not found/iu.test(message);
}

function isDuplicateKeyError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /E11000|duplicate key/iu.test(message);
}

export class AppDbMailConnectionRepository implements MailConnectionRepository {
	constructor(private readonly callerFactory: (roomId: string) => HubToolCaller = createRoomHubToolCaller) {}

	async read(scope: MailScope): Promise<MailConnection | null> {
		const safeScope = parseMailScope(scope);
		try {
			return (await this.findRecord(safeScope))?.connection ?? null;
		} catch (error) {
			if (isCollectionMissingError(error)) return null;
			throw error;
		}
	}

	async write(scope: MailScope, connection: MailConnection): Promise<void> {
		const safeScope = parseMailScope(scope);
		const safeConnection = selectWritePayload(connection);
		if (safeConnection.roomId !== safeScope.roomId) {
			throw new Error('Mail connection room does not match the verified scope.');
		}

		let current: StoredMailConnection | null;
		try {
			current = await this.findRecord(safeScope);
		} catch (error) {
			if (!isCollectionMissingError(error)) throw error;
			await this.registerCollection(safeScope);
			current = await this.findRecord(safeScope);
		}

		const call = this.callerFactory(safeScope.roomId);
		if (current) {
			await call('mcpapp.db.update', {
				collection: MAIL_CONNECTION_COLLECTION,
				id: current.id,
				data: safeConnection,
			});
			return;
		}

		try {
			await call('mcpapp.db.create', {
				collection: MAIL_CONNECTION_COLLECTION,
				data: safeConnection,
			});
		} catch (error) {
			if (!isDuplicateKeyError(error)) throw error;
			const raced = await this.findRecord(safeScope);
			if (!raced) throw error;
			await call('mcpapp.db.update', {
				collection: MAIL_CONNECTION_COLLECTION,
				id: raced.id,
				data: safeConnection,
			});
		}
	}

	private async findRecord(scope: MailScope): Promise<StoredMailConnection | null> {
		const response = asRecord(
			await this.callerFactory(scope.roomId)('mcpapp.db.query', {
				collection: MAIL_CONNECTION_COLLECTION,
				// Uses the unique { roomId: 1 } index.
				where: [{ field: 'roomId', op: '==', value: scope.roomId }],
				limit: 1,
			}),
		);
		const records = Array.isArray(response.records) ? response.records : [];
		if (records.length === 0) return null;
		const row = asRecord(records[0]);
		if (typeof row._id !== 'string' || !row._id) throw new Error('Mail connection record has no id.');
		const parsed = selectConnection(row);
		if (parsed.roomId !== scope.roomId) {
			throw new Error('Mail connection record belongs to a different room.');
		}
		return { id: row._id, connection: parsed };
	}

	private async registerCollection(scope: MailScope): Promise<void> {
		try {
			await this.callerFactory(scope.roomId)('mcpapp.db.registerCollection', {
				collection: MAIL_CONNECTION_COLLECTION,
				scope: 'room',
				fields: MAIL_CONNECTION_FIELDS,
				indexes: MAIL_CONNECTION_INDEXES,
			});
		} catch (error) {
			if (!isAlreadyRegisteredError(error)) throw error;
		}
	}
}
