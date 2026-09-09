import { parseToolResult, type McpApp } from '@privos_ai/app-react';
import type { IPayrollService, PayrollRecord } from '../types';

/**
 * Talks ONLY to this app's own `hrm.payroll.*` tools. The server re-derives
 * the room from the Hub-verified actor; `roomId` is sent so a mismatch is a
 * loud error instead of a silent redirect. Schema registration happens
 * server-side on the first `query`, so `initializeSchema` is a no-op kept for
 * the `IPayrollService` contract.
 */
export class PayrollService implements IPayrollService {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
  ) {
    if (!app) throw new Error('PayrollService requires a valid McpApp instance.');
    if (!roomId) throw new Error('PayrollService requires a roomId.');
  }

  async initializeSchema(): Promise<void> {
    return;
  }

  async getRecords(): Promise<PayrollRecord[]> {
    const result = parseToolResult(
      await this.app.callServerTool({ name: 'hrm.payroll.query', arguments: { roomId: this.roomId } }),
    );
    return Array.isArray(result.records) ? (result.records as PayrollRecord[]) : [];
  }

  async saveRecord(record: PayrollRecord): Promise<void> {
    const { _id, _createdAt, _updatedAt, roomId: _room, ...data } = record;
    if (_id) {
      await this.app.callServerTool({
        name: 'hrm.payroll.update',
        arguments: { roomId: this.roomId, id: _id, data },
      });
    } else {
      await this.app.callServerTool({
        name: 'hrm.payroll.create',
        arguments: { roomId: this.roomId, data },
      });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.app.callServerTool({
      name: 'hrm.payroll.delete',
      arguments: { roomId: this.roomId, id },
    });
  }
}
