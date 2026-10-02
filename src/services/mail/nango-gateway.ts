import type { ConnectSession, MailProvider, MailScope } from './mail-contracts';

export interface ConnectionTags {
	installation_id: string;
	room_id: string;
	actor_id: string;
	attempt_id: string;
}

export interface BrokerConnection {
	connectionId: string;
	integrationId: string;
	tags: ConnectionTags;
	authError: boolean;
}

export interface ProxyRequest {
	provider: MailProvider;
	connectionId: string;
	method: 'GET' | 'POST';
	endpoint: string;
	data?: unknown;
	timeoutMs: number;
}

export interface ProxyResponse {
	status: number;
	data: unknown;
	retryAfterSeconds?: number;
}

export interface NangoGateway {
	createSession(provider: MailProvider, tags: ConnectionTags): Promise<ConnectSession>;
	findConnection(
		scope: MailScope,
		provider: MailProvider,
		connectionId: string,
		timeoutMs: number,
	): Promise<BrokerConnection | null>;
	findConnectionForAttempt(
		scope: MailScope,
		provider: MailProvider,
		tags: ConnectionTags,
		timeoutMs: number,
	): Promise<BrokerConnection | null>;
	proxy(request: ProxyRequest): Promise<ProxyResponse>;
	deleteConnection(provider: MailProvider, connectionId: string): Promise<void>;
}

export const NANGO_INTEGRATION_IDS: Readonly<Record<MailProvider, string>> = {
	google: 'hr-google-mail',
	microsoft: 'hr-microsoft-mail',
};
