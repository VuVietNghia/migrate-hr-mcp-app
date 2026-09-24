import { describe, expect, it, vi } from 'vitest';
import { PipelineService } from '../src/ui/pipeline-service';

/**
 * `askAI` chi cham `app.rest`: mot lan `ai-messages.send`, mot lan `ai-messages.startGeneration`,
 * roi lap `ai-messages.list`. Stub tra ve theo path nen khong can dung toi SDK that.
 *
 * `PipelineService` nhan ba tham so: `(app: McpApp, roomId: string, _contextBuilder: ICvContextBuilder)`.
 * Tham so thu ba khong duoc dung trong luong nay nen truyen mot object rong la du.
 */
function createAppStub(
  onList: () => unknown,
  sendBody: unknown = { sessionId: 'sess-1', aiMessage: { _id: 'msg-1' } },
) {
  let listCalls = 0;
  const app = {
    async rest(req: { method: string; path: string }) {
      if (req.path === 'ai-messages.send') {
        return { statusCode: 200, body: sendBody };
      }
      if (req.path === 'ai-messages.startGeneration') {
        return { statusCode: 200, body: {} };
      }
      if (req.path === 'ai-messages.list') {
        listCalls += 1;
        return { statusCode: 200, body: onList() };
      }
      throw new Error(`unexpected rest path: ${req.path}`);
    },
    get listCalls() { return listCalls; },
  };
  return app;
}

describe('askAI', () => {
  it('tra ve ngay khi AI bao completed', async () => {
    const app = createAppStub(() => ({ messages: [{ _id: 'msg-1', type: 'ai', status: 'completed', content: 'xong roi' }] }));
    const service = new PipelineService(app as never, 'room-1', {} as never);

    await expect(service.askAI('prompt')).resolves.toEqual({ text: 'xong roi' });
  });

  it('nem loi sau nguong that bai lien tiep thay vi poll du 10 phut', async () => {
    // Nguong la 10 nhip, moi nhip ngu 2s: 20 giay dong ho that, qua xa timeout 5s cua vitest.
    // Dong ho gia cho phep kiem dung hanh vi do ma khong phai cho that.
    vi.useFakeTimers();
    try {
      const app = createAppStub(() => { throw new Error('mang chet'); });
      const service = new PipelineService(app as never, 'room-1', {} as never);

      const pending = expect(service.askAI('prompt')).rejects.toThrow(/mất kết nối/i);
      await vi.advanceTimersByTimeAsync(30000);
      await pending;

      // Phai dung o nguong, khong phai 300 nhip.
      expect(app.listCalls).toBeLessThanOrEqual(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dung ngay khi signal bi abort', async () => {
    const controller = new AbortController();
    const app = createAppStub(() => ({ messages: [{ _id: 'msg-1', type: 'ai', status: 'processing' }] }));
    const service = new PipelineService(app as never, 'room-1', {} as never);

    const pending = service.askAI('prompt', undefined, undefined, undefined, undefined, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(/abort/i);
  });

  it('bo qua tin AI da xong cua yeu cau khac trong cung phien', async () => {
    vi.useFakeTimers();
    try {
      let poll = 0;
      const app = createAppStub(() => {
        poll += 1;
        return {
          messages: [
            { _id: 'msg-1', type: 'ai', status: poll >= 2 ? 'completed' : 'processing', content: 'dung cua minh' },
            // Tin cua yeu cau soan thao gui sau, nam cuoi danh sach va da xong truoc.
            { _id: 'msg-other', type: 'ai', status: 'completed', content: 'cua yeu cau khac' },
          ],
        };
      });
      const service = new PipelineService(app as never, 'room-1', {} as never);

      const pending = service.askAI('prompt');
      await vi.advanceTimersByTimeAsync(4000);
      await expect(pending).resolves.toEqual({ text: 'dung cua minh' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('chon dung tin theo aiMessageId khi Hub tra tin moi nhat truoc', async () => {
    vi.useFakeTimers();
    try {
      const app = createAppStub(() => ({
        messages: [
          { _id: 'msg-1', type: 'ai', status: 'completed', content: 'ket qua CV moi' },
          { _id: 'msg-old', type: 'ai', status: 'completed', content: 'ket qua CV truoc' },
        ],
      }));
      const service = new PipelineService(app as never, 'room-1', {} as never);

      const pending = service.askAI('prompt');
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual({ text: 'ket qua CV moi' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bao loi ngay khi Hub khong tra id tin nhan AI', async () => {
    const app = createAppStub(
      () => ({ messages: [{ _id: 'msg-x', type: 'ai', status: 'completed', content: 'khong phai cua minh' }] }),
      { sessionId: 'sess-1' },
    );
    const service = new PipelineService(app as never, 'room-1', {} as never);

    await expect(service.askAI('prompt')).rejects.toThrow(/aiMessage\._id/);
    expect(app.listCalls).toBe(0);
  });
});
