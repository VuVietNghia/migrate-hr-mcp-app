import { z } from 'zod';

export type { MailErrorCode } from './mail-errors';

export type MailProvider = 'google' | 'microsoft';

export interface MailScope {
	installationId: string;
	roomId: string;
}

export interface MailActor extends MailScope {
	userId: string;
}

export interface MailConnection {
	roomId: string;
	provider: MailProvider;
	connectionId: string;
	senderEmail: string;
	status: 'connected' | 'disconnected' | 'error';
	revision: string;
	updatedBy: string;
	updatedAt: string;
}

export interface MailMessage {
	toName: string;
	toEmail: string;
	subject: string;
	htmlContent: string;
}

export interface MailReceipt {
	status: 'accepted';
	provider: MailProvider;
	senderEmail: string;
	connectionRevision: string;
	providerMessageId?: string;
}

export interface ConnectSession {
	sessionToken: string;
	connectLink: string;
	expiresAt: string;
}

export const MAIL_CONNECTION_DISCOVERY_SENTINEL = '__discover__';

export type MailConnectionSummary = Pick<
	MailConnection,
	'roomId' | 'provider' | 'senderEmail' | 'status' | 'revision' | 'updatedAt'
>;

export interface ConnectionView {
	connection: MailConnectionSummary | null;
	cleanupPending: boolean;
}

export interface BeginResult extends ConnectSession {
	attemptId: string;
}

export interface MailProviderAdapter {
	identity(connectionId: string, timeoutMs: number): Promise<string>;
	send(connection: MailConnection, message: MailMessage, timeoutMs: number, verifiedSender?: string): Promise<MailReceipt>;
}

const headerText = (maxLength: number) =>
	z.string().min(1).max(maxLength).refine(value => !/[\r\n]/u.test(value), 'Header values must not contain CR or LF');

const mailMessageSchema = z
	.object({
		toName: headerText(256),
		toEmail: headerText(320).pipe(z.email()),
		subject: headerText(500),
		htmlContent: z.string().min(1).max(200_000),
	})
	.strict();

const mailConnectionSchema = z
	.object({
		roomId: z.string().min(1).max(64),
		provider: z.enum(['google', 'microsoft']),
		connectionId: z.string().min(1).max(256),
		senderEmail: z.email().max(320),
		status: z.enum(['connected', 'disconnected', 'error']),
		revision: z.uuid(),
		updatedBy: z.string().min(1).max(256),
		updatedAt: z.iso.datetime({ offset: true }),
	})
	.strict();

const mailReceiptSchema = z
	.object({
		status: z.literal('accepted'),
		provider: z.enum(['google', 'microsoft']),
		senderEmail: z.email().max(320),
		connectionRevision: z.string().min(1).max(64),
		providerMessageId: z.string().min(1).max(512).optional(),
	})
	.strict();

const mailConnectionSummarySchema = mailConnectionSchema.omit({ connectionId: true, updatedBy: true });

export function parseMailMessage(raw: unknown): MailMessage {
	return mailMessageSchema.parse(raw);
}

export function parseMailConnection(raw: unknown): MailConnection {
	return mailConnectionSchema.parse(raw);
}

export function parseMailConnectionSummary(raw: unknown): MailConnectionSummary {
	return mailConnectionSummarySchema.parse(raw);
}

export function parseMailReceipt(raw: unknown): MailReceipt {
	return mailReceiptSchema.parse(raw);
}
