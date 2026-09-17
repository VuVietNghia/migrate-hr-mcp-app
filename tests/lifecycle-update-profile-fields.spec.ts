import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * Danh dau gia tri tra ve cua handler la mot tool result da dung hinh (vd
 * `{ isError: true, content: [...] }`) de tra nguyen van thay vi boc JSON.
 * `callServerTool` resolve binh thuong ca khi tool bao loi, nen day la cach tai hien hinh do.
 */
function rawResult(result: unknown) {
  return { __rawToolResult: true as const, result };
}

function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      const value = handler(call.arguments ?? {});
      if (value && typeof value === 'object' && (value as any).__rawToolResult) {
        return (value as any).result;
      }
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    },
  };
  return { app, calls };
}

const STAGES = [{ _id: 'stage-1', name: 'Mới nhận việc' }];

const HR_LIST = {
  _id: 'list-1',
  name: '[HR-MCP-App] Hồ sơ nhân sự',
  fieldDefinitions: [
    { _id: 'fd-phone', name: 'Số điện thoại', type: 'TEXT' },
    { _id: 'fd-email', name: 'Email', type: 'TEXT' },
    { _id: 'fd-pos', name: 'Vị trí', type: 'SELECT', options: [{ _id: 'opt-dev', value: 'Developer' }] },
    { _id: 'fd-doc', name: 'Hồ sơ đính kèm', type: 'DOCUMENT' },
  ],
};

const CONFIG_ITEM = {
  _id: 'cfg-1',
  name: '[Hệ thống] Không xoá - Cấu hình Kanban',
  description: JSON.stringify(STAGES),
};

function healthyRoom() {
  return {
    'mcpapp.lists.getAll': () => [HR_LIST],
    'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
    'mcpapp.lists.updateItem': () => ({ updated: true }),
  };
}

describe('PrivOSLifecycleService.updateProfileFields', () => {
  it('gui mang customFields day du chu khong chi truong da doi', async () => {
    // Tai lieu khong noi customFields la merge hay replace
    // (`room-scoped-apis/items.md:213`). Gui day du thi dung voi ca hai nghia.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      phone: '0909999999',
      email: 'b@example.com',
      position: 'Developer',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update).toBeDefined();
    expect(update!.arguments!.itemId).toBe('item-1');
    expect(update!.arguments!.title).toBe('Nguyen Van B');
    expect(update!.arguments!.customFields).toEqual([
      { fieldId: 'fd-phone', value: '0909999999' },
      { fieldId: 'fd-email', value: 'b@example.com' },
      { fieldId: 'fd-pos', value: 'opt-dev' },
    ]);
  });

  it('gui lai fd-doc khi attachedFileObj co gia tri', async () => {
    // Neu Hub thay the toan bo customFields, khong gui lai fd-doc se xoa mat file
    // dinh kem cua the moi lan sua ho so.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      phone: '0909999999',
      email: 'b@example.com',
      position: 'Developer',
      attachedFileObj: { _id: 'file-1', name: 'ho-so.md' },
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update).toBeDefined();
    expect(update!.arguments!.customFields).toEqual([
      { fieldId: 'fd-phone', value: '0909999999' },
      { fieldId: 'fd-email', value: 'b@example.com' },
      { fieldId: 'fd-pos', value: 'opt-dev' },
      { fieldId: 'fd-doc', value: [{ _id: 'file-1', name: 'ho-so.md' }] },
    ]);
  });

  it('dung lai description du ca sourceCandidateId lan fileId', async () => {
    // `updateItem` thay description nguyen khoi. Ghi de mu se lam mat lien ket toi
    // ung vien nguon, va thanh Kanban mat luon duong dan toi file ho so.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      sourceCandidateId: 'cand-7',
      attachedFileId: 'file-1',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    const description = String(update!.arguments!.description);
    expect(description).toContain('[sourceCandidateId:cand-7]');
    expect(description).toContain('[fileId:file-1]');
  });

  it('dung fileUrl khi khong co fileId', async () => {
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      attachedFileUrl: 'https://minio/ho-so.md',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(String(update!.arguments!.description)).toContain('[fileUrl:https://minio/ho-so.md]');
  });

  it('khong gui description khi khong co marker nao de ghi', async () => {
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', { name: 'Nguyen Van B' });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update!.arguments).not.toHaveProperty('description');
  });

  it('nem loi thay vi im lang khi khong lay duoc danh sach ho so', async () => {
    const { app } = createAppStub({ 'mcpapp.lists.getAll': () => { throw new Error('Hub down'); } });
    const service = new PrivOSLifecycleService(app as any);

    await expect(service.updateProfileFields('room-1', 'item-1', { name: 'X' }))
      .rejects.toThrow(/Hub down/);
  });

  it('gui null khi field bi xoa trong form de sync duoi merge semantics', async () => {
    // Under merge semantics, omitting a field leaves the old value on the item. To clear
    // a field (e.g. phone: ''), we must send null to the item so it overwrites the old value.
    // Position is omitted entirely (not passed), so it should also send null per the update contract.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      phone: '',
      email: 'b@example.com',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update).toBeDefined();
    expect(update!.arguments!.customFields).toEqual([
      { fieldId: 'fd-phone', value: null },
      { fieldId: 'fd-email', value: 'b@example.com' },
      { fieldId: 'fd-pos', value: null },
    ]);
    // fd-doc (DOCUMENT type) must not appear because no attachedFileObj was passed: the builder
    // resends the DOCUMENT field only when the caller supplies a value, and never nulls it.
    expect(update!.arguments!.customFields).toHaveLength(3);
  });

  it('nem loi khi Hub tu choi updateItem bang isError', async () => {
    // `callServerTool` resolve chu khong reject khi tool tra `isError: true`. Khong kiem tra
    // thi form bao "Đã lưu hồ sơ" trong khi the tren bang khong he duoc cap nhat.
    const { app } = createAppStub({
      ...healthyRoom(),
      'mcpapp.lists.updateItem': () => rawResult({
        isError: true,
        content: [{ type: 'text', text: 'denied by hub' }],
      }),
    });
    const service = new PrivOSLifecycleService(app as any);

    await expect(service.updateProfileFields('room-1', 'item-1', { name: 'X' }))
      .rejects.toThrow(/denied by hub/);
  });

  it('giu ghi chu tay trong description va thay marker cu bang marker moi', async () => {
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      sourceCandidateId: 'cand-7',
      attachedFileId: 'file-1',
      existingDescription: '[sourceCandidateId:old]\n\nGhi chu tay cua HR\n\n[fileId:old-file]',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    const description = String(update!.arguments!.description);
    expect(description).toContain('[sourceCandidateId:cand-7]');
    expect(description).toContain('[fileId:file-1]');
    expect(description.split('Ghi chu tay cua HR')).toHaveLength(2);
    expect(description).not.toContain('[sourceCandidateId:old]');
    expect(description).not.toContain('old-file');
  });
});

describe('PrivOSLifecycleService.updateProfileFields voi truong SELECT va DATE', () => {
  const LIST_PHONG_BAN_NGAY = {
    _id: 'list-1',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    fieldDefinitions: [
      { _id: 'fd-dept', name: 'Phòng ban', type: 'SELECT', options: [{ _id: 'opt-it', value: 'IT' }] },
      { _id: 'fd-start', name: 'Ngày bắt đầu', type: 'DATE' },
    ],
  };

  it('doi phong ban sang id option va gui null cho ngay bat dau rong', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_PHONG_BAN_NGAY],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.updateItem': () => ({ updated: true }),
    });
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', { name: 'X', department: 'IT', startDate: '' });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update!.arguments!.customFields).toEqual([
      { fieldId: 'fd-dept', value: 'opt-it' },
      { fieldId: 'fd-start', value: null },
    ]);
  });
});
