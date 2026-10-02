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

const MICROSOFT_IDENTITY_ENDPOINT = '/v1.0/me?$select=id,mail,userPrincipalName';
const MICROSOFT_SEND_ENDPOINT = '/v1.0/me/sendMail';

export class MicrosoftMailAdapter implements MailProviderAdapter {
	constructor(private readonly gateway: NangoGateway, private readonly now: () => number = Date.now) {}

	async identity(connectionId: string, timeoutMs: number): Promise<string> {
		const response = await this.gateway.proxy({
			provider: 'microsoft',
			connectionId,
			method: 'GET',
			endpoint: MICROSOFT_IDENTITY_ENDPOINT,
			timeoutMs,
		});
		assertIdentityResponse(response);
		const identity = z.object({ mail: z.email() }).passthrough().safeParse(response.data);
		if (!identity.success) throw new MailError('MAIL_RECONNECT_REQUIRED');
		return identity.data.mail;
	}

	async send(connectionRaw: Parameters<MailProviderAdapter['send']>[0], messageRaw: Parameters<MailProviderAdapter['send']>[1], timeoutMs: number, verifiedSender?: string): Promise<MailReceipt> {
		const deadline = this.now() + timeoutMs;
		const connection = parseMailConnection(connectionRaw);
		const message = parseMailMessage(messageRaw);
		if (connection.provider !== 'microsoft') throw new MailError('MAIL_CONNECTION_CHANGED');
		const identity = verifiedSender ?? await this.identity(connection.connectionId, this.remaining(deadline));
		if (identity.toLowerCase() !== connection.senderEmail.toLowerCase()) throw new MailError('MAIL_RECONNECT_REQUIRED');

		try {
			const remainingMs = this.remaining(deadline);
			const response = await this.gateway.proxy({
				provider: 'microsoft',
				connectionId: connection.connectionId,
				method: 'POST',
				endpoint: MICROSOFT_SEND_ENDPOINT,
				data: {
					message: {
						subject: message.subject,
						body: { contentType: 'HTML', content: message.htmlContent },
						toRecipients: [
							{ emailAddress: { name: message.toName, address: message.toEmail } },
						],
					},
					saveToSentItems: true,
				},
				timeoutMs: remainingMs,
			});
			assertSendResponse(response, 202);
			return {
				status: 'accepted',
				provider: 'microsoft',
				senderEmail: identity,
				connectionRevision: connection.revision,
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
