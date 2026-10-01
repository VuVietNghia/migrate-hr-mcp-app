import type { MailConnectEvent, MailConnectLauncher } from './mail-connection-controller';

const NANGO_CONNECT_ORIGIN = 'https://connect.nango.dev';
const POLL_INTERVAL_MS = 1500;
const POPUP_FEATURES = 'popup=yes,width=520,height=760,resizable=yes,scrollbars=yes';

export interface NangoPopupWindow {
	closed: boolean;
	navigate(url: string): void;
	close(): void;
}

export interface NangoPopupHost {
	open(url: string, target: string, features: string): NangoPopupWindow | null;
	setInterval(callback: () => void, delayMs: number): number;
	clearInterval(handle: number): void;
	queueMicrotask(callback: () => void): void;
}

function browserHost(): NangoPopupHost {
	return {
		open(url, target, features) {
			const popup = window.open(url, target, features);
			if (!popup) return null;
			return {
				get closed() { return popup.closed; },
				navigate: nextUrl => { popup.location.href = nextUrl; },
				close: () => popup.close(),
			};
		},
		setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
		clearInterval: handle => window.clearInterval(handle),
		queueMicrotask: callback => window.queueMicrotask(callback),
	};
}

function isAllowedConnectLink(value: string): boolean {
	try {
		return new URL(value).origin === NANGO_CONNECT_ORIGIN;
	} catch {
		return false;
	}
}

export function createNangoPopupLauncher(host: NangoPopupHost = browserHost()): MailConnectLauncher {
	return {
		open(onEvent) {
			const popup = host.open('about:blank', '_blank', POPUP_FEATURES);
			let timer: number | null = null;
			let stopped = false;
			let polling = false;

			const emit = (event: MailConnectEvent) => {
				void onEvent(event).catch(() => undefined);
			};
			const stop = (closePopup: boolean) => {
				if (stopped) return;
				stopped = true;
				if (timer !== null) host.clearInterval(timer);
				timer = null;
				if (closePopup && popup && !popup.closed) popup.close();
			};
			const poll = async () => {
				if (stopped || polling || !popup) return;
				if (popup.closed) {
					stop(false);
					emit({ type: 'close' });
					return;
				}
				polling = true;
				try {
					await onEvent({ type: 'poll' });
				} finally {
					polling = false;
				}
			};

			if (!popup) host.queueMicrotask(() => emit({ type: 'error' }));

			return {
				setConnectLink(connectLink) {
					if (!popup || stopped) return;
					if (!isAllowedConnectLink(connectLink)) {
						stop(true);
						host.queueMicrotask(() => emit({ type: 'error' }));
						return;
					}
					try {
						popup.navigate(connectLink);
						timer = host.setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
						host.queueMicrotask(() => { void poll(); });
					} catch {
						stop(true);
						host.queueMicrotask(() => emit({ type: 'error' }));
					}
				},
				close: () => stop(true),
			};
		},
	};
}

export const nangoPopupLauncher = createNangoPopupLauncher();
