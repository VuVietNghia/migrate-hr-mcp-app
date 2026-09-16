import { createRoomHubToolCaller, type HubToolCaller } from '../hub-tool-caller';
import {
	PAYROLL_COLLECTION,
	type IPayrollRepository,
	type PayrollDocument,
	type PayrollInput,
} from './payroll-repository';
import {
	PAYROLL_FIELDS,
	PAYROLL_INDEXES,
	byCreatedAtDesc,
	isAlreadyRegisteredError,
	isLivePayrollRecord,
	isRevivableRecord,
} from './payroll-schema';

// Re-exported so existing importers keep their call site; the values live in `payroll-schema.ts`
// because the UI's PayrollService registers and pages the same collection over the user-session relay.
export { PAYROLL_MAX_PAGES, PAYROLL_PAGE_SIZE } from './payroll-schema';
import { PAYROLL_MAX_PAGES, PAYROLL_PAGE_SIZE } from './payroll-schema';

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class AppDbPayrollRepository implements IPayrollRepository {
	constructor(private readonly callerFactory: (roomId: string) => HubToolCaller = createRoomHubToolCaller) {}

	async initializeSchema(roomId: string): Promise<void> {
		const call = this.callerFactory(roomId);
		try {
			await call('mcpapp.db.registerCollection', {
				collection: PAYROLL_COLLECTION,
				scope: 'room',
				fields: PAYROLL_FIELDS,
				indexes: PAYROLL_INDEXES,
			});
		} catch (error) {
			if (!isAlreadyRegisteredError(error)) throw error;
		}
		// Rooms registered before `deletedAt` existed still enforce the old field list, and the hub
		// rejects a write carrying an unregistered field — a soft delete there would fail. This adds
		// the field. `updateSchema` takes `fields` only and cannot touch the unique index, so it is
		// safe to run on every load and is a no-op once the room is current. It is deliberately NOT
		// swallowed: a room that cannot take the field cannot soft-delete, and that must be loud.
		await call('mcpapp.db.updateSchema', { collection: PAYROLL_COLLECTION, fields: PAYROLL_FIELDS });
	}

	async queryByRoom(roomId: string): Promise<readonly PayrollDocument[]> {
		const call = this.callerFactory(roomId);
		const collected: PayrollDocument[] = [];

		for (let page = 0; page < PAYROLL_MAX_PAGES; page += 1) {
			const response = asRecord(
				await call('mcpapp.db.query', {
					collection: PAYROLL_COLLECTION,
					// Redundant with `scope: 'room'` physical isolation, kept as defence in depth; it also
					// selects the { roomId: 1, employeeId: 1 } index via its prefix.
					where: [{ field: 'roomId', op: '==', value: roomId }],
					// Sorting on the registered, unique `employeeId` gives paging a total order. Without a
					// stable sort, `offset` paging can repeat or skip documents between pages.
					orderBy: [{ field: 'employeeId', direction: 'asc' }],
					limit: PAYROLL_PAGE_SIZE,
					offset: page * PAYROLL_PAGE_SIZE,
				}),
			);
			const records = Array.isArray(response.records) ? (response.records as PayrollDocument[]) : [];
			collected.push(...records);
			// A short page is the ONLY normal exit — it proves the room was read to completion.
			// Tombstoned rows are filtered here, not in the `where` clause: rows written before
			// `deletedAt` was registered have no such field, and a `where deletedAt == null` is not
			// guaranteed to match a missing field. Paging above still counts the raw page length, so a
			// page made entirely of tombstones does not end the read early. The query itself is
			// unchanged and still uses the { roomId: 1, employeeId: 1 } index via its roomId prefix.
			if (records.length < PAYROLL_PAGE_SIZE) {
				return collected.filter(isLivePayrollRecord).sort(byCreatedAtDesc);
			}
		}

		// Budget exhausted while a FULL page was still coming back: the read is incomplete. Returning
		// it would hand callers a truncated payroll list — the same silent truncation `fetchListItems`
		// refuses for the roster. Tombstones are never purged and count toward this budget, so the
		// ceiling is reachable in a real room. A partial salary list is never the fallback.
		throw new Error(
			`Bảng lương của room ${roomId} vượt quá ${PAYROLL_MAX_PAGES * PAYROLL_PAGE_SIZE} dòng. `
			+ 'Dừng để không trả về danh sách lương thiếu.',
		);
	}

	async create(roomId: string, data: PayrollInput): Promise<PayrollDocument> {
		const { roomId: _ignored, ...safe } = data as PayrollInput & { roomId?: string };
		const call = this.callerFactory(roomId);

		// The unique (roomId, employeeId) index counts tombstoned rows too, so a plain create for an
		// employee whose row was soft-deleted would be rejected for good. Revive that row instead —
		// without this, the tombstone is not recoverable and the soft delete buys nothing.
		//
		// `isRevivableRecord`, NOT a bare `existing?._id`: a LIVE row must fall through to the create
		// below so the unique index rejects the duplicate loudly. Writing over it here would silently
		// destroy an existing salary — see the predicate's doc comment in `payroll-schema.ts`.
		const existing = await this.findAnyByEmployee(call, roomId, safe.employeeId);
		if (isRevivableRecord(existing)) {
			await call('mcpapp.db.update', {
				collection: PAYROLL_COLLECTION,
				id: existing._id,
				// `''` rather than null: the field is registered as a string, and `isLivePayrollRecord`
				// treats any falsy value as live.
				data: { ...safe, roomId, deletedAt: '' },
			});
			return { ...existing, ...safe, roomId, deletedAt: undefined } as PayrollDocument;
		}

		const created = await call('mcpapp.db.create', {
			collection: PAYROLL_COLLECTION,
			data: { ...safe, roomId },
		});
		return asRecord(created) as unknown as PayrollDocument;
	}

	/**
	 * The row for one employee in this room, tombstoned or not. Both keys of the unique
	 * { roomId: 1, employeeId: 1 } index are in the filter, so this uses the whole index.
	 */
	private async findAnyByEmployee(
		call: HubToolCaller,
		roomId: string,
		employeeId: string,
	): Promise<PayrollDocument | undefined> {
		const response = asRecord(
			await call('mcpapp.db.query', {
				collection: PAYROLL_COLLECTION,
				where: [
					{ field: 'roomId', op: '==', value: roomId },
					{ field: 'employeeId', op: '==', value: employeeId },
				],
				limit: 1,
				offset: 0,
			}),
		);
		const records = Array.isArray(response.records) ? (response.records as PayrollDocument[]) : [];
		return records[0];
	}

	async update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void> {
		const { roomId: _ignored, ...safe } = data as Partial<PayrollInput> & { roomId?: string };
		await this.callerFactory(roomId)('mcpapp.db.update', {
			collection: PAYROLL_COLLECTION,
			id,
			// `deletedAt: ''` clears any tombstone, the same revive semantics `create` uses. An edit
			// opened before a garbage-collection pass tombstoned the row would otherwise report success
			// while the row stayed invisible. `''` not null: the field is registered as a string and
			// `isLivePayrollRecord` tests falsiness.
			data: { ...safe, roomId, deletedAt: '' },
		});
	}

	async delete(roomId: string, id: string): Promise<void> {
		// Soft delete. The row stays so a mistaken garbage-collection pass is recoverable, and so the
		// unique (roomId, employeeId) index still records that this employee has a row — `create`
		// revives it rather than colliding with it.
		await this.callerFactory(roomId)('mcpapp.db.update', {
			collection: PAYROLL_COLLECTION,
			id,
			data: { roomId, deletedAt: new Date().toISOString() },
		});
	}
}
