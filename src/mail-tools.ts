/**
 * App-owned `hrm.mail.*` tools. Same authorization posture as payroll-tools:
 * verified actor required, room pinned to `actor.roomId`, `requestedBy` is
 * the verified user id (a caller-supplied value is discarded), HTML is
 * sanitized before it reaches the relay or the history list.
 */
import type { VerifiedActor } from '@privos_ai/app-server';

import { resolveActorRoom } from './payroll-tools';
import { createRoomHubToolCaller } from './services/hub-tool-caller';
import { EmailHistoryRepository } from './services/mail/email-history-repository';
import { sanitizeEmailHtml } from './services/mail/html-sanitizer';
import { MailRelayService } from './services/mail/mail-relay-service';
import { TrackedMailService } from './services/mail/tracked-mail-service';

export const MAIL_TOOL_NAMES = ['hrm.mail.send', 'hrm.mail.retry'] as const;
export type MailToolName = (typeof MAIL_TOOL_NAMES)[number];

export const MAIL_TOOL_DEFINITIONS = [
	{
		name: 'hrm.mail.send',
		title: 'Send HR email',
		description:
			'Send one email through the HR relay and record it in the room email history. Requires a Hub-verified actor.',
		inputSchema: {
			type: 'object',
			properties: {
				roomId: { type: 'string' },
				source: { type: 'string', enum: ['cv_scored', 'lifecycle'] },
				toName: { type: 'string' },
				toEmail: { type: 'string' },
				subject: { type: 'string' },
				htmlContent: { type: 'string' },
				cvItemId: { type: 'string' },
				cvListId: { type: 'string' },
				jdName: { type: 'string' },
			},
			required: ['source', 'toName', 'toEmail', 'subject', 'htmlContent'],
		},
	},
	{
		name: 'hrm.mail.retry',
		title: 'Retry a failed HR email',
		description: 'Re-send a failed email from the room history using its stored recipient and content.',
		inputSchema: {
			type: 'object',
			properties: { roomId: { type: 'string' }, itemId: { type: 'string' } },
			required: ['itemId'],
		},
	},
] as const;

export function isMailTool(name: unknown): name is MailToolName {
	return typeof name === 'string' && (MAIL_TOOL_NAMES as readonly string[]).includes(name);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 500;
const MAX_HTML = 200_000;

// One relay (one queue) per process — the rate limit is per EmailJS account, not per room.
const relay = new MailRelayService();

type TrackedMail = Pick<TrackedMailService, 'send' | 'retry'>;
let dependencies: { createTrackedMail: (roomId: string) => TrackedMail } = {
	createTrackedMail: (roomId) =>
		new TrackedMailService(new EmailHistoryRepository(createRoomHubToolCaller(roomId)), relay),
};

/** Test seam. */
export function setMailToolDependencies(deps: { createTrackedMail: (roomId: string) => TrackedMail }): void {
	dependencies = deps;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requireString(args: Record<string, unknown>, key: string, max: number): string {
	const value = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
	if (!value) throw new Error(`${key} is required`);
	if (value.length > max) throw new Error(`${key} exceeds ${max} characters`);
	return value;
}

function optionalString(args: Record<string, unknown>, key: string, max = 256): string | undefined {
	const value = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
	if (!value) return undefined;
	if (value.length > max) throw new Error(`${key} exceeds ${max} characters`);
	return value;
}

export async function handleMailTool(name: MailToolName, rawArgs: unknown, actor: VerifiedActor | undefined) {
	const args = asRecord(rawArgs);
	const roomId = resolveActorRoom(args, actor);
	const tracked = dependencies.createTrackedMail(roomId);

	if (name === 'hrm.mail.retry') {
		const itemId = requireString(args, 'itemId', 128);
		const record = await tracked.retry(roomId, itemId);
		return { content: [{ type: 'text' as const, text: JSON.stringify({ itemId: record.id, status: record.status }) }] };
	}

	const source = args.source;
	if (source !== 'cv_scored' && source !== 'lifecycle') throw new Error("source must be 'cv_scored' or 'lifecycle'");
	const toEmail = requireString(args, 'toEmail', 320);
	if (!EMAIL_REGEX.test(toEmail)) throw new Error('Recipient email is invalid');
	const rawHtml = typeof args.htmlContent === 'string' ? args.htmlContent : '';
	if (!rawHtml.trim()) throw new Error('htmlContent is required');
	if (rawHtml.length > MAX_HTML) throw new Error(`htmlContent exceeds ${MAX_HTML} characters`);

	const record = await tracked.send({
		roomId,
		source,
		recipientName: requireString(args, 'toName', 256),
		recipientEmail: toEmail,
		subject: requireString(args, 'subject', MAX_SUBJECT),
		htmlContent: sanitizeEmailHtml(rawHtml),
		cvItemId: optionalString(args, 'cvItemId'),
		cvListId: optionalString(args, 'cvListId'),
		jdName: optionalString(args, 'jdName'),
		requestedBy: actor!.userId,
	});
	return { content: [{ type: 'text' as const, text: JSON.stringify({ itemId: record.id, status: record.status }) }] };
}
