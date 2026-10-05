/**
 * Dev-mode UI server: runs a Vite dev server (HMR + source maps) and exposes it
 * to the hub-embedded iframe so you get true Hot Module Replacement and
 * TypeScript breakpoints — the browser talks to Vite directly, not to an inlined
 * bundle. Production keeps the relay inline-bundle path (mcp-message-handlers.ts);
 * this module is only loaded when `npm run dev` sets PRIVOS_DEV_UI=1.
 *
 * Two ways to reach the Vite server (DEV_TUNNEL env):
 *   - "localhost" (default): iframe loads http://localhost:<port>. Works when you
 *     view the hub in a browser on the SAME machine as Vite. No extra tooling.
 *     (Browsers exempt http://localhost subresources from mixed-content blocking.)
 *   - "cloudflared": spin up a public quick tunnel. Needed when the hub is opened
 *     on a DIFFERENT machine than the one running Vite. Requires the cloudflared
 *     binary. If PUBLIC_URL is set, that tunnel is reused and nothing is spawned.
 */
import { spawn, type ChildProcess } from 'child_process';
import type { HmrOptions } from 'vite';

const DEFAULT_VITE_PORT = 5179;

export interface DevUiServer {
	/** Origin the iframe loads UI assets from (http://localhost:<port> or https tunnel). */
	publicUrl: string;
	/** Stop the Vite server and any tunnel. */
	close: () => Promise<void>;
}

/** Spawn a cloudflared quick tunnel for the given local port; resolve with its public URL. */
function startCloudflaredTunnel(port: number): Promise<{ url: string; proc: ChildProcess }> {
	return new Promise((resolve, reject) => {
		const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let settled = false;
		const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

		const onData = (buf: Buffer) => {
			const m = buf.toString().match(urlRe);
			if (m && !settled) {
				settled = true;
				resolve({ url: m[0], proc });
			}
		};
		proc.stdout?.on('data', onData);
		proc.stderr?.on('data', onData); // cloudflared prints the URL banner to stderr

		proc.on('error', (err) => {
			if (!settled) {
				settled = true;
				reject(new Error(`cloudflared failed to start: ${err.message}`));
			}
		});
		proc.on('exit', (code) => {
			if (!settled) {
				settled = true;
				reject(new Error(`cloudflared exited early (code ${code}) before a tunnel URL appeared`));
			}
		});

		setTimeout(() => {
			if (!settled) {
				settled = true;
				proc.kill();
				reject(new Error('Timed out waiting for cloudflared tunnel URL (30s)'));
			}
		}, 30_000);
	});
}

/** Resolve the public origin + matching Vite HMR config for the chosen transport. */
async function resolveTransport(
	port: number,
): Promise<{ publicUrl: string; hmr: HmrOptions; allowedHosts: true | string[]; tunnelProc?: ChildProcess }> {
	const mode = (process.env.DEV_TUNNEL || 'localhost').toLowerCase();

	if (mode === 'localhost') {
		// Same-machine: browser reaches Vite directly; HMR over ws://localhost:<port>.
		return {
			publicUrl: `http://localhost:${port}`,
			hmr: { protocol: 'ws', host: 'localhost', clientPort: port },
			allowedHosts: true,
		};
	}

	if (mode === 'cloudflared') {
		// Reuse a developer-supplied tunnel if present; otherwise spin up cloudflared.
		let publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '') || '';
		let tunnelProc: ChildProcess | undefined;
		if (!publicUrl) {
			console.log('[Dev] Starting cloudflared tunnel...');
			const tunnel = await startCloudflaredTunnel(port);
			publicUrl = tunnel.url;
			tunnelProc = tunnel.proc;
			console.log(`[Dev] Tunnel: ${publicUrl}`);
		} else {
			console.log(`[Dev] Using provided PUBLIC_URL: ${publicUrl}`);
		}
		const tunnelHost = new URL(publicUrl).host;
		// TLS terminates at the tunnel edge → browser connects wss://<tunnel>:443.
		return {
			publicUrl,
			hmr: { protocol: 'wss', host: tunnelHost, clientPort: 443 },
			allowedHosts: [tunnelHost],
			tunnelProc,
		};
	}

	throw new Error(`Unknown DEV_TUNNEL mode "${mode}" (expected "localhost" or "cloudflared")`);
}

/** Start the Vite dev server (+ optional tunnel) and return the iframe-facing public URL. */
export async function startDevUiServer(): Promise<DevUiServer> {
	const port = Number(process.env.VITE_PORT) || DEFAULT_VITE_PORT;
	const { publicUrl, hmr, allowedHosts, tunnelProc } = await resolveTransport(port);

	const { createServer } = await import('vite');
	const vite = await createServer({
		configFile: false,
		root: 'src/ui',
		base: '/ui/',
		plugins: [(await import('@vitejs/plugin-react')).default()],
		server: { host: '0.0.0.0', port, strictPort: true, cors: true, allowedHosts, hmr },
	});
	await vite.listen(port);
	console.log(`[Dev] Vite dev server on http://localhost:${port} — UI served from ${publicUrl}`);

	return {
		publicUrl,
		close: async () => {
			await vite.close();
			tunnelProc?.kill();
		},
	};
}
