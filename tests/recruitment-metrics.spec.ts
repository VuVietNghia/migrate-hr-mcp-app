import { describe, expect, it } from 'vitest';

import { loadEvaluatedCandidateCount } from '../src/ui/recruitment/recruitment-metrics';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function toolResult(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

describe('loadEvaluatedCandidateCount', () => {
  it('counts visible candidate cards across every SCREENING list and excludes system rows', async () => {
    const calls: ToolCall[] = [];
    const itemsByList: Record<string, unknown[]> = {
      'screening-a': [
        { _id: 'candidate-1', name: 'Nguyễn An' },
        { _id: 'system-a', name: '[Hệ thống] Không xoá - config' },
        { _id: 'candidate-2', name: 'Trần Bình' },
      ],
      'screening-b': [{ _id: 'candidate-3', name: 'Lê Chi' }],
    };
    const app = {
      async callServerTool(call: ToolCall) {
        calls.push(call);
        if (call.name === 'mcpapp.lists.getAll') {
          return toolResult({ lists: [
            { _id: 'screening-a', name: 'SCREENING_BACKEND' },
            { _id: 'notes', name: 'NOTES' },
            { id: 'screening-b', name: 'SCREENING_MARKETING' },
          ] });
        }
        if (call.name === 'mcpapp.lists.getItems') {
          const listId = String(call.arguments?.listId);
          const items = itemsByList[listId] ?? [];
          return toolResult({ items, total: items.length });
        }
        throw new Error(`Unexpected call: ${call.name}`);
      },
    };

    await expect(loadEvaluatedCandidateCount(app as never, 'room-1')).resolves.toBe(3);
    expect(calls.filter((call) => call.name === 'mcpapp.lists.getItems')).toHaveLength(2);
  });

  it('returns zero when the room has no SCREENING list', async () => {
    const app = { callServerTool: async () => toolResult({ lists: [] }) };
    await expect(loadEvaluatedCandidateCount(app as never, 'room-1')).resolves.toBe(0);
  });

  it('rejects the whole metric when any list cannot be read instead of showing a partial count', async () => {
    const app = {
      async callServerTool(call: ToolCall) {
        if (call.name === 'mcpapp.lists.getAll') {
          return toolResult({ lists: [
            { _id: 'screening-a', name: 'SCREENING_A' },
            { _id: 'screening-b', name: 'SCREENING_B' },
          ] });
        }
        if (call.arguments?.listId === 'screening-a') {
          return toolResult({ items: [{ _id: 'candidate-1', name: 'Nguyễn An' }], total: 1 });
        }
        return toolError('App is not permitted to read this list');
      },
    };

    await expect(loadEvaluatedCandidateCount(app as never, 'room-1')).rejects.toThrow(/not permitted/i);
  });
});
