export interface PayrollRecord {
  _id?: string;
  employeeId: string;
  baseSalary: number;
  taxId: string;
  bankAccount: string;
  bankName?: string;
  contractType?: string;
  applyProbationRate?: boolean; // Checkbox phòng Hành chính kiểm soát (mặc định true khi thử việc 85%)
  probationRate?: number; // Mặc định 85 (%)
  // Server-owned: `hrm.payroll.*` stamps it from the Hub-verified `actor.roomId` and it is
  // `required: true` in the registered schema. Present on records read back, never sent on a
  // write — PayrollService strips it before every create/update. Readonly so the UI cannot set it.
  readonly roomId?: string;
  _createdAt?: string; // Do App Database gán khi tạo bản ghi
  _updatedAt?: string; // Do App Database gán khi cập nhật bản ghi
}

export interface IPayrollService {
  initializeSchema(): Promise<void>;
  getRecords(): Promise<PayrollRecord[]>;
  saveRecord(record: PayrollRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
}
