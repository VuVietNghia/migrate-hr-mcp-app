import { describe, expect, it } from 'vitest';
import type { EmployeeProfile } from '../src/ui/lifecycle/types';
import type { PayrollRecord } from '../src/ui/payroll/types';
import {
  calculatePayrollStats,
  countPayrollFilters,
  isResignedStatus,
  matchesPayrollFilter,
  partitionByEmploymentStatus,
  selectEmploymentSegment,
  selectOrphanedPayrolls,
  sumNetPayroll,
} from '../src/ui/payroll/payroll-selectors';

const OFFICIAL: EmployeeProfile = {
  _id: 'emp-official',
  name: 'Nguyen Van A',
  status: 'Chính thức',
  department: 'IT',
};

const PROBATION: EmployeeProfile = {
  _id: 'emp-probation',
  name: 'Le Thi B',
  status: 'Đang thử việc',
  department: 'IT',
};

const RESIGNED: EmployeeProfile = {
  _id: 'emp-resigned',
  name: 'Tran Van C',
  status: 'Nghỉ việc',
  department: 'IT',
};

const ROSTER: EmployeeProfile[] = [OFFICIAL, PROBATION, RESIGNED];

const PAYROLLS: PayrollRecord[] = [
  {
    _id: 'pay-1',
    employeeId: 'emp-official',
    baseSalary: 20_000_000,
    taxId: '0123456789',
    bankAccount: '111222333',
    contractType: 'Chính thức',
  },
  {
    // Có lương nhưng thiếu MST/STK -> rơi vào nhóm missing_info.
    _id: 'pay-2',
    employeeId: 'emp-probation',
    baseSalary: 10_000_000,
    taxId: '',
    bankAccount: '',
    contractType: 'Thử việc (85%)',
    applyProbationRate: true,
    probationRate: 85,
  },
  {
    // Lương rất lớn để một khoản bị tính nhầm là nhìn thấy ngay trong assertion.
    _id: 'pay-3',
    employeeId: 'emp-resigned',
    baseSalary: 50_000_000,
    taxId: '9876543210',
    bankAccount: '444555666',
    contractType: 'Chính thức',
  },
];

const payrollByEmployeeId: ReadonlyMap<string, PayrollRecord> = new Map(
  PAYROLLS.map((payroll) => [payroll.employeeId, payroll]),
);

describe('isResignedStatus', () => {
  it('nhận diện đúng tên stage mặc định', () => {
    expect(isResignedStatus('Nghỉ việc')).toBe(true);
  });

  it('bỏ qua khác biệt hoa thường và dấu', () => {
    expect(isResignedStatus('NGHỈ VIỆC')).toBe(true);
    expect(isResignedStatus('nghi viec')).toBe(true);
  });

  it('vẫn nhận diện khi stage được đặt tên khác đi', () => {
    expect(isResignedStatus('Đã nghỉ việc')).toBe(true);
  });

  it('gộp khoảng trắng kép ở giữa chuỗi', () => {
    expect(isResignedStatus('Nghỉ  việc')).toBe(true);
  });

  it('gộp non-breaking space ở giữa chuỗi', () => {
    expect(isResignedStatus('Nghỉ\u00A0việc')).toBe(true);
  });

  it('không nhận nhầm các trạng thái đang làm việc', () => {
    expect(isResignedStatus('Chính thức')).toBe(false);
    expect(isResignedStatus('Đang thử việc')).toBe(false);
    expect(isResignedStatus('Mới nhận việc')).toBe(false);
    expect(isResignedStatus(undefined)).toBe(false);
    expect(isResignedStatus('')).toBe(false);
  });

  it('chấp nhận bắt luôn stage chỉ mới nhắc tới việc nghỉ', () => {
    // Đánh đổi được chấp nhận có chủ đích: "Chờ nghỉ việc" vẫn khớp NGHI VIEC nên bị
    // xem là đã nghỉ. Không "sửa" test này thành false nếu suite đổi màu xanh.
    expect(isResignedStatus('Chờ nghỉ việc')).toBe(true);
  });
});

describe('partitionByEmploymentStatus', () => {
  it('tách danh sách thành nhóm đang làm việc và nhóm đã nghỉ', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    expect(partition.active.map((employee) => employee._id)).toEqual(['emp-official', 'emp-probation']);
    expect(partition.resigned.map((employee) => employee._id)).toEqual(['emp-resigned']);
  });

  it('trả về hai mảng rỗng khi không có hồ sơ nào', () => {
    expect(partitionByEmploymentStatus([])).toEqual({ active: [], resigned: [] });
  });
});

describe('selectEmploymentSegment', () => {
  const partition = partitionByEmploymentStatus(ROSTER);

  it('trả nhóm đang làm việc cho filter active', () => {
    expect(selectEmploymentSegment(partition, 'active')).toEqual([OFFICIAL, PROBATION]);
  });

  it('trả nhóm đã nghỉ cho filter resigned', () => {
    expect(selectEmploymentSegment(partition, 'resigned')).toEqual([RESIGNED]);
  });

  it('trả toàn bộ cho filter all', () => {
    expect(selectEmploymentSegment(partition, 'all')).toEqual([OFFICIAL, PROBATION, RESIGNED]);
  });
});

describe('sumNetPayroll', () => {
  it('áp tỷ lệ thử việc 85% khi cộng quỹ lương', () => {
    expect(sumNetPayroll([OFFICIAL, PROBATION], payrollByEmployeeId)).toBe(28_500_000);
  });

  it('bỏ qua nhân sự chưa thiết lập lương', () => {
    const noPayroll: EmployeeProfile = { _id: 'emp-none', name: 'Pham Thi D', status: 'Chính thức' };

    expect(sumNetPayroll([OFFICIAL, noPayroll], payrollByEmployeeId)).toBe(20_000_000);
  });

  it('cộng riêng được quỹ lương chờ tất toán của nhóm đã nghỉ', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    expect(sumNetPayroll(partition.resigned, payrollByEmployeeId)).toBe(50_000_000);
  });

  it('tổng hai nhóm sau khi tách bằng tổng tính trên toàn bộ danh sách', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    const partitionedTotal = sumNetPayroll(partition.active, payrollByEmployeeId)
      + sumNetPayroll(partition.resigned, payrollByEmployeeId);

    expect(partitionedTotal).toBe(sumNetPayroll(ROSTER, payrollByEmployeeId));
  });
});

describe('calculatePayrollStats', () => {
  it('không tính nhân sự đã nghỉ vào tổng quỹ lương thực chi', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    const stats = calculatePayrollStats(partition.active, payrollByEmployeeId);

    // 20.000.000 + 85% * 10.000.000. Nếu người đã nghỉ bị tính vào thì là 78.500.000.
    expect(stats.totalBudget).toBe(28_500_000);
    expect(stats.totalStaff).toBe(2);
    expect(stats.configuredCount).toBe(2);
    expect(stats.fullyCompleted).toBe(1);
    expect(stats.completionRate).toBe(50);
  });

  it('trả completionRate bằng 0 khi không còn nhân sự nào đang làm việc', () => {
    expect(calculatePayrollStats([], payrollByEmployeeId)).toEqual({
      totalStaff: 0,
      configuredCount: 0,
      totalBudget: 0,
      fullyCompleted: 0,
      completionRate: 0,
    });
  });
});

describe('matchesPayrollFilter', () => {
  const official = payrollByEmployeeId.get('emp-official');
  const probation = payrollByEmployeeId.get('emp-probation');

  it('lọc theo tình trạng thiết lập lương', () => {
    expect(matchesPayrollFilter(official, 'configured')).toBe(true);
    expect(matchesPayrollFilter(undefined, 'configured')).toBe(false);
    expect(matchesPayrollFilter(undefined, 'unconfigured')).toBe(true);
  });

  it('nhận diện hồ sơ đã có lương nhưng thiếu MST/STK', () => {
    expect(matchesPayrollFilter(probation, 'missing_info')).toBe(true);
    expect(matchesPayrollFilter(official, 'missing_info')).toBe(false);
  });

  it('filter all nhận mọi bản ghi', () => {
    expect(matchesPayrollFilter(undefined, 'all')).toBe(true);
    expect(matchesPayrollFilter(official, 'all')).toBe(true);
  });
});

describe('countPayrollFilters', () => {
  it('đếm theo đúng nhóm nhân sự được truyền vào', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    expect(countPayrollFilters(partition.active, payrollByEmployeeId)).toEqual({
      all: 2,
      configured: 2,
      unconfigured: 0,
      missingInfo: 1,
    });
  });

  it('đếm đúng cho nhóm đã nghỉ khi filter tình trạng lương chuyển sang resigned', () => {
    const partition = partitionByEmploymentStatus(ROSTER);

    expect(countPayrollFilters(partition.resigned, payrollByEmployeeId)).toEqual({
      all: 1,
      configured: 1,
      unconfigured: 0,
      missingInfo: 0,
    });
  });
});

describe('selectOrphanedPayrolls', () => {
  const employee = (id: string) => ({ _id: id, name: id, status: 'Chính thức' }) as EmployeeProfile;
  const payroll = (id: string, employeeId: string): PayrollRecord =>
    ({ _id: id, employeeId, baseSalary: 1, taxId: '', bankAccount: '' });

  it('returns nothing when the roster is empty, however many payroll rows exist', () => {
    expect(selectOrphanedPayrolls([], [payroll('p1', 'e1'), payroll('p2', 'e2')])).toEqual([]);
  });

  it('returns only the rows whose employee is absent from a non-empty roster', () => {
    const result = selectOrphanedPayrolls([employee('e1')], [payroll('p1', 'e1'), payroll('p2', 'gone')]);
    expect(result.map((row) => row._id)).toEqual(['p2']);
  });

  it('skips rows with no id, which cannot be addressed for deletion', () => {
    const noId = { employeeId: 'gone', baseSalary: 1, taxId: '', bankAccount: '' } as PayrollRecord;
    expect(selectOrphanedPayrolls([employee('e1')], [noId])).toEqual([]);
  });
});
