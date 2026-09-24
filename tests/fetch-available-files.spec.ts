import { describe, expect, it } from 'vitest';
import {
  PipelineService,
  ROOM_FILES_MAX_PAGES,
  ROOM_FILES_PAGE_SIZE,
} from '../src/ui/pipeline-service';

type RestRequest = { method: string; path: string; query?: Record<string, unknown> };
type RestResponse = { statusCode?: number; body: unknown };

/**
 * `fetchAvailableFiles` only touches `app.rest` on `file-management.files.channel/room-1`.
 * `respond` gets the requested offset and the 0-based call index, so a test can model a Hub
 * whose answer changes between calls.
 */
function roomFilesApp(respond: (offset: number, callIndex: number) => RestResponse) {
  const calls: RestRequest[] = [];
  const app = {
    async rest(req: RestRequest) {
      calls.push(req);
      if (req.path !== 'file-management.files.channel/room-1') {
        throw new Error(`unexpected rest path: ${req.path}`);
      }
      const { statusCode = 200, body } = respond(Number(req.query?.offset ?? 0), calls.length - 1);
      return { statusCode, body };
    },
  };
  return { app, calls };
}

/** `count` distinct files numbered from `from`: `{ _id: 'f-150', name: 'f-150.pdf' }`. */
function files(from: number, count: number, prefix = 'f') {
  return Array.from({ length: count }, (_, i) => ({
    _id: `${prefix}-${from + i}`,
    name: `${prefix}-${from + i}.pdf`,
  }));
}

/** A consistent Hub: `total` files, served page by page at whatever offset is asked. */
function consistentRoom(total: number) {
  return (offset: number): RestResponse => ({
    body: {
      success: true,
      files: files(offset, Math.max(0, Math.min(ROOM_FILES_PAGE_SIZE, total - offset))),
      total,
    },
  });
}

const service = (app: unknown) => new PipelineService(app as never, 'room-1', {} as never);

describe('PipelineService.fetchAvailableFiles', () => {
  it('reads every page with count 100 and increasing offsets', async () => {
    const { app, calls } = roomFilesApp(consistentRoom(230));
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(230);
    expect(calls.map((call) => call.query)).toEqual([
      { count: 100, offset: 0 },
      { count: 100, offset: 100 },
      { count: 100, offset: 200 },
    ]);
  });

  it('keeps a CV that sits beyond the first page', async () => {
    const { app } = roomFilesApp(consistentRoom(230));
    const result = await service(app).fetchAvailableFiles();
    expect(result.some((file) => file._id === 'f-150')).toBe(true);
  });

  it('stops on total when the last page is exactly full', async () => {
    const { app, calls } = roomFilesApp(consistentRoom(200));
    await expect(service(app).fetchAvailableFiles()).resolves.toHaveLength(200);
    expect(calls).toHaveLength(2);
  });

  it('stops on a short page when the Hub sends no total', async () => {
    const { app, calls } = roomFilesApp((offset) => ({
      body: offset === 0 ? files(0, 100) : files(100, 7),
    }));
    await expect(service(app).fetchAvailableFiles()).resolves.toHaveLength(107);
    expect(calls).toHaveLength(2);
  });

  it('keeps the existing mapping and hides skill files on every page', async () => {
    const { app } = roomFilesApp((offset) => ({
      body: {
        success: true,
        total: 101,
        files: offset === 0
          ? [...files(0, 99), { _id: 'skill', name: 'hr-miniapp/skills/cv-evaluator-skill.md' }]
          : [{ _id: 'cv-x', name: 'cv-x.pdf', file_size: 42, downloadUrl: 'https://hub/cv-x' }],
      },
    }));
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(100);
    expect(result.some((file) => file._id === 'skill')).toBe(false);
    expect(result.find((file) => file._id === 'cv-x')).toEqual({
      _id: 'cv-x',
      name: 'cv-x.pdf',
      size: 42,
      downloadUrl: 'https://hub/cv-x',
    });
  });

  it('restarts the read when total changes between pages', async () => {
    // First read: page 0 says 201 files, then a file is deleted and page 1 says 200.
    const { app, calls } = roomFilesApp((offset, callIndex) => {
      if (callIndex === 0) return { body: { success: true, files: files(0, 100), total: 201 } };
      return consistentRoom(200)(offset);
    });
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(200);
    expect(calls.map((call) => call.query?.offset)).toEqual([0, 100, 0, 100]);
  });

  it('gives up when total keeps changing on every attempt', async () => {
    const { app } = roomFilesApp((offset, callIndex) => ({
      body: { success: true, files: files(offset, 100), total: 1000 + callIndex },
    }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/thay đổi liên tục/);
  });

  it('refuses a Hub that ignores offset', async () => {
    const { app } = roomFilesApp(() => ({ body: { success: true, files: files(0, 100), total: 500 } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/bỏ qua offset/);
  });

  it('refuses to return a truncated list past the page budget', async () => {
    const { app, calls } = roomFilesApp((offset) => ({
      body: { success: true, files: files(offset, 100), total: 999999 },
    }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/hơn 5000 file/);
    expect(calls).toHaveLength(ROOM_FILES_MAX_PAGES);
  });

  it('refuses a response without a file list instead of reporting an empty room', async () => {
    const { app } = roomFilesApp(() => ({ body: { success: true } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/không có danh sách file/);
  });

  it('follows total past short pages when the Hub caps count below 100', async () => {
    const { app, calls } = roomFilesApp((offset) => ({
      body: { success: true, files: files(offset, Math.max(0, Math.min(50, 120 - offset))), total: 120 },
    }));
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(120);
    expect(result.some((file) => file._id === 'f-110')).toBe(true);
    expect(calls.map((call) => call.query?.offset)).toEqual([0, 50, 100]);
  });

  it('refuses an empty page that arrives before total is reached', async () => {
    const { app } = roomFilesApp((offset) => ({
      body: { success: true, files: offset === 0 ? files(0, 100) : [], total: 300 },
    }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/trang rỗng/);
  });

  it('propagates a Hub failure', async () => {
    const { app } = roomFilesApp(() => ({ statusCode: 500, body: { success: false, error: 'boom' } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow('boom');
  });
});

describe('PipelineService.uploadCV when the file list cannot be read', () => {
  it('still uploads under the original name; the Hub remains the duplicate guard', async () => {
    const uploads: Array<{ fileName: string }> = [];
    const app = {
      async rest() {
        return { statusCode: 500, body: { success: false, error: 'boom' } };
      },
      async uploadFile(args: { fileName: string }) {
        uploads.push(args);
        return { file: { _id: 'new-cv' } };
      },
    };
    const svc = service(app);
    // `readAsDataUri` needs the browser FileReader; the name de-duplication is what is under test.
    (svc as unknown as { readAsDataUri: () => Promise<string> }).readAsDataUri = async () => 'data:application/pdf;base64,AA==';

    const result = await svc.uploadCV({ name: 'cv.pdf', type: 'application/pdf', size: 2 } as File);

    expect(result).toEqual({ _id: 'new-cv', name: 'cv.pdf', size: 2 });
    expect(uploads.map((upload) => upload.fileName)).toEqual(['cv.pdf']);
  });
});
