/**
 * App-owned `hrm.payroll.*` tools. Authorization model:
 *   1. `actor` MUST be present — it is the SDK-verified caller (dispatch
 *      assertion or Hub-signed user token). Without it we fail closed.
 *   2. The room the repository is pointed at is ALWAYS `actor.roomId`. A
 *      caller-supplied `roomId` is accepted only when it equals it — it exists
 *      so the UI can express intent and get a loud mismatch instead of silent
 *      redirection.
 *   3. Every write payload is rebuilt from a field whitelist; `roomId`, `_id`,
 *      and any operator-looking key never reach the Hub.
 */
import type { VerifiedActor } from '@privos_ai/app-server';

import { AppDbPayrollRepository } from './services/payroll/app-db-payroll-repository';
import type { IPayrollRepository, PayrollInput } from './services/payroll/payroll-repository';

export const PAYROLL_TOOL_NAMES = [
	'hrm.payroll.query',
	'hrm.payroll.create',
	'hrm.payroll.update',
	'hrm.payroll.delete',
] as const;
export type PayrollToolName = (typeof PAYROLL_TOOL_NAMES)[number];

const PAYROLL_DATA_SCHEMA = {
	type: 'object',
	properties: {
		employeeId: { type: 'string' },
		baseSalary: { type: 'number' },
		taxId: { type: 'string' },
		bankAccount: { type: 'string' },
		bankName: { type: 'string' },
		contractType: { type: 'string' },
		applyProbationRate: { type: 'boolean' },
		probationRate: { type: 'number' },
	},
} as const;

export const PAYROLL_TOOL_DEFINITIONS = [
	{
		name: 'hrm.payroll.query',
		title: 'Query payroll records',
		description: 'List payroll records of the room the verified caller is in. Requires a Hub-verified actor.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' } } },
	},
	{
		name: 'hrm.payroll.create',
		title: 'Create payroll record',
		description: 'Create one payroll record in the verified caller room.',
		inputSchema: {
			type: 'object',
			properties: { roomId: { type: 'string' }, data: PAYROLL_DATA_SCHEMA },
			required: ['data'],
		},
	},
	{
		name: 'hrm.payroll.update',
		title: 'Update payroll record',
		description: 'Update one payroll record by id in the verified caller room.',
		inputSchema: {
			type: 'object',
			properties: { roomId: { type: 'string' }, id: { type: 'string' }, data: PAYROLL_DATA_SCHEMA },
			required: ['id', 'data'],
		},
	},
	{
		name: 'hrm.payroll.delete',
		title: 'Delete payroll record',
		description: 'Soft-delete one payroll record by id in the verified caller room.',
		inputSchema: {
			type: 'object',
			properties: { roomId: { type: 'string' }, id: { type: 'string' } },
			required: ['id'],
		},
	},
] as const;

export function isPayrollTool(name: unknown): name is PayrollToolName {
	return typeof name === 'string' && (PAYROLL_TOOL_NAMES as readonly string[]).includes(name);
}

let dependencies: { repository: IPayrollRepository } = { repository: new AppDbPayrollRepository() };

/** Test seam — production wiring is the default above. */
export function setPayrollToolDependencies(deps: { repository: IPayrollRepository }): void {
	dependencies = deps;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function wrap(payload: unknown): { content: [{ type: 'text'; text: string }] } {
	return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Resolve the ONLY room this call may touch: the verified actor's. */
export function resolveActorRoom(args: Record<string, unknown>, actor: VerifiedActor | undefined): string {
	if (!actor) {
		throw new Error('This tool requires a verified caller identity (no Hub-verified actor on this request).');
	}
	// `roomId` is optional on VerifiedActor (JWT `rid`): a token minted outside a room carries
	// none. These tools are room-scoped by definition, so an absent room fails closed as well —
	// the room is NEVER taken from the arguments.
	const actorRoom = typeof actor.roomId === 'string' ? actor.roomId.trim() : '';
	if (!actorRoom) {
		throw new Error('The verified caller identity carries no room, so this room-scoped tool cannot run.');
	}
	const requested = typeof args.roomId === 'string' ? args.roomId.trim() : '';
	if (requested && requested !== actorRoom) {
		throw new Error(`roomId "${requested}" does not match the verified caller room.`);
	}
	return actorRoom;
}

function optionalString(value: unknown, key: string, maxLength: number): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') throw new Error(`${key} must be a string`);
	if (value.length > maxLength) throw new Error(`${key} exceeds ${maxLength} characters`);
	return value;
}

function readPayrollInput(raw: unknown, partial: false): PayrollInput;
function readPayrollInput(raw: unknown, partial: true): Partial<PayrollInput>;
function readPayrollInput(raw: unknown, partial: boolean): PayrollInput | Partial<PayrollInput> {
	const data = asRecord(raw);
	const out: Record<string, unknown> = {};

	if (data.employeeId !== undefined || !partial) {
		if (typeof data.employeeId !== 'string' || !data.employeeId.trim()) throw new Error('employeeId is required');
		out.employeeId = data.employeeId.trim();
	}
	if (data.baseSalary !== undefined || !partial) {
		if (typeof data.baseSalary !== 'number' || !Number.isFinite(data.baseSalary) || data.baseSalary < 0) {
			throw new Error('baseSalary must be a number >= 0');
		}
		out.baseSalary = data.baseSalary;
	}
	for (const [key, max] of [
		['taxId', 32],
		['bankAccount', 64],
		['bankName', 128],
		['contractType', 64],
	] as const) {
		const value = optionalString(data[key], key, max);
		if (value !== undefined) out[key] = value;
	}
	if (data.applyProbationRate !== undefined) {
		if (typeof data.applyProbationRate !== 'boolean') throw new Error('applyProbationRate must be a boolean');
		out.applyProbationRate = data.applyProbationRate;
	}
	if (data.probationRate !== undefined) {
		if (typeof data.probationRate !== 'number' || data.probationRate < 0 || data.probationRate > 100) {
			throw new Error('probationRate must be a number between 0 and 100');
		}
		out.probationRate = data.probationRate;
	}
	return out as PayrollInput;
}

function requireId(args: Record<string, unknown>): string {
	const id = typeof args.id === 'string' ? args.id.trim() : '';
	if (!id) throw new Error('id is required');
	return id;
}

export async function handlePayrollTool(name: PayrollToolName, rawArgs: unknown, actor: VerifiedActor | undefined) {
	const args = asRecord(rawArgs);
	const roomId = resolveActorRoom(args, actor);
	const { repository } = dependencies;

	try {
		switch (name) {
			case 'hrm.payroll.query': {
				await repository.initializeSchema(roomId);
				return wrap({ records: await repository.queryByRoom(roomId) });
			}
			case 'hrm.payroll.create': {
				const input = readPayrollInput(args.data, false);
				return wrap(await repository.create(roomId, input));
			}
			case 'hrm.payroll.update': {
				const id = requireId(args);
				const input = readPayrollInput(args.data, true);
				await repository.update(roomId, id, input);
				return wrap({ id, updated: true });
			}
			case 'hrm.payroll.delete': {
				const id = requireId(args);
				await repository.delete(roomId, id);
				return wrap({ id, deleted: true });
			}
		}
	} catch (error) {
		// TEMP DIAGNOSTIC (2026-09-10) — @privos_ai/app-server's runtime sanitizes every thrown
		// error down to a bare "Internal error" before it reaches the client, and even its own
		// server-side log only records `errorCode`, never `message`/`stack` (runtime.js). This is
		// the only place the real cause is still visible. Remove once hrm.payroll.query's 400 is
		// root-caused (see docs/superpowers/plans/2026-09-10-payroll-db-conformance-fixes.md).
		console.error('[hrm.payroll] tool threw', {
			name,
			roomId,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
}
