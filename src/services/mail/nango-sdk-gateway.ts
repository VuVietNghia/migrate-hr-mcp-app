import { Nango } from '@nangohq/node';
import { z } from 'zod';

import type { MailProvider, MailScope } from './mail-contracts';
import { MailError } from './mail-errors';
import type { MailSecretReader } from './file-mail-secret';
import {
	NANGO_INTEGRATION_IDS,
	type BrokerConnection,
	type ConnectionTags,
	type NangoGateway,
	type ProxyRequest,
	type ProxyResponse,
} from './nango-gateway';

const CONTROL_PLANE_TIMEOUT_MS = 15_000;

interface ConnectSessionRequest {
	allowed_integrations: string[];
	end_user: { id: string };
	tags: Record<string, string>;
}

interface ConnectSessionResponse {
	data: { token: string; connect_link: string; expires_at: string };
}

interface ListConnectionsRequest {
	connectionId?: string;
	integrationId: string;
	tags: Record<string, string>;
	limit: number;
}

interface ListConnectionsResponse {
	connections: unknown[];
}

export interface NangoProxyOptions {
	providerConfigKey: string;
	connectionId: string;
	baseUrlOverride: string;
	endpoint: string;
	method: 'GET' | 'POST';
	retries: 0;
	data?: unknown;
}

interface NangoProxyResult {
	status: number;
	data: unknown;
	headers?: unknown;
}

export interface NangoSdkClient {
	createConnectSession(body: ConnectSessionRequest): Promise<ConnectSessionResponse>;
	listConnections(params: ListConnectionsRequest): Promise<ListConnectionsResponse>;
	proxy(options: NangoProxyOptions): Promise<NangoProxyResult>;
	deleteConnection(integrationId: string, connectionId: string): Promise<unknown>;
}

export type NangoClientFactory = (apiKey: string, timeoutMs: number) => NangoSdkClient;

const defaultClientFactory: NangoClientFactory = (apiKey, timeoutMs) => {
	const client = new Nango({ apiKey });
	client.http.defaults.timeout = timeoutMs;
	return {
		createConnectSession: body => client.createConnectSession(body),
		listConnections: params => client.listConnections(params),
		proxy: options => client.proxy<unknown>(options),
		deleteConnection: (integrationId, connectionId) => client.deleteConnection(integrationId, connectionId),
	};
};

const tagsSchema = z.object({
	installation_id: z.string().min(1),
	room_id: z.string().min(1),
	actor_id: z.string().min(1),
	attempt_id: z.string().min(1),
});

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function readStatus(error: unknown): number | undefined {
	const response = asRecord(asRecord(error).response);
	return typeof response.status === 'number' ? response.status : undefined;
}

function readResponseData(error: unknown): unknown {
	return asRecord(asRecord(error).response).data;
}

function readRetryAfter(headers: unknown): number | undefined {
	const record = asRecord(headers);
	const raw = record['retry-after'];
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
	if (typeof raw === 'string' && /^\d+$/u.test(raw)) return Number(raw);
	if (typeof record.get === 'function') {
		const value = (record.get as (name: string) => unknown)('retry-after');
		if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value);
	}
	return undefined;
}

function proxyTarget(request: ProxyRequest): { baseUrlOverride: string; endpoint: string } {
	if (request.provider === 'microsoft') {
		if (request.endpoint !== '/v1.0/me?$select=id,mail,userPrincipalName' && request.endpoint !== '/v1.0/me/sendMail') {
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
		}
		return { baseUrlOverride: 'https://graph.microsoft.com', endpoint: request.endpoint };
	}
	const allowed = new Set([
		'https://openidconnect.googleapis.com/v1/userinfo',
		'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
	]);
	if (!allowed.has(request.endpoint)) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
	const url = new URL(request.endpoint);
	return { baseUrlOverride: url.origin, endpoint: `${url.pathname}${url.search}` };
}

export class NangoSdkGateway implements NangoGateway {
	constructor(
		private readonly secretReader: MailSecretReader,
		private readonly clientFactory: NangoClientFactory = defaultClientFactory,
	) {}

	async createSession(provider: MailProvider, tags: ConnectionTags) {
		const safeTags = tagsSchema.parse(tags);
		const client = await this.client(CONTROL_PLANE_TIMEOUT_MS);
		try {
			const response = await client.createConnectSession({
				allowed_integrations: [NANGO_INTEGRATION_IDS[provider]],
				end_user: { id: safeTags.actor_id },
				tags: { ...safeTags },
			});
			return z
				.object({ data: z.object({
					token: z.string().min(1),
					connect_link: z.url().refine(link => new URL(link).origin === 'https://connect.nango.dev'),
					expires_at: z.iso.datetime({ offset: true }),
				}) })
				.transform(value => ({
					sessionToken: value.data.token,
					connectLink: value.data.connect_link,
					expiresAt: value.data.expires_at,
				}))
				.parse(response);
		} catch (error) {
			if (error instanceof MailError) throw error;
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE', undefined, error);
		}
	}

	async findConnectionForAttempt(
		scope: MailScope,
		provider: MailProvider,
		tags: ConnectionTags,
		timeoutMs: number,
	): Promise<BrokerConnection | null> {
		try {
			const safeTags = tagsSchema.parse(tags);
			if (safeTags.installation_id !== scope.installationId || safeTags.room_id !== scope.roomId) {
				throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			}
			const integrationId = NANGO_INTEGRATION_IDS[provider];
			const response = await (await this.client(timeoutMs)).listConnections({
				integrationId,
				tags: safeTags,
				limit: 2,
			});
			const matches = response.connections.filter(value => {
				const row = asRecord(value);
				const rowTags = asRecord(row.tags);
				return (
					typeof row.connection_id === 'string' &&
					row.provider_config_key === integrationId &&
					rowTags.installation_id === safeTags.installation_id &&
					rowTags.room_id === safeTags.room_id &&
					rowTags.actor_id === safeTags.actor_id &&
					rowTags.attempt_id === safeTags.attempt_id
				);
			});
			if (matches.length === 0) return null;
			if (matches.length !== 1) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			const row = asRecord(matches[0]);
			return {
				connectionId: z.string().min(1).max(256).parse(row.connection_id),
				integrationId,
				tags: tagsSchema.parse(row.tags),
				authError: Array.isArray(row.errors) && row.errors.length > 0,
			};
		} catch (error) {
			if (error instanceof MailError) throw error;
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE', undefined, error);
		}
	}

	async findConnection(
		scope: MailScope,
		provider: MailProvider,
		connectionId: string,
		timeoutMs: number,
	): Promise<BrokerConnection | null> {
		try {
			const integrationId = NANGO_INTEGRATION_IDS[provider];
			const response = await (await this.client(timeoutMs)).listConnections({
				connectionId,
				integrationId,
				tags: { installation_id: scope.installationId, room_id: scope.roomId },
				limit: 2,
			});
			const matches = response.connections.filter(value => {
				const row = asRecord(value);
				const rowTags = asRecord(row.tags);
				return (
					row.connection_id === connectionId &&
					row.provider_config_key === integrationId &&
					rowTags.installation_id === scope.installationId &&
					rowTags.room_id === scope.roomId
				);
			});
			if (matches.length === 0) return null;
			if (matches.length !== 1) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
			const row = asRecord(matches[0]);
			return {
				connectionId,
				integrationId,
				tags: tagsSchema.parse(row.tags),
				authError: Array.isArray(row.errors) && row.errors.length > 0,
			};
		} catch (error) {
			if (error instanceof MailError) throw error;
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE', undefined, error);
		}
	}

	async proxy(request: ProxyRequest): Promise<ProxyResponse> {
		const timeoutMs = Math.max(1, Math.min(request.timeoutMs, CONTROL_PLANE_TIMEOUT_MS));
		const target = proxyTarget(request);
		try {
			const response = await (await this.client(timeoutMs)).proxy({
				providerConfigKey: NANGO_INTEGRATION_IDS[request.provider],
				connectionId: request.connectionId,
				baseUrlOverride: target.baseUrlOverride,
				endpoint: target.endpoint,
				method: request.method,
				retries: 0,
				...(request.data === undefined ? {} : { data: request.data }),
			});
			return {
				status: response.status,
				data: response.data,
				...(readRetryAfter(response.headers) === undefined
					? {}
					: { retryAfterSeconds: readRetryAfter(response.headers) }),
			};
		} catch (error) {
			const status = readStatus(error);
			if (status !== undefined) {
				const response = asRecord(asRecord(error).response);
				const retryAfterSeconds = readRetryAfter(response.headers);
				return {
					status,
					data: readResponseData(error),
					...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
				};
			}
			throw new Error('Nango proxy transport failed.');
		}
	}

	async deleteConnection(provider: MailProvider, connectionId: string): Promise<void> {
		try {
			await (await this.client(CONTROL_PLANE_TIMEOUT_MS)).deleteConnection(
				NANGO_INTEGRATION_IDS[provider],
				connectionId,
			);
		} catch (error) {
			if (readStatus(error) === 404) return;
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE', undefined, error);
		}
	}

	private async client(timeoutMs: number): Promise<NangoSdkClient> {
		const apiKey = await this.secretReader.read();
		return this.clientFactory(apiKey, Math.max(1, Math.min(timeoutMs, CONTROL_PLANE_TIMEOUT_MS)));
	}
}
