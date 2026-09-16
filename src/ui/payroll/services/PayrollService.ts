import { parseToolResult, type McpApp } from '@privos_ai/app-react';
import { PAYROLL_COLLECTION } from '../../../services/payroll/payroll-repository';
import {
  PAYROLL_FIELDS,
  PAYROLL_INDEXES,
  PAYROLL_MAX_PAGES,
  PAYROLL_PAGE_SIZE,
  byCreatedAtDesc,
  isAlreadyRegisteredError,
  isLivePayrollRecord,
  isRevivableRecord,
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
    // See the same call in `app-db-payroll-repository.ts` — this is the user-session mirror of it.
    await this.call('mcpapp.db.updateSchema', { collection: PAYROLL_COLLECTION, fields: PAYROLL_FIELDS });
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
      // A short page is the ONLY normal exit — it proves the room was read to completion.
      // See `AppDbPayrollRepository.queryByRoom` — the same in-memory tombstone filter, for the same
      // reason: legacy rows have no `deletedAt` field for a `where` clause to match against.
      if (records.length < PAYROLL_PAGE_SIZE) {
        return collected.filter(isLivePayrollRecord).sort(byCreatedAtDesc);
      }
    }

    // Budget exhausted while a FULL page was still coming back: the read is incomplete. A truncated
    // payroll list is what `PayrollDashboard`'s reconciliation must never see, so it is never the
    // fallback — the user-session mirror of the same throw in `AppDbPayrollRepository.queryByRoom`.
    throw new Error(
      `Bảng lương của room ${this.roomId} vượt quá ${PAYROLL_MAX_PAGES * PAYROLL_PAGE_SIZE} dòng. `
      + 'Dừng để không trả về danh sách lương thiếu.',
    );
  }

  async saveRecord(record: PayrollRecord): Promise<void> {
    // `_id`/`_createdAt`/`_updatedAt` are hub-assigned, `roomId` is service-owned and `deletedAt` is
    // written only by `deleteRecord` and cleared only by a revive: none of them belong in a write
    // payload built from UI state.
    const { _id, _createdAt: _c, _updatedAt: _u, roomId: _room, deletedAt: _d, ...fields } = record;
    const data = { ...fields, roomId: this.roomId };

    if (_id) {
      // `deletedAt: ''` clears any tombstone the row picked up while this edit was open — a
      // garbage-collection pass on another client's reload would otherwise leave the row invisible
      // while this save reported success. Mirrors `AppDbPayrollRepository.update`.
      await this.call('mcpapp.db.update', {
        collection: PAYROLL_COLLECTION,
        id: _id,
        data: { ...data, deletedAt: '' },
      });
      return;
    }

    // The unique (roomId, employeeId) index counts tombstoned rows, so creating a second row for an
    // employee whose row was soft-deleted would be rejected. Revive that row instead — this is the
    // user-session mirror of `AppDbPayrollRepository.create`.
    //
    // `isRevivableRecord`, NOT a bare `existing?._id`: a LIVE row must fall through to the create
    // below so the unique index rejects it loudly. Overwriting it here would let the second of two
    // concurrent admins silently clobber the first one's salary figure.
    const existing = await this.findAnyByEmployee(record.employeeId);
    if (isRevivableRecord(existing)) {
      await this.call('mcpapp.db.update', {
        collection: PAYROLL_COLLECTION,
        id: existing._id,
        data: { ...data, deletedAt: '' },
      });
      return;
    }

    await this.call('mcpapp.db.create', { collection: PAYROLL_COLLECTION, data });
  }

  /**
   * The row for one employee in this room, tombstoned or not. Both keys of the unique
   * { roomId: 1, employeeId: 1 } index are in the filter, so this uses the whole index.
   */
  private async findAnyByEmployee(employeeId: string): Promise<PayrollRecord | undefined> {
    const response = await this.call('mcpapp.db.query', {
      collection: PAYROLL_COLLECTION,
      where: [
        { field: 'roomId', op: '==', value: this.roomId },
        { field: 'employeeId', op: '==', value: employeeId },
      ],
      limit: 1,
      offset: 0,
    });
    const records = Array.isArray(response.records) ? (response.records as PayrollRecord[]) : [];
    return records[0];
  }

  async deleteRecord(id: string): Promise<void> {
    // Soft delete — the user-session mirror of `AppDbPayrollRepository.delete`.
    await this.call('mcpapp.db.update', {
      collection: PAYROLL_COLLECTION,
      id,
      data: { roomId: this.roomId, deletedAt: new Date().toISOString() },
    });
  }
}
