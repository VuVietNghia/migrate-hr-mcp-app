import { describe, expect, it } from 'vitest';
import { moveCVToStage } from '../src/ui/cv-scored/cv-stage-move';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * `callServerTool` chỉ reject khi lỗi đường truyền; Hub từ chối thì vẫn resolve với
 * `{ isError: true, ... }`. Stub trả nguyên object `respond` đưa ra để tái tạo cả hai dạng.
 */
function createAppStub(respond: (call: ToolCall) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      return respond(call);
    },
  };
  return { app, calls };
}

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

describe('moveCVToStage', () => {
  it('goi mcpapp.lists.moveItemToStage voi itemId va stageId, resolve khi Hub chuyen xong', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).resolves.toBeUndefined();
    expect(calls).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'cv-1', stageId: 'stage-7' } },
    ]);
  });

  it('reject voi thong diep cua Hub khi Hub tu choi (isError) thay vi coi la thanh cong', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: 'You do not have permission to edit this item' }],
    }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow(
      'You do not have permission to edit this item',
    );
  });

  it('reject khi isError du text loi la JSON hop le', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: '{}' }],
    }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow();
  });

  it('de nguyen loi duong truyen', async () => {
    const app = {
      async callServerTool(): Promise<unknown> {
        throw new Error('network down');
      },
    };

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow('network down');
  });
});
