import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import publisherManifest from '../privos-app.json';
import { createManifest, MARKETPLACE_MANIFEST_FIELDS } from '../src/manifest';
import { lintManifest } from '@privos_ai/app-server/manifest-tools';

describe('manifest', () => {
  it('uses the CV Matcher identity for the generated agent bot', () => {
    expect(publisherManifest.agentBot).toEqual({
      name: 'CV Matcher Assistant',
      slug: 'cv-matcher-assistant',
    });
  });

  it('serves the canonical Marketplace manifest', () => {
    const manifest = createManifest();
    expect(Object.keys(manifest)).toEqual(MARKETPLACE_MANIFEST_FIELDS);
    expect(manifest).toEqual(publisherManifest);
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.title).toBe(pkg.title);
    expect(manifest.repository).toBe(pkg.repository.url);
  });

  it('passes strict manifest lint and emits deterministic canonical hashes', () => {
    const report = lintManifest(createManifest());
    expect(report.valid, report.errors.join('; ')).toBe(true);
    expect(report.canonicalManifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.publisherPermissionDeclarationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  // Regression coverage for the "Error: No UI resource available" / JSON-RPC -32602 incident
  // (2026-09-08): `name` was renamed three times without updating `tools[*].ui.resourceUri`
  // alongside it, and neither `manifest:lint` nor `npm run build` catches that drift — this is
  // a static assertion so it fails at `npm test` speed, without waiting on a `vite build`.
  it('keeps every declared UI resourceUri host equal to the manifest name', () => {
    const uiTools = (publisherManifest.tools as { ui?: { resourceUri?: string } }[]).filter((tool) => tool.ui?.resourceUri);
    expect(uiTools.length).toBeGreaterThan(0);
    for (const tool of uiTools) {
      expect(new URL(tool.ui!.resourceUri!).host).toBe(publisherManifest.name);
    }
  });

  it('declares the complete Room mailbox contract without EmailJS environment keys', () => {
    const toolNames = publisherManifest.tools.map(tool => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'hrm.mail.connection.get',
      'hrm.mail.connection.begin',
      'hrm.mail.connection.complete',
      'hrm.mail.connection.disconnect',
    ]));
    const send = publisherManifest.tools.find(tool => tool.name === 'hrm.mail.send');
    expect(send?.inputSchema.properties).toHaveProperty('recordHistory');
    expect(publisherManifest.env.some(entry => entry.key.startsWith('EMAILJS_'))).toBe(false);
    expect(publisherManifest.dataPolicy.externalDestinations).toEqual(expect.arrayContaining([
      'Nango',
      'Google Gmail API',
      'Microsoft Graph API',
    ]));
    const dashboard = publisherManifest.tools.find(tool => tool.name === 'hr_management_dashboard');
    expect(dashboard?.ui?.csp?.frameDomains).toContain('https://connect.nango.dev');
  });

  it('grants the Room mail agent bot access to its App Database state', () => {
    const permissions = new Map(
      publisherManifest.permissions.map(permission => [permission.scope, permission]),
    );

    for (const scope of ['db:read', 'db:write', 'db:schema:read', 'db:schema:write']) {
      expect(permissions.get(scope)).toMatchObject({
        requirement: 'required',
        context: 'room',
        executionContext: 'both',
      });
    }
  });

  it('lets an interactive Room member join the app agent bot before mail OAuth', () => {
    const permission = publisherManifest.permissions.find(entry => entry.scope === 'bot:room:join');

    expect(permission).toMatchObject({
      requirement: 'required',
      context: 'room',
      executionContext: 'user',
      feature: 'hr.mail.bot.room.join',
    });
  });
});
