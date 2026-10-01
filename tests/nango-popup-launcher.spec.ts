import { describe, expect, it, vi } from 'vitest';

import {
	createNangoPopupLauncher,
	type NangoPopupHost,
	type NangoPopupWindow,
} from '../src/ui/mail-connection/nango-popup-launcher';

function fixture(openResult: NangoPopupWindow | null = {
	closed: false,
	close: vi.fn(),
	navigate: vi.fn(),
}) {
	let interval: (() => void) | null = null;
	const host: NangoPopupHost = {
		open: vi.fn(() => openResult),
		setInterval: vi.fn(callback => {
			interval = callback;
			return 17;
		}),
		clearInterval: vi.fn(),
		queueMicrotask: callback => callback(),
	};
	return { host, popup: openResult, tick: () => interval?.() };
}

describe('Nango popup launcher', () => {
	it('opens a blank popup synchronously, then navigates only to an official Nango connect link', async () => {
		const { host, popup } = fixture();
		const events: string[] = [];
		const handle = createNangoPopupLauncher(host).open(async event => { events.push(event.type); });

		expect(host.open).toHaveBeenCalledWith('about:blank', '_blank', expect.stringContaining('popup=yes'));
		handle.setConnectLink('https://connect.nango.dev/?session_token=short-lived');
		await Promise.resolve();

		expect(popup?.navigate).toHaveBeenCalledWith('https://connect.nango.dev/?session_token=short-lived');
		expect(events).toEqual(['poll']);
		expect(host.setInterval).toHaveBeenCalled();
	});

	it('polls while the popup is open and emits close when the user closes the tab', async () => {
		const popup: NangoPopupWindow = { closed: false, close: vi.fn(), navigate: vi.fn() };
		const { host, tick } = fixture(popup);
		const events: string[] = [];
		const handle = createNangoPopupLauncher(host).open(async event => { events.push(event.type); });
		handle.setConnectLink('https://connect.nango.dev/?session_token=short-lived');
		await Promise.resolve();
		events.length = 0;

		tick();
		await Promise.resolve();
		expect(events).toEqual(['poll']);

		popup.closed = true;
		tick();
		await Promise.resolve();
		expect(events).toEqual(['poll', 'close']);
		expect(host.clearInterval).toHaveBeenCalledWith(17);
	});

	it('fails closed when popups are blocked or the link is not hosted by Nango', async () => {
		const blocked = fixture(null);
		const blockedEvents: string[] = [];
		createNangoPopupLauncher(blocked.host).open(async event => { blockedEvents.push(event.type); });
		await Promise.resolve();
		expect(blockedEvents).toEqual(['error']);

		const invalid = fixture();
		const invalidEvents: string[] = [];
		const handle = createNangoPopupLauncher(invalid.host).open(async event => { invalidEvents.push(event.type); });
		handle.setConnectLink('https://example.test/not-nango');
		await Promise.resolve();
		expect(invalidEvents).toEqual(['error']);
		expect(invalid.popup?.close).toHaveBeenCalled();
	});
});
