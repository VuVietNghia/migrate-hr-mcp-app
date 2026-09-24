import { parseToolResult, type McpApp } from '@privos_ai/app-react';

import { isAlreadyRegisteredError } from '../services/payroll/payroll-schema';

export const RECRUITMENT_DEPARTMENTS_COLLECTION = 'hr_recruitment_departments';

export interface RecruitmentDepartment {
  key: string;
  label: string;
  order: number;
}

export function createRecruitmentRoomOperation<TApp>(app: TApp, roomId: string) {
  let active = true;
  return {
    cancel() {
      active = false;
    },
    isCurrent(context: { app: TApp | undefined; roomId: string | undefined }) {
      return active && context.app === app && context.roomId === roomId;
    },
  };
}

export const DEFAULT_RECRUITMENT_DEPARTMENTS: RecruitmentDepartment[] = [
  { key: 'it', label: 'IT', order: 0 },
  { key: 'marketing', label: 'Marketing', order: 1 },
  { key: 'hr', label: 'HR', order: 2 },
];

export function isRecruitmentDepartmentRenameable(key: string): boolean {
  return !DEFAULT_RECRUITMENT_DEPARTMENTS.some((department) => department.key === key);
}

interface DepartmentRecord {
  _id?: string;
  roomId?: unknown;
  departmentKey?: unknown;
  label?: unknown;
  order?: unknown;
}

const DEPARTMENT_FIELDS = [
  { name: 'roomId', type: 'string', required: true, maxLength: 64 },
  { name: 'departmentKey', type: 'string', required: true, maxLength: 100 },
  { name: 'label', type: 'string', required: true, maxLength: 100 },
  { name: 'order', type: 'number', required: true, min: 0 },
] as const;

const DEPARTMENT_INDEXES = [
  { fields: { roomId: 1, departmentKey: 1 }, unique: true },
] as const;

function isCollectionMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /collection/i.test(message) && /not found/i.test(message);
}

export function departmentKeyFromLabel(label: string): string {
  const normalized = label
    .trim()
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) throw new Error('Tên phòng ban phải có ít nhất một chữ cái hoặc chữ số.');
  return normalized === 'khac' ? 'other' : normalized;
}

export function resolveJdDepartment(content: string): Pick<RecruitmentDepartment, 'key' | 'label'> {
  const metadataMatch = content.match(/<!--\s*DEPARTMENT_ID:\s*([^>]+?)\s*-->/i);
  const tableMatch = content.match(/\|\s*\*\*Phòng ban\*\*\s*\|\s*(.*?)\s*\|/i);
  const legacyMatch = content.match(/^-\s*Phòng ban:\s*(.*)$/im);
  const label = (tableMatch?.[1] || legacyMatch?.[1] || 'Khác').trim();
  let key: string | undefined;
  for (const candidate of [metadataMatch?.[1]?.trim(), label]) {
    if (!candidate) continue;
    try {
      key = departmentKeyFromLabel(candidate);
      break;
    } catch {
      // A malformed legacy value must not prevent the rest of the Room's JDs from loading.
    }
  }
  return { key: key || 'other', label };
}

export function mergeRecruitmentDepartments(
  stored: RecruitmentDepartment[],
  fromJds: Array<Pick<RecruitmentDepartment, 'key' | 'label'>>,
): RecruitmentDepartment[] {
  const merged = new Map<string, RecruitmentDepartment>();
  for (const item of DEFAULT_RECRUITMENT_DEPARTMENTS) merged.set(item.key, item);
  for (const item of [...stored].sort((left, right) => left.order - right.order)) {
    if (!merged.has(item.key)) merged.set(item.key, item);
  }
  for (const item of fromJds) {
    if (!merged.has(item.key)) {
      merged.set(item.key, { ...item, order: merged.size });
    }
  }
  return [...merged.values()];
}

export class AppDbRecruitmentDepartmentStore {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
  ) {}

  async list(): Promise<RecruitmentDepartment[]> {
    let response: Record<string, unknown>;
    try {
      response = await this.call('mcpapp.db.query', {
        collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
        where: [{ field: 'roomId', op: '==', value: this.roomId }],
        orderBy: [{ field: 'order', direction: 'asc' }],
        limit: 1000,
      });
    } catch (error) {
      if (isCollectionMissingError(error)) return [];
      throw error;
    }

    const records = Array.isArray(response.records) ? response.records as DepartmentRecord[] : [];
    return records
      .filter((record) => (
        typeof record.departmentKey === 'string'
        && typeof record.label === 'string'
        && typeof record.order === 'number'
      ))
      .map((record) => ({
        key: record.departmentKey as string,
        label: record.label as string,
        order: record.order as number,
      }))
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'vi'));
  }

  async create(label: string, order: number): Promise<RecruitmentDepartment> {
    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel.length > 100) {
      throw new Error('Tên phòng ban phải có từ 1 đến 100 ký tự.');
    }
    const department: RecruitmentDepartment = {
      key: departmentKeyFromLabel(trimmedLabel),
      label: trimmedLabel,
      order: Number.isFinite(order) && order >= 0 ? order : 0,
    };

    const builtIn = DEFAULT_RECRUITMENT_DEPARTMENTS.find((item) => item.key === department.key);
    if (builtIn) return builtIn;

    const existing = await this.findByKey(department.key);
    if (existing) return existing;

    try {
      await this.insert(department);
      return department;
    } catch (error) {
      if (isCollectionMissingError(error)) {
        await this.registerCollection();
        try {
          await this.insert(department);
          return department;
        } catch (retryError) {
          const raced = await this.findByKey(department.key);
          if (raced) return raced;
          throw retryError;
        }
      }

      const raced = await this.findByKey(department.key);
      if (raced) return raced;
      throw error;
    }
  }

  async rename(key: string, label: string, order: number): Promise<RecruitmentDepartment> {
    if (!isRecruitmentDepartmentRenameable(key)) {
      throw new Error('Phòng ban mặc định không thể đổi tên.');
    }

    const trimmedLabel = label.trim();
    if (!trimmedLabel || trimmedLabel.length > 100) {
      throw new Error('Tên phòng ban phải có từ 1 đến 100 ký tự.');
    }
    const labelKey = departmentKeyFromLabel(trimmedLabel);
    const duplicate = [...DEFAULT_RECRUITMENT_DEPARTMENTS, ...await this.list()]
      .find((item) => item.key !== key && departmentKeyFromLabel(item.label) === labelKey);
    if (duplicate) {
      throw new Error('Tên phòng ban đã tồn tại.');
    }

    const existing = await this.findRecordByKey(key);
    if (existing) {
      return this.updateRecord(existing, trimmedLabel);
    }

    const department: RecruitmentDepartment = {
      key,
      label: trimmedLabel,
      order: Number.isFinite(order) && order >= 0 ? order : 0,
    };
    try {
      await this.insert(department);
      return department;
    } catch (error) {
      if (isCollectionMissingError(error)) {
        await this.registerCollection();
        try {
          await this.insert(department);
          return department;
        } catch (retryError) {
          const raced = await this.findRecordByKey(key);
          if (raced) return this.updateRecord(raced, trimmedLabel);
          throw retryError;
        }
      }

      const raced = await this.findRecordByKey(key);
      if (raced) return this.updateRecord(raced, trimmedLabel);
      throw error;
    }
  }

  private async findByKey(key: string): Promise<RecruitmentDepartment | null> {
    const record = await this.findRecordByKey(key);
    if (!record) return null;
    return {
      key: record.departmentKey as string,
      label: record.label as string,
      order: record.order as number,
    };
  }

  private async findRecordByKey(key: string): Promise<DepartmentRecord | null> {
    try {
      const response = await this.call('mcpapp.db.query', {
        collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
        where: [
          { field: 'roomId', op: '==', value: this.roomId },
          { field: 'departmentKey', op: '==', value: key },
        ],
        limit: 1,
      });
      const record = Array.isArray(response.records) ? response.records[0] as DepartmentRecord | undefined : undefined;
      if (
        typeof record?.departmentKey !== 'string'
        || typeof record.label !== 'string'
        || typeof record.order !== 'number'
      ) return null;
      return record;
    } catch (error) {
      if (isCollectionMissingError(error)) return null;
      throw error;
    }
  }

  private async updateRecord(record: DepartmentRecord, label: string): Promise<RecruitmentDepartment> {
    if (typeof record._id !== 'string') {
      throw new Error('Không tìm thấy mã bản ghi phòng ban để đổi tên.');
    }
    await this.call('mcpapp.db.update', {
      collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
      id: record._id,
      data: { label },
    });
    return {
      key: record.departmentKey as string,
      label,
      order: record.order as number,
    };
  }

  private async insert(department: RecruitmentDepartment): Promise<void> {
    await this.call('mcpapp.db.create', {
      collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
      data: {
        roomId: this.roomId,
        departmentKey: department.key,
        label: department.label,
        order: department.order,
      },
    });
  }

  private async registerCollection(): Promise<void> {
    try {
      await this.call('mcpapp.db.registerCollection', {
        collection: RECRUITMENT_DEPARTMENTS_COLLECTION,
        scope: 'room',
        fields: DEPARTMENT_FIELDS,
        indexes: DEPARTMENT_INDEXES,
      });
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) throw error;
    }
  }

  private async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return parseToolResult(await this.app.callServerTool({ name, arguments: args }));
  }
}
