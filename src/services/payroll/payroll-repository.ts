/**
 * Payroll persistence contract. The only layer allowed to know that records
 * live in this app's room-scoped App Database collection is the
 * implementation in `app-db-payroll-repository.ts`; tool handlers depend on
 * this interface so they can be unit-tested with an in-memory fake.
 */
export const PAYROLL_COLLECTION = 'hr_payroll_records';

export interface PayrollDocument {
	readonly _id?: string;
	readonly roomId: string;
	readonly employeeId: string;
	readonly baseSalary: number;
	readonly taxId?: string;
	readonly bankAccount?: string;
	readonly bankName?: string;
	readonly contractType?: string;
	readonly applyProbationRate?: boolean;
	readonly probationRate?: number;
	readonly _createdAt?: string;
	readonly _updatedAt?: string;
}

export type PayrollInput = Omit<PayrollDocument, '_id' | 'roomId' | '_createdAt' | '_updatedAt'>;

export interface IPayrollRepository {
	initializeSchema(roomId: string): Promise<void>;
	queryByRoom(roomId: string): Promise<readonly PayrollDocument[]>;
	create(roomId: string, data: PayrollInput): Promise<PayrollDocument>;
	update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void>;
	delete(roomId: string, id: string): Promise<void>;
}
