import { afterEach, describe, expect, it, vi } from 'vitest';
import { restCall, getFileTextById, readRoomFileText, OptionalFeatureUnavailableError } from '../src/ui/privos-rest';

function fakeApp(response: { statusCode: number; body: any }, calls: any[] = []) {
  return { rest: async (params: any) => { calls.push(params); return response; } } as any;
}

describe('getFileTextById', () => {
  it('reads the text through the file-management content route by id', async () => {
    const calls: any[] = [];
    const app = fakeApp({ statusCode: 200, body: { result: '# JD Nhân viên kinh doanh' } }, calls);
    await expect(getFileTextById(app, 'file-1')).resolves.toBe('# JD Nhân viên kinh doanh');
    expect(calls[0]).toMatchObject({ method: 'GET', path: 'file-management.files/file-1/content' });
  });

  it('throws instead of returning empty text when the body has no result', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: true } });
    await expect(getFileTextById(app, 'file-1')).rejects.toThrow('File content response did not include text');
  });

  it('propagates a Hub refusal so the caller can show the failure', async () => {
    const app = fakeApp({ statusCode: 403, body: { success: false, error: 'App is not permitted' } });
    await expect(getFileTextById(app, 'file-1')).rejects.toBeInstanceOf(OptionalFeatureUnavailableError);
  });
});

describe('readRoomFileText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the file through the file-management route without touching downloadUrl', async () => {
    const calls: any[] = [];
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const app = fakeApp({ statusCode: 200, body: { result: '# JD UI/UX Designer' } }, calls);
    await expect(readRoomFileText(app, { _id: 'jd-1', downloadUrl: 'http://10.88.255.1:9010/jd.md' })).resolves.toBe('# JD UI/UX Designer');
    expect(calls[0].path).toBe('file-management.files/jd-1/content');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to downloadUrl when the Hub route refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# JD từ downloadUrl')));
    const app = fakeApp({ statusCode: 403, body: { success: false } });
    await expect(readRoomFileText(app, { _id: 'jd-1', downloadUrl: 'https://files/jd.md' })).resolves.toBe('# JD từ downloadUrl');
  });

  it('throws the Hub failure when the download fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const app = fakeApp({ statusCode: 403, body: { success: false } });
    await expect(readRoomFileText(app, { _id: 'jd-1', downloadUrl: 'http://10.88.255.1:9010/jd.md' })).rejects.toBeInstanceOf(OptionalFeatureUnavailableError);
  });

  it('resolves an empty string for an empty file instead of reporting a failure', async () => {
    const app = fakeApp({ statusCode: 200, body: { result: '  ' } });
    await expect(readRoomFileText(app, { _id: 'jd-1' })).resolves.toBe('');
  });
});

describe('restCall', () => {
  it('surfaces the Hub error detail on a >=400 status instead of a bare status code', async () => {
    const app = fakeApp({ statusCode: 400, body: { success: false, error: 'Task is already bound to a different executor bot (bot-1)' } });
    await expect(restCall(app, 'POST', 'agents.sandbox.generate-async', {})).rejects.toThrow(
      'Task is already bound to a different executor bot (bot-1)',
    );
  });

  it('surfaces the Hub error detail on a 200 success:false body', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: false, error: 'Invalid bot: no active token (bot was not provisioned correctly)' } });
    await expect(restCall(app, 'POST', 'ai-messages.send', {})).rejects.toThrow(
      'Invalid bot: no active token (bot was not provisioned correctly)',
    );
  });

  it('falls back to a generic message when no detail is present', async () => {
    const app = fakeApp({ statusCode: 500, body: {} });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toThrow('Request failed (500)');
  });

  it('always raises OptionalFeatureUnavailableError on 403, regardless of body content', async () => {
    const app = fakeApp({ statusCode: 403, body: { success: false, error: 'ignored on 403' } });
    await expect(restCall(app, 'GET', 'some.route', {})).rejects.toBeInstanceOf(OptionalFeatureUnavailableError);
  });

  it('resolves normally on success', async () => {
    const app = fakeApp({ statusCode: 200, body: { success: true, attemptId: 'attempt-1' } });
    await expect(restCall(app, 'GET', 'some.route', {})).resolves.toEqual({ success: true, attemptId: 'attempt-1' });
  });
});
