import { describe, expect, it, vi } from 'vitest';
import { PipelineService } from '../src/ui/pipeline-service';

/**
 * `askAI` chi cham `app.rest`: mot lan `ai-messages.send`, mot lan `ai-messages.startGeneration`,
 * roi lap `ai-messages.list`. Stub tra ve theo path nen khong can dung toi SDK that.
 *
 * `PipelineService` nhan ba tham so: `(app: McpApp, roomId: string, _contextBuilder: ICvContextBuilder)`.
 * Tham so thu ba khong duoc dung trong luong nay nen truyen mot object rong la du.
 */
function createAppStub(onList: () => unknown) {
  let listCalls = 0;
  const app = {
    async rest(req: { method: string; path: string }) {
      if (req.path === 'ai-messages.send') {
        return { statusCode: 200, body: { sessionId: 'sess-1', aiMessage: { _id: 'msg-1' } } };
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
    const app = createAppStub(() => ({ messages: [{ type: 'ai', status: 'completed', content: 'xong roi' }] }));
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
    const app = createAppStub(() => ({ messages: [{ type: 'ai', status: 'processing' }] }));
    const service = new PipelineService(app as never, 'room-1', {} as never);

    const pending = service.askAI('prompt', undefined, undefined, undefined, undefined, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(/abort/i);
  });
});
