import { Buffer } from 'node:buffer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { z } from 'zod';

import {
	parseMailConnection,
	parseMailMessage,
	type MailProviderAdapter,
	type MailReceipt,
} from './mail-contracts';
import { MailError } from './mail-errors';
import { assertIdentityResponse, assertSendResponse } from './mail-provider-response';
import type { NangoGateway } from './nango-gateway';

const GOOGLE_IDENTITY_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export class GoogleMailAdapter implements MailProviderAdapter {
	constructor(private readonly gateway: NangoGateway, private readonly now: () => number = Date.now) {}

	async identity(connectionId: string, timeoutMs: number): Promise<string> {
		const deadline = this.now() + timeoutMs;
		const response = await this.gateway.proxy({
			provider: 'google',
			connectionId,
			method: 'GET',
			endpoint: GOOGLE_IDENTITY_ENDPOINT,
			timeoutMs: this.remaining(deadline),
		});
		if (response.status === 401 || response.status === 403) {
			// Gmail-only OAuth grants cannot use OpenID UserInfo. The authenticated
			// Gmail profile verifies the mailbox without relying on dashboard metadata.
			const profileResponse = await this.gateway.proxy({
				provider: 'google', connectionId, method: 'GET', endpoint: GMAIL_PROFILE_ENDPOINT,
				timeoutMs: this.remaining(deadline),
			});
			assertIdentityResponse(profileResponse);
			const profile = z.object({ emailAddress: z.email() }).safeParse(profileResponse.data);
			if (!profile.success) throw new MailError('MAIL_RECONNECT_REQUIRED');
			return profile.data.emailAddress;
		}
		assertIdentityResponse(response);
		const identity = z.object({ email: z.email(), email_verified: z.literal(true) }).passthrough().safeParse(response.data);
		if (!identity.success) throw new MailError('MAIL_RECONNECT_REQUIRED');
		return identity.data.email;
	}

	async send(connectionRaw: Parameters<MailProviderAdapter['send']>[0], messageRaw: Parameters<MailProviderAdapter['send']>[1], timeoutMs: number, verifiedSender?: string): Promise<MailReceipt> {
		const deadline = this.now() + timeoutMs;
		const connection = parseMailConnection(connectionRaw);
		const message = parseMailMessage(messageRaw);
		if (connection.provider !== 'google') throw new MailError('MAIL_CONNECTION_CHANGED');
		const identity = verifiedSender ?? await this.identity(connection.connectionId, this.remaining(deadline));
		if (identity.toLowerCase() !== connection.senderEmail.toLowerCase()) throw new MailError('MAIL_RECONNECT_REQUIRED');

		let raw: string;
		try {
			const mime = await new MailComposer({
				from: connection.senderEmail,
				to: { name: message.toName, address: message.toEmail },
				subject: message.subject,
				html: message.htmlContent,
				disableFileAccess: true,
				disableUrlAccess: true,
			}).compile().build();
			raw = Buffer.from(mime).toString('base64url');
		} catch (error) {
			throw new MailError('MAIL_SEND_REJECTED', undefined, error);
		}

		try {
			const remainingMs = this.remaining(deadline);
			const response = await this.gateway.proxy({
				provider: 'google',
				connectionId: connection.connectionId,
				method: 'POST',
				endpoint: GMAIL_SEND_ENDPOINT,
				data: { raw },
				timeoutMs: remainingMs,
			});
			assertSendResponse(response, 200);
			const parsed = z.object({ id: z.string().min(1) }).passthrough().safeParse(response.data);
			if (!parsed.success) throw new MailError('MAIL_SEND_UNKNOWN');
			return {
				status: 'accepted',
				provider: 'google',
				senderEmail: identity,
				connectionRevision: connection.revision,
				providerMessageId: parsed.data.id,
			};
		} catch (error) {
			if (error instanceof MailError) throw error;
			throw new MailError('MAIL_SEND_UNKNOWN', undefined, error);
		}
	}

	private remaining(deadline: number): number {
		const remainingMs = deadline - this.now();
		if (remainingMs <= 0) throw new MailError('MAIL_TIMEOUT_BEFORE_SEND');
		return remainingMs;
	}
}
