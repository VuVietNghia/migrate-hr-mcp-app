import type { MailReceipt } from './mail-contracts';
import { MailError } from './mail-errors';

interface QueueJob {
	fingerprint: string;
	deadline: number;
	task: (remainingMs: number) => Promise<MailReceipt>;
	resolve: (receipt: MailReceipt) => void;
	reject: (error: unknown) => void;
	promise: Promise<MailReceipt>;
}

interface ConnectionQueueState {
	active: boolean;
	pending: QueueJob[];
	fingerprints: Map<string, Promise<MailReceipt>>;
}

export interface ConnectionMailQueueOptions {
	now?: () => number;
	maxPendingPerConnection?: number;
	maxPendingTotal?: number;
}

export class ConnectionMailQueue {
	private readonly queues = new Map<string, ConnectionQueueState>();
	private readonly now: () => number;
	private readonly maxPendingPerConnection: number;
	private readonly maxPendingTotal: number;
	private totalPending = 0;

	constructor(options: ConnectionMailQueueOptions = {}) {
		this.now = options.now ?? Date.now;
		this.maxPendingPerConnection = options.maxPendingPerConnection ?? 20;
		this.maxPendingTotal = options.maxPendingTotal ?? 200;
	}

	get registrySize(): number {
		return this.queues.size;
	}

	enqueue(
		key: string,
		fingerprint: string,
		deadline: number,
		task: (remainingMs: number) => Promise<MailReceipt>,
	): Promise<MailReceipt> {
		if (deadline <= this.now()) return Promise.reject(new MailError('MAIL_TIMEOUT_BEFORE_SEND'));
		let state = this.queues.get(key);
		const joined = state?.fingerprints.get(fingerprint);
		if (joined) return joined;

		if (!state) {
			state = { active: false, pending: [], fingerprints: new Map() };
			this.queues.set(key, state);
		}
		if (state.active && (state.pending.length >= this.maxPendingPerConnection || this.totalPending >= this.maxPendingTotal)) {
			if (!state.active && state.pending.length === 0) this.queues.delete(key);
			return Promise.reject(new MailError('MAIL_QUEUE_FULL'));
		}

		let resolve = (_receipt: MailReceipt): void => undefined;
		let reject = (_error: unknown): void => undefined;
		const promise = new Promise<MailReceipt>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		});
		const job: QueueJob = { fingerprint, deadline, task, resolve, reject, promise };
		state.fingerprints.set(fingerprint, promise);
		if (state.active) {
			state.pending.push(job);
			this.totalPending += 1;
		} else {
			state.active = true;
			void this.runJob(key, state, job);
		}
		return promise;
	}

	private async runJob(key: string, state: ConnectionQueueState, job: QueueJob): Promise<void> {
		try {
			const remainingMs = job.deadline - this.now();
			if (remainingMs <= 0) throw new MailError('MAIL_TIMEOUT_BEFORE_SEND');
			job.resolve(await job.task(remainingMs));
		} catch (error) {
			job.reject(error);
		} finally {
			state.fingerprints.delete(job.fingerprint);
			const next = state.pending.shift();
			if (next) {
				this.totalPending -= 1;
				void this.runJob(key, state, next);
			} else {
				state.active = false;
				if (this.queues.get(key) === state) this.queues.delete(key);
			}
		}
	}
}
