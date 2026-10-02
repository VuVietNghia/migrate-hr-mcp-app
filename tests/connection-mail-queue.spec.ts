import { describe, expect, it } from 'vitest';

import { ConnectionMailQueue } from '../src/services/mail/connection-mail-queue';

const receipt = {
	status: 'accepted' as const,
	provider: 'google' as const,
	senderEmail: 'hr@example.com',
	connectionRevision: 'revision-a',
};

describe('ConnectionMailQueue', () => {
	it('joins only an identical pending attempt and permits a later intentional resend', async () => {
		const queue = new ConnectionMailQueue();
		let release = (): void => undefined;
		let markStarted = (): void => undefined;
		const started = new Promise<void>(resolve => { markStarted = resolve; });
		let calls = 0;
		const task = async () => {
			calls += 1;
			markStarted();
			await new Promise<void>(resolve => {
				release = resolve;
			});
			return receipt;
		};
		const first = queue.enqueue('connection-a', 'same', Date.now() + 5000, task);
		const joined = queue.enqueue('connection-a', 'same', Date.now() + 5000, task);
		await started;
		release();
		await Promise.all([first, joined]);
		expect(calls).toBe(1);

		const resend = queue.enqueue('connection-a', 'same', Date.now() + 5000, async () => {
			calls += 1;
			return receipt;
		});
		await resend;
		expect(calls).toBe(2);
	});

	it('does not let a slow connection block another connection', async () => {
		const queue = new ConnectionMailQueue();
		let release = (): void => undefined;
		let markStarted = (): void => undefined;
		const started = new Promise<void>(resolve => { markStarted = resolve; });
		const slow = queue.enqueue('connection-a', 'a', Date.now() + 5000, async () => {
			markStarted();
			await new Promise<void>(resolve => {
				release = resolve;
			});
			return receipt;
		});
		await started;
		await expect(
			queue.enqueue('connection-b', 'b', Date.now() + 5000, async () => receipt),
		).resolves.toEqual(receipt);
		release();
		await slow;
	});

	it('does not dispatch a queued request after its deadline and cleans idle state', async () => {
		let now = 1000;
		const queue = new ConnectionMailQueue({ now: () => now });
		let release = (): void => undefined;
		let markStarted = (): void => undefined;
		const started = new Promise<void>(resolve => { markStarted = resolve; });
		const first = queue.enqueue('connection-a', 'first', 5000, async () => {
			markStarted();
			await new Promise<void>(resolve => {
				release = resolve;
			});
			return receipt;
		});
		let dispatched = false;
		const expired = queue.enqueue('connection-a', 'expired', 1200, async () => {
			dispatched = true;
			return receipt;
		});
		await started;
		now = 1300;
		release();
		await first;
		await expect(expired).rejects.toMatchObject({ code: 'MAIL_TIMEOUT_BEFORE_SEND' });
		expect(dispatched).toBe(false);
		expect(queue.registrySize).toBe(0);
	});
});
