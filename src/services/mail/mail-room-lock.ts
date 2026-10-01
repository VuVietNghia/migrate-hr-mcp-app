import type { MailScope } from './mail-contracts';

interface LockEntry {
	tail: Promise<void>;
	waiters: number;
}

function namespace(scope: MailScope): string {
	return `${scope.installationId}\u0000${scope.roomId}`;
}

export class MailRoomLock {
	private readonly entries = new Map<string, LockEntry>();

	async run<T>(scope: MailScope, action: () => Promise<T>): Promise<T> {
		const key = namespace(scope);
		const existing = this.entries.get(key);
		const previous = existing?.tail ?? Promise.resolve();
		let release = (): void => undefined;
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		const entry: LockEntry = existing ?? { tail: Promise.resolve(), waiters: 0 };
		entry.waiters += 1;
		entry.tail = previous.catch(() => undefined).then(() => gate);
		this.entries.set(key, entry);

		await previous.catch(() => undefined);
		try {
			return await action();
		} finally {
			release();
			entry.waiters -= 1;
			if (entry.waiters === 0 && this.entries.get(key) === entry) this.entries.delete(key);
		}
	}
}
