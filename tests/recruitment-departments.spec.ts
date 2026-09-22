import { describe, expect, it } from 'vitest';

import {
  AppDbRecruitmentDepartmentStore,
  DEFAULT_RECRUITMENT_DEPARTMENTS,
  RECRUITMENT_DEPARTMENTS_COLLECTION,
  createRecruitmentRoomOperation,
  departmentKeyFromLabel,
  isRecruitmentDepartmentRenameable,
  mergeRecruitmentDepartments,
  resolveJdDepartment,
} from '../src/ui/recruitment-departments';

describe('recruitment room operations', () => {
  it('rejects stale async results after cancellation or a room switch', () => {
    const appA = {};
    const appB = {};
    const operation = createRecruitmentRoomOperation(appA, 'room-a');

    expect(operation.isCurrent({ app: appA, roomId: 'room-a' })).toBe(true);
    expect(operation.isCurrent({ app: appB, roomId: 'room-b' })).toBe(false);

    operation.cancel();
    expect(operation.isCurrent({ app: appA, roomId: 'room-a' })).toBe(false);
  });
});

type ToolCall = { name: string; arguments?: Record<string, unknown> };
type DepartmentRow = {
  _id: string;
  roomId: string;
  departmentKey: string;
  label: string;
  order: number;
};

function toolResult(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function createDbStub({ registered = true }: { registered?: boolean } = {}) {
  const calls: ToolCall[] = [];
  const rows: DepartmentRow[] = [];
  let isRegistered = registered;

  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const args = call.arguments ?? {};

      switch (call.name) {
        case 'mcpapp.db.registerCollection':
          if (isRegistered) return toolError('Collection is already registered for this room identity');
          isRegistered = true;
          return toolResult({ collection: args.collection });
        case 'mcpapp.db.query': {
          if (!isRegistered) {
            return toolError(`Collection "${RECRUITMENT_DEPARTMENTS_COLLECTION}" not found for this room scope`);
          }
          const where = args.where as Array<{ field: keyof DepartmentRow; value: string }> | undefined;
          const records = where
            ? rows.filter((row) => where.every((clause) => row[clause.field] === clause.value))
            : [...rows];
          return toolResult({ records });
        }
        case 'mcpapp.db.create': {
          if (!isRegistered) {
            return toolError(`Collection "${RECRUITMENT_DEPARTMENTS_COLLECTION}" not found for this room scope`);
          }
          const data = args.data as Omit<DepartmentRow, '_id'>;
          if (rows.some((row) => row.roomId === data.roomId && row.departmentKey === data.departmentKey)) {
            return toolError('duplicate key error');
          }
          const row = { _id: `department-${rows.length + 1}`, ...data };
          rows.push(row);
          return toolResult(row);
        }
        case 'mcpapp.db.update': {
          const row = rows.find((item) => item._id === args.id);
          if (!row) return toolError('Department not found');
          Object.assign(row, args.data);
          return toolResult(row);
        }
        default:
          throw new Error(`Unexpected tool call: ${call.name}`);
      }
    },
  };

  return { app: app as never, calls, rows };
}

describe('recruitment department identifiers', () => {
  it('only seeds the three protected departments', () => {
    expect(DEFAULT_RECRUITMENT_DEPARTMENTS).toEqual([
      { key: 'it', label: 'IT', order: 0 },
      { key: 'marketing', label: 'Marketing', order: 1 },
      { key: 'hr', label: 'HR', order: 2 },
    ]);
  });

  it('only allows custom or JD-derived departments to be renamed', () => {
    expect(isRecruitmentDepartmentRenameable('it')).toBe(false);
    expect(isRecruitmentDepartmentRenameable('marketing')).toBe(false);
    expect(isRecruitmentDepartmentRenameable('hr')).toBe(false);
    expect(isRecruitmentDepartmentRenameable('other')).toBe(true);
    expect(isRecruitmentDepartmentRenameable('sales')).toBe(true);
  });

  it('creates a stable ASCII key from a Vietnamese department label', () => {
    expect(departmentKeyFromLabel('  Phòng Kế toán & Tài chính  ')).toBe('phong_ke_toan_tai_chinh');
  });

  it('keeps the built-in Khác department on its existing other key', () => {
    expect(departmentKeyFromLabel('Khác')).toBe('other');
  });
});

describe('resolveJdDepartment', () => {
  it('uses stable metadata for a new JD while preserving its display label', () => {
    const content = `# TUYỂN DỤNG: KẾ TOÁN TỔNG HỢP

<!-- DEPARTMENT_ID: ke_toan -->

| **Phòng ban** | Kế toán nội bộ |
`;

    expect(resolveJdDepartment(content)).toEqual({ key: 'ke_toan', label: 'Kế toán nội bộ' });
  });

  it('keeps loading a legacy JD that only stores the department label', () => {
    const content = `# TUYỂN DỤNG: NHÂN VIÊN

| **Phòng ban** | Chăm sóc khách hàng |
`;

    expect(resolveJdDepartment(content)).toEqual({
      key: 'cham_soc_khach_hang',
      label: 'Chăm sóc khách hàng',
    });
  });

  it('falls back to the existing other department when legacy metadata is malformed', () => {
    const content = `# TUYỂN DỤNG: NHÂN VIÊN

<!-- DEPARTMENT_ID: !!! -->

| **Phòng ban** | ??? |
`;

    expect(resolveJdDepartment(content)).toEqual({ key: 'other', label: '???' });
  });

  it('falls back from malformed metadata to a valid visible department label', () => {
    const content = `# TUYỂN DỤNG: NHÂN VIÊN

<!-- DEPARTMENT_ID: !!! -->

| **Phòng ban** | Kế toán |
`;

    expect(resolveJdDepartment(content)).toEqual({ key: 'ke_toan', label: 'Kế toán' });
  });
});

describe('mergeRecruitmentDepartments', () => {
  it('keeps an empty stored department and adds departments discovered from legacy JDs without duplicates', () => {
    expect(mergeRecruitmentDepartments(
      [{ key: 'ke_toan', label: 'Kế toán', order: 4 }],
      [
        { key: 'ke_toan', label: 'Tên cũ của kế toán' },
        { key: 'sales', label: 'Kinh doanh' },
      ],
    )).toEqual([
      { key: 'it', label: 'IT', order: 0 },
      { key: 'marketing', label: 'Marketing', order: 1 },
      { key: 'hr', label: 'HR', order: 2 },
      { key: 'ke_toan', label: 'Kế toán', order: 4 },
      { key: 'sales', label: 'Kinh doanh', order: 4 },
    ]);
  });
});

describe('AppDbRecruitmentDepartmentStore', () => {
  it('does not persist a duplicate of a built-in department', async () => {
    const { app, rows } = createDbStub();
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    await expect(store.create(' IT ', 9)).resolves.toEqual({ key: 'it', label: 'IT', order: 0 });
    expect(rows).toEqual([]);
  });

  it('treats a missing room collection as no custom departments without registering during read', async () => {
    const { app, calls } = createDbStub({ registered: false });
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    await expect(store.list()).resolves.toEqual([]);
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query']);
  });

  it('registers a room-scoped collection on first write and persists the department', async () => {
    const { app, calls, rows } = createDbStub({ registered: false });
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    await expect(store.create('Kế toán', 4)).resolves.toEqual({
      key: 'ke_toan',
      label: 'Kế toán',
      order: 4,
    });

    expect(rows).toEqual([
      {
        _id: 'department-1',
        roomId: 'room-1',
        departmentKey: 'ke_toan',
        label: 'Kế toán',
        order: 4,
      },
    ]);
    const registration = calls.find((call) => call.name === 'mcpapp.db.registerCollection');
    expect(registration?.arguments).toMatchObject({
      collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
      scope: 'room',
    });
  });

  it('returns the existing room department instead of creating a duplicate', async () => {
    const { app, rows } = createDbStub();
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    await store.create('Kế toán', 4);
    await expect(store.create('  KẾ TOÁN  ', 9)).resolves.toEqual({
      key: 'ke_toan',
      label: 'Kế toán',
      order: 4,
    });
    expect(rows).toHaveLength(1);
  });

  it('recovers when two first writes race to register the room collection', async () => {
    const { app, rows } = createDbStub({ registered: false });
    const firstStore = new AppDbRecruitmentDepartmentStore(app, 'room-1');
    const secondStore = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    const results = await Promise.all([
      firstStore.create('Kế toán', 4),
      secondStore.create('Kế toán', 4),
    ]);

    expect(results).toEqual([
      { key: 'ke_toan', label: 'Kế toán', order: 4 },
      { key: 'ke_toan', label: 'Kế toán', order: 4 },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('renames a stored department without changing its stable key or order', async () => {
    const { app, calls, rows } = createDbStub();
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');
    await store.create('Sales', 3);

    await expect(store.rename('sales', 'Kinh doanh quốc tế', 99)).resolves.toEqual({
      key: 'sales',
      label: 'Kinh doanh quốc tế',
      order: 3,
    });

    expect(rows[0]).toMatchObject({ departmentKey: 'sales', label: 'Kinh doanh quốc tế', order: 3 });
    expect(calls.find((call) => call.name === 'mcpapp.db.update')?.arguments).toMatchObject({
      id: 'department-1',
      data: { label: 'Kinh doanh quốc tế' },
    });
  });

  it('persists a renamed JD-derived department while retaining its original key', async () => {
    const { app, rows } = createDbStub();
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');

    await expect(store.rename('sales', 'Kinh doanh', 3)).resolves.toEqual({
      key: 'sales',
      label: 'Kinh doanh',
      order: 3,
    });
    expect(rows[0]).toMatchObject({ departmentKey: 'sales', label: 'Kinh doanh', order: 3 });
  });

  it('rejects protected departments and duplicate display names', async () => {
    const { app } = createDbStub();
    const store = new AppDbRecruitmentDepartmentStore(app, 'room-1');
    await store.create('Sales', 3);
    await store.create('Kế toán', 4);

    await expect(store.rename('it', 'Công nghệ', 0)).rejects.toThrow('không thể đổi tên');
    await expect(store.rename('sales', ' KẾ TOÁN ', 3)).rejects.toThrow('đã tồn tại');
  });
});
