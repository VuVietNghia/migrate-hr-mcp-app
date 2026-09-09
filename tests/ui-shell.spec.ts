import { spawnSync } from 'node:child_process';
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
const ASSETS_MANIFEST_URI = `${UI_RESOURCE_URI.slice(0, UI_RESOURCE_URI.lastIndexOf('/') + 1)}assets-manifest.json`;
const ASSET_URI_PREFIX = `${UI_RESOURCE_URI.slice(0, UI_RESOURCE_URI.lastIndexOf('/') + 1)}assets/`;

// `verify:fast-pr` runs `test` before `build`, so these assertions on the production shell/asset
// contract cannot assume `dist/ui` already exists — build it here first, the same way
// packaging.spec.ts self-invokes its own script instead of assuming prior pipeline steps ran.
beforeAll(() => {
  // `node_modules/.bin/vite` is an extensionless shell script — spawnSync cannot execute it on
  // Windows. Call vite's JS entry with the node binary already running the tests: works on every OS.
  // vitest sets NODE_ENV=test, and Vite keys minification off it: a test-mode build emits
  // DIFFERENT content hashes than `npm run build` and, with emptyOutDir, replaces dist/ui with
  // them. The Hub serves UI assets from a snapshot of the production filenames, so letting a
  // test-mode build land in dist/ui makes a running app request assets the Hub has never seen.
  // Pin production here: this suite must assert the artifact that actually ships.
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

describe('built UI shell and split assets', () => {
  it('serves a shell with the relay meta tag, the boot watchdog, and only relative asset tags', async () => {
    const result = await handleMcpMessage('resources/read', 1, { uri: UI_RESOURCE_URI });
    const html = result.contents[0].text as string;

    expect(html).toContain('<meta name="privos-ui-assets" content="relay">');
    expect(html).toContain('__privosUiBooted');
    expect(html).toContain('ui/asset-load-failed');
    // Every script/link tag must reference `./assets/…` — never an absolute or external URL.
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) {
      expect(match[1]).toMatch(/^\.?\/?assets\//);
    }
  });

  it('lists build files through the sibling assets-manifest resource', async () => {
    const result = await handleMcpMessage('resources/read', 2, { uri: ASSETS_MANIFEST_URI });
    const manifest = JSON.parse(result.contents[0].text as string) as { files: { name: string; size: number; type: string }[] };

    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.some((f) => f.name.endsWith('.js'))).toBe(true);
    expect(manifest.files.some((f) => f.name.endsWith('.css'))).toBe(true);
    // The demo tarball that used to prove non-JS/CSS assets get hashed and listed shipped with
    // the platform demo panels and was removed in 3.0.0; the contract that remains is that every
    // listed entry is addressable and sized.
    for (const file of manifest.files) {
      expect(file.name).toMatch(/^[^/]+$/);
      expect(file.size).toBeGreaterThan(0);
      expect(typeof file.type).toBe('string');
    }
  });

  it('serves a listed asset and refuses an unlisted or .map uri with JSON-RPC -32602', async () => {
    const manifestResult = await handleMcpMessage('resources/read', 3, { uri: ASSETS_MANIFEST_URI });
    const { files } = JSON.parse(manifestResult.contents[0].text as string) as { files: { name: string }[] };
    const jsFile = files.find((f) => f.name.endsWith('.js'))!;

    const asset = await handleMcpMessage('resources/read', 4, {
      uri: `${ASSET_URI_PREFIX}${jsFile.name}`,
    });
    expect(asset.contents[0].mimeType).toBe('text/javascript');
    expect(typeof asset.contents[0].text).toBe('string');

    const unknown = await handleMcpMessage('resources/read', 5, {
      uri: `${ASSET_URI_PREFIX}does-not-exist.js.map`,
    }).catch((err: Error & { code?: number }) => err);
    expect(unknown).toBeInstanceOf(Error);
    expect((unknown as Error & { code?: number }).code).toBe(-32602);
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
