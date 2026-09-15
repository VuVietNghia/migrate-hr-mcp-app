/**
 * The registered shape of `hr_payroll_records`, shared by both callers of the App
 * Database: the server-side `AppDbPayrollRepository` (installation-bot credential) and
 * the UI's `PayrollService` (user-session relay). Both register and page the same
 * collection, so the field list, the index, and the paging limits have to be one
 * definition — two copies would drift and the Hub would reject whichever ran second.
 *
 * This module deliberately has no imports: the UI bundle pulls it in, so anything
 * server-only reached from here would break the browser build.
 */

/** Schema is fixed here; `mcpapp.db.registerCollection` enforces it server-side on every write. */
export const PAYROLL_FIELDS = [
	{ name: 'roomId', type: 'string', required: true, maxLength: 64 },
	{ name: 'employeeId', type: 'string', required: true, maxLength: 64 },
	{ name: 'baseSalary', type: 'number', required: true, min: 0 },
	{ name: 'taxId', type: 'string', maxLength: 32 },
	{ name: 'bankAccount', type: 'string', maxLength: 64 },
	{ name: 'bankName', type: 'string', maxLength: 128 },
	{ name: 'contractType', type: 'string', maxLength: 64 },
	{ name: 'applyProbationRate', type: 'boolean' },
	{ name: 'probationRate', type: 'number', min: 0, max: 100 },
	/**
	 * Soft-delete tombstone: an ISO-8601 timestamp when the row is deleted, absent or empty
	 * otherwise. Payroll rows are never removed from the collection. `PayrollDashboard`'s garbage
	 * collector used to hard-delete any row whose employee it could not match against the roster,
	 * so one truncated or failed roster read was unrecoverable.
	 */
	{ name: 'deletedAt', type: 'string', maxLength: 32 },
] as const;

/**
 * Index uses: queryByRoom (roomId prefix, then employeeId as the paging sort key); uniqueness of
 * one payroll row per employee per room. Fixed at registerCollection time — `mcpapp.db.updateSchema`
 * takes `fields` only, so changing this index would require dropping the collection and its data.
 */
export const PAYROLL_INDEXES = [{ fields: { roomId: 1, employeeId: 1 }, unique: true }] as const;

/** The hub caps one `mcpapp.db.query` response at 1000 docs (tools-database.md — Limits). */
export const PAYROLL_PAGE_SIZE = 1000;

/** 10 × 1000 = the hub's 10,000 count cap. A hard stop so a misbehaving page never loops forever. */
export const PAYROLL_MAX_PAGES = 10;

/**
 * `registerCollection` is not idempotent on the Hub — re-running it in a room that already
 * has the collection throws. Every caller registers on first load, so every caller needs
 * to recognise that one message as success.
 */
export function isAlreadyRegisteredError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /already registered/i.test(message);
}

/**
 * Newest first. `_createdAt` is hub-assigned and is NOT a registered schema field, so sending it to
 * `orderBy` risks the documented `Unknown field` error — the display order is applied here instead.
 * Documents without `_createdAt` sort last.
 */
export function byCreatedAtDesc(a: { _createdAt?: string }, b: { _createdAt?: string }): number {
	return (b._createdAt ?? '').localeCompare(a._createdAt ?? '');
}

/**
 * A row is live until it carries a `deletedAt` tombstone.
 *
 * Reads filter on this in memory rather than in a `where` clause: rows written before `deletedAt`
 * was registered have no such field at all, and a `where deletedAt == null` clause is not
 * guaranteed to match a document that is missing the field entirely. Reviving a row clears the
 * tombstone by writing `''`, which is falsy here — the schema types the field as a string, so
 * there is no null to write.
 */
export function isLivePayrollRecord(record: { deletedAt?: string }): boolean {
	return !record.deletedAt;
}

/**
 * Whether a row found by an employee lookup may be REVIVED by a create, rather than created anew.
 *
 * Only a tombstoned row may be. Reviving a LIVE row would write the caller's fields straight over
 * an existing salary — no tombstone, no recovery — which is exactly the collision the unique
 * `{ roomId, employeeId }` index exists to prevent. `hrm.payroll.create` retried after a timed-out
 * first call, or two admins saving the same new employee, would silently destroy the earlier
 * figure. When the row is live the caller MUST fall through to a plain create and let the index
 * reject the write loudly. Both mirrors (`AppDbPayrollRepository.create`, `PayrollService
 * .saveRecord`) call this so the decision exists once.
 */
export function isRevivableRecord<T extends { _id?: string; deletedAt?: string }>(
	record: T | null | undefined,
): record is T & { _id: string } {
	if (!record || !record._id) return false;
	return !isLivePayrollRecord(record);
}
