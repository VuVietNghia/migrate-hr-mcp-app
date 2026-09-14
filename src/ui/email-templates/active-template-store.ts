import { parseToolResult, type McpApp } from '@privos_ai/app-react';

import { isAlreadyRegisteredError } from '../../services/payroll/payroll-schema';

/** Remembers which template of one category is "Đang sử dụng" for the whole Room. */
export interface ActiveTemplateStore {
  read(): Promise<string | null>;
  write(templateId: string): Promise<void>;
}

export type ActiveTemplateCategory = 'cv_scored' | 'lifecycle';

export const EMAIL_TEMPLATE_SETTINGS_COLLECTION = 'hr_email_template_settings';

const SETTINGS_FIELDS = [
  { name: 'roomId', type: 'string', required: true, maxLength: 64 },
  { name: 'category', type: 'string', required: true, enum: ['cv_scored', 'lifecycle'] },
  { name: 'activeTemplateId', type: 'string', required: true, maxLength: 128 },
] as const;

/** One pointer row per category per Room; the unique index turns a concurrent double-create into a retryable error. */
const SETTINGS_INDEXES = [{ fields: { roomId: 1, category: 1 }, unique: true }] as const;

interface SettingsRecord {
  _id?: string;
  activeTemplateId?: unknown;
}

function isCollectionMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /collection/i.test(message) && /not found/i.test(message);
}

/**
 * Stores the active template id in the App Database (`db:read` / `db:write`, collection registered
 * with `db:schema:write`) over the user-session relay, the same path as `PayrollService`. It replaces
 * the `_active-template.md` pointer file that used to sit next to the templates in Room Files.
 *
 * The collection is registered lazily on the first write, so the 3-second template polling only ever
 * runs a query — a Room that never picked a template reads as `null` without touching the schema.
 */
export class AppDbActiveTemplateStore implements ActiveTemplateStore {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
    private readonly category: ActiveTemplateCategory,
  ) {}

  async read(): Promise<string | null> {
    try {
      const record = await this.findRecord();
      return typeof record?.activeTemplateId === 'string' ? record.activeTemplateId : null;
    } catch (error) {
      if (isCollectionMissingError(error)) return null;
      throw error;
    }
  }

  async write(templateId: string): Promise<void> {
    try {
      await this.upsert(templateId);
    } catch (error) {
      if (!isCollectionMissingError(error)) throw error;
      await this.registerCollection();
      await this.upsert(templateId);
    }
  }

  private async upsert(templateId: string): Promise<void> {
    const data = { roomId: this.roomId, category: this.category, activeTemplateId: templateId };
    const existing = await this.findRecord();
    if (existing?._id) {
      await this.call('mcpapp.db.update', { collection: EMAIL_TEMPLATE_SETTINGS_COLLECTION, id: existing._id, data });
      return;
    }
    try {
      await this.call('mcpapp.db.create', { collection: EMAIL_TEMPLATE_SETTINGS_COLLECTION, data });
    } catch (createError) {
      // Another tab created the row between our query and create: the unique index rejected ours.
      const raced = await this.findRecord();
      if (!raced?._id) throw createError;
      await this.call('mcpapp.db.update', { collection: EMAIL_TEMPLATE_SETTINGS_COLLECTION, id: raced._id, data });
    }
  }

  private async findRecord(): Promise<SettingsRecord | null> {
    const response = await this.call('mcpapp.db.query', {
      collection: EMAIL_TEMPLATE_SETTINGS_COLLECTION,
      where: [
        { field: 'roomId', op: '==', value: this.roomId },
        { field: 'category', op: '==', value: this.category },
      ],
      limit: 1,
    });
    const records = Array.isArray(response.records) ? response.records as SettingsRecord[] : [];
    return records[0] ?? null;
  }

  private async registerCollection(): Promise<void> {
    try {
      await this.call('mcpapp.db.registerCollection', {
        collection: EMAIL_TEMPLATE_SETTINGS_COLLECTION,
        scope: 'room',
        fields: SETTINGS_FIELDS,
        indexes: SETTINGS_INDEXES,
      });
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) throw error;
    }
  }

  private async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return parseToolResult(await this.app.callServerTool({ name, arguments: args }));
  }
}
