import type { VerifiedActor } from '@privos_ai/app-server';
import { z } from 'zod';

import { resolveActorRoom } from './payroll-tools';
import { resolveOwnMcpAppId } from './resolve-own-mcp-app-id';
import { MAIL_CONNECTION_DISCOVERY_SENTINEL } from './services/mail/mail-contracts';
import type { MailConnectionService } from './services/mail/mail-connection-service';
import { getMailConnectionService } from './services/mail/mail-runtime';
import { MailError, toPublicMailError } from './services/mail/mail-errors';

export const MAIL_CONNECTION_TOOL_NAMES = [
	'hrm.mail.connection.get',
	'hrm.mail.connection.begin',
	'hrm.mail.connection.complete',
	'hrm.mail.connection.disconnect',
] as const;

export type MailConnectionToolName = (typeof MAIL_CONNECTION_TOOL_NAMES)[number];

export const MAIL_CONNECTION_TOOL_DEFINITIONS = [
	{
		name: 'hrm.mail.connection.get',
		title: 'Get Room mail connection',
		description: 'Return the shared sender mailbox status for the verified Room.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' } } },
	},
	{
		name: 'hrm.mail.connection.begin',
		title: 'Begin Room mail connection',
		description: 'Create a restricted Nango Connect session for Google or Microsoft mail.',
		inputSchema: {
			type: 'object',
			properties: {
				roomId: { type: 'string' },
				provider: { type: 'string', enum: ['google', 'microsoft'] },
				expectedRevision: { type: ['string', 'null'] },
			},
			required: ['provider', 'expectedRevision'],
		},
	},
	{
		name: 'hrm.mail.connection.complete',
		title: 'Complete Room mail connection',
		description: 'Verify and activate the candidate Nango connection for the verified Room.',
		inputSchema: {
			type: 'object',
			properties: {
				roomId: { type: 'string' },
				attemptId: { type: 'string' },
				candidateConnectionId: { type: 'string' },
			},
			required: ['attemptId', 'candidateConnectionId'],
		},
	},
	{
		name: 'hrm.mail.connection.disconnect',
		title: 'Disconnect Room mail connection',
		description: 'Deactivate the shared sender mailbox and remove its Nango connection.',
		inputSchema: {
			type: 'object',
			properties: { roomId: { type: 'string' }, expectedRevision: { type: 'string' } },
			required: ['expectedRevision'],
		},
	},
] as const;

type MailConnectionApi = Pick<MailConnectionService, 'get' | 'begin' | 'complete' | 'poll' | 'disconnect'>;

let dependencies: {
	getService: () => MailConnectionApi;
	resolveInstallationId: () => Promise<string | undefined>;
} = {
	getService: getMailConnectionService,
	resolveInstallationId: resolveOwnMcpAppId,
};

export function setMailConnectionToolDependencies(next: typeof dependencies): void {
	dependencies = next;
}

export function isMailConnectionTool(name: unknown): name is MailConnectionToolName {
	return typeof name === 'string' && (MAIL_CONNECTION_TOOL_NAMES as readonly string[]).includes(name);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export async function handleMailConnectionTool(
	name: MailConnectionToolName,
	rawArgs: unknown,
	actor: VerifiedActor | undefined,
) {
	try {
		const args = asRecord(rawArgs);
		const roomId = resolveActorRoom(args, actor);
		const installationId = await dependencies.resolveInstallationId();
		if (!installationId) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
		const mailActor = { installationId, roomId, userId: actor!.userId };
		const service = dependencies.getService();
		let result: unknown;
		switch (name) {
			case 'hrm.mail.connection.get':
				z.object({ roomId: z.string().optional() }).strict().parse(args);
				result = await service.get(mailActor);
				break;
			case 'hrm.mail.connection.begin': {
				const input = z
					.object({
						roomId: z.string().optional(),
						provider: z.enum(['google', 'microsoft']),
						expectedRevision: z.uuid().nullable(),
					})
					.strict()
					.parse(args);
				result = await service.begin(mailActor, input.provider, input.expectedRevision);
				break;
			}
			case 'hrm.mail.connection.complete': {
				const input = z
					.object({
						roomId: z.string().optional(),
						attemptId: z.string().min(1).max(128),
						candidateConnectionId: z.string().min(1).max(256),
					})
					.strict()
					.parse(args);
				result = input.candidateConnectionId === MAIL_CONNECTION_DISCOVERY_SENTINEL
					? await service.poll(mailActor, input.attemptId)
					: await service.complete(mailActor, input.attemptId, input.candidateConnectionId);
				break;
			}
			case 'hrm.mail.connection.disconnect': {
				const input = z
					.object({ roomId: z.string().optional(), expectedRevision: z.uuid() })
					.strict()
					.parse(args);
				result = await service.disconnect(mailActor, input.expectedRevision);
				break;
			}
			default: {
				const exhaustive: never = name;
				throw new Error(`Unsupported mail connection tool: ${exhaustive}`);
			}
		}
		return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
	} catch (error) {
		const safe = toPublicMailError(error);
		console.error('[hrm.mail.connection] failed', { tool: name, code: safe.code });
		return { content: [{ type: 'text' as const, text: JSON.stringify(safe) }], isError: true };
	}
}
