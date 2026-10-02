import { MailError } from './mail-errors';
import type { ProxyResponse } from './nango-gateway';

export function assertIdentityResponse(response: ProxyResponse): void {
	if (response.status === 401 || response.status === 403) throw new MailError('MAIL_RECONNECT_REQUIRED');
	if (response.status === 429) throw new MailError('MAIL_RATE_LIMITED', response.retryAfterSeconds);
	if (response.status < 200 || response.status >= 300) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
}

export function assertSendResponse(response: ProxyResponse, acceptedStatus: number): void {
	if (response.status === 401 || response.status === 403) throw new MailError('MAIL_RECONNECT_REQUIRED');
	if (response.status === 429) throw new MailError('MAIL_RATE_LIMITED', response.retryAfterSeconds);
	if (response.status >= 500) throw new MailError('MAIL_SEND_UNKNOWN');
	if (response.status !== acceptedStatus) throw new MailError('MAIL_SEND_REJECTED');
}
