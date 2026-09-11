import { createRoomHubToolCaller, type HubToolCaller } from '../hub-tool-caller';
import {
	PAYROLL_COLLECTION,
	type IPayrollRepository,
	type PayrollDocument,
	type PayrollInput,
} from './payroll-repository';

/** Schema is fixed here; `mcpapp.db.registerCollection` enforces it server-side on every write. */
const PAYROLL_FIELDS = [
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
const PAYROLL_INDEXES = [{ fields: { roomId: 1, employeeId: 1 }, unique: true }] as const;

/** The hub caps one `mcpapp.db.query` response at 1000 docs (tools-database.md — Limits). */
export const PAYROLL_PAGE_SIZE = 1000;

/** 10 × 1000 = the hub's 10,000 count cap. A hard stop so a misbehaving page never loops forever. */
export const PAYROLL_MAX_PAGES = 10;

/**
 * Newest first. `_createdAt` is hub-assigned and is NOT a registered schema field, so sending it to
 * `orderBy` risks the documented `Unknown field` error — the display order is applied here instead.
 * Documents without `_createdAt` sort last.
 */
function byCreatedAtDesc(a: PayrollDocument, b: PayrollDocument): number {
	return (b._createdAt ?? '').localeCompare(a._createdAt ?? '');
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class AppDbPayrollRepository implements IPayrollRepository {
	constructor(private readonly callerFactory: (roomId: string) => HubToolCaller = createRoomHubToolCaller) {}

	async initializeSchema(roomId: string): Promise<void> {
		try {
			await this.callerFactory(roomId)('mcpapp.db.registerCollection', {
				collection: PAYROLL_COLLECTION,
				scope: 'room',
				fields: PAYROLL_FIELDS,
				indexes: PAYROLL_INDEXES,
			});
		} catch (error) {
			// registerCollection is not idempotent on the Hub — re-running in the same room throws.
			const message = error instanceof Error ? error.message : String(error);
			if (!/already registered/i.test(message)) throw error;
		}
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
			if (records.length < PAYROLL_PAGE_SIZE) break;
		}

		return collected.sort(byCreatedAtDesc);
	}

	async create(roomId: string, data: PayrollInput): Promise<PayrollDocument> {
		const { roomId: _ignored, ...safe } = data as PayrollInput & { roomId?: string };
		const created = await this.callerFactory(roomId)('mcpapp.db.create', {
			collection: PAYROLL_COLLECTION,
			data: { ...safe, roomId },
		});
		return asRecord(created) as unknown as PayrollDocument;
	}

	async update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void> {
		const { roomId: _ignored, ...safe } = data as Partial<PayrollInput> & { roomId?: string };
		await this.callerFactory(roomId)('mcpapp.db.update', {
			collection: PAYROLL_COLLECTION,
			id,
			data: { ...safe, roomId },
		});
	}

	async delete(roomId: string, id: string): Promise<void> {
		await this.callerFactory(roomId)('mcpapp.db.delete', { collection: PAYROLL_COLLECTION, id });
	}
}
