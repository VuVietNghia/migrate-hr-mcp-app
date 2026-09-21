/**
 * Server-side EmailJS relay. EmailJS's REST API only accepts non-browser
 * callers that present the account's private key as `accessToken`, so all
 * four variables are mandatory. Values come from the app's declared secret
 * env (`privos-app.json` → `env`), never from the UI.
 */
import { createHash } from 'node:crypto';

import { TaskQueue } from './task-queue';

export interface SendMailParams {
	toName: string;
	toEmail: string;
	subject: string;
	htmlContent: string;
}

export interface MailRelayEnv {
	serviceId?: string;
	templateId?: string;
	publicKey?: string;
	privateKey?: string;
}

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

/** Ceiling for one EmailJS request. See the `signal` in `send()` for why it is mandatory. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Identifies a message by what the recipient would actually receive. Each field is length-prefixed,
 * so no separator can be confused with content that happens to contain it.
 */
function fingerprint(params: SendMailParams): string {
	const hash = createHash('sha256');
	for (const field of [params.toEmail, params.toName, params.subject, params.htmlContent]) {
		hash.update(`${field.length}:${field}`);
	}
	return hash.digest('hex');
}

/**
 * EmailJS explains a rejection in plain text — 412 "Gmail_API: Invalid grant. Please reconnect your
 * Gmail account" is the whole fix, where the bare status says nothing. The body may echo request
 * fields, so every configured credential is masked before any of it leaves the relay.
 */
function describeRejection(body: string, env: Required<MailRelayEnv>): string {
	let text = body;
	for (const secret of [env.privateKey, env.publicKey, env.serviceId, env.templateId]) {
		text = text.split(secret).join('[redacted]');
	}
	return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function asRequestError(error: unknown, timeoutMs: number): Error {
	const name = (error as { name?: unknown } | null)?.name;
	if (name === 'TimeoutError' || name === 'AbortError') {
		return new Error(`EmailJS không phản hồi trong ${timeoutMs}ms`);
	}
	return error instanceof Error ? error : new Error(String(error));
}

export function readMailRelayEnv(env: NodeJS.ProcessEnv = process.env): MailRelayEnv {
	return {
		serviceId: env.EMAILJS_SERVICE_ID,
		templateId: env.EMAILJS_TEMPLATE_ID,
		publicKey: env.EMAILJS_PUBLIC_KEY,
		privateKey: env.EMAILJS_PRIVATE_KEY,
	};
}

function requireEnv(env: MailRelayEnv): Required<MailRelayEnv> {
	const missing = (
		[
			['serviceId', 'EMAILJS_SERVICE_ID'],
			['templateId', 'EMAILJS_TEMPLATE_ID'],
			['publicKey', 'EMAILJS_PUBLIC_KEY'],
			['privateKey', 'EMAILJS_PRIVATE_KEY'],
		] as const
	)
		.filter(([key]) => !env[key])
		.map(([, name]) => name);
	if (missing.length) throw new Error(`Mail relay is not configured: missing ${missing.join(', ')}`);
	return env as Required<MailRelayEnv>;
}

export class MailRelayService {
	private readonly queue: TaskQueue;
	private readonly env: MailRelayEnv;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;
	/** Fingerprint → the attempt that is queued or in flight, so an identical request joins it. */
	private readonly pending = new Map<string, Promise<void>>();

	constructor(opts: { env?: MailRelayEnv; fetchImpl?: typeof fetch; delayMs?: number; timeoutMs?: number } = {}) {
		this.env = opts.env ?? readMailRelayEnv();
		this.fetchImpl = opts.fetchImpl ?? fetch;
		// 1.5s between sends keeps the account under EmailJS's rate limit.
		this.queue = new TaskQueue({ delayMs: opts.delayMs ?? 1500 });
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	/**
	 * Resolves once EmailJS has accepted the message.
	 *
	 * A request identical to one STILL QUEUED joins that attempt instead of queueing a second copy.
	 * Callers wait behind the whole queue, so the Hub can time a tool call out while its message is
	 * still waiting; the operator then retries a message that is in fact on its way. Joining it means
	 * that retry cannot put two copies in the queue.
	 *
	 * Once an attempt has finished, the same message is sent again on request. Resending an invite to a
	 * candidate — after changing the template, or simply once more — is a normal operator action, and an
	 * earlier version that swallowed identical messages for 10 minutes reported them as sent when
	 * nothing had gone out.
	 */
	queueMail(params: SendMailParams): Promise<void> {
		const key = fingerprint(params);
		const inFlight = this.pending.get(key);
		if (inFlight) return inFlight;

		const attempt = this.queue.enqueue(() => this.send(params)).finally(() => {
			this.pending.delete(key);
		});
		this.pending.set(key, attempt);
		return attempt;
	}

	private async send(params: SendMailParams): Promise<void> {
		const env = requireEnv(this.env);
		let response: Response;
		try {
			response = await this.fetchImpl(EMAILJS_SEND_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					service_id: env.serviceId,
					template_id: env.templateId,
					user_id: env.publicKey,
					accessToken: env.privateKey,
					template_params: {
						name: params.toName,
						to_name: params.toName,
						to_email: params.toEmail,
						subject: params.subject,
						message: params.htmlContent,
					},
				}),
				// The queue runs one send at a time, so a socket that never answers would hold up
				// every other sender indefinitely. Bound each attempt instead.
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch (error) {
			throw asRequestError(error, this.timeoutMs);
		}
		if (!response.ok) {
			const detail = describeRejection(await response.text().catch(() => ''), env);
			throw new Error(`EmailJS rejected the message (${response.status})${detail ? `: ${detail}` : ''}`);
		}
	}
}
