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
