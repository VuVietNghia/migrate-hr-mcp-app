import { describe, expect, it, vi } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * Marks a handler's return value as an already-shaped tool-result object (e.g.
 * `{ isError: true, content: [...] }`) instead of a plain payload to be JSON-wrapped.
 * `callServerTool` resolves normally even for tool-level failures — it only rejects
 * on a transport error — so this is what lets a test reproduce that resolved-but-failed shape.
 */
function rawResult(result: unknown) {
  return { __rawToolResult: true as const, result };
}

/**
 * The service only ever touches `app.callServerTool`, so a name→payload map is a
 * complete stand-in for `McpApp`. The real SDK wraps every payload as JSON inside
 * `content[0].text`; the stub reproduces that shape because the service parses it.
 * A handler may opt out of that wrapping via `rawResult(...)` to hand back a
 * tool-result object verbatim (e.g. an `isError` response).
 */
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
  fieldDefinitions: [{ _id: 'fd-1', name: 'Email', type: 'TEXT' }],
};

const CONFIG_ITEM = {
  _id: 'cfg-1',
  name: '[Hệ thống] Không xoá - Cấu hình Kanban',
  description: JSON.stringify(STAGES),
};

const EMPLOYEE_ITEM = {
  _id: 'emp-1',
  name: 'Nguyen Van A',
  stageId: 'stage-1',
  customFields: [{ fieldId: 'fd-1', value: 'a@example.com' }],
};

/** `n` employee items with ids starting at `offset`, so a paging read can be asserted. */
function itemPage(offset: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `emp-${offset + i}`,
    name: `NV ${offset + i}`,
    stageId: 'stage-1',
    customFields: [],
  }));
}

function healthyRoom(items: unknown[]) {
  return {
    'mcpapp.lists.getAll': () => [HR_LIST],
    'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
    'mcpapp.lists.getItems': () => items,
  };
}

describe('PrivOSLifecycleService.loadProfiles', () => {
  it('propagates a Hub failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => {
        throw new Error('mcp-apps.rest-call 403');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('mcp-apps.rest-call 403');
  });

  it('propagates a list-creation failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [],
      'mcpapp.lists.create': () => {
        throw new Error('lists.create denied');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('lists.create denied');
  });

  it('returns an empty roster when the list loaded fine but holds no employee items', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([]);
  });

  it('maps employee items to profiles on the happy path', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);
  });

  it('keeps the raw item description so an edit can preserve hand-written notes', async () => {
    const { app } = createAppStub(healthyRoom([{ ...EMPLOYEE_ITEM, description: 'ghi chu' }]));
    const service = new PrivOSLifecycleService(app as never);

    const profiles = await service.loadProfiles('room-1');
    expect(profiles[0].rawDescription).toBe('ghi chu');
  });

  it('rejects a tool-level (isError) failure from mcpapp.lists.getAll instead of silently provisioning a duplicate list', async () => {
    // Error text is deliberately valid JSON ('{}'). A hand-rolled `JSON.parse(text)` treats
    // this as an empty success payload and masks the failure — the exact bug being asserted
    // against. Only checking `isError` first (as parseToolResult does) catches it.
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => rawResult({
        isError: true,
        content: [{ type: 'text', text: '{}' }],
      }),
      'mcpapp.lists.create': () => ({ list: { _id: 'list-2' } }),
      'mcpapp.lists.getItems': () => [],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow();
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('rejects a tool-level (isError) failure from mcpapp.lists.getItems instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // Same valid-JSON-error-text trap as above, this time on the getItems path.
      'mcpapp.lists.getItems': () => rawResult({
        isError: true,
        content: [{ type: 'text', text: '{}' }],
      }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow();
  });

  it('rejects when mcpapp.lists.create resolves successfully but with no usable list id', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [],
      'mcpapp.lists.create': () => ({}),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/no usable list id/);
  });

  it('never deletes the employee list when the Kanban config JSON is corrupt', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '{not json' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/cấu hình kanban/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('never deletes the employee list when the config item holds an empty stage array', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '[]' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/stage/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('repairs a MISSING Kanban config item from the list stages instead of bricking the room', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{ ...HR_LIST, stages: STAGES }],
      // No config item at all — the state `createNewList` leaves behind when `mcpapp.lists.create`
      // echoes back no stages. Throwing here would make the room permanently unreadable.
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'cfg-new' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);

    const created = calls.find(c => c.name === 'mcpapp.lists.createItem')!;
    expect(created).toBeDefined();
    expect(created.arguments!.description).toBe(JSON.stringify(STAGES));
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('repairs a MISSING Kanban config item by fetching the stages when the list carries none', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.stages.getByList': () => STAGES,
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'cfg-new' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);
    expect(calls.some(c => c.name === 'mcpapp.stages.getByList')).toBe(true);
    expect(calls.find(c => c.name === 'mcpapp.lists.createItem')!.arguments!.description)
      .toBe(JSON.stringify(STAGES));
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
  });

  it('still throws, and deletes nothing, when no stages can be recovered from any source', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.stages.getByList': () => [],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/stage/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.createItem')).toBe(false);
  });

  it('keeps serving the roster when re-creating the repaired config item fails', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [{ ...HR_LIST, stages: STAGES }],
      'mcpapp.lists.searchItems': () => [],
      'mcpapp.lists.createItem': () => { throw new Error('lists.createItem denied'); },
      'mcpapp.lists.getItems': () => [EMPLOYEE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toHaveLength(1);
  });
});

describe('PrivOSLifecycleService roster paging', () => {
  it('reads past the first page instead of truncating the roster at 100', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': (args) => (Number(args.offset ?? 0) === 0 ? itemPage(0, 100) : itemPage(100, 7)),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toHaveLength(107);
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('throws instead of returning a partial roster when the hub ignores offset', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // The same full page every time — what a hub that silently drops `offset` produces.
      'mcpapp.lists.getItems': () => itemPage(0, 100),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/offset/i);
  });

  it('stops on a short first page without asking for a second', async () => {
    const { app, calls } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await service.loadProfiles('room-1');
    expect(calls.filter(c => c.name === 'mcpapp.lists.getItems')).toHaveLength(1);
  });

  it('throws instead of accepting a roster item that has no id to match a payroll row against', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{ name: 'Khong co id', stageId: 'stage-1', customFields: [] }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/không mang _id/i);
  });
});

describe('PrivOSLifecycleService khong goi tool khong ton tai', () => {
  it('khong goi debug_log khi mot item khong khop stageId', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // stageId khong co trong STAGES, dung nhanh fallback cua getStageName.
      'mcpapp.lists.getItems': () => [
        { _id: 'emp-1', name: 'NV 1', stageId: 'stage-khong-ton-tai', customFields: [] },
      ],
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.loadProfiles('room-1');
    expect(calls.map(c => c.name)).not.toContain('debug_log');
  });
});

describe('PrivOSLifecycleService khop ten field chinh xac', () => {
  const LIST_HAI_TRUONG_NGAY = {
    _id: 'list-1',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    fieldDefinitions: [
      { _id: 'fd-ngay-sinh', name: 'Ngày sinh', type: 'DATE' },
      { _id: 'fd-ngay-bat-dau', name: 'Ngày bắt đầu', type: 'DATE' },
    ],
    stages: STAGES,
  };

  it('khong ghi ngay vao lam de len truong Ngay sinh khi tao ho so', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_HAI_TRUONG_NGAY],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      startDate: '2026-01-05',
    } as never);

    const createCall = calls.find(c => c.name === 'mcpapp.lists.createItem');
    const customFields = createCall!.arguments!.customFields as Array<{ fieldId: string; value: unknown }>;
    expect(customFields.map(f => f.fieldId)).toEqual(['fd-ngay-bat-dau']);
    expect(customFields.find(f => f.fieldId === 'fd-ngay-sinh')).toBeUndefined();
  });

  it('doc startDate tu Ngay bat dau chu khong phai Ngay sinh', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_HAI_TRUONG_NGAY],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{
        _id: 'emp-1',
        name: 'NV 1',
        stageId: 'stage-1',
        customFields: [
          { fieldId: 'fd-ngay-sinh', value: '1990-03-20' },
          { fieldId: 'fd-ngay-bat-dau', value: '2026-01-05' },
        ],
      }],
    });
    const service = new PrivOSLifecycleService(app as never);

    const profiles = await service.loadProfiles('room-1');
    expect(profiles[0].startDate).toBe('2026-01-05');
  });

  it('bo qua truong co ten khong nam trong bang alias', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_HAI_TRUONG_NGAY,
        fieldDefinitions: [{ _id: 'fd-ghi-chu', name: 'Ghi chú nội bộ', type: 'TEXT' }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{
        _id: 'emp-1',
        name: 'NV 1',
        stageId: 'stage-1',
        customFields: [{ fieldId: 'fd-ghi-chu', value: 'khong duoc gan vao dau ca' }],
      }],
    });
    const service = new PrivOSLifecycleService(app as never);

    const profile = (await service.loadProfiles('room-1'))[0] as Record<string, unknown>;
    expect(Object.values(profile)).not.toContain('khong duoc gan vao dau ca');
  });
});

describe('PrivOSLifecycleService gan file dinh kem dung truong', () => {
  const LIST_CO_TRUONG_LOAI_HO_SO = {
    _id: 'list-1',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    fieldDefinitions: [
      // Dat TRUOC truong DOCUMENT that. `.find()` duyet theo thu tu mang va chay ca predicate
      // cho tung phan tu, nen mot predicate OR gop se chon dung truong nay.
      { _id: 'fd-loai-ho-so', name: 'Loại hồ sơ', type: 'SELECT', options: [] },
      { _id: 'fd-tep-dinh-kem', name: 'Hồ sơ đính kèm', type: 'DOCUMENT' },
    ],
    stages: STAGES,
  };

  function customFieldsOfCreateCall(calls: ToolCall[]) {
    const createCall = calls.find(c => c.name === 'mcpapp.lists.createItem');
    return createCall!.arguments!.customFields as Array<{ fieldId: string; value: unknown }>;
  }

  it('gan file vao truong DOCUMENT chu khong phai truong SELECT ten "Loai ho so"', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_CO_TRUONG_LOAI_HO_SO],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1', downloadUrl: 'https://example.com/cv.pdf' },
    } as never);

    const customFields = customFieldsOfCreateCall(calls);
    expect(customFields.find(f => Array.isArray(f.value))!.fieldId).toBe('fd-tep-dinh-kem');
    expect(customFields.some(f => f.fieldId === 'fd-loai-ho-so')).toBe(false);
  });

  it('khong gan file vao truong chi chua chu "ho so" khi khong co truong DOCUMENT nao', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_CO_TRUONG_LOAI_HO_SO,
        fieldDefinitions: [{ _id: 'fd-loai-ho-so', name: 'Loại hồ sơ', type: 'SELECT', options: [] }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1' },
    } as never);

    expect(customFieldsOfCreateCall(calls).some(f => f.fieldId === 'fd-loai-ho-so')).toBe(false);
  });

  it('van gan duoc file qua bang alias khi truong khong khai bao type DOCUMENT', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_CO_TRUONG_LOAI_HO_SO,
        fieldDefinitions: [{ _id: 'fd-tai-lieu', name: 'Tài liệu', type: 'TEXT' }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1' },
    } as never);

    expect(customFieldsOfCreateCall(calls).find(f => Array.isArray(f.value))!.fieldId).toBe('fd-tai-lieu');
  });
});

describe('PrivOSLifecycleService id local khi tao ho so that bai', () => {
  it('sinh id khac nhau cho hai ho so tao trong cung mot mili-giay', async () => {
    // Dong bang dong ho de hai lan goi chac chan roi vao cung mot mili-giay. Neu de thoi gian
    // that chay, test se lúc pass lúc fail tuy toc do may — dung cai can tranh o day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:00:00.000Z'));
    try {
      const { app } = createAppStub({
        'mcpapp.lists.getAll': () => { throw new Error('hub khong phan hoi'); },
      });
      const service = new PrivOSLifecycleService(app as never);

      const dau = await service.createProfile('room-1', { name: 'NV A' } as never);
      const sau = await service.createProfile('room-1', { name: 'NV B' } as never);

      expect(dau._id).not.toBe(sau._id);
      expect(dau._id.startsWith('local-')).toBe(true);
      expect(sau._id.startsWith('local-')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PrivOSLifecycleService chi doc list SCREENING', () => {
  const STAGE_05 = [{ _id: 'stage-05', name: '05_Moi_Phong_Van' }];

  const SCREENING_LIST = {
    _id: 'list-screening',
    name: 'SCREENING_Backend_Developer',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  // List khong lien quan gi den tuyen dung, nhung ten cung khong chua tu khoa nhan su nao,
  // nen logic loai tru cu xep no vao dien "list ung vien".
  const UNRELATED_LIST = {
    _id: 'list-khac',
    name: 'Bảng theo dõi chi phí',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  const HR_LIFECYCLE_LIST = {
    _id: 'list-nhan-su',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  const CANDIDATE_ITEM = {
    _id: 'ung-vien-1',
    name: 'Nguyen Van A',
    stageId: 'stage-05',
    customFields: [],
  };

  it('khong doc item cua list khong phai SCREENING', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [SCREENING_LIST, UNRELATED_LIST, HR_LIFECYCLE_LIST],
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.loadPassedCandidates('room-1');

    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.listId)).toEqual(['list-screening']);
  });

  it('chi tra ve ung vien cua list SCREENING', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [SCREENING_LIST, UNRELATED_LIST],
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    const candidates = await service.loadPassedCandidates('room-1');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].listId).toBe('list-screening');
    expect(candidates[0].listName).toBe('SCREENING_Backend_Developer');
  });

  it('tra ve rong khi room khong co list SCREENING nao', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [UNRELATED_LIST, HR_LIFECYCLE_LIST],
      // Van khai bao handler nay: neu bo qua, loi "unexpected tool call" se bi
      // `loadPassedCandidates` nuot va tra ve [] — test se pass vi ly do sai.
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadPassedCandidates('room-1')).resolves.toEqual([]);
    expect(calls.some(c => c.name === 'mcpapp.lists.getItems')).toBe(false);
  });
});
