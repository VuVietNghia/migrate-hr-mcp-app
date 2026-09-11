import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePrivosApp } from '@privos_ai/app-react';
import { usePolling } from '../../hooks/usePolling';
import { IPayrollService, PayrollRecord } from '../types';
import { EmployeeProfile, ILifecycleService } from '../../lifecycle/types';
import { 
  formatCurrency, 
  calculateNetSalary, 
  formatCurrencyPreview, 
  isProbationContract 
} from '../utils';
import { buildPayrollDebugRequest, formatPayrollDebugOutput } from '../debug-format';
import {
  type IPayrollExportService,
  type PayrollExportDestination,
  type PayrollExportFormat,
  type PayrollExportScope,
} from '../services/PayrollExportService';

interface PayrollDashboardProps {
  roomId: string;
  payrollService: IPayrollService;
  lifecycleService: ILifecycleService;
  payrollExportService: IPayrollExportService;
  /** True only while this tab is the visible one — polling is gated on it. */
  active?: boolean;
}

const BANK_OPTIONS = [
  'Vietcombank',
  'MB Bank',
  'Techcombank',
  'VPBank',
  'ACB',
  'BIDV',
  'VietinBank',
  'TPBank',
  'Khác'
];

const CONTRACT_OPTIONS = [
  'Chính thức',
  'Thử việc (85%)',
  'Thực tập',
  'Cộng tác viên'
];

/**
 * Extracts 1-2 letter uppercase initials from the employee's name
 */
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SALARY_REGEX = /^\d{1,12}$/;
// Chấp nhận: 10 chữ số (MST cũ/doanh nghiệp), 12 chữ số (CCCD làm MST theo Đề án 06), 13 chữ số (MST chi nhánh 10-3 số)
const TAX_ID_REGEX = /^(?:\d{10}|\d{12}|\d{10}-?\d{3})$/;
const BANK_ACCOUNT_REGEX = /^[0-9-]{6,24}$/;

type PayrollFilterStatus = 'all' | 'configured' | 'unconfigured' | 'missing_info';

const PAYROLL_FILTER_LABELS: Record<PayrollFilterStatus, string> = {
  all: 'Tat_Ca_Trang_Thai',
  configured: 'Da_Co_Luong',
  unconfigured: 'Chua_Thiet_Lap',
  missing_info: 'Thieu_STK_MST',
};

const PAYROLL_EXPORT_FORMAT_LABELS: Record<PayrollExportFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel',
};

const PAYROLL_EXPORT_GROUPS: ReadonlyArray<{
  label: string;
  scope: PayrollExportScope;
  actions: ReadonlyArray<{ format: PayrollExportFormat; destination: PayrollExportDestination; label: string }>;
}> = [
  {
    label: 'Theo bộ lọc',
    scope: 'filtered',
    actions: [
      { format: 'csv', destination: 'download', label: 'Tải CSV' },
      { format: 'csv', destination: 'privos', label: 'Lưu CSV' },
      { format: 'xlsx', destination: 'download', label: 'Tải Excel' },
      { format: 'xlsx', destination: 'privos', label: 'Lưu Excel' },
    ],
  },
  {
    label: 'Toàn bộ dữ liệu',
    scope: 'all',
    actions: [
      { format: 'csv', destination: 'download', label: 'Tải CSV' },
      { format: 'csv', destination: 'privos', label: 'Lưu CSV' },
      { format: 'xlsx', destination: 'download', label: 'Tải Excel' },
      { format: 'xlsx', destination: 'privos', label: 'Lưu Excel' },
    ],
  },
];

interface PayrollFilterCounts {
  all: number;
  configured: number;
  unconfigured: number;
  missingInfo: number;
}

function hasConfiguredSalary(payroll?: PayrollRecord): boolean {
  return (payroll?.baseSalary ?? 0) > 0;
}

function isPaymentInfoMissing(payroll?: PayrollRecord): boolean {
  return hasConfiguredSalary(payroll)
    && (!payroll?.taxId?.trim() || !payroll?.bankAccount?.trim());
}

function matchesPayrollFilter(payroll: PayrollRecord | undefined, filter: PayrollFilterStatus): boolean {
  if (filter === 'configured') return hasConfiguredSalary(payroll);
  if (filter === 'unconfigured') return !hasConfiguredSalary(payroll);
  if (filter === 'missing_info') return isPaymentInfoMissing(payroll);
  return true;
}

function areEmployeeProfilesEqual(prev: EmployeeProfile[], next: EmployeeProfile[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((employee, index) => {
    const candidate = next[index];
    return employee._id === candidate._id
      && employee.name === candidate.name
      && employee.status === candidate.status
      && employee.phone === candidate.phone
      && employee.email === candidate.email
      && employee.position === candidate.position
      && employee.department === candidate.department
      && employee.startDate === candidate.startDate
      && employee.sourceCandidateId === candidate.sourceCandidateId;
  });
}

function arePayrollRecordsEqual(prev: PayrollRecord[], next: PayrollRecord[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((record, index) => {
    const candidate = next[index];
    return record._id === candidate._id
      && record.employeeId === candidate.employeeId
      && record.baseSalary === candidate.baseSalary
      && record.taxId === candidate.taxId
      && record.bankAccount === candidate.bankAccount
      && record.bankName === candidate.bankName
      && record.contractType === candidate.contractType
      && record.applyProbationRate === candidate.applyProbationRate
      && record.probationRate === candidate.probationRate
      && record.roomId === candidate.roomId;
  });
}

export function PayrollDashboard({
  roomId,
  payrollService,
  lifecycleService,
  payrollExportService,
  active = false,
}: PayrollDashboardProps) {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States cho form thêm/sửa lương
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<PayrollRecord>>({});
  const [debugData, setDebugData] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);
  const [exportingAction, setExportingAction] = useState<string | null>(null);

  // States cho Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<PayrollFilterStatus>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const isRefreshingDataRef = useRef(false);
  
  const app = usePrivosApp();
  const payrollByEmployeeId = useMemo(
    () => new Map(payrolls.map((payroll) => [payroll.employeeId, payroll])),
    [payrolls]
  );

  const loadData = useCallback(async (isSilent = false) => {
    if (isRefreshingDataRef.current) return;
    isRefreshingDataRef.current = true;
    if (!isSilent) setLoading(true);
    try {
      // Tải song song danh sách nhân sự từ Kanban và bảng Lương từ DB
      const [empData, payData] = await Promise.all([
        lifecycleService.loadProfiles(roomId),
        payrollService.getRecords()
      ]);

      // DỌN RÁC (Garbage Collection): Xoá bản ghi lương nếu nhân viên không còn tồn tại
      const activeEmpIds = new Set(empData.map(e => e._id));
      const orphanedPayrolls = payData.filter(p => !activeEmpIds.has(p.employeeId));
      
      if (!isSilent && orphanedPayrolls.length > 0) {
        console.log(`Tiến hành dọn rác: Xoá ${orphanedPayrolls.length} bản ghi lương mồ côi.`);
        await Promise.all(orphanedPayrolls.map(p => {
          if (p._id) return payrollService.deleteRecord(p._id);
        }));
      }

      const activePayrolls = payData.filter(p => activeEmpIds.has(p.employeeId));
      setEmployees((previous) => (areEmployeeProfilesEqual(previous, empData) ? previous : empData));
      setPayrolls((previous) => (arePayrollRecordsEqual(previous, activePayrolls) ? previous : activePayrolls));
    } catch (error) {
      console.error("Lỗi khi tải dữ liệu lương:", error);
      if (!isSilent) {
        const detail = error instanceof Error ? error.message : String(error);
        setStatusMsg({ text: `Lỗi khi tải dữ liệu bảng lương: ${detail}`, type: 'error' });
      }
    } finally {
      isRefreshingDataRef.current = false;
      if (!isSilent) setLoading(false);
    }
  }, [lifecycleService, payrollService, roomId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Đồng bộ nền mỗi giây; hook tự chống request chồng nhau và dừng khi tab bị ẩn.
  usePolling(
    useCallback(() => loadData(true), [loadData]),
    { enabled: active && Boolean(roomId) && editingId === null, interval: 3000, immediate: false }
  );

  const showRawPayrollDebug = async () => {
    const request = buildPayrollDebugRequest(roomId);

    try {
      const result = await app.callServerTool(request);
      setDebugData(formatPayrollDebugOutput({ roomId, request, result }));
    } catch (error) {
      setDebugData(formatPayrollDebugOutput({ roomId, request, error }));
    }
  };

  const handleEdit = (emp: EmployeeProfile) => {
    const existing = payrollByEmployeeId.get(emp._id);
    setEditingId(emp._id);
    setFormData(existing || {
      employeeId: emp._id,
      baseSalary: 0,
      taxId: '',
      bankAccount: '',
      bankName: 'Vietcombank',
      contractType: 'Chính thức',
      applyProbationRate: true,
      probationRate: 85
    });
  };

  const handleSave = async () => {
    if (!formData.employeeId) return;

    // Validate mức lương (bỏ dấu chấm/phẩy nếu người dùng nhập)
    const rawSalary = formData.baseSalary !== undefined && formData.baseSalary !== null 
      ? String(formData.baseSalary).replace(/[^\d]/g, '').trim() 
      : '0';
    if (!SALARY_REGEX.test(rawSalary) || Number(rawSalary) < 0) {
      setStatusMsg({ text: 'Mức lương cơ bản phải là số nguyên dương hợp lệ.', type: 'error' });
      return;
    }

    // Validate Mã số thuế (loại bỏ khoảng trắng thừa trước khi kiểm tra)
    const cleanTaxId = (formData.taxId ?? '').replace(/\s+/g, '');
    if (cleanTaxId && !TAX_ID_REGEX.test(cleanTaxId)) {
      setStatusMsg({ text: 'Mã số thuế không hợp lệ (gồm 10 số, 12 số CCCD, hoặc 13 số chi nhánh dạng 0123456789-001).', type: 'error' });
      return;
    }

    // Validate Số tài khoản (loại bỏ khoảng trắng thừa)
    const cleanBankAcc = (formData.bankAccount ?? '').replace(/\s+/g, '');
    if (cleanBankAcc && !BANK_ACCOUNT_REGEX.test(cleanBankAcc)) {
      setStatusMsg({ text: 'Số tài khoản ngân hàng không hợp lệ (gồm 6–24 chữ số).', type: 'error' });
      return;
    }

    try {
      await payrollService.saveRecord({
        ...formData,
        baseSalary: Number(rawSalary),
        taxId: cleanTaxId,
        bankAccount: cleanBankAcc,
        applyProbationRate: formData.applyProbationRate !== false,
        probationRate: 85
      } as PayrollRecord);
      setEditingId(null);
      setStatusMsg({ text: 'Đã cập nhật thông tin lương thành công!', type: 'success' });
      setTimeout(() => setStatusMsg(null), 3000);
      await loadData();
    } catch (error) {
      console.error("Lỗi khi lưu lương:", error);
      setStatusMsg({ text: 'Có lỗi xảy ra khi lưu thông tin lương.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const copyBankAccount = (stk: string, empId: string) => {
    navigator.clipboard.writeText(stk);
    setCopiedBankId(empId);
    setTimeout(() => setCopiedBankId(null), 1800);
  };

  // Trích xuất danh sách phòng ban duy nhất
  const departments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach(e => {
      if (e.department && e.department.trim()) {
        depts.add(e.department.trim());
      }
    });
    return Array.from(depts).sort((left, right) => left.localeCompare(right, 'vi'));
  }, [employees]);

  const employeesInSelectedDepartment = useMemo(
    () => selectedDept === 'all'
      ? employees
      : employees.filter((employee) => employee.department === selectedDept),
    [employees, selectedDept]
  );

  // KPIs calculations
  const stats = useMemo(() => {
    const relevantEmployees = employeesInSelectedDepartment;

    const totalStaff = relevantEmployees.length;
    const configuredCount = relevantEmployees.filter(emp => {
      return hasConfiguredSalary(payrollByEmployeeId.get(emp._id));
    }).length;

    // Tính tổng quỹ lương thực nhận (đã tính tỷ lệ thử việc 85% nếu có)
    const totalBudget = relevantEmployees.reduce((acc, emp) => {
      const pay = payrollByEmployeeId.get(emp._id);
      if (!pay || !pay.baseSalary) return acc;
      const { netSalary } = calculateNetSalary(
        pay.baseSalary,
        pay.contractType,
        pay.applyProbationRate !== false,
        pay.probationRate ?? 85
      );
      return acc + netSalary;
    }, 0);

    const fullyCompleted = relevantEmployees.filter(emp => {
      const pay = payrollByEmployeeId.get(emp._id);
      return pay && (pay.baseSalary ?? 0) > 0 && !!pay.taxId && !!pay.bankAccount;
    }).length;

    const completionRate = totalStaff > 0 ? Math.round((fullyCompleted / totalStaff) * 100) : 0;

    return { totalStaff, configuredCount, totalBudget, fullyCompleted, completionRate };
  }, [employeesInSelectedDepartment, payrollByEmployeeId]);

  const filterCounts = useMemo<PayrollFilterCounts>(() => {
    return employeesInSelectedDepartment.reduce<PayrollFilterCounts>((counts, employee) => {
      const payroll = payrollByEmployeeId.get(employee._id);
      counts.all += 1;
      if (hasConfiguredSalary(payroll)) counts.configured += 1;
      else counts.unconfigured += 1;
      if (isPaymentInfoMissing(payroll)) counts.missingInfo += 1;
      return counts;
    }, { all: 0, configured: 0, unconfigured: 0, missingInfo: 0 });
  }, [employeesInSelectedDepartment, payrollByEmployeeId]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employeesInSelectedDepartment.filter(emp => {
      const payroll = payrollByEmployeeId.get(emp._id);
      if (!matchesPayrollFilter(payroll, filterStatus)) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const matchName = emp.name.toLowerCase().includes(term);
      const matchPosition = emp.position?.toLowerCase().includes(term) ?? false;
      const matchDept = emp.department?.toLowerCase().includes(term) ?? false;
      const matchTax = payroll?.taxId?.toLowerCase().includes(term) ?? false;
      const matchBank = payroll?.bankAccount?.toLowerCase().includes(term) ?? false;

      return matchName || matchPosition || matchDept || matchTax || matchBank;
    });
  }, [employeesInSelectedDepartment, filterStatus, payrollByEmployeeId, searchTerm]);

  const handleExport = async (
    scope: PayrollExportScope,
    format: PayrollExportFormat,
    destination: PayrollExportDestination,
  ) => {
    const sourceEmployees = scope === 'filtered' ? filteredEmployees : employees;
    const actionKey = `${scope}-${format}-${destination}`;
    if (sourceEmployees.length === 0) {
      setStatusMsg({ text: 'Không có dữ liệu bảng lương để xuất.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    setExportingAction(actionKey);
    try {
      const result = await payrollExportService.export({
        employees: sourceEmployees,
        payrollByEmployeeId,
        scope,
        format,
        destination,
        filterContext: {
          department: selectedDept === 'all' ? 'Tat_Ca_Phong_Ban' : selectedDept,
          status: PAYROLL_FILTER_LABELS[filterStatus],
        },
      });
      const destinationLabel = destination === 'privos'
        ? `đã lưu vào PrivOS tại ${result.roomPath}`
        : 'đã tải xuống máy';
      setStatusMsg({ text: `Đã xuất ${result.fileName} và ${destinationLabel}.`, type: 'success' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (error) {
      console.error('Không thể xuất báo cáo payroll:', error);
      setStatusMsg({ text: 'Không thể xuất báo cáo bảng lương. Vui lòng thử lại.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setExportingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="hr-terminal-ui" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <p style={{ color: 'var(--text-muted)' }}>Đang tải bảng lương & thông tin tài chính...</p>
      </div>
    );
  }

  return (
    <div className="hr-terminal-ui">
      {/* Header */}
      <header className="hr-header-block">
        <div className="header-content">
          <h2 className="hr-title">Quản Lý Lương & Tài Chính Nhân Sự</h2>
          <p className="hr-subtitle">
            Theo dõi mức lương cơ bản, lương thử việc, mã số thuế và tài khoản ngân hàng chi trả.
          </p>
        </div>
        <div className="header-actions payroll-header-actions">
          {PAYROLL_EXPORT_GROUPS.map((group) => {
            const sourceCount = group.scope === 'filtered' ? filteredEmployees.length : employees.length;
            return (
              <details
                key={group.scope}
                className="payroll-export-menu"
              >
                <summary className="payroll-export-menu-trigger">
                  <span className="payroll-export-menu-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12" />
                      <path d="m7 10 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                  </span>
                  <span>
                    <span className="payroll-export-menu-title">{group.label}</span>
                    <span className="payroll-export-menu-count">{sourceCount} nhân sự</span>
                  </span>
                  <svg className="payroll-export-menu-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="payroll-export-menu-panel">
                  <p className="payroll-export-menu-description">
                    {group.scope === 'filtered'
                      ? 'Dùng kết quả tìm kiếm và bộ lọc hiện tại.'
                      : 'Bỏ qua toàn bộ bộ lọc đang áp dụng.'}
                  </p>
                  <div className="payroll-export-actions">
                    {group.actions.map((action) => {
                      const actionKey = `${group.scope}-${action.format}-${action.destination}`;
                      const isExporting = exportingAction === actionKey;
                      const destinationLabel = action.destination === 'download' ? 'Tải máy' : 'Lưu PrivOS';
                      return (
                        <button
                          key={actionKey}
                          type="button"
                          className={`payroll-export-action payroll-export-action-${action.destination}`}
                          disabled={sourceCount === 0 || isExporting}
                          onClick={() => handleExport(group.scope, action.format, action.destination)}
                          title={`${action.label} ${group.label.toLowerCase()}`}
                        >
                          <span className="payroll-export-action-format">{PAYROLL_EXPORT_FORMAT_LABELS[action.format]}</span>
                          <span>{isExporting ? 'Đang xuất...' : destinationLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </details>
            );
          })}

          {/* Discreet Debug Inspector Button */}
          <button 
            type="button"
            className="hr-btn hr-btn-subtle payroll-header-icon-button"
            onClick={showRawPayrollDebug}
            title="Xem dữ liệu gốc JSON từ Database"
            aria-label="Xem dữ liệu gốc JSON từ Database"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Status Notifications */}
      {statusMsg && (
        <div className={`hr-status-banner hr-status-${statusMsg.type}`}>
          {statusMsg.type === 'success' ? '✓' : '⚠️'} {statusMsg.text}
        </div>
      )}

      {/* 4 KPI Stat Cards */}
      <div className="hr-stats-grid">
        <div className="hr-stat-card">
          <div className="hr-stat-icon">👥</div>
          <div className="hr-stat-content">
            <span className="hr-stat-label">
              {selectedDept === 'all' ? 'Tổng số nhân sự' : `Nhân sự (${selectedDept})`}
            </span>
            <span className="hr-stat-value">{stats.totalStaff}</span>
          </div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-icon" style={{ background: 'rgba(20, 134, 96, 0.1)', color: '#148660' }}>💰</div>
          <div className="hr-stat-content">
            <span className="hr-stat-label">Tổng quỹ lương thực chi</span>
            <span className="hr-stat-value" style={{ color: '#148660' }}>
              {formatCurrency(stats.totalBudget)}
            </span>
          </div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-icon" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#D97706' }}>📋</div>
          <div className="hr-stat-content">
            <span className="hr-stat-label">Đã định mức lương</span>
            <span className="hr-stat-value">
              {stats.configuredCount} / {stats.totalStaff}
            </span>
          </div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}>🛡️</div>
          <div className="hr-stat-content">
            <span className="hr-stat-label">Hồ sơ thanh toán đủ</span>
            <span className="hr-stat-value" style={{ color: '#10B981' }}>
              {stats.fullyCompleted} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>({stats.completionRate}%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar Search & Status Filters */}
      <div className="hr-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div className="hr-search-box" style={{ flex: '1 1 280px' }}>
            <span className="hr-search-icon">🔍</span>
            <input 
              type="text"
              className="hr-search-input"
              placeholder="Tìm theo tên, vị trí, phòng ban, STK, MST..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            aria-label="Lọc theo tình trạng lương"
            className="hr-input"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value as PayrollFilterStatus)}
            style={{ width: 'auto', minWidth: '185px' }}
          >
            <option value="all">Tất cả tình trạng ({filterCounts.all})</option>
            <option value="configured">Đã có lương ({filterCounts.configured})</option>
            <option value="unconfigured">Chưa thiết lập ({filterCounts.unconfigured})</option>
            <option value="missing_info">Thiếu STK/MST ({filterCounts.missingInfo})</option>
          </select>

          {departments.length > 0 && (
            <select
              aria-label="Lọc theo phòng ban"
              className="hr-input"
              value={selectedDept}
              onChange={(event) => setSelectedDept(event.target.value)}
              style={{ width: 'auto', minWidth: '180px' }}
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          )}

          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6C737A)' }}>
            Hiển thị <strong>{filteredEmployees.length}</strong> / {filterCounts.all} hồ sơ
          </span>
        </div>
      </div>

      {/* Modern Data Table */}
      <div className="hr-table-card">
        <table className="hr-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Nhân viên</th>
              <th style={{ width: '13%' }}>Loại HĐ</th>
              <th style={{ width: '18%' }}>Mức lương & Thực nhận</th>
              <th style={{ width: '12%' }}>Mã số thuế</th>
              <th style={{ width: '22%' }}>Tài khoản ngân hàng</th>
              <th style={{ width: '13%', textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => {
              const pay = payrollByEmployeeId.get(emp._id);
              const isEditing = editingId === emp._id;
              const isSalaryConfigured = hasConfiguredSalary(pay);
              const initials = getInitials(emp.name);
              
              return (
                <tr key={emp._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="profile-avatar" style={{ width: 30, height: 30, fontSize: '0.75rem' }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{emp.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {emp.position || 'Nhân sự'} {emp.department ? `• ${emp.department}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  {isEditing ? (
                    <>
                      <td>
                        <select 
                          className="hr-select"
                          value={formData.contractType || 'Chính thức'}
                          onChange={e => setFormData({ ...formData, contractType: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          {CONTRACT_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        
                        {/* Checkbox kiểm soát phòng Hành chính khi là hợp đồng Thử việc */}
                        {isProbationContract(formData.contractType) && (
                          <label 
                            className="hr-checkbox-control" 
                            title="Phòng Hành chính tích chọn để áp dụng mức 85% lương hoặc bỏ chọn nếu thỏa thuận 100%"
                          >
                            <input 
                              type="checkbox"
                              checked={formData.applyProbationRate !== false}
                              onChange={e => setFormData({ ...formData, applyProbationRate: e.target.checked })}
                            />
                            <span>Hưởng 85% thử việc</span>
                          </label>
                        )}
                      </td>
                      <td>
                        <input 
                          type="number" 
                          value={formData.baseSalary || ''}
                          onChange={e => setFormData({...formData, baseSalary: Number(e.target.value)})}
                          className="hr-input"
                          placeholder="Mức lương cơ bản"
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        />
                        {/* Real-time currency preview */}
                        {formatCurrencyPreview(formData.baseSalary) && (
                          <span className="hr-input-preview">
                            {formatCurrencyPreview(formData.baseSalary)}
                            {isProbationContract(formData.contractType) && formData.applyProbationRate !== false && (
                              <span style={{ color: '#D97706', display: 'block' }}>
                                ➔ Thực nhận: {formatCurrency(Math.round(Number(formData.baseSalary || 0) * 0.85))}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={formData.taxId || ''}
                          onChange={e => setFormData({...formData, taxId: e.target.value})}
                          className="hr-input"
                          placeholder="Mã số thuế"
                          style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <select 
                            className="hr-select"
                            value={formData.bankName || 'Vietcombank'}
                            onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                            style={{ width: '110px' }}
                          >
                            {BANK_OPTIONS.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                          <input 
                            type="text" 
                            value={formData.bankAccount || ''}
                            onChange={e => setFormData({...formData, bankAccount: e.target.value})}
                            className="hr-input"
                            placeholder="Số tài khoản"
                            style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button onClick={handleSave} className="hr-btn hr-btn-accent" style={{ padding: '5px 12px', fontSize: '0.8rem' }}>
                            Lưu
                          </button>
                          <button onClick={() => setEditingId(null)} className="hr-btn" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>
                            Huỷ
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className="contract-tag">
                          {pay?.contractType || 'Chính thức'}
                        </span>
                      </td>
                      <td>
                        {isSalaryConfigured ? (
                          (() => {
                            const { netSalary, isProbationDiscounted } = calculateNetSalary(
                              pay!.baseSalary,
                              pay?.contractType,
                              pay?.applyProbationRate !== false,
                              pay?.probationRate ?? 85
                            );
                            
                            return (
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                                  {formatCurrency(netSalary)}
                                </div>
                                {isProbationDiscounted ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                    <span className="badge-probation-rate">85%</span>
                                    <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                                      Gốc: {formatCurrency(pay!.baseSalary)}
                                    </span>
                                  </div>
                                ) : isProbationContract(pay?.contractType) ? (
                                  <span className="badge-probation-rate badge-probation-100" style={{ marginTop: '2px' }}>
                                    Thử việc 100%
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="hr-status-pill hr-status-pill-warn">
                            Chưa thiết lập
                          </span>
                        )}
                      </td>
                      <td>
                        {pay?.taxId ? (
                          <span style={{ fontWeight: 500 }}>{pay.taxId}</span>
                        ) : (
                          <span className="badge-missing badge-missing-warn" title="Nhân viên chưa cập nhật Mã số thuế">
                            ⚠️ Thiếu MST
                          </span>
                        )}
                      </td>
                      <td>
                        {pay?.bankAccount ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="bank-tag">{pay.bankName || 'Ngân hàng'}</span>
                            <span style={{ fontFamily: 'var(--hr-font-mono)', fontSize: '0.825rem' }}>{pay.bankAccount}</span>
                            <button
                              type="button"
                              className={`hr-icon-btn ${copiedBankId === emp._id ? 'copied' : ''}`}
                              onClick={() => copyBankAccount(pay.bankAccount, emp._id)}
                              title="Sao chép số tài khoản"
                            >
                              {copiedBankId === emp._id ? 'Đã chép' : 'Chép'}
                            </button>
                          </div>
                        ) : (
                          <span className="badge-missing" title="Chưa cập nhật tài khoản nhận lương">
                            ⚠️ Thiếu STK
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          onClick={() => handleEdit(emp)} 
                          className="hr-btn"
                          style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                        >
                          {isSalaryConfigured ? 'Chỉnh sửa' : '+ Thiết lập'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            
            {filteredEmployees.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  Không tìm thấy hồ sơ lương nào phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Debug Inspector Modal */}
      {debugData && (
        <div className="hr-debug-modal-overlay" onClick={() => setDebugData(null)}>
          <div className="hr-debug-modal-content" onClick={e => e.stopPropagation()}>
            <div className="hr-debug-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>⚙️</span>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Dữ liệu thô từ Database (Select All)</h4>
              </div>
              <button 
                className="hr-btn hr-btn-subtle" 
                style={{ padding: '4px 8px' }}
                onClick={() => setDebugData(null)}
              >
                ✕
              </button>
            </div>
            <pre className="hr-debug-pre">{debugData}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

