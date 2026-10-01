export const MAIL_ERROR_CODES = [
	'MAIL_NOT_CONFIGURED',
	'MAIL_RECONNECT_REQUIRED',
	'MAIL_CONNECTION_CHANGED',
	'MAIL_CONNECT_EXPIRED',
	'MAIL_CONFIGURATION_UNAVAILABLE',
	'MAIL_RATE_LIMITED',
	'MAIL_QUEUE_FULL',
	'MAIL_TIMEOUT_BEFORE_SEND',
	'MAIL_SEND_UNKNOWN',
	'MAIL_SEND_REJECTED',
] as const;

export type MailErrorCode = (typeof MAIL_ERROR_CODES)[number];

export function isMailErrorCode(value: unknown): value is MailErrorCode {
	return typeof value === 'string' && (MAIL_ERROR_CODES as readonly string[]).includes(value);
}

const PUBLIC_MESSAGES: Readonly<Record<MailErrorCode, string>> = {
	MAIL_NOT_CONFIGURED: 'Room chưa kết nối tài khoản gửi email.',
	MAIL_RECONNECT_REQUIRED: 'Kết nối email cần được xác thực lại.',
	MAIL_CONNECTION_CHANGED: 'Tài khoản gửi email của Room đã thay đổi. Vui lòng thử lại.',
	MAIL_CONNECT_EXPIRED: 'Phiên kết nối email đã hết hạn.',
	MAIL_CONFIGURATION_UNAVAILABLE: 'Chức năng email chưa được cấu hình đầy đủ.',
	MAIL_RATE_LIMITED: 'Nhà cung cấp email đang giới hạn tốc độ gửi.',
	MAIL_QUEUE_FULL: 'Hàng đợi gửi email đang đầy. Vui lòng thử lại sau.',
	MAIL_TIMEOUT_BEFORE_SEND: 'Email chưa được gửi vì thời gian chờ đã hết.',
	MAIL_SEND_UNKNOWN: 'Chưa xác định được kết quả gửi. Kiểm tra thư đã gửi trước khi gửi lại.',
	MAIL_SEND_REJECTED: 'Nhà cung cấp email đã từ chối yêu cầu gửi.',
};

export interface PublicMailError {
	code: MailErrorCode;
	message: string;
	retryAfterSeconds?: number;
}

export class MailError extends Error {
	readonly code: MailErrorCode;
	readonly retryAfterSeconds?: number;
	readonly cause?: unknown;

	constructor(code: MailErrorCode, retryAfterSeconds?: number, cause?: unknown) {
		super(PUBLIC_MESSAGES[code]);
		this.name = 'MailError';
		this.code = code;
		this.retryAfterSeconds = retryAfterSeconds;
		this.cause = cause;
	}
}

export function toPublicMailError(error: unknown): PublicMailError {
	if (error instanceof MailError) {
		return {
			code: error.code,
			message: PUBLIC_MESSAGES[error.code],
			...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
		};
	}
	return {
		code: 'MAIL_CONFIGURATION_UNAVAILABLE',
		message: PUBLIC_MESSAGES.MAIL_CONFIGURATION_UNAVAILABLE,
	};
}
