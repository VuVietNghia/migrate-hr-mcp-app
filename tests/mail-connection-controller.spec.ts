import { describe, expect, it, vi } from 'vitest';

import type { BeginResult, ConnectionView, MailProvider } from '../src/services/mail/mail-contracts';
import {
	MailConnectionController,
	type MailConnectEvent,
	type MailConnectHandle,
	type MailConnectLauncher,
	type MailConnectionClientApi,
} from '../src/ui/mail-connection/mail-connection-controller';

const roomAConnection = {
	roomId: 'room-a',
	provider: 'google' as const,
	senderEmail: 'a@example.test',
	status: 'connected' as const,
	revision: '11111111-1111-4111-8111-111111111111',
	updatedAt: '2026-09-30T03:00:00.000Z',
};

const replacement = {
	...roomAConnection,
	provider: 'microsoft' as const,
	senderEmail: 'new@example.test',
	revision: '22222222-2222-4222-8222-222222222222',
};

const oldView: ConnectionView = { connection: roomAConnection, cleanupPending: false };
const newView: ConnectionView = { connection: replacement, cleanupPending: false };

class FakeLauncher implements MailConnectLauncher {
	readonly handle: MailConnectHandle & { emit(event: MailConnectEvent): Promise<void> };
	openCalls = 0;

	constructor() {
		let listener: (event: MailConnectEvent) => Promise<void> = async () => undefined;
		this.handle = {
			setConnectLink: vi.fn(),
			close: vi.fn(),
			emit: event => listener(event),
		};
		this.open = onEvent => {
			this.openCalls += 1;
			listener = onEvent;
			return this.handle;
		};
	}

	open: (onEvent: (event: MailConnectEvent) => Promise<void>) => MailConnectHandle;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(done => { resolve = done; });
	return { promise, resolve };
}

function client(overrides: Partial<MailConnectionClientApi> = {}): MailConnectionClientApi {
	return {
		joinCurrentRoom: vi.fn(async () => undefined),
		get: vi.fn(async () => oldView),
		begin: vi.fn(async (_provider: MailProvider, _revision: string | null): Promise<BeginResult> => ({
			attemptId: 'attempt-a',
			sessionToken: 'token-a',
			connectLink: 'https://connect.nango.dev/?session_token=short-lived',
			expiresAt: '2026-09-30T03:10:00.000Z',
		})),
		complete: vi.fn(async () => newView),
		poll: vi.fn(async () => null),
		disconnect: vi.fn(async () => ({ connection: null, cleanupPending: false })),
		...overrides,
	};
}

describe('MailConnectionController', () => {
	it('joins the bot, reloads the empty Room view, and begins OAuth after the initial load failed', async () => {
		const pendingJoin = deferred<void>();
		const emptyView: ConnectionView = { connection: null, cleanupPending: false };
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockRejectedValueOnce(new Error('configuration unavailable'))
			.mockResolvedValueOnce(emptyView);
		const api = client({
			get,
			joinCurrentRoom: vi.fn(() => pendingJoin.promise),
		});
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();

		const connecting = controller.connect('google');
		expect(launcher.openCalls).toBe(1);
		expect(api.joinCurrentRoom).toHaveBeenCalledTimes(1);
		expect(api.begin).not.toHaveBeenCalled();

		pendingJoin.resolve();
		await connecting;

		expect(api.get).toHaveBeenCalledTimes(2);
		expect(api.begin).toHaveBeenCalledWith('google', null);
		expect(launcher.handle.setConnectLink).toHaveBeenCalledWith('https://connect.nango.dev/?session_token=short-lived');
		expect(controller.state).toEqual({ kind: 'connecting', view: emptyView, provider: 'google' });
	});

	it('closes Connect UI and keeps a retryable view-less error when joining the Room fails', async () => {
		const api = client({
			get: vi.fn(async () => { throw new Error('configuration unavailable'); }),
			joinCurrentRoom: vi.fn(async () => { throw new Error('join failed'); }),
		});
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();

		await controller.connect('google');

		expect(launcher.handle.close).toHaveBeenCalled();
		expect(api.begin).not.toHaveBeenCalled();
		expect(controller.state).toEqual({ kind: 'error', view: null, message: 'join failed' });
	});

	it('does not continue recovery after the controller is disposed during the Room join', async () => {
		const pendingJoin = deferred<void>();
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockRejectedValueOnce(new Error('configuration unavailable'))
			.mockResolvedValueOnce({ connection: null, cleanupPending: false });
		const api = client({
			get,
			joinCurrentRoom: vi.fn(() => pendingJoin.promise),
		});
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();

		const connecting = controller.connect('google');
		controller.dispose();
		pendingJoin.resolve();
		await connecting;

		expect(get).toHaveBeenCalledTimes(1);
		expect(api.begin).not.toHaveBeenCalled();
		expect(launcher.handle.close).toHaveBeenCalled();
	});

	it('opens Connect UI before awaiting begin and completes the candidate', async () => {
		const pendingBegin = deferred<BeginResult>();
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockResolvedValueOnce(oldView)
			.mockResolvedValue(newView);
		const api = client({ begin: vi.fn(() => pendingBegin.promise), get });
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();

		const connecting = controller.connect('google');
		expect(launcher.openCalls).toBe(1);
		expect(api.joinCurrentRoom).not.toHaveBeenCalled();
		expect(api.begin).toHaveBeenCalledWith('google', roomAConnection.revision);
		pendingBegin.resolve({
			attemptId: 'attempt-a',
			sessionToken: 'token-a',
			connectLink: 'https://connect.nango.dev/?session_token=short-lived',
			expiresAt: '2026-09-30T03:10:00.000Z',
		});
		await connecting;
		expect(launcher.handle.setConnectLink).toHaveBeenCalledWith('https://connect.nango.dev/?session_token=short-lived');

		await launcher.handle.emit({ type: 'connect', candidateConnectionId: 'candidate-a' });
		expect(api.complete).toHaveBeenCalledWith('attempt-a', 'candidate-a');
		expect(api.get).toHaveBeenCalledTimes(2);
		expect(controller.state).toEqual({ kind: 'ready', view: newView });
	});

	it('commits a connection discovered while the external Nango tab is open', async () => {
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockResolvedValueOnce(oldView)
			.mockResolvedValue(newView);
		const api = client({ get, poll: vi.fn(async () => newView) });
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();
		await controller.connect('google');

		await launcher.handle.emit({ type: 'poll' });

		expect(api.poll).toHaveBeenCalledWith('attempt-a');
		expect(api.complete).not.toHaveBeenCalled();
		expect(launcher.handle.close).toHaveBeenCalled();
		expect(controller.state).toEqual({ kind: 'ready', view: newView });
	});

	it('keeps the old connection when the user closes Connect UI', async () => {
		const api = client();
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();
		await controller.connect('microsoft');

		await launcher.handle.emit({ type: 'close' });

		expect(api.complete).not.toHaveBeenCalled();
		expect(controller.state).toEqual({ kind: 'ready', view: oldView });
	});

	it('discards a stale event after Room switch or unmount', async () => {
		const api = client();
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();
		await controller.connect('google');
		controller.dispose();

		await launcher.handle.emit({ type: 'connect', candidateConnectionId: 'stale' });

		expect(api.complete).not.toHaveBeenCalled();
		expect(launcher.handle.close).toHaveBeenCalled();
	});

	it('serializes connect then close so a successful replacement is not reverted in the UI', async () => {
		const completion = deferred<ConnectionView>();
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockResolvedValueOnce(oldView)
			.mockResolvedValue(newView);
		const api = client({ get, complete: vi.fn(() => completion.promise) });
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();
		await controller.connect('microsoft');

		const connected = launcher.handle.emit({ type: 'connect', candidateConnectionId: 'candidate-a' });
		const closed = launcher.handle.emit({ type: 'close' });
		completion.resolve(newView);
		await Promise.all([connected, closed]);

		expect(controller.state).toEqual({ kind: 'ready', view: newView });
	});

	it('keeps the committed connection when the refresh after completion fails', async () => {
		const get = vi.fn<() => Promise<ConnectionView>>()
			.mockResolvedValueOnce(oldView)
			.mockRejectedValueOnce(new Error('refresh failed'));
		const api = client({ get });
		const launcher = new FakeLauncher();
		const controller = new MailConnectionController(api, launcher);
		await controller.load();
		await controller.connect('microsoft');

		const connected = launcher.handle.emit({ type: 'connect', candidateConnectionId: 'candidate-a' });
		const closed = launcher.handle.emit({ type: 'close' });
		await Promise.all([connected, closed]);

		expect(controller.state).toEqual({ kind: 'error', view: newView, message: 'refresh failed' });
	});

	it('disconnects without checking a Room role', async () => {
		const api = client();
		const controller = new MailConnectionController(api, new FakeLauncher());
		await controller.load();

		await controller.disconnect();

		expect(api.disconnect).toHaveBeenCalledWith(roomAConnection.revision);
	});
});
