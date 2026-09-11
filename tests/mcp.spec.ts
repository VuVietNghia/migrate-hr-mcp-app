import { afterEach, describe, expect, it } from 'vitest';
import { handleMcpMessage } from '../src/mcp-message-handlers';
import publisherManifest from '../privos-app.json';

describe('JSON-RPC handlers', () => {
  afterEach(() => {
    delete process.env.PRIVOS_AGENT_BOT_CREDENTIAL;
    delete process.env.PRIVOS_AGENT_BOT_USER_ID;
  });

  it('initializes and lists tools', async () => {
    expect((await handleMcpMessage('initialize', 1, {})).serverInfo.name).toBeTruthy();
    const listed = await handleMcpMessage('tools/list', 2, {});
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hr_bulk_export');
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hr_agent_bot_credential_check');
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hrm.payroll.query');
    expect(listed.tools.map((tool: any) => tool.name)).toContain('hrm.mail.send');
    const whoami = listed.tools.find((tool: any) => tool.name === 'hr_whoami');
    expect(whoami.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('fails closed on hrm.payroll.* without a verified actor', async () => {
    const rejected = await handleMcpMessage('tools/call', 30, { name: 'hrm.payroll.query', arguments: { roomId: 'room-1' } }).catch((e: Error) => e);
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toContain('verified caller identity');
  });

  it('routes hr_agent_bot_credential_check to the credential self-check, reporting absent env as not-configured', async () => {
    const result = await handleMcpMessage('tools/call', 5, { name: 'hr_agent_bot_credential_check', arguments: {} });
    expect(JSON.parse(result.content[0].text)).toEqual({ status: 'not-configured' });
  });

  it('uses only a verified actor for backend identity, regardless of transport', async () => {
    const unverified = await handleMcpMessage('tools/call', 3, { name: 'hr_whoami', arguments: {} });
    expect(JSON.parse(unverified.content[0].text)).toMatchObject({ verified: false });

    // Managed Direct HTTP: actor came from the Hub-embedded dispatch-assertion claim.
    const verifiedManaged = await handleMcpMessage(
      'tools/call',
      4,
      { name: 'hr_whoami', arguments: { userToken: 'ignored-browser-secret' } },
      { userId: 'user-1', username: 'alice', roomId: 'room-1', claims: Object.freeze({}), provenance: 'dispatch-assertion' },
    );
    expect(JSON.parse(verifiedManaged.content[0].text)).toMatchObject({
      verified: true,
      userId: 'user-1',
      username: 'alice',
      roomId: 'room-1',
      provenance: 'dispatch-assertion',
    });
    expect(verifiedManaged.content[0].text).not.toContain('ignored-browser-secret');

    // Relay: actor came from a separately Hub-signed user token verified against the Hub JWKS.
    const verifiedRelay = await handleMcpMessage(
      'tools/call',
      5,
      { name: 'hr_whoami', arguments: {} },
      { userId: 'user-2', username: 'bob', roomId: 'room-2', claims: Object.freeze({ sub: 'user-2' }), provenance: 'user-token' },
    );
    expect(JSON.parse(verifiedRelay.content[0].text)).toMatchObject({
      verified: true,
      userId: 'user-2',
      username: 'bob',
      roomId: 'room-2',
      provenance: 'user-token',
    });
  });
  // Reproduces the 2026-09-08 incident directly: after `name` changes, the Hub keeps sending
  // `resources/read` for whatever `ui://<old-name>/form.html` it registered at the last pairing,
  // while this handler now computes UI_RESOURCE_URI from the CURRENT `name`. The two diverge and
  // the Hub-visible symptom is "Error: No UI resource available" — this locks the handler's own
  // contract for that mismatch: a loud, specific JSON-RPC -32602, never a silent fallback.
  it('rejects a stale ui:// resourceUri (simulating a Hub still on a previous app id) with -32602', async () => {
    const staleUri = 'ui://ai.privos.mcp-app-demo-previous-name/form.html';
    const rejected = await handleMcpMessage('resources/read', 20, { uri: staleUri }).catch(
      (err: Error & { code?: number }) => err,
    );
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error & { code?: number }).code).toBe(-32602);
    expect((rejected as Error).message).toContain(staleUri);
  });

  it('serves resources/read for the current, correctly-derived resourceUri', async () => {
    const currentUri = (publisherManifest.tools as { ui?: { resourceUri?: string } }[]).find(
      (tool) => tool.ui?.resourceUri,
    )!.ui!.resourceUri!;
    const ok = await handleMcpMessage('resources/read', 21, { uri: currentUri });
    expect(ok.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(typeof ok.contents[0].text).toBe('string');
  });

  it('calls the licensed tool on Pro', async () => {
    process.env.PRIVOS_APP_LICENSE = '{"tier":"pro","state":"active"}';
    const result = await handleMcpMessage('tools/call', 3, {
      name: 'hr_bulk_export', arguments: { records: [{ id: 1 }] },
    });
    delete process.env.PRIVOS_APP_LICENSE;
    expect(JSON.parse(result.content[0].text).exported).toBe(1);
  });
});
