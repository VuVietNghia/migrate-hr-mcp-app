import { describe, expect, it } from 'vitest';
import { loadScreeningBoard } from '../src/ui/cv-scored/cv-board-loader';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return { content: [{ type: 'text', text: JSON.stringify(handler(call.arguments ?? {})) }] };
    },
  };
  return { app, calls };
}

describe('loadScreeningBoard', () => {
  it('dựng board với stagesMap, fieldsMap và thẻ; thêm field mail khi còn thiếu', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.get': () => ({
        stages: [{ _id: 's3', name: '03_Tiem_Nang' }],
        fieldDefinitions: [{ _id: 'f1', name: 'Tổng điểm' }],
      }),
      'mcpapp.lists.addField': () => ({ success: true }),
      'mcpapp.lists.getItems': () => [
        { _id: 'cv-1', name: 'CV A', stageId: 's3', customFields: [{ fieldId: 'f1', value: 70 }] },
      ],
    });

    const board = await loadScreeningBoard(app, { _id: 'list-1', name: 'SCREENING_BACKEND' });

    expect(board.listId).toBe('list-1');
    expect(board.listName).toBe('SCREENING_BACKEND');
    expect(board.stagesMap).toEqual({ s3: '03_Tiem_Nang' });
    expect(board.fieldsMap).toEqual({ f1: 'Tổng điểm', interview_invite_sent: 'Đã gửi mail phỏng vấn' });
    expect(board.cvs).toHaveLength(1);
    expect(board.cvs[0]).toMatchObject({ _id: 'cv-1', status: '03_Tiem_Nang', score: 70 });
    expect(calls.some((c) => c.name === 'mcpapp.lists.addField')).toBe(true);
  });

  it('không thêm field mail khi list đã có', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.get': () => ({
        stages: [{ _id: 's1', name: '01_Dau_Vao' }],
        fieldDefinitions: [{ _id: 'interview_invite_sent', name: 'Đã gửi mail phỏng vấn' }],
      }),
      'mcpapp.lists.getItems': () => [],
    });

    const board = await loadScreeningBoard(app, { _id: 'list-2', name: 'SCREENING_TESTER' });

    expect(board.cvs).toEqual([]);
    expect(calls.some((c) => c.name === 'mcpapp.lists.addField')).toBe(false);
  });
});
