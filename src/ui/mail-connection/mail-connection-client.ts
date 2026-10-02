import type { McpApp } from '@privos_ai/app-react';
import { z } from 'zod';

import {
	MAIL_CONNECTION_DISCOVERY_SENTINEL,
	parseMailConnectionSummary,
	type BeginResult,
	type ConnectionView,
	type MailProvider,
} from '../../services/mail/mail-contracts';
import { parseMailToolResult } from '../email-history/user-session-tracked-mail';

export type MailConnectionApp = Pick<McpApp, 'callServerTool'>;

const beginResultSchema = z.object({
	attemptId: z.string().min(1).max(128),
	sessionToken: z.string().min(1),
	connectLink: z.url().refine(link => new URL(link).origin === 'https://connect.nango.dev'),
	expiresAt: z.iso.datetime({ offset: true }),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function parseConnectionView(raw: unknown, roomId: string): ConnectionView {
	const value = asRecord(raw);
	const keys = Object.keys(value);
	if (keys.some(key => key !== 'connection' && key !== 'cleanupPending')) {
		throw new Error('Invalid mail connection response');
	}
	if (typeof value.cleanupPending !== 'boolean') throw new Error('Invalid mail connection response');
	const connection = value.connection === null ? null : parseMailConnectionSummary(value.connection);
	if (connection && connection.roomId !== roomId) throw new Error('Invalid Room mail connection');
	return { connection, cleanupPending: value.cleanupPending };
}

export class MailConnectionClient {
	constructor(
		private readonly app: MailConnectionApp,
		private readonly roomId: string,
	) {}

	/** Interactive call covered by the Room-scoped `bot:room:join` permission. */
	async joinCurrentRoom(): Promise<void> {
		await this.call('mcpapp.bot.joinCurrentRoom', {});
	}

	async get(): Promise<ConnectionView> {
		return this.callView('hrm.mail.connection.get', { roomId: this.roomId });
	}

	async begin(provider: MailProvider, expectedRevision: string | null): Promise<BeginResult> {
		const raw = await this.call('hrm.mail.connection.begin', {
			roomId: this.roomId,
			provider,
			expectedRevision,
		});
		return beginResultSchema.parse(raw);
	}

	async complete(attemptId: string, candidateConnectionId: string): Promise<ConnectionView> {
		return this.callView('hrm.mail.connection.complete', {
			roomId: this.roomId,
			attemptId,
			candidateConnectionId,
		});
	}

	async poll(attemptId: string): Promise<ConnectionView | null> {
		const raw = await this.call('hrm.mail.connection.complete', {
			roomId: this.roomId,
			attemptId,
			candidateConnectionId: MAIL_CONNECTION_DISCOVERY_SENTINEL,
		});
		return raw === null ? null : parseConnectionView(raw, this.roomId);
	}

	async disconnect(expectedRevision: string): Promise<ConnectionView> {
		return this.callView('hrm.mail.connection.disconnect', {
			roomId: this.roomId,
			expectedRevision,
		});
	}

	private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
		return parseMailToolResult(await this.app.callServerTool({ name, arguments: args }));
	}

	private async callView(name: string, args: Record<string, unknown>): Promise<ConnectionView> {
		return parseConnectionView(await this.call(name, args), this.roomId);
	}
}
