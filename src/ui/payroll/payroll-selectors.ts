import type { EmployeeProfile } from '../lifecycle/types';
import type { PayrollRecord } from './types';
import { calculateNetSalary } from './utils';

export type EmploymentFilter = 'active' | 'resigned' | 'all';

export type PayrollFilterStatus = 'all' | 'configured' | 'unconfigured' | 'missing_info';

export interface EmploymentPartition {
  active: EmployeeProfile[];
  resigned: EmployeeProfile[];
}

export interface PayrollStats {
  totalStaff: number;
  configuredCount: number;
  totalBudget: number;
  fullyCompleted: number;
  completionRate: number;
}

export interface PayrollFilterCounts {
  all: number;
  configured: number;
  unconfigured: number;
  missingInfo: number;
}

/**
 * `status` là tên stage Kanban đọc về từ Hub và người quản trị room đổi tên được, nên
 * so khớp bỏ dấu thay vì so bằng một chuỗi cố định: bắt sót ở đây làm quỹ lương phồng
 * lên một cách im lặng. `src/ui/lifecycle/LifecycleDashboard.tsx` và
 * `src/ui/lifecycle/utils.ts` vẫn so `status === 'Nghỉ việc'` chính xác tuyệt đối; đó
 * là các nơi cần gộp về định nghĩa này thay vì tạo thêm một cách so khớp thứ ba.
 */
export function isResignedStatus(status: string | undefined): boolean {
  if (!status) return false;

  const normalized = status
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();

  return normalized.includes('NGHI VIEC');
}

export function partitionByEmploymentStatus(employees: EmployeeProfile[]): EmploymentPartition {
  const active: EmployeeProfile[] = [];
  const resigned: EmployeeProfile[] = [];

  for (const employee of employees) {
    if (isResignedStatus(employee.status)) resigned.push(employee);
    else active.push(employee);
  }

  return { active, resigned };
}

export function selectEmploymentSegment(
  partition: EmploymentPartition,
  filter: EmploymentFilter,
): EmployeeProfile[] {
  switch (filter) {
    case 'active':
      return partition.active;
    case 'resigned':
      return partition.resigned;
    case 'all':
      return [...partition.active, ...partition.resigned];
  }
}

export function hasConfiguredSalary(payroll?: PayrollRecord): boolean {
  return (payroll?.baseSalary ?? 0) > 0;
}

function isPaymentInfoMissing(payroll?: PayrollRecord): boolean {
  return hasConfiguredSalary(payroll)
    && (!payroll?.taxId?.trim() || !payroll?.bankAccount?.trim());
}

export function matchesPayrollFilter(
  payroll: PayrollRecord | undefined,
  filter: PayrollFilterStatus,
): boolean {
  if (filter === 'configured') return hasConfiguredSalary(payroll);
  if (filter === 'unconfigured') return !hasConfiguredSalary(payroll);
  if (filter === 'missing_info') return isPaymentInfoMissing(payroll);
  return true;
}

export function sumNetPayroll(
  employees: EmployeeProfile[],
  payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>,
): number {
  return employees.reduce((total, employee) => {
    const payroll = payrollByEmployeeId.get(employee._id);
    if (!payroll?.baseSalary) return total;

    const { netSalary } = calculateNetSalary(
      payroll.baseSalary,
      payroll.contractType,
      payroll.applyProbationRate !== false,
      payroll.probationRate ?? 85,
    );

    return total + netSalary;
  }, 0);
}

export function calculatePayrollStats(
  employees: EmployeeProfile[],
  payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>,
): PayrollStats {
  const totalStaff = employees.length;

  const configuredCount = employees.filter(
    (employee) => hasConfiguredSalary(payrollByEmployeeId.get(employee._id)),
  ).length;

  const fullyCompleted = employees.filter((employee) => {
    const payroll = payrollByEmployeeId.get(employee._id);
    return hasConfiguredSalary(payroll) && !isPaymentInfoMissing(payroll);
  }).length;

  return {
    totalStaff,
    configuredCount,
    totalBudget: sumNetPayroll(employees, payrollByEmployeeId),
    fullyCompleted,
    completionRate: totalStaff > 0 ? Math.round((fullyCompleted / totalStaff) * 100) : 0,
  };
}

export function countPayrollFilters(
  employees: EmployeeProfile[],
  payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>,
): PayrollFilterCounts {
  return employees.reduce<PayrollFilterCounts>((counts, employee) => {
    const payroll = payrollByEmployeeId.get(employee._id);
    counts.all += 1;
    if (hasConfiguredSalary(payroll)) counts.configured += 1;
    else counts.unconfigured += 1;
    if (isPaymentInfoMissing(payroll)) counts.missingInfo += 1;
    return counts;
  }, { all: 0, configured: 0, unconfigured: 0, missingInfo: 0 });
}
