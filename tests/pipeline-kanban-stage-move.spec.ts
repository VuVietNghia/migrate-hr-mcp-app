import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PipelineService } from '../src/ui/pipeline-service';
import { formatKanbanItemTitle } from '../src/ui/pipeline-candidate-name';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

const STAGES = [
  { _id: 's01', name: '01_Dau_Vao' },
  { _id: 's02', name: '02_Loai_CV' },
  { _id: 's03', name: '03_Tiem_Nang' },
  { _id: 's06', name: '06_Sai_JD' },
];

/**
 * Luong list moi: getAll rong -> create -> batchCreateItems -> createItem (config) -> moveItemToStage.
 * Hub tu choi thi callServerTool van resolve voi isError: true, stub tai tao dung dang do.
 */
function createAppStub(options: { createdItemIds: string[]; rejectMoveFor?: string }) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      switch (call.name) {
        case 'mcpapp.lists.getAll':
          return jsonResult([]);
        case 'mcpapp.lists.create':
          return jsonResult({ list: { _id: 'list-1' }, stages: STAGES });
        case 'mcpapp.lists.batchCreateItems':
          return jsonResult({ items: options.createdItemIds.map((_id) => ({ _id })) });
        case 'mcpapp.lists.createItem':
          return jsonResult({ item: { _id: 'config-1' } });
        case 'mcpapp.lists.moveItemToStage':
          if (call.arguments?.itemId === options.rejectMoveFor) {
            return { isError: true, content: [{ type: 'text', text: 'Stage not found' }] };
          }
          return jsonResult({ moved: true });
        default:
          throw new Error(`unexpected tool: ${call.name}`);
      }
    },
  };
  return { app, calls };
}

const RESULTS = [
  { originalName: 'CV_A.pdf', normalizedName: 'Nguyen Van A', score: 85, category: 'ĐẠT', reason: 'dat' },
  { originalName: 'CV_B.pdf', normalizedName: 'Tran Thi B', score: 30, category: 'KHÔNG ĐẠT', reason: 'khong dat' },
];

async function run(options: { createdItemIds: string[]; rejectMoveFor?: string }) {
  const { app, calls } = createAppStub(options);
  const service = new PipelineService(app as never, 'room-1', {} as never);
  const logs: string[] = [];
  await service.createKanbanBatchViaAI(RESULTS, 'JD_Developer.md', (msg) => logs.push(msg));
  return { calls, logs };
}

describe('createKanbanBatchViaAI - chuyen cot va bao the ket', () => {
  it('Hub tu choi mot lan chuyen cot: log neu dung the ket, khong bao "vao dung stage"', async () => {
    const { logs } = await run({ createdItemIds: ['item-1', 'item-2'], rejectMoveFor: 'item-2' });

    const stuckLog = logs.find((line) => line.includes('chưa chuyển được sang cột đích'));
    expect(stuckLog).toBeDefined();
    expect(stuckLog).toContain('1 thẻ chưa chuyển được sang cột đích, đang nằm ở cột "Đầu vào"');
    expect(stuckLog).toContain(formatKanbanItemTitle('Tran Thi B'));
    expect(stuckLog).not.toContain(formatKanbanItemTitle('Nguyen Van A'));
    expect(logs.some((line) => line.includes('vào đúng stage'))).toBe(false);
  });

  it('moi lan chuyen cot thanh cong: giu log cu, chuyen dung stage', async () => {
    const { calls, logs } = await run({ createdItemIds: ['item-1', 'item-2'] });

    expect(logs.some((line) => line.includes('vào đúng stage'))).toBe(true);
    expect(logs.some((line) => line.includes('chưa chuyển được'))).toBe(false);
    expect(calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'item-1', stageId: 's03' } },
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'item-2', stageId: 's02' } },
    ]);
  });

  it('batchCreateItems tra thieu item: the khong co id duoc bao ket', async () => {
    const { calls, logs } = await run({ createdItemIds: ['item-1'] });

    const stuckLog = logs.find((line) => line.includes('chưa chuyển được sang cột đích'));
    expect(stuckLog).toContain(formatKanbanItemTitle('Tran Thi B'));
    expect(calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toHaveLength(1);
  });

  it('source khong con goi thang moveItemToStage', () => {
    const source = fs.readFileSync(path.resolve('src/ui/pipeline-service.ts'), 'utf8');
    expect(source).not.toContain("'mcpapp.lists.moveItemToStage'");
    expect(source).toContain('await moveCVToStage(this.app, createdId, intendedStageId);');
  });
});
