/**
 * MCP JSON-RPC method handlers for the relay demo app.
 *
 * Production: the shell is served with its JS and CSS inlined
 * (`renderInlineShell`), so the iframe issues zero asset requests. This
 * deliberately opts OUT of the Hub's split-asset path: that path serves assets
 * from an object-storage snapshot taken once per installation generation, so any
 * rebuild that moved a content hash 404s until a version bump plus a Hub
 * Refresh. Inlining trades ~1.3 MB per tab open (against an 8 MB relay response
 * cap) for a UI that ships on rebuild + restart alone.
 *
 * In development: reads source and builds on-the-fly via Vite.
 */
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import {
	getPlatformContext,
	publicUrlFor,
	INVALID_PARAMS,
	type VerifiedActor,
} from '@privos_ai/app-server';

import _pkg from '../privos-app.json';
import { getAppIconDataUri } from './app-icon';
import { createLicenseGuard } from './license';
import { checkAgentBotCredential } from './agent-bot-credential-check';
import { PAYROLL_TOOL_DEFINITIONS, handlePayrollTool, isPayrollTool } from './payroll-tools';
import { MAIL_TOOL_DEFINITIONS, handleMailTool, isMailTool } from './mail-tools';
const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const TOOL_NAME = 'hr_management_dashboard';
// Pure data (no UI) tool: returns the SDK-verified caller actor — Managed Direct
// HTTP names it in the body-bound Hub dispatch assertion; Relay names it via a
// separately Hub-signed user token verified against the Hub's JWKS. See
// `handleWhoami` and `handleMcpMessage`'s `actor` parameter doc below.
const WHOAMI_TOOL = 'hr_whoami';
const BULK_EXPORT_TOOL = 'hr_bulk_export';
// Pure data (no UI) tool: proves the configured agent bot credential actually
// authenticates against the Hub. See agent-bot-credential-check.ts.
const CREDENTIAL_CHECK_TOOL = 'hr_agent_bot_credential_check';
/**
 * Read straight from the manifest rather than rebuilt from `pkg.name`: the Hub pins the declared
 * `resourceUri` at pairing and asks for exactly that string, so any manifest where the slug and
 * `name` disagree would make a `name`-derived URI answer a request nobody sends.
 */
const UI_RESOURCE_URI: string = (pkg.tools as any[]).find((tool) => tool?.name === TOOL_NAME)?.ui?.resourceUri;
if (!UI_RESOURCE_URI) throw new Error(`privos-app.json declares no ui.resourceUri for tool ${TOOL_NAME}.`);

/**
 * Embed origins this app declares, read straight from the published manifest so the runtime
 * advertisement and the marketplace listing can never disagree about what was requested.
 */
const UI_DECLARED_CSP: Record<string, string[]> | undefined = (pkg.tools as any[] | undefined)?.find(
	(tool) => tool?.ui?.resourceUri === UI_RESOURCE_URI,
)?.ui?.csp;

const appIcon = getAppIconDataUri();

const DIST_UI_DIR = path.join(moduleDir, '../dist/ui');
/** Matches `<link …>` — self-closing, so it has no end tag to consume. */
const LINK_TAG_RE = /<link\b[^>]*>/gi;
/** Matches `<script … src="…"></script>`, end tag included, so the whole element is replaced. */
const EXTERNAL_SCRIPT_TAG_RE = /<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*\1[^>]*>\s*<\/script>/gi;
const REL_RE = /\brel\s*=\s*["']([^"']+)["']/i;
const SRC_OR_HREF_RE = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i;

/**
 * Rendered once, lazily: reading `dist/ui` before it exists (e.g. `npm test`
 * runs ahead of `npm run build` in `verify:fast-pr`) must not crash every
 * caller that merely imports this module. A malformed build throws here — the
 * first time the UI is actually requested, never earlier.
 */
let inlineShellHtml: string | null = null;

/**
 * The built `index.html` with every `<script src>` / `<link rel=stylesheet>` replaced by the
 * file's own bytes. The sandboxed iframe runs at `Origin: null` and has nothing to resolve a
 * relative `./assets/…` against, so a reference surviving this pass would render a blank frame;
 * {@link assertNoExternalRefs} turns that into a loud boot failure instead.
 */
function renderInlineShell(): string {
	if (inlineShellHtml) return inlineShellHtml;

	const indexPath = path.join(DIST_UI_DIR, 'index.html');
	let html: string;
	try {
		html = fs.readFileSync(indexPath, 'utf8');
	} catch (err) {
		throw new Error(`renderInlineShell: cannot read ${indexPath}: ${(err as Error).message}`);
	}

	html = html.replace(LINK_TAG_RE, (tag) => {
		const rel = REL_RE.exec(tag)?.[1]?.toLowerCase();
		// Preloads only warm a network fetch that no longer happens; the bytes are already here.
		if (rel === 'modulepreload' || rel === 'preload') return '';
		if (rel !== 'stylesheet') return tag;
		const href = SRC_OR_HREF_RE.exec(tag)?.[1];
		if (!href) return tag;
		return `<style>${escapeForRawTextElement(readDistFile(href, indexPath), 'style')}</style>`;
	});

	html = html.replace(EXTERNAL_SCRIPT_TAG_RE, (tag) => {
		const src = SRC_OR_HREF_RE.exec(tag)?.[1];
		if (!src) return tag;
		return `<script type="module">${escapeForRawTextElement(readDistFile(src, indexPath), 'script')}</script>`;
	});

	// Debug escape hatch for usePolling.ts: the iframe runs at `Origin: null` with no reachable
	// URL or storage, so this is the only way to hand it a flag — a plain (non-module) inline
	// script placed before the bundle, which always runs before any deferred module script.
	if (process.env.PRIVOS_DEBUG_NO_POLL === '1') {
		html = html.replace(/<head[^>]*>/i, (tag) => `${tag}<script>window.__PRIVOS_NO_POLL__=true;</script>`);
	}

	assertNoExternalRefs(html, indexPath);
	inlineShellHtml = html;
	return html;
}

/** Read a build-relative reference (`./assets/index-<hash>.js`) from `dist/ui`, refusing escapes. */
function readDistFile(reference: string, indexPath: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//') || reference.startsWith('/')) {
		throw new Error(`renderInlineShell: ${indexPath} references a non-relative asset "${reference}" — build with Vite base: './'`);
	}
	const distRealpath = fs.realpathSync(DIST_UI_DIR);
	const filePath = fs.realpathSync(path.join(DIST_UI_DIR, reference));
	const relative = path.relative(distRealpath, filePath);
	if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`renderInlineShell: asset "${reference}" resolves outside ${DIST_UI_DIR}`);
	}
	return fs.readFileSync(filePath, 'utf8');
}

/**
 * Inside `<script>` / `<style>` the HTML tokenizer looks for exactly one thing: the element's own
 * closing tag. Bundled code carrying that literal (an HTML template string, a regex) would cut the
 * document in half. `<\/script` is an identity escape in both JS and CSS string literals — same
 * bytes to the parser that matters, invisible to the one that must not match.
 */
function escapeForRawTextElement(source: string, tagName: 'script' | 'style'): string {
	const escaped = source.replace(new RegExp(`</(?=${tagName})`, 'gi'), '<\\/');
	if (new RegExp(`</${tagName}`, 'i').test(escaped)) {
		throw new Error(`renderInlineShell: could not neutralize a literal </${tagName} in the bundle`);
	}
	return escaped;
}

/**
 * No `<script src>` / `<link href>` may survive inlining. Letting one through would reintroduce
 * exactly the failure this rendering path exists to remove — an asset fetch the iframe cannot
 * resolve — as a blank frame rather than an error.
 */
function assertNoExternalRefs(html: string, indexPath: string): void {
	const offenders: string[] = [];
	for (const tag of [...html.matchAll(LINK_TAG_RE), ...html.matchAll(/<script\b[^>]*>/gi)]) {
		if (SRC_OR_HREF_RE.test(tag[0])) offenders.push(tag[0]);
	}
	if (offenders.length > 0) {
		throw new Error(
			`renderInlineShell: ${indexPath} still references external assets after inlining:\n${offenders.map((o) => `  - ${o}`).join('\n')}`,
		);
	}
}

/**
 * When set, the UI is served live from a Vite dev server at this public origin
 * (HMR + breakpoints) instead of the split production bundle. See dev-server.ts.
 */
let devPublicUrl: string | null = null;

/** Enable dev mode: iframe loads UI from the Vite dev server at `publicUrl`. */
export function setDevPublicUrl(publicUrl: string): void {
	devPublicUrl = publicUrl.replace(/\/$/, '');
}

/** The shell HTML for the current mode — live dev server, or the built-and-cached production shell. */
function currentShellHtml(): string {
	return devPublicUrl ? getDevUiHtml(devPublicUrl) : renderInlineShell();
}

/**
 * Handle an incoming MCP JSON-RPC request and return the result.
 *
 * `actor` is the SDK's unified {@link VerifiedActor} — the same shape for
 * both transports, distinguished only by `actor.provenance`:
 *   - `'dispatch-assertion'` — Managed Direct HTTP; the Hub embedded the
 *     actor claim directly in the body-bound Cluster dispatch assertion
 *     verified by `verifyInboundDispatch` before this call.
 *   - `'user-token'` — Relay (`standalone-production`, and `development`
 *     whenever a Hub dispatch trust is configured); the SDK independently
 *     verified a separate Hub-signed RS256 user JWT against the Hub's JWKS
 *     and cross-bound it to the already-verified dispatch `roomId`.
 * `undefined` means no verified caller identity is available for this
 * request (no token was presented, the token was invalid, or JWKS
 * verification failed) — callers must treat that as "unknown", never fall
 * back to any unverified out-of-band field.
 */
export async function handleMcpMessage(
	method: string,
	_id: number,
	params: any,
	actor?: VerifiedActor,
): Promise<any> {
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: '2025-03-26',
				capabilities: {
					tools: {},
					extensions: {
						'io.modelcontextprotocol/ui': {
							mimeTypes: ['text/html;profile=mcp-app'],
						},
					},
				},
				serverInfo: {
				name: pkg.title || pkg.name,
				version: pkg.version,
				...(appIcon && { icon: appIcon }),
				// Advertise the exact schema-v2 declaration; Hub owns catalog metadata
				// and still enforces the selected subset server-side.
				...(Array.isArray(pkg.permissions) && { permissions: pkg.permissions }),
			},
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			return {
				tools: [
					{
						name: TOOL_NAME,
							title: pkg.title || 'PrivOS Demo MCP App',
						description: pkg.description || 'HR management dashboard',
						inputSchema: {
							type: 'object',
							properties: { roomId: { type: 'string' } },
						},
						_meta: {
							// The CSP block declares the external origins this app's UI would like to
							// embed. It grants nothing: a workspace admin approves what may actually
							// load, and the Hub enforces that approval on the served document.
							ui: { resourceUri: UI_RESOURCE_URI, csp: UI_DECLARED_CSP },
						},
					},
					{
						name: WHOAMI_TOOL,
						title: 'Who am I (verified)',
						description:
							"Return the actor authenticated by the Hub's body-bound private dispatch assertion.",
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					{
						name: BULK_EXPORT_TOOL,
						title: 'Bulk export HR records',
						description: 'Export records in bulk. Requires the Pro tier.',
						inputSchema: {
							type: 'object',
							properties: { records: { type: 'array', items: { type: 'object' } } },
							required: ['records'],
						},
					},
					{
						name: CREDENTIAL_CHECK_TOOL,
						title: 'Validate agent bot credential',
						description: "Confirm this app's configured agent bot credential authenticates against the Hub.",
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					...PAYROLL_TOOL_DEFINITIONS,
					...MAIL_TOOL_DEFINITIONS,
				],
			};

		case 'tools/call':
			if (params?.name === BULK_EXPORT_TOOL) {
				const records = Array.isArray(params?.arguments?.records) ? params.arguments.records : [];
				const guard = createLicenseGuard();
				guard.assert('bulk-export');
				guard.assertWithin('records', records.length);
				return { content: [{ type: 'text', text: JSON.stringify({ exported: records.length, records }) }] };
			}
			if (params?.name === WHOAMI_TOOL) {
				return handleWhoami(actor);
			}
			if (params?.name === CREDENTIAL_CHECK_TOOL) {
				return { content: [{ type: 'text', text: JSON.stringify(await checkAgentBotCredential()) }] };
			}
			if (isPayrollTool(params?.name)) {
				return handlePayrollTool(params.name, params?.arguments, actor);
			}
			if (isMailTool(params?.name)) {
				return handleMailTool(params.name, params?.arguments, actor);
			}
			if (params?.name !== TOOL_NAME) {
				throw new Error(`Unknown tool: ${params?.name || '<missing>'}`);
			}
			return {
				content: [
					{
						type: 'resource',
						resource: {
							uri: UI_RESOURCE_URI,
							mimeType: 'text/html;profile=mcp-app',
							text: currentShellHtml(),
						},
					},
				],
			};

		case 'resources/read':
			return handleResourcesRead(params?.uri);

		default:
			throw new Error(`Unknown method: ${method}`);
	}
}

/**
 * `resources/read` serves exactly one resource: the shell. The split-asset URIs
 * (`…/assets-manifest.json`, `…/assets/<file>`) are gone along with the split
 * itself — the shell carries its own bytes now, so there is nothing else to
 * read. Any other URI is refused; before the split, this handler echoed the UI
 * HTML for every URI it was asked about, and that silent fallback stays gone by
 * design (see the demo's CHANGELOG).
 *
 * Dev mode short-circuits ahead of all of this: the live Vite dev server is the
 * only source of truth there, so it keeps echoing the dev shell for whatever URI
 * was requested.
 */
function handleResourcesRead(uri: unknown): { contents: unknown[] } {
	if (devPublicUrl) {
		return {
			contents: [
				{
					uri: typeof uri === 'string' ? uri : UI_RESOURCE_URI,
					mimeType: 'text/html;profile=mcp-app',
					text: currentShellHtml(),
				},
			],
		};
	}

	if (uri === UI_RESOURCE_URI) {
		return { contents: [{ uri: UI_RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: currentShellHtml() }] };
	}

	throw Object.assign(new Error(`Unknown resource: ${typeof uri === 'string' ? uri : '<missing>'}`), {
		code: INVALID_PARAMS,
	});
}

/**
 * Backend handler for the `hr_whoami` tool.
 *
 * `actor` is only ever the SDK-verified {@link VerifiedActor} the caller
 * (`http-server.ts` for Managed Direct HTTP, `relay-transport.ts` for Relay)
 * forwarded from `runtime-identity.ts` / `context.actor`. This function never
 * reads any plain, unverified caller-identity field (e.g. request
 * `_meta.privosUser.userId`) — those ride alongside the signed token but are
 * not proof of anything on their own, and there is intentionally no fallback
 * to them here. The iframe never receives or forwards a bearer/user token.
 */
async function handleWhoami(actor?: VerifiedActor): Promise<any> {
	const wrap = (obj: Record<string, any>) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
	if (!actor) {
		return wrap({
			verified: false,
			error: 'No verified caller identity is available for this request (no token presented, or verification failed).',
		});
	}
	const username = actor.username || actor.userId;
	return wrap({
		verified: true,
		username,
		userId: actor.userId,
		roomId: actor.roomId,
		provenance: actor.provenance,
		message: `Backend verified this request came from ${username} (${actor.userId}) via ${actor.provenance}.`,
		platform: describePlatformEnvironment(),
	});
}

/**
 * What the platform injected and what the operator configured — reported so an
 * end-to-end check can prove the environment actually reached the container.
 *
 * A secret is reported as SET or UNSET and never by value: this output travels
 * through the room, so printing the SMTP password — or the agent bot
 * credential — here would be exactly the leak the whole write-only path
 * exists to prevent. `PRIVOS_AGENT_BOT_CREDENTIAL` is written by a workspace
 * admin from Admin > Apps > this app > Settings, never by this app; this
 * backend only ever reads it from its own environment, the same as any other
 * declared secret.
 */
function describePlatformEnvironment(): Record<string, unknown> {
	const platform = getPlatformContext();
	return {
		publicUrl: platform.publicUrl ?? null,
		accessMode: platform.accessMode ?? null,
		mediaUrlExample: publicUrlFor('/public/icon.svg') ?? null,
		companyName: process.env.HRM_COMPANY_NAME ?? null,
		locale: process.env.HRM_LOCALE ?? 'en-US',
		smtpPasswordSet: Boolean(process.env.HRM_SMTP_PASSWORD),
		agentBotCredentialSet: Boolean(process.env.PRIVOS_AGENT_BOT_CREDENTIAL),
	};
}

/**
 * Build HTML referencing a live Vite dev server (HMR + TypeScript breakpoints).
 * Loads @vite/client and the React Fast Refresh preamble cross-origin from the
 * tunnel, then the real entry module — equivalent to what Vite injects into a
 * transformed index.html, but emitted here since the relay serves the document.
 */
function getDevUiHtml(publicUrl: string): string {
	const base = `${publicUrl}/ui`;
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
	  <title>${pkg.title || 'PrivOS Demo MCP App'} (dev)</title>
  <script type="module" src="${base}/@vite/client"></script>
  <script type="module">
    import RefreshRuntime from "${base}/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${base}/main.tsx"></script>
</body>
</html>`;
}
