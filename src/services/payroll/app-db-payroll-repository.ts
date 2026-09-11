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
		try {
			await this.callerFactory(roomId)('mcpapp.db.registerCollection', {
				collection: PAYROLL_COLLECTION,
				scope: 'room',
				fields: PAYROLL_FIELDS,
				indexes: PAYROLL_INDEXES,
			});
		} catch (error) {
			if (!isAlreadyRegisteredError(error)) throw error;
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
