/**
 * Server-side EmailJS relay. EmailJS's REST API only accepts non-browser
 * callers that present the account's private key as `accessToken`, so all
 * four variables are mandatory. Values come from the app's declared secret
 * env (`privos-app.json` → `env`), never from the UI.
 */
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

	constructor(opts: { env?: MailRelayEnv; fetchImpl?: typeof fetch; delayMs?: number } = {}) {
		this.env = opts.env ?? readMailRelayEnv();
		this.fetchImpl = opts.fetchImpl ?? fetch;
		// 1.5s between sends keeps the account under EmailJS's rate limit.
		this.queue = new TaskQueue({ delayMs: opts.delayMs ?? 1500 });
	}

	queueMail(params: SendMailParams): Promise<void> {
		return this.queue.enqueue(() => this.send(params));
	}

	private async send(params: SendMailParams): Promise<void> {
		const env = requireEnv(this.env);
		const response = await this.fetchImpl(EMAILJS_SEND_URL, {
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
		});
		if (!response.ok) {
			// The body may echo request fields (incl. accessToken) — keep it out of the error.
			await response.text().catch(() => '');
			throw new Error(`EmailJS rejected the message (${response.status})`);
		}
	}
}
