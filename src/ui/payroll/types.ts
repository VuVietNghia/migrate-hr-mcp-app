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
  roomId?: string; // Tùy chọn, dùng để filter data theo room nếu ứng dụng hỗ trợ nhiều room
  _createdAt?: string; // Do App Database gán khi tạo bản ghi
  _updatedAt?: string; // Do App Database gán khi cập nhật bản ghi
}

export interface IPayrollService {
  initializeSchema(): Promise<void>;
  getRecords(): Promise<PayrollRecord[]>;
  saveRecord(record: PayrollRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
}
