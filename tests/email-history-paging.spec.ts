import { describe, expect, it } from 'vitest';
import { EmailHistoryService } from '../src/ui/email-history/email-history-service';
import { EMAIL_HISTORY_LIST_NAME, EMAIL_HISTORY_STAGES } from '../src/services/mail/email-history-model';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Stage thật, gán id giả. `resolveStageIds` khớp theo `name` nên tên phải đúng từng chữ. */
const STAGES = [
  { _id: 's1', name: EMAIL_HISTORY_STAGES.interviewSent },
  { _id: 's2', name: EMAIL_HISTORY_STAGES.interviewFailed },
  { _id: 's3', name: EMAIL_HISTORY_STAGES.employeeSent },
  { _id: 's4', name: EMAIL_HISTORY_STAGES.employeeFailed },
];

const LIST = { _id: 'list-mail', name: EMAIL_HISTORY_LIST_NAME, stages: STAGES };

/** Item tối thiểu mà `parseEmailHistoryItem` chấp nhận. `stageId: 's1'` nên `source` phải là `cv_scored`. */
function mailItem(index: number) {
  return {
    _id: `mail-${index}`,
    stageId: 's1',
    customFields: [
      { fieldId: 'source', value: 'cv_scored' },
      { fieldId: 'recipient_name', value: `Nguoi Nhan ${index}` },
      { fieldId: 'recipient_email', value: `nguoinhan${index}@example.com` },
      { fieldId: 'subject', value: 'Thu moi phong van' },
      { fieldId: 'html_content', value: '<p>noi dung</p>' },
      { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' },
      { fieldId: 'updated_at', value: new Date(Date.UTC(2026, 8, 2, 0, 0, index)).toISOString() },
    ],
  };
}

function createAppStub(pageFor: (offset: number) => unknown[]) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      if (call.name === 'mcpapp.lists.getAll') {
        return { content: [{ type: 'text', text: JSON.stringify([LIST]) }] };
      }
      if (call.name === 'mcpapp.lists.getItems') {
        const payload = pageFor(Number(call.arguments?.offset ?? 0));
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      }
      throw new Error(`unexpected tool call: ${call.name}`);
    },
    async rest() {
      throw new Error('rest() khong duoc goi khi list da mang san stages');
    },
  };
  return { app, calls };
}

describe('EmailHistoryService phan trang', () => {
  it('doc qua 100 ban ghi thay vi de Hub cat im lang', async () => {
    const { app, calls } = createAppStub((offset) =>
      offset === 0
        ? Array.from({ length: 100 }, (_, i) => mailItem(i))
        : Array.from({ length: 23 }, (_, i) => mailItem(100 + i)),
    );
    const service = new EmailHistoryService(app as never);

    await expect(service.load('room-1')).resolves.toHaveLength(123);
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('khong bao gio gui count vuot tran 100 cua Hub', async () => {
    const { app, calls } = createAppStub(() => [mailItem(0)]);
    const service = new EmailHistoryService(app as never);

    await service.load('room-1');
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.every(c => Number(c.arguments!.count) <= 100)).toBe(true);
  });

  /**
   * Test này KHÔNG chứng minh được nhánh skip của module phân trang đã chạy.
   * `parseEmailHistoryItem` tự nó đã loại mọi item thiếu `_id`, nên một bản ghi không id
   * không bao giờ trở thành record hợp lệ dù có skip hay không — chạy trên code trước khi
   * sửa thì test này vẫn xanh.
   * Thứ nó thật sự chốt: `load()` được nối với `missingId: 'skip'`. Đổi sang `'throw'` thì
   * cả lần load bị reject và assertion dưới đây đỏ.
   * Nhánh skip của chính module được phủ trực tiếp ở `tests/list-item-paging.spec.ts`.
   */
  it('load() duoc noi voi missingId skip, nen mot ban ghi thieu id khong lam ca hop thu reject', async () => {
    const withoutId: Record<string, unknown> = { ...mailItem(0) };
    delete withoutId._id;

    const { app } = createAppStub(() => [withoutId, mailItem(1)]);
    const service = new EmailHistoryService(app as never);

    await expect(service.load('room-1')).resolves.toHaveLength(1);
  });
});
