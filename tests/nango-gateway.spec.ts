import { describe, expect, it } from 'vitest';

import {
	NangoSdkGateway,
	type NangoClientFactory,
	type NangoSdkClient,
} from '../src/services/mail/nango-sdk-gateway';

const tags = {
	installation_id: 'installation-a',
	room_id: 'room-a',
	actor_id: 'user-a',
	attempt_id: 'attempt-a',
};

function createGateway(overrides: Partial<NangoSdkClient> = {}) {
	const created: Array<{ apiKey: string; timeoutMs: number }> = [];
	const client: NangoSdkClient = {
		createConnectSession: async () => ({ data: {
			token: 'session-token',
			connect_link: 'https://connect.nango.dev/?session_token=short-lived',
			expires_at: '2026-09-30T02:00:00Z',
		} }),
		listConnections: async () => ({ connections: [] }),
		proxy: async () => ({ status: 200, data: {} }),
		deleteConnection: async () => undefined,
		...overrides,
	};
	const factory: NangoClientFactory = (apiKey, timeoutMs) => {
		created.push({ apiKey, timeoutMs });
		return client;
	};
	return {
		created,
		gateway: new NangoSdkGateway({ read: async () => 'file-key' }, factory),
	};
}

describe('NangoSdkGateway', () => {
	it('allows the authenticated Gmail Profile endpoint through the broker', async () => {
		const { gateway } = createGateway({ proxy: async () => ({ status: 200, data: { emailAddress: 'hr@example.test' } }) });
		await expect(gateway.proxy({
			provider: 'google', connectionId: 'connection-a', method: 'GET',
			endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile', timeoutMs: 8000,
		})).resolves.toMatchObject({ status: 200, data: { emailAddress: 'hr@example.test' } });
	});

	it('creates a provider-restricted connect session with server tags', async () => {
		let body: unknown;
		const { gateway } = createGateway({
			createConnectSession: async value => {
				body = value;
				return { data: {
					token: 'session-token',
					connect_link: 'https://connect.nango.dev/?session_token=short-lived',
					expires_at: '2026-09-30T02:00:00Z',
				} };
			},
		});

		await expect(gateway.createSession('google', tags)).resolves.toEqual({
			sessionToken: 'session-token',
			connectLink: 'https://connect.nango.dev/?session_token=short-lived',
			expiresAt: '2026-09-30T02:00:00Z',
		});
		expect(body).toEqual({
			allowed_integrations: ['hr-google-mail'],
			end_user: { id: 'user-a' },
			tags,
		});
	});

	it('discovers exactly one completed connection using all attempt tags', async () => {
		let params: unknown;
		const { gateway } = createGateway({
			listConnections: async value => {
				params = value;
				return { connections: [{
					connection_id: 'connection-a',
					provider_config_key: 'hr-google-mail',
					tags,
					errors: [],
				}] };
			},
		});

		await expect(gateway.findConnectionForAttempt(
			{ installationId: 'installation-a', roomId: 'room-a' },
			'google',
			tags,
			8000,
		)).resolves.toMatchObject({ connectionId: 'connection-a', tags });
		expect(params).toEqual({ integrationId: 'hr-google-mail', tags, limit: 2 });
	});

	it('lists only exact connection, integration and namespace metadata with limit two', async () => {
		let params: unknown;
		const { gateway } = createGateway({
			listConnections: async value => {
				params = value;
				return {
					connections: [{
						connection_id: 'connection-a',
						provider_config_key: 'hr-google-mail',
						tags,
						errors: [],
					}],
				};
			},
		});

		await expect(
			gateway.findConnection(
				{ installationId: 'installation-a', roomId: 'room-a' },
				'google',
				'connection-a',
				8000,
			),
		).resolves.toMatchObject({ connectionId: 'connection-a', integrationId: 'hr-google-mail', tags });
		expect(params).toEqual({
			connectionId: 'connection-a',
			integrationId: 'hr-google-mail',
			tags: { installation_id: 'installation-a', room_id: 'room-a' },
			limit: 2,
		});
	});

	it('rejects an ambiguous metadata result', async () => {
		const row = {
			connection_id: 'connection-a',
			provider_config_key: 'hr-google-mail',
			tags,
			errors: [],
		};
		const { gateway } = createGateway({ listConnections: async () => ({ connections: [row, row] }) });
		await expect(
			gateway.findConnection(
				{ installationId: 'installation-a', roomId: 'room-a' },
				'google',
				'connection-a',
				8000,
			),
		).rejects.toMatchObject({ code: 'MAIL_CONFIGURATION_UNAVAILABLE' });
	});

	it('uses an allowlisted provider base URL and disables proxy retries', async () => {
		let options: unknown;
		const { gateway } = createGateway({
			proxy: async value => {
				options = value;
				return { status: 202, data: '' };
			},
		});
		await gateway.proxy({
			provider: 'microsoft',
			connectionId: 'connection-a',
			method: 'POST',
			endpoint: '/v1.0/me/sendMail',
			data: { message: {} },
			timeoutMs: 5000,
		});
		expect(options).toMatchObject({
			providerConfigKey: 'hr-microsoft-mail',
			connectionId: 'connection-a',
			baseUrlOverride: 'https://graph.microsoft.com',
			endpoint: '/v1.0/me/sendMail',
			method: 'POST',
			retries: 0,
		});
	});
});
