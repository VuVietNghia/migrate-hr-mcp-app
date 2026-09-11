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

/** Index uses: queryByRoom (roomId prefix); uniqueness of one payroll row per employee per room. */
const PAYROLL_INDEXES = [{ fields: { roomId: 1, employeeId: 1 }, unique: true }] as const;

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
		// Uses index { roomId: 1, employeeId: 1 } via its roomId prefix.
		const response = asRecord(
			await this.callerFactory(roomId)('mcpapp.db.query', {
				collection: PAYROLL_COLLECTION,
				where: [{ field: 'roomId', op: '==', value: roomId }],
				orderBy: [{ field: '_createdAt', direction: 'desc' }],
				limit: 1000,
			}),
		);
		const records = Array.isArray(response.records) ? response.records : [];
		return records as PayrollDocument[];
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
