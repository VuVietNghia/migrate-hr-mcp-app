# Loại nhân sự đã nghỉ việc khỏi KPI Quản lý lương — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi HR kéo một nhân sự sang cột "Nghỉ việc" ở Kanban vòng đời, tab Quản lý lương phải lập tức loại người đó khỏi "Tổng quỹ lương thực chi" và toàn bộ KPI, đồng thời vẫn cho xem lại bảng lương của họ qua một bộ lọc riêng để tất toán.

**Architecture:** Toàn bộ logic dẫn xuất (phân nhóm đang làm / đã nghỉ, cộng quỹ lương, đếm KPI, đếm bộ lọc) được tách khỏi `PayrollDashboard.tsx` ra một module thuần `src/ui/payroll/payroll-selectors.ts`. Đây là bắt buộc chứ không phải làm đẹp: vitest của dự án chạy `environment: 'node'`, không có jsdom/React Testing Library, nên cách duy nhất để test được hành vi này là đưa nó ra khỏi component. `PayrollDashboard` sau đó chỉ còn giữ state và render. Không đụng tới `PayrollService`, `PrivOSLifecycleService`, `PayrollExportService` hay schema DB.

**Tech Stack:** TypeScript 5 (strict), React 18, Vitest 2.1.9 (`environment: 'node'`, chỉ nhận `tests/**/*.spec.ts`), PrivOS MCP App SDK (`@privos_ai/app-react`).

**Spec:** Không có file spec — việc này đi theo nhánh *bounded* của skill brainstorming, thiết kế được duyệt trực tiếp trong chat. Thiết kế đã duyệt được chép lại nguyên văn ở mục "Bối cảnh" bên dưới để plan này tự đứng được một mình.

---

## Bối cảnh — vì sao có thay đổi này

`src/ui/payroll/components/PayrollDashboard.tsx:335-364` tính KPI trên
`employeesInSelectedDepartment`, tức là **mọi** hồ sơ trả về từ
`lifecycleService.loadProfiles(roomId)`, không hề lọc theo `status`:

```ts
const stats = useMemo(() => {
  const relevantEmployees = employeesInSelectedDepartment;   // gồm cả 'Nghỉ việc'
  const totalStaff = relevantEmployees.length;
  const totalBudget = relevantEmployees.reduce(/* cộng netSalary */);
  ...
}, [employeesInSelectedDepartment, payrollByEmployeeId]);
```

`status` của hồ sơ chính là tên stage Kanban (`PrivOSLifecycleService.getStageName`),
và stage "Nghỉ việc" được provision sẵn tại `PrivOSLifecycleService.getInitialStages()`.
Nghĩa là dữ liệu để phân biệt đã có sẵn trong `EmployeeProfile.status`, chỉ là
tab Lương chưa bao giờ đọc tới nó. Hệ quả: một người đã nghỉ việc vẫn được cộng
đủ vào "Tổng quỹ lương thực chi", "Tổng số nhân sự", "Đã định mức lương" và
"Hồ sơ thanh toán đủ".

Cơ chế dọn rác tại `PayrollDashboard.tsx:202-213` **không** phải chỗ để sửa: nó
chỉ xoá bản ghi lương khi `_id` hồ sơ biến mất hoàn toàn khỏi danh sách. Người
nghỉ việc vẫn còn hồ sơ, nên bản ghi lương của họ được giữ — đúng như mong muốn,
vì HR còn cần tất toán lương tháng cuối.

### Quyết định nghiệp vụ đã chốt

Nhân sự "Nghỉ việc" bị loại khỏi KPI ngay lập tức, nhưng **không** bị xoá và
**không** biến mất khỏi hệ thống: họ chuyển sang một phân vùng riêng "Đã nghỉ
việc (chờ tất toán)" xem được bằng bộ lọc, kèm một dòng tổng phụ cho biết quỹ
lương chờ tất toán là bao nhiêu.

### Một điểm lệch so với thiết kế đã duyệt trong chat

Thiết kế trong chat nói sẽ thêm hằng số `RESIGNED_STATUS = 'Nghỉ việc'` vào
`src/ui/lifecycle/types.ts` rồi so sánh bằng `===`. Plan này **không** làm vậy,
mà dùng hàm `isResignedStatus()` so khớp sau khi bỏ dấu và chuẩn hoá hoa/thường.

Lý do: `status` không phải enum do code kiểm soát — nó là tên stage đọc về từ
Hub và người quản trị room đổi tên được. So sánh `===` với đúng một chuỗi sẽ
âm thầm thất bại nếu stage tên là "Đã nghỉ việc", và thất bại kiểu đó lại làm
quỹ lương phồng lên — đúng cái bug đang sửa. Đánh đổi: `includes('NGHI VIEC')`
có thể bắt nhầm một stage tên "Chờ nghỉ việc" nếu ai đó tạo ra; chấp nhận, vì
bắt nhầm nhìn thấy ngay trên UI còn bắt sót thì im lặng sai số tiền. Vì thế
`src/ui/lifecycle/types.ts` không bị sửa trong plan này.

## Global Constraints

- **Git ở chế độ chỉ đọc trong dự án này.** `CLAUDE.md` của user cấm mọi thao tác git ghi, không ngoại lệ. KHÔNG chạy `git add`, `git commit`, `git checkout`, `git stash`... Không task nào trong plan này kết thúc bằng commit; user tự commit khi họ muốn.
- **Bám đúng phạm vi task.** Chỉ sửa đúng thứ mà step nêu tên. Không tiện tay refactor, không sửa lỗi không liên quan, không thêm nhận xét về code gặp trên đường đi.
- Test nằm phẳng trong `tests/<name>.spec.ts` và chạy dưới `environment: 'node'`. Dự án **không có** jsdom hay React Testing Library — không thêm vào, và không viết test render component React.
- TypeScript strict. Lệnh kiểm tra là `npm run typecheck:strict-unused`, lệnh này fail cả khi có biến/tham số/import không dùng tới. Mỗi task chỉ được import đúng thứ nó dùng.
- Toàn bộ chuỗi hiển thị cho người dùng viết bằng tiếng Việt có dấu, khớp văn phong sẵn có trong file (ví dụ "Tổng quỹ lương thực chi", "Chưa thiết lập").
- Comment chỉ giải thích *tại sao*, không bao giờ mô tả lại code đang làm gì.
- Không đổi `PayrollRecord`, không đổi schema `mcpapp.db`, không đổi `PayrollService`, không đổi `PayrollExportService`.
- Hai test sau đây được biết là đang fail sẵn trong repo vì lý do không liên quan (app-identity mismatch giữa `privos-app.json` và host `resourceUri`; lỗi quyền file Windows trong `preflight`). Chúng fail trước và sau plan này đều được; nếu có test **khác** fail thì dừng lại và báo.

---

### Task 1: Module selector thuần + test

Tách toàn bộ logic dẫn xuất ra khỏi component và phủ test. Hết task này chưa có gì đổi trên UI — đây là phần duy nhất có thể test tự động, nên nó đứng riêng.

**Files:**
- Create: `src/ui/payroll/payroll-selectors.ts`
- Create: `tests/payroll-selectors.spec.ts`

**Interfaces:**
- Consumes: `EmployeeProfile` từ `src/ui/lifecycle/types.ts`; `PayrollRecord` từ `src/ui/payroll/types.ts`; `calculateNetSalary` từ `src/ui/payroll/utils.ts` (đã tồn tại, không sửa).
- Produces (Task 2 và Task 3 import đúng các tên này):
  - `type EmploymentFilter = 'active' | 'resigned' | 'all'`
  - `type PayrollFilterStatus = 'all' | 'configured' | 'unconfigured' | 'missing_info'`
  - `interface EmploymentPartition { active: EmployeeProfile[]; resigned: EmployeeProfile[] }`
  - `interface PayrollStats { totalStaff: number; configuredCount: number; totalBudget: number; fullyCompleted: number; completionRate: number }`
  - `interface PayrollFilterCounts { all: number; configured: number; unconfigured: number; missingInfo: number }`
  - `isResignedStatus(status: string | undefined): boolean`
  - `partitionByEmploymentStatus(employees: EmployeeProfile[]): EmploymentPartition`
  - `selectEmploymentSegment(partition: EmploymentPartition, filter: EmploymentFilter): EmployeeProfile[]`
  - `hasConfiguredSalary(payroll?: PayrollRecord): boolean`
  - `isPaymentInfoMissing(payroll?: PayrollRecord): boolean` (module-private, không export)
  - `matchesPayrollFilter(payroll: PayrollRecord | undefined, filter: PayrollFilterStatus): boolean`
  - `sumNetPayroll(employees: EmployeeProfile[], payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>): number`
  - `calculatePayrollStats(employees: EmployeeProfile[], payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>): PayrollStats`
  - `countPayrollFilters(employees: EmployeeProfile[], payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>): PayrollFilterCounts`

- [ ] **Step 1: Viết test fail trước**

Tạo `tests/payroll-selectors.spec.ts` với đúng nội dung sau:

```ts
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

  it('không nhận nhầm các trạng thái đang làm việc', () => {
    expect(isResignedStatus('Chính thức')).toBe(false);
    expect(isResignedStatus('Đang thử việc')).toBe(false);
    expect(isResignedStatus('Mới nhận việc')).toBe(false);
    expect(isResignedStatus(undefined)).toBe(false);
    expect(isResignedStatus('')).toBe(false);
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
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npx vitest run tests/payroll-selectors.spec.ts`

Expected: FAIL ngay ở bước resolve module — `Failed to load url ../src/ui/payroll/payroll-selectors` hoặc `Cannot find module`. Toàn bộ file test fail vì `payroll-selectors.ts` chưa tồn tại. Nếu nó pass, dừng lại và báo — trạng thái repo không khớp giả định của plan.

- [ ] **Step 3: Tạo module selector**

Tạo `src/ui/payroll/payroll-selectors.ts` với đúng nội dung sau:

```ts
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
 * lên một cách im lặng.
 */
export function isResignedStatus(status: string | undefined): boolean {
  if (!status) return false;

  const normalized = status
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
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

export function isPaymentInfoMissing(payroll?: PayrollRecord): boolean {
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
    return hasConfiguredSalary(payroll) && !!payroll?.taxId && !!payroll?.bankAccount;
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
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/payroll-selectors.spec.ts`

Expected: toàn bộ test pass (18 test trong 7 `describe`).

- [ ] **Step 5: Kiểm tra type**

Run: `npm run typecheck:strict-unused`

Expected: exit code 0, không output.

- [ ] **Step 6: Bàn giao, không commit**

Thao tác git ghi bị cấm trong dự án này. Báo lại các file đã tạo
(`src/ui/payroll/payroll-selectors.ts`, `tests/payroll-selectors.spec.ts`) và kết
quả 2 lệnh verify ở trên, để nguyên working tree cho user tự commit.

---

### Task 2: KPI chỉ tính nhân sự đang làm việc

Đấu nối `PayrollDashboard` vào module selector và sửa đúng cái bug: 4 thẻ KPI chuyển sang tính trên nhóm đang làm việc. Hết task này bảng dữ liệu vẫn liệt kê đủ mọi người như cũ — phân vùng UI là việc của Task 3.

**Files:**
- Modify: `src/ui/payroll/components/PayrollDashboard.tsx`

**Interfaces:**
- Consumes (từ Task 1): `calculatePayrollStats`, `countPayrollFilters`, `hasConfiguredSalary`, `matchesPayrollFilter`, `partitionByEmploymentStatus`, và type `PayrollFilterStatus`.
- Produces: biến cục bộ `employmentPartition: EmploymentPartition` bên trong component — Task 3 đọc lại chính biến này. Không thêm props, không đổi chữ ký export của `PayrollDashboard`.

- [ ] **Step 1: Thêm import module selector**

Trong `src/ui/payroll/components/PayrollDashboard.tsx`, ngay sau khối import
`} from '../services/PayrollExportService';` (khoảng dòng 18), chèn thêm:

```tsx
import {
  calculatePayrollStats,
  countPayrollFilters,
  hasConfiguredSalary,
  matchesPayrollFilter,
  partitionByEmploymentStatus,
  type PayrollFilterStatus,
} from '../payroll-selectors';
```

Chỉ import đúng 6 tên này. `npm run typecheck:strict-unused` sẽ fail nếu import
thừa một cái tên chưa dùng tới.

- [ ] **Step 2: Xoá các bản sao cục bộ trong component file**

Vẫn trong file đó, xoá 5 khối sau (chúng đã chuyển sang `payroll-selectors.ts` ở Task 1):

1. Dòng khai báo type (khoảng dòng 63):

```tsx
type PayrollFilterStatus = 'all' | 'configured' | 'unconfigured' | 'missing_info';
```

2. Interface `PayrollFilterCounts` (khoảng dòng 104-109):

```tsx
interface PayrollFilterCounts {
  all: number;
  configured: number;
  unconfigured: number;
  missingInfo: number;
}
```

3. Hàm `hasConfiguredSalary` (khoảng dòng 111-113).
4. Hàm `isPaymentInfoMissing` (khoảng dòng 115-118).
5. Hàm `matchesPayrollFilter` (khoảng dòng 120-125).

GIỮ NGUYÊN, không đụng tới: hằng `PAYROLL_FILTER_LABELS` (nó dùng type
`PayrollFilterStatus` vừa import), `BANK_OPTIONS`, `CONTRACT_OPTIONS`,
`getInitials`, 3 regex validate, `PAYROLL_EXPORT_FORMAT_LABELS`,
`PAYROLL_EXPORT_GROUPS`, `areEmployeeProfilesEqual`, `arePayrollRecordsEqual`.

Sau khi xoá, file đi thẳng từ dấu `];` kết thúc `PAYROLL_EXPORT_GROUPS` sang
`function areEmployeeProfilesEqual(...)`.

- [ ] **Step 3: Đổi tên biến trong khối dọn rác cho khỏi bẫy người sau**

Trong `loadData`, thay khối hiện tại (khoảng dòng 202-215):

```tsx
      // DỌN RÁC (Garbage Collection): Xoá bản ghi lương nếu nhân viên không còn tồn tại
      const activeEmpIds = new Set(empData.map(e => e._id));
      const orphanedPayrolls = payData.filter(p => !activeEmpIds.has(p.employeeId));
```

bằng:

```tsx
      // DỌN RÁC (Garbage Collection): Xoá bản ghi lương nếu nhân viên không còn tồn tại.
      // Đối chiếu theo mọi hồ sơ còn tồn tại, không phân biệt còn làm hay đã nghỉ: người
      // đã nghỉ vẫn phải giữ bản ghi lương để tất toán.
      const knownEmployeeIds = new Set(empData.map(e => e._id));
      const orphanedPayrolls = payData.filter(p => !knownEmployeeIds.has(p.employeeId));
```

và thay dòng (khoảng dòng 213):

```tsx
      const activePayrolls = payData.filter(p => activeEmpIds.has(p.employeeId));
```

bằng:

```tsx
      const linkedPayrolls = payData.filter(p => knownEmployeeIds.has(p.employeeId));
```

rồi sửa dòng `setPayrolls` ngay bên dưới cho khớp tên mới:

```tsx
      setPayrolls((previous) => (arePayrollRecordsEqual(previous, linkedPayrolls) ? previous : linkedPayrolls));
```

Không đổi bất kỳ hành vi nào của khối này — chỉ đổi tên biến và thêm comment.

- [ ] **Step 4: Cho KPI chỉ tính nhóm đang làm việc**

Thay nguyên khối `stats` (khoảng dòng 334-364, từ comment `// KPIs calculations`
đến hết `}, [employeesInSelectedDepartment, payrollByEmployeeId]);`) bằng:

```tsx
  const employmentPartition = useMemo(
    () => partitionByEmploymentStatus(employeesInSelectedDepartment),
    [employeesInSelectedDepartment]
  );

  // Người đã nghỉ việc không còn nằm trong quỹ lương định kỳ, nên mọi KPI chỉ tính nhóm đang làm việc.
  const stats = useMemo(
    () => calculatePayrollStats(employmentPartition.active, payrollByEmployeeId),
    [employmentPartition, payrollByEmployeeId]
  );
```

- [ ] **Step 5: Dùng lại hàm đếm bộ lọc dùng chung**

Thay nguyên khối `filterCounts` (khoảng dòng 366-375) bằng:

```tsx
  const filterCounts = useMemo(
    () => countPayrollFilters(employeesInSelectedDepartment, payrollByEmployeeId),
    [employeesInSelectedDepartment, payrollByEmployeeId]
  );
```

Nguồn dữ liệu ở đây vẫn là cả phòng ban; Task 3 mới đổi sang nhóm đang chọn.

- [ ] **Step 6: Sửa nhãn thẻ KPI đầu tiên cho đúng thứ nó đang đếm**

Thay nội dung `<span className="hr-stat-label">` của thẻ đầu tiên (khoảng dòng 536-538):

```tsx
            <span className="hr-stat-label">
              {selectedDept === 'all' ? 'Tổng số nhân sự' : `Nhân sự (${selectedDept})`}
            </span>
```

bằng:

```tsx
            <span className="hr-stat-label">
              {selectedDept === 'all' ? 'Nhân sự đang làm việc' : `Đang làm việc (${selectedDept})`}
            </span>
```

- [ ] **Step 7: Kiểm tra type**

Run: `npm run typecheck:strict-unused`

Expected: exit code 0, không output. Nếu báo `'isPaymentInfoMissing' is declared
but its value is never read` nghĩa là Step 2 xoá sót, hoặc Step 1 import thừa —
sửa cho đúng rồi chạy lại.

- [ ] **Step 8: Chạy toàn bộ test và build**

Run: `npx vitest run`

Expected: không có test nào đang pass mà chuyển thành fail. Hai test fail sẵn đã
nêu ở Global Constraints vẫn fail — chấp nhận.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 9: Đọc lại và xác nhận, không sửa**

Không sửa code ở step này. Đọc lại `PayrollDashboard.tsx` và xác nhận 3 điều,
rồi báo kết quả:

1. `stats` chỉ nhận `employmentPartition.active` — không còn chỗ nào tính KPI trên cả `employeesInSelectedDepartment`.
2. `filteredEmployees` vẫn dựng từ `employeesInSelectedDepartment` (bảng vẫn liệt kê đủ mọi người — đúng như dự kiến ở task này).
3. Khối dọn rác vẫn đối chiếu theo `knownEmployeeIds` (mọi hồ sơ), không dính dáng gì tới `employmentPartition`.

Nếu có điểm nào khác với mô tả trên thì báo lại thay vì tự sửa.

- [ ] **Step 10: Bàn giao, không commit**

Báo file đã sửa (`src/ui/payroll/components/PayrollDashboard.tsx`) và kết quả
verify. Không chạy lệnh git ghi.

---

### Task 3: Phân vùng "Đã nghỉ việc (chờ tất toán)" trên UI

Cho HR xem lại và tất toán nhóm đã nghỉ mà không làm bẩn KPI: thêm bộ lọc trạng thái làm việc, dòng tổng quỹ lương chờ tất toán, và nhãn nhận diện trong bảng.

**Files:**
- Modify: `src/ui/payroll/components/PayrollDashboard.tsx`
- Modify: `src/ui/hr-premium-styles.css` (thêm đúng 1 class, chèn sau khối `.hr-status-pill-warn`, khoảng dòng 858)

**Interfaces:**
- Consumes (từ Task 1): `isResignedStatus`, `selectEmploymentSegment`, `sumNetPayroll`, type `EmploymentFilter`. Từ Task 2: biến `employmentPartition` đã có sẵn trong component.
- Produces: không có gì cho task sau — đây là task cuối.

- [ ] **Step 1: Bổ sung import**

Trong `src/ui/payroll/components/PayrollDashboard.tsx`, mở rộng khối import
`from '../payroll-selectors'` mà Task 2 đã tạo thành:

```tsx
import {
  calculatePayrollStats,
  countPayrollFilters,
  hasConfiguredSalary,
  isResignedStatus,
  matchesPayrollFilter,
  partitionByEmploymentStatus,
  selectEmploymentSegment,
  sumNetPayroll,
  type EmploymentFilter,
  type PayrollFilterStatus,
} from '../payroll-selectors';
```

- [ ] **Step 2: Thêm nhãn trạng thái làm việc dùng cho tên file xuất báo cáo**

Ngay sau hằng `PAYROLL_FILTER_LABELS` (khoảng dòng 65-70), chèn:

```tsx
const EMPLOYMENT_FILTER_LABELS: Record<EmploymentFilter, string> = {
  active: 'Dang_Lam_Viec',
  resigned: 'Da_Nghi_Viec',
  all: 'Tat_Ca_Nhan_Su',
};
```

Không dấu, theo đúng quy ước sẵn có của `PAYROLL_FILTER_LABELS` (những nhãn này
đi thẳng vào tên file qua `PayrollExportService.toFileSegment`).

- [ ] **Step 3: Thêm state bộ lọc trạng thái làm việc**

Trong phần khai báo state "States cho Search & Filter", ngay sau dòng
`const [filterStatus, setFilterStatus] = useState<PayrollFilterStatus>('all');`,
chèn:

```tsx
  const [employmentFilter, setEmploymentFilter] = useState<EmploymentFilter>('active');
```

Mặc định `'active'`: mở tab lên là thấy đúng người đang trả lương.

- [ ] **Step 4: Dựng nhóm nhân sự đang xem và quỹ lương chờ tất toán**

Ngay sau khối `stats` (do Task 2 tạo), chèn:

```tsx
  const employmentScopedEmployees = useMemo(
    () => selectEmploymentSegment(employmentPartition, employmentFilter),
    [employmentPartition, employmentFilter]
  );

  const resignedBudget = useMemo(
    () => sumNetPayroll(employmentPartition.resigned, payrollByEmployeeId),
    [employmentPartition, payrollByEmployeeId]
  );
```

- [ ] **Step 5: Cho bộ đếm và bảng chạy theo nhóm đang xem**

Thay khối `filterCounts` (do Task 2 tạo) bằng:

```tsx
  const filterCounts = useMemo(
    () => countPayrollFilters(employmentScopedEmployees, payrollByEmployeeId),
    [employmentScopedEmployees, payrollByEmployeeId]
  );
```

Rồi trong `filteredEmployees`, đổi nguồn và mảng dependency từ
`employeesInSelectedDepartment` sang `employmentScopedEmployees`, giữ nguyên
phần thân lọc:

```tsx
  const filteredEmployees = useMemo(() => {
    return employmentScopedEmployees.filter(emp => {
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
  }, [employmentScopedEmployees, filterStatus, payrollByEmployeeId, searchTerm]);
```

- [ ] **Step 6: Ghi trạng thái làm việc vào tên file xuất báo cáo**

Trong `handleExport`, thay `filterContext` bằng:

```tsx
        filterContext: {
          department: selectedDept === 'all' ? 'Tat_Ca_Phong_Ban' : selectedDept,
          status: `${PAYROLL_FILTER_LABELS[filterStatus]}_${EMPLOYMENT_FILTER_LABELS[employmentFilter]}`,
        },
```

Không đụng `PayrollExportService`. Lưu ý có chủ đích: scope `'all'` ("Toàn bộ dữ
liệu") vẫn xuất `employees` gồm cả người đã nghỉ — đúng nghĩa "bỏ qua toàn bộ bộ
lọc", đừng "sửa" chỗ này.

- [ ] **Step 7: Chú thích khoản bị loại ngay trên thẻ Tổng quỹ lương**

Trong thẻ KPI thứ hai, thay khối `<div className="hr-stat-content">` (khoảng
dòng 545-550 của bản gốc) bằng:

```tsx
          <div className="hr-stat-content">
            <span className="hr-stat-label">Tổng quỹ lương thực chi</span>
            <span className="hr-stat-value" style={{ color: '#148660' }}>
              {formatCurrency(stats.totalBudget)}
            </span>
            {employmentPartition.resigned.length > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Chưa gồm {employmentPartition.resigned.length} nhân sự đã nghỉ ({formatCurrency(resignedBudget)})
              </span>
            )}
          </div>
```

`.hr-stat-content` đã là `flex-direction: column` (`hr-premium-styles.css:343`)
nên dòng chú thích tự xuống hàng, không cần CSS mới.

- [ ] **Step 8: Thêm dropdown lọc trạng thái làm việc**

Trong `.hr-toolbar`, chèn ngay TRƯỚC thẻ `<select aria-label="Lọc theo tình trạng lương" ...>`:

```tsx
          <select
            aria-label="Lọc theo trạng thái làm việc"
            className="hr-input"
            value={employmentFilter}
            onChange={(event) => setEmploymentFilter(event.target.value as EmploymentFilter)}
            style={{ width: 'auto', minWidth: '190px' }}
          >
            <option value="active">Đang làm việc ({employmentPartition.active.length})</option>
            <option value="resigned">Đã nghỉ việc ({employmentPartition.resigned.length})</option>
            <option value="all">
              Tất cả nhân sự ({employmentPartition.active.length + employmentPartition.resigned.length})
            </option>
          </select>
```

- [ ] **Step 9: Thêm dải thông báo quỹ lương chờ tất toán**

Chèn ngay TRƯỚC `{/* Modern Data Table */}`:

```tsx
      {employmentFilter !== 'active' && employmentPartition.resigned.length > 0 && (
        <div className="hr-status-banner hr-status-info">
          Quỹ lương chờ tất toán của {employmentPartition.resigned.length} nhân sự đã nghỉ: {formatCurrency(resignedBudget)}.
          Khoản này không nằm trong Tổng quỹ lương thực chi.
        </div>
      )}
```

- [ ] **Step 10: Gắn nhãn nhận diện trong từng dòng bảng**

Trong `<tbody>`, thay khối ô tên nhân viên:

```tsx
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{emp.name}</div>
```

bằng:

```tsx
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {emp.name}
                          {isResignedStatus(emp.status) && (
                            <span className="hr-status-pill hr-status-pill-resigned">Đã nghỉ việc</span>
                          )}
                        </div>
```

Phần còn lại của ô (dòng `{emp.position || 'Nhân sự'} ...` và các thẻ đóng) giữ nguyên.

- [ ] **Step 11: Thêm class CSS cho nhãn đã nghỉ việc**

Trong `src/ui/hr-premium-styles.css`, chèn ngay sau khối `.hr-status-pill-warn`
(kết thúc khoảng dòng 858, ngay trước comment `/* Debug Modal / Panel */`):

```css
.hr-status-pill-resigned {
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
}
```

Dùng đúng cặp màu đỏ của stage "Nghỉ việc" (`#ef4444`) đã dùng ở `KANBAN_COLUMNS`
và `.badge-missing`.

- [ ] **Step 12: Kiểm tra type và build**

Run: `npm run typecheck:strict-unused`

Expected: exit code 0, không output.

Run: `npx vitest run`

Expected: không có test nào đang pass mà chuyển thành fail; 2 test fail sẵn vẫn fail.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 13: Checklist kiểm thử thủ công**

Dự án không có test render React, nên phần UI phải mắt thấy. Nếu chạy được app
(`npm run dev`, cần relay/pairing của PrivOS), kiểm đủ 6 mục sau và báo kết quả
từng mục; nếu không dựng được môi trường thì nói thẳng là chưa kiểm chứng được
trên UI thật, đừng tuyên bố đã xong.

1. Tab Quản lý lương mở lên mặc định ở "Đang làm việc"; bảng không còn người đã nghỉ.
2. Kéo một nhân sự đang có lương sang cột "Nghỉ việc" ở tab Hồ sơ & Vòng đời → trong vòng ~3 giây (chu kỳ polling), "Tổng quỹ lương thực chi" giảm đúng bằng lương thực nhận của người đó, "Nhân sự đang làm việc" giảm 1.
3. Thẻ Tổng quỹ lương hiện dòng "Chưa gồm N nhân sự đã nghỉ (...)" với số tiền khớp.
4. Chuyển dropdown sang "Đã nghỉ việc" → bảng hiện đúng người đó kèm nhãn đỏ "Đã nghỉ việc", dải xanh báo quỹ lương chờ tất toán hiện ra, và các con số trong dropdown "Tình trạng lương" khớp với số dòng đang hiển thị.
5. Bấm "Chỉnh sửa" trên một người đã nghỉ → vẫn sửa và lưu được (phục vụ tất toán), KPI không thay đổi sau khi lưu.
6. Kéo người đó ngược lại cột "Chính thức" → họ quay lại nhóm đang làm việc và quỹ lương tăng lại đúng bằng số cũ.

- [ ] **Step 14: Bàn giao, không commit**

Báo các file đã sửa (`src/ui/payroll/components/PayrollDashboard.tsx`,
`src/ui/hr-premium-styles.css`), kết quả các lệnh verify và checklist thủ công.
Không chạy lệnh git ghi — user tự commit.
