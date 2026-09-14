import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivosInterviewEmailTemplateFileGateway } from '../src/ui/email-templates/interview-email-template-repository';

const TEMPLATE = '---\nid: moi-phong-van-mac-dinh\n---\nKính gửi {{candidate_name}}';

function fakeApp(response: { statusCode: number; body: any }) {
  const paths: string[] = [];
  const app = { rest: async ({ path }: { path: string }) => { paths.push(path); return response; } } as any;
  return { app, paths };
}

describe('PrivosInterviewEmailTemplateFileGateway.read', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a template through the file-management route instead of the unreachable downloadUrl', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { app, paths } = fakeApp({ statusCode: 200, body: { result: TEMPLATE } });
    const gateway = new PrivosInterviewEmailTemplateFileGateway(app, 'room-1');

    await expect(gateway.read('moi-phong-van-mac-dinh.md', 'file-1', 'http://10.88.255.1:9010/x.md')).resolves.toBe(TEMPLATE);
    expect(paths).toEqual(['file-management.files/file-1/content']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces the failure when neither read path works, so no default template overwrites it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { app } = fakeApp({ statusCode: 500, body: { success: false, error: 'boom' } });
    const gateway = new PrivosInterviewEmailTemplateFileGateway(app, 'room-1');

    await expect(gateway.read('moi-phong-van-mac-dinh.md', 'file-1', 'http://10.88.255.1:9010/x.md')).rejects.toThrow('boom');
  });

  it('rejects an unsafe filename before any request', async () => {
    const { app, paths } = fakeApp({ statusCode: 200, body: { result: TEMPLATE } });
    const gateway = new PrivosInterviewEmailTemplateFileGateway(app, 'room-1');

    await expect(gateway.read('../secret.md', 'file-1')).rejects.toThrow('filename is invalid');
    expect(paths).toEqual([]);
  });
});
