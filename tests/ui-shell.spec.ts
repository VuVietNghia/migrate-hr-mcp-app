import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import appManifest from '../privos-app.json';
import { handleMcpMessage } from '../src/mcp-message-handlers';
import { LazyBoundary } from '../src/ui/lazy-boundary';

// Read the real `resourceUri` off the published manifest rather than duplicating it as a second
// literal — the wire contract requires `appSlug` (the `ui://` host) to equal `app.appId`
// (`privos-app.json`'s `name`), and a hardcoded literal here could drift from both independently
// and hide exactly the mismatch this file exists to catch.
const uiTool = (appManifest.tools as { ui?: { resourceUri?: string } }[]).find((tool) => tool.ui?.resourceUri);
const UI_RESOURCE_URI = uiTool!.ui!.resourceUri!;
const ASSET_URI_PREFIX = `${UI_RESOURCE_URI.slice(0, UI_RESOURCE_URI.lastIndexOf('/') + 1)}assets/`;
/** Matches the relay response cap the inlined shell has to fit inside (`DEFAULT_MAX_RESPONSE_BYTES`). */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DIST_ASSETS_DIR = fileURLToPath(new URL('../dist/ui/assets/', import.meta.url));

/** Total bytes the build emitted — what an inlined shell must contain at minimum. */
function builtAssetBytes(): number {
  return readdirSync(DIST_ASSETS_DIR).reduce((total, name) => total + statSync(DIST_ASSETS_DIR + name).size, 0);
}

/** The single build output with the given extension; the inline shell only works with one of each. */
function builtAssetNamed(extension: string): string {
  const matches = readdirSync(DIST_ASSETS_DIR).filter((name) => name.endsWith(extension));
  expect(matches).toHaveLength(1);
  return matches[0];
}

// `verify:fast-pr` runs `test` before `build`, so these assertions on the production shell/asset
// contract cannot assume `dist/ui` already exists — build it here first, the same way
// packaging.spec.ts self-invokes its own script instead of assuming prior pipeline steps ran.
beforeAll(() => {
  // `node_modules/.bin/vite` is an extensionless shell script — spawnSync cannot execute it on
  // Windows. Call vite's JS entry with the node binary already running the tests: works on every OS.
  // vitest sets NODE_ENV=test, and Vite keys minification off it: a test-mode build is
  // unminified and, with emptyOutDir, replaces dist/ui with it. The shell inlines whatever is
  // in dist/ui, so an unminified build would have this suite assert a payload several times
  // the size of the one that ships — and the size assertion below is a real contract against
  // the relay response cap. Pin production: assert the artifact that actually ships.
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `vite build failed ahead of the UI shell tests: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
});

describe('UI resource identity (appSlug = app.appId, never a different host)', () => {
  it('keeps the ui:// host equal to the registered app id — a mismatch 404s every asset', () => {
    expect(new URL(UI_RESOURCE_URI).host).toBe(appManifest.name);
  });
});

describe('built UI shell with inlined assets', () => {
  it('inlines every script and stylesheet so the iframe fetches nothing', async () => {
    const result = await handleMcpMessage('resources/read', 1, { uri: UI_RESOURCE_URI });
    const html = result.contents[0].text as string;

    // The Hub only fetches and rewrites assets for a shell that opts in with this meta tag.
    // Its absence is what keeps this app off the generation-snapshot path entirely.
    expect(html).not.toContain('privos-ui-assets');
    // No `src`/`href` may survive on a script or link tag: the sandboxed iframe runs at
    // `Origin: null` and has nothing to resolve even a relative reference against.
    for (const tag of [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)]) {
      expect(tag[0]).not.toMatch(/\b(?:src|href)\s*=/i);
    }
    expect(html).toContain('<script type="module">');
    expect(html).toContain('<style>');
  });

  it('carries each built file verbatim, escaped so it cannot terminate its own element', async () => {
    const result = await handleMcpMessage('resources/read', 2, { uri: UI_RESOURCE_URI });
    const html = result.contents[0].text as string;

    // The bundle is present in full, not truncated or summarized.
    expect(Buffer.byteLength(html, 'utf8')).toBeGreaterThan(builtAssetBytes());

    // Each built file appears as the exact body of its element, under the one transformation the
    // renderer is allowed to make. `</script` is the ONLY sequence that ends a script element, so
    // the literal `<script` and `</style>` the drafting templates embed must survive untouched —
    // asserting on the whole document instead would wrongly flag those as breakage.
    for (const [name, tag] of [
      [builtAssetNamed('.js'), 'script'],
      [builtAssetNamed('.css'), 'style'],
    ] as const) {
      const source = readFileSync(DIST_ASSETS_DIR + name, 'utf8');
      const escaped = source.replace(new RegExp(`</(?=${tag})`, 'gi'), '<\\/');
      const open = tag === 'script' ? '<script type="module">' : '<style>';
      expect(html).toContain(`${open}${escaped}</${tag}>`);
      expect(escaped).not.toMatch(new RegExp(`</${tag}`, 'i'));
    }

    // The document survives to its own end — the shell was not truncated mid-bundle.
    expect(html.trimEnd()).toMatch(/<\/html>$/);
  });

  it('fits inside the relay response cap it now depends on', async () => {
    const result = await handleMcpMessage('resources/read', 3, { uri: UI_RESOURCE_URI });
    const bytes = Buffer.byteLength(result.contents[0].text as string, 'utf8');
    expect(bytes).toBeLessThan(MAX_RESPONSE_BYTES);
  });

  it('refuses the retired split-asset URIs with JSON-RPC -32602', async () => {
    for (const [id, uri] of [
      [4, `${ASSET_URI_PREFIX}index-abcdefgh.js`],
      [5, `${ASSET_URI_PREFIX}does-not-exist.js.map`],
      [6, `${UI_RESOURCE_URI.slice(0, UI_RESOURCE_URI.lastIndexOf('/') + 1)}assets-manifest.json`],
    ] as const) {
      const refused = await handleMcpMessage('resources/read', id, { uri }).catch(
        (err: Error & { code?: number }) => err,
      );
      expect(refused).toBeInstanceOf(Error);
      expect((refused as Error & { code?: number }).code).toBe(-32602);
    }
  });

  it('serves the identical shell from both the tools/call embedded resource and resources/read', async () => {
    const viaResourcesRead = await handleMcpMessage('resources/read', 6, { uri: UI_RESOURCE_URI });
    const viaToolsCall = await handleMcpMessage('tools/call', 7, {
      name: 'hr_management_dashboard',
      arguments: {},
    });
    expect(viaToolsCall.content[0].resource.text).toBe(viaResourcesRead.contents[0].text);
  });
});

describe('lazy panel error boundary — Reload fallback', () => {
  it('renders the "unavailable" fallback after catching a failed chunk load', () => {
    const derived = LazyBoundary.getDerivedStateFromError();
    expect(derived).toEqual({ hasError: true });

    const boundary = new LazyBoundary({ children: createElement('div') });
    boundary.state = derived;
    const output = boundary.render() as any;

    const rendered = JSON.stringify(output);
    expect(rendered).toContain('A new version of this app is available');
    expect(rendered).toContain('Reload');

    // The Reload button must actually trigger a full page reload, not a re-render.
    const button = output.props.children[1];
    expect(button.type).toBe('button');
    const reload = { reload: () => {} };
    let called = false;
    reload.reload = () => {
      called = true;
    };
    (globalThis as any).window = { location: reload };
    button.props.onClick();
    expect(called).toBe(true);
  });

  it('renders children unchanged before any error is caught', () => {
    const child = createElement('span', { id: 'ok' }, 'content');
    const boundary = new LazyBoundary({ children: child });
    expect(boundary.render()).toBe(child);
  });
});
