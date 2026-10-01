import { describe, expect, it } from 'vitest';

import { parseMailConnection, parseMailMessage } from '../src/services/mail/mail-contracts';
import { MailError, toPublicMailError } from '../src/services/mail/mail-errors';

const validMessage = {
	toName: 'Candidate',
	toEmail: 'candidate@example.com',
	subject: 'Interview invitation',
	htmlContent: '<p>Vui lòng tham gia phỏng vấn.</p>',
};

const validConnection = {
	roomId: 'room-a',
	provider: 'google',
	connectionId: 'connection-a',
	senderEmail: 'sender@example.com',
	status: 'connected',
	revision: '2d62e84b-52fc-4f32-b6f1-8d8dd7611a11',
	updatedAt: '2026-09-30T01:02:03.000Z',
	updatedBy: 'user-a',
};

describe('mail contracts', () => {
	it('rejects provider connection routing supplied inside a message', () => {
		expect(() => parseMailMessage({ ...validMessage, connectionId: 'attacker-connection' })).toThrow();
	});

	it('rejects header injection in a recipient display name', () => {
		expect(() =>
			parseMailMessage({
				...validMessage,
				toName: 'Candidate\r\nBcc: attacker@example.com',
			}),
		).toThrow();
	});

	it('accepts a strict valid message without adding routing fields', () => {
		expect(parseMailMessage(validMessage)).toEqual(validMessage);
	});

	it('rejects token material in a persisted connection record', () => {
		expect(() => parseMailConnection({ ...validConnection, accessToken: 'secret' })).toThrow();
	});

	it('rejects a non-ISO connection timestamp', () => {
		expect(() => parseMailConnection({ ...validConnection, updatedAt: 'yesterday' })).toThrow();
	});

	it('returns a stable public error without exposing an internal cause', () => {
		const internal = new MailError('MAIL_SEND_REJECTED', undefined, new Error('provider token=secret'));

		expect(toPublicMailError(internal)).toEqual({
			code: 'MAIL_SEND_REJECTED',
			message: 'Nhà cung cấp email đã từ chối yêu cầu gửi.',
		});
	});

	it('maps unknown failures to a generic configuration error', () => {
		expect(toPublicMailError(new Error('database password=secret'))).toEqual({
			code: 'MAIL_CONFIGURATION_UNAVAILABLE',
			message: 'Chức năng email chưa được cấu hình đầy đủ.',
		});
	});
});
