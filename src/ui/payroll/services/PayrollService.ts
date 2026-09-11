import { parseToolResult, type McpApp } from '@privos_ai/app-react';
import { PAYROLL_COLLECTION } from '../../../services/payroll/payroll-repository';
import {
  PAYROLL_FIELDS,
  PAYROLL_INDEXES,
  PAYROLL_MAX_PAGES,
  PAYROLL_PAGE_SIZE,
  byCreatedAtDesc,
  isAlreadyRegisteredError,
} from '../../../services/payroll/payroll-schema';
import type { IPayrollService, PayrollRecord } from '../types';

/**
 * Talks to the App Database through the mediated `mcpapp.db.*` tools, which the host
 * bridge runs AS THE CURRENT USER — the documented call path (see
 * `privos-dev-docs/mcp-app-platform/apis/tools-database.md` — SDK Usage) and the one
 * the declared `db:read` / `db:write` / `db:schema:read` / `db:schema:write` scopes are
 * granted for (`executionContext: "user"` in privos-app.json).
 *
 * This deliberately does NOT go through this app's own `hrm.payroll.*` server tools:
 * those reach the same collection with the installation-bot credential, which only a
 * workspace admin can issue. They stay in place for AI-chat and background callers.
 *
 * `roomId` is never taken from a record — the service stamps its own on every write, so
 * a record carrying a foreign `roomId` cannot redirect the row.
 */
export class PayrollService implements IPayrollService {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
  ) {
    if (!app) throw new Error('PayrollService requires a valid McpApp instance.');
    if (!roomId) throw new Error('PayrollService requires a roomId.');
  }

  /** Resolves the tool result, turning a tool-level `isError` into a rejection. */
  private async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return parseToolResult(await this.app.callServerTool({ name, arguments: args }));
  }

  async initializeSchema(): Promise<void> {
    try {
      await this.call('mcpapp.db.registerCollection', {
        collection: PAYROLL_COLLECTION,
        scope: 'room',
        fields: PAYROLL_FIELDS,
        indexes: PAYROLL_INDEXES,
      });
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) throw error;
    }
  }

  async getRecords(): Promise<PayrollRecord[]> {
    const collected: PayrollRecord[] = [];

    for (let page = 0; page < PAYROLL_MAX_PAGES; page += 1) {
      const response = await this.call('mcpapp.db.query', {
        collection: PAYROLL_COLLECTION,
        // Redundant with `scope: 'room'` physical isolation, kept as defence in depth; it also
        // selects the { roomId: 1, employeeId: 1 } index via its prefix.
        where: [{ field: 'roomId', op: '==', value: this.roomId }],
        // Sorting on the registered, unique `employeeId` gives paging a total order. Without a
        // stable sort, `offset` paging can repeat or skip documents between pages.
        orderBy: [{ field: 'employeeId', direction: 'asc' }],
        limit: PAYROLL_PAGE_SIZE,
        offset: page * PAYROLL_PAGE_SIZE,
      });

      const records = Array.isArray(response.records) ? (response.records as PayrollRecord[]) : [];
      collected.push(...records);
      if (records.length < PAYROLL_PAGE_SIZE) break;
    }

    return collected.sort(byCreatedAtDesc);
  }

  async saveRecord(record: PayrollRecord): Promise<void> {
    // `_id`/`_createdAt`/`_updatedAt` are hub-assigned and `roomId` is service-owned: none of
    // them belong in a write payload, and `roomId` is re-stamped below rather than forwarded.
    const { _id, _createdAt: _c, _updatedAt: _u, roomId: _room, ...fields } = record;
    const data = { ...fields, roomId: this.roomId };

    if (_id) {
      await this.call('mcpapp.db.update', { collection: PAYROLL_COLLECTION, id: _id, data });
    } else {
      await this.call('mcpapp.db.create', { collection: PAYROLL_COLLECTION, data });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.call('mcpapp.db.delete', { collection: PAYROLL_COLLECTION, id });
  }
}
