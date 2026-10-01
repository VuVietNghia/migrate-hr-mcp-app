import type { BeginResult, ConnectionView, MailProvider } from '../../services/mail/mail-contracts';

export interface MailConnectionClientApi {
	joinCurrentRoom(): Promise<void>;
	get(): Promise<ConnectionView>;
	begin(provider: MailProvider, expectedRevision: string | null): Promise<BeginResult>;
	complete(attemptId: string, candidateConnectionId: string): Promise<ConnectionView>;
	poll(attemptId: string): Promise<ConnectionView | null>;
	disconnect(expectedRevision: string): Promise<ConnectionView>;
}

export type MailConnectEvent =
	| { type: 'ready' }
	| { type: 'close' }
	| { type: 'connect'; candidateConnectionId: string }
	| { type: 'poll' }
	| { type: 'error' }
	| { type: 'settings_changed' };

export interface MailConnectHandle {
	setConnectLink(connectLink: string): void;
	close(): void;
}

export interface MailConnectLauncher {
	open(onEvent: (event: MailConnectEvent) => Promise<void>): MailConnectHandle;
}

export type MailConnectionState =
	| { kind: 'loading' }
	| { kind: 'ready'; view: ConnectionView }
	| { kind: 'connecting'; view: ConnectionView; provider: MailProvider }
	| { kind: 'error'; view: ConnectionView | null; message: string };

type StateListener = (state: MailConnectionState) => void;

const EMPTY_CONNECTION_VIEW: ConnectionView = { connection: null, cleanupPending: false };

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message
		? error.message
		: 'Không thể cập nhật tài khoản gửi email của Room.';
}

export class MailConnectionController {
	state: MailConnectionState = { kind: 'loading' };
	private generation = 0;
	private listener: StateListener | null = null;
	private connectHandle: MailConnectHandle | null = null;

	constructor(
		private readonly client: MailConnectionClientApi,
		private readonly launcher: MailConnectLauncher,
	) {}

	subscribe(listener: StateListener): () => void {
		this.listener = listener;
		listener(this.state);
		return () => {
			if (this.listener === listener) this.listener = null;
		};
	}

	async load(): Promise<void> {
		const operation = ++this.generation;
		this.setState({ kind: 'loading' });
		try {
			const view = await this.client.get();
			if (operation === this.generation) this.setState({ kind: 'ready', view });
		} catch (error) {
			if (operation === this.generation) this.setState({ kind: 'error', view: null, message: errorMessage(error) });
		}
	}

	async connect(provider: MailProvider): Promise<void> {
		let currentView = this.currentView();
		const needsRoomJoin = currentView === null;
		const previousError = this.state.kind === 'error' ? this.state.message : errorMessage(undefined);
		const operation = ++this.generation;
		let attempt: BeginResult | null = null;
		let eventChain = Promise.resolve();
		this.connectHandle?.close();
		this.connectHandle = this.launcher.open(event => {
			eventChain = eventChain.then(() => this.handleConnectEvent(
				event,
				operation,
				attempt,
				currentView,
				previousError,
			));
			return eventChain;
		});
		this.setState({ kind: 'connecting', view: currentView ?? EMPTY_CONNECTION_VIEW, provider });
		try {
			if (needsRoomJoin) {
				await this.client.joinCurrentRoom();
				if (operation !== this.generation) return;
				const recoveredView = await this.client.get();
				if (operation !== this.generation) return;
				currentView = recoveredView;
				this.setState({ kind: 'connecting', view: recoveredView, provider });
			}
			if (!currentView) return;
			attempt = await this.client.begin(provider, currentView.connection?.revision ?? null);
			if (operation !== this.generation) {
				this.connectHandle?.close();
				return;
			}
			this.connectHandle.setConnectLink(attempt.connectLink);
		} catch (error) {
			if (operation !== this.generation) return;
			this.connectHandle.close();
			this.connectHandle = null;
			this.setState({ kind: 'error', view: currentView, message: errorMessage(error) });
		}
	}

	async disconnect(): Promise<void> {
		const currentView = this.currentView();
		const revision = currentView?.connection?.revision;
		if (!currentView || !revision) return;
		const operation = ++this.generation;
		this.connectHandle?.close();
		this.connectHandle = null;
		this.setState({ kind: 'loading' });
		try {
			const view = await this.client.disconnect(revision);
			if (operation === this.generation) this.setState({ kind: 'ready', view });
		} catch (error) {
			if (operation === this.generation) {
				this.setState({ kind: 'error', view: currentView, message: errorMessage(error) });
			}
		}
	}

	dispose(): void {
		this.generation += 1;
		this.connectHandle?.close();
		this.connectHandle = null;
		this.listener = null;
	}

	private currentView(): ConnectionView | null {
		switch (this.state.kind) {
			case 'ready':
			case 'connecting':
				return this.state.view;
			case 'error':
				return this.state.view;
			case 'loading':
				return null;
			default: {
				const exhaustive: never = this.state;
				return exhaustive;
			}
		}
	}

	private async handleConnectEvent(
		event: MailConnectEvent,
		operation: number,
		attempt: BeginResult | null,
		oldView: ConnectionView | null,
		previousError: string,
	): Promise<void> {
		if (operation !== this.generation) return;
		switch (event.type) {
			case 'ready':
			case 'settings_changed':
				return;
			case 'close':
				this.generation += 1;
				this.connectHandle = null;
				this.setState(oldView
					? { kind: 'ready', view: oldView }
					: { kind: 'error', view: null, message: previousError });
				return;
			case 'error':
				this.generation += 1;
				this.connectHandle?.close();
				this.connectHandle = null;
				this.setState({ kind: 'error', view: oldView, message: 'Không thể kết nối tài khoản email. Hãy thử lại.' });
				return;
			case 'poll': {
				if (!attempt || !oldView) return;
				let completedView: ConnectionView | null;
				try {
					completedView = await this.client.poll(attempt.attemptId);
				} catch (error) {
					this.failConnection(operation, oldView, error);
					return;
				}
				if (completedView) await this.commitConnection(operation, completedView);
				return;
			}
			case 'connect': {
				if (!attempt || !oldView) return;
				let completedView: ConnectionView;
				try {
					completedView = await this.client.complete(attempt.attemptId, event.candidateConnectionId);
				} catch (error) {
					this.failConnection(operation, oldView, error);
					return;
				}
				await this.commitConnection(operation, completedView);
				return;
			}
			default: {
				const exhaustive: never = event;
				return exhaustive;
			}
		}
	}

	private failConnection(operation: number, oldView: ConnectionView, error: unknown): void {
		if (operation !== this.generation) return;
		this.connectHandle?.close();
		this.connectHandle = null;
		this.setState({ kind: 'error', view: oldView, message: errorMessage(error) });
	}

	private async commitConnection(operation: number, completedView: ConnectionView): Promise<void> {
		if (operation !== this.generation) return;
		const committedOperation = ++this.generation;
		this.connectHandle?.close();
		this.connectHandle = null;
		this.setState({ kind: 'ready', view: completedView });
		try {
			const refreshedView = await this.client.get();
			if (committedOperation === this.generation) {
				this.setState({ kind: 'ready', view: refreshedView });
			}
		} catch (error) {
			if (committedOperation === this.generation) {
				this.setState({ kind: 'error', view: completedView, message: errorMessage(error) });
			}
		}
	}

	private setState(state: MailConnectionState): void {
		this.state = state;
		this.listener?.(state);
	}
}
