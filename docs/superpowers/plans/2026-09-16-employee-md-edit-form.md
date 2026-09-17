# Form sửa hồ sơ nhân sự từ file Markdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ở tab Hồ sơ nhân sự, thêm form đọc dữ liệu từ file Markdown đã link với item trong list, cho sửa, rồi ghi ngược lại file đó và đồng bộ thẻ Kanban.

**Architecture:** Tách thành ba lớp. Một module thuần parse/render Markdown (không chạm `app`, test được hoàn toàn). Một lớp I/O đọc-ghi file Room với đường chính `POST file-management.files/:fileId/update-content` và đường dự phòng `app.uploadFile` + `duplicateAction: 'replace'`. Một modal ráp UI, mỏng nhất có thể vì repo không có React Testing Library.

**Tech Stack:** TypeScript strict, React 18, Vitest 2, `@privos_ai/app-react` 0.6, Vite 5 (`?raw` import cho template Markdown).

**Spec:** `docs/superpowers/specs/2026-09-16-employee-md-edit-form-design.md`

## Global Constraints

- **Không commit, không chạy bất kỳ lệnh git ghi nào.** Người dùng cấm tuyệt đối. Thay bước "Commit" bằng bước chạy lại toàn bộ test. Việc commit là của người dùng.
- **Không sửa các file sau** (thành viên khác trong team đang làm, tránh xung đột merge): `src/ui/lifecycle/LifecycleDashboard.tsx`, `src/ui/privos-rest.ts`, `src/ui/App.tsx`, `src/ui/email-templates/**`, `src/ui/email-history/EmailMailboxView.tsx`, `src/ui/email-history/EmailTab.tsx`, `src/ui/lifecycle/di/EmployeeEmailTemplateContext.tsx`, `src/ui/data/email-templates/**`, `src/ui/pipeline-dashboard.tsx`, `src/ui/jd-chatbot-functional.tsx`, `src/ui/bot-drafting-tab.tsx`.
- **Không sửa `src/ui/lifecycle/services/lifecycleService.ts`** và **`src/ui/lifecycle/components/CreateProfileForm.tsx`** — cả hai là code chết không ai import; xoá chúng là task dọn dẹp riêng, ngoài phạm vi plan này.
- **Không sửa `src/ui/data/employee_template.md`.** Mọi file hồ sơ đang tồn tại trong Room đều sinh từ bản hiện tại; đổi template là phá round-trip của dữ liệu cũ.
- **Chỉ ghi file bằng công cụ Write/Edit**, không dùng heredoc hay chuyển hướng shell — tiếng Việt sẽ hỏng mã.
- **Không dùng icon, emoji** trong code mới, comment mới, hay chuỗi hiển thị mới.
- **TypeScript strict.** Không thêm `any` mới trừ khi có comment giải thích tại sao dữ liệu thật sự không có schema tĩnh.
- **Cấm gọi `PUT /api/v1/internal/rooms/:roomId/items/:itemId/customFields`** hay bất kỳ route `internal/` nào — route service-key bỏ qua ACL theo từng người dùng (`privos-dev-docs/APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:76-77`).
- **Baseline test trước khi bắt đầu: 295 test, 294 pass, 1 fail.** Test fail sẵn có là `tests/manifest.spec.ts > manifest > serves the canonical Marketplace manifest` (lệch tên app giữa `package.json` là `ai.privos.mcp-app-demo-can-run` và manifest là `ai.privos.mcp-app-demo-hr-hrm`). Không sửa nó, không tính nó là hỏng do mình.
- **Lệnh chạy test:** `npx vitest run <đường dẫn file test>` cho một file, `npm test` cho toàn bộ.
- **Lệnh typecheck:** `npm run typecheck`.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/ui/lifecycle/employee-md-document.ts` | Model `EmployeeMdDocument`, `parseEmployeeMd`, `renderEmployeeMd`. Thuần, không phụ thuộc `app`. | 1 |
| `tests/employee-md-document.spec.ts` | Round-trip, thiếu H1, thiếu nhãn, ba dòng ghép, giá trị chứa `$&`. | 1 |
| `src/ui/lifecycle/services/employee-md-file.ts` | Phân giải tham chiếu file từ item, đọc text, ghi text (đường chính + dự phòng). | 2 |
| `tests/employee-md-file.spec.ts` | Phân giải `folder_id` snake_case, đường ghi chính, tụt về dự phòng, chặn khi thiếu folder. | 2 |
| `src/ui/lifecycle/services/employee-md-save.ts` | Giao dịch lưu: ghi file trước, đồng bộ item sau, phân biệt thất bại từng phần. | 2 |
| `tests/employee-md-save.spec.ts` | Thứ tự gọi, trạng thái `saved-item-stale`. | 2 |
| `src/ui/lifecycle/types.ts` | Thêm `attachedFileId`/`attachedFileUrl` vào `EmployeeProfile`, thêm `UpdateProfileFieldsInput` và `updateProfileFields` vào `ILifecycleService`. | 3 |
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | Cài `updateProfileFields` qua `mcpapp.lists.updateItem`. | 3 |
| `tests/lifecycle-update-profile-fields.spec.ts` | Mảng customFields đầy đủ, description dựng lại đủ marker. | 3 |
| `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx` | Bỏ 22 lệnh `.replace` thủ công, dùng `renderEmployeeMd` chung. | 4 |
| `src/ui/lifecycle/components/EditProfileModal.tsx` | Modal form sửa. | 5 |
| `src/ui/lifecycle/components/ProfileCard.tsx` | Nút "Sửa hồ sơ" + mount modal. | 5 |
| `src/ui/lifecycle/components/ProfileListView.tsx` | Nút "Sửa" trong cột thao tác + mount modal. | 5 |

---

### Task 1: Module parse/render Markdown

**Files:**
- Create: `src/ui/lifecycle/employee-md-document.ts`
- Test: `tests/employee-md-document.spec.ts`

**Interfaces:**
- Consumes: `src/ui/data/employee_template.md` (chỉ đọc nội dung, không sửa file).
- Produces:
  - `interface EmployeeMdDocument` — 23 khoá kiểu `string`, liệt kê đầy đủ ở Step 3.
  - `interface ParsedEmployeeMd { doc: EmployeeMdDocument; missingLabels: string[] }`
  - `const EMPLOYEE_MD_HEADER: string`
  - `function createEmptyEmployeeMdDocument(): EmployeeMdDocument`
  - `function renderEmployeeMd(doc: EmployeeMdDocument, template: string): string`
  - `function parseEmployeeMd(text: string): ParsedEmployeeMd | null`

**Bối cảnh cho người làm:** `src/ui/data/employee_template.md` là một file Markdown chứa 23 chỗ trống dạng `[TÊN_VIẾT_HOA]`. Form tạo hồ sơ hiện tại thay từng chỗ trống rồi upload lên Room. Task này làm chiều ngược lại: đọc file đã sinh ra, bóc lại 23 giá trị. **File template dùng CRLF**, nên mọi phép tách dòng phải dùng `/\r?\n/`, không phải `'\n'`.

Nội dung template hiện tại, để đối chiếu khi viết regex:

```
# HỒ SƠ NHÂN SỰ
**Mã nhân sự:** [LOCAL_ID]
**Ngày tạo hồ sơ:** [CREATE_DATE]

## 1. Thông tin chung
- **Họ và Tên:** [FULL_NAME]
- **Vị trí công việc:** [POSITION]
- **Phòng ban:** [DEPARTMENT]
- **Ngày bắt đầu làm việc:** [START_DATE]

## 2. Liên hệ
- **Số điện thoại:** [PHONE]
- **Email công việc:** [EMAIL]
- **Telegram:** [TELEGRAM]
- **Liên hệ khẩn cấp:** [EMERGENCY]

## 3. Thông tin cá nhân
- **Ngày sinh:** [DOB]
- **Số CMND/CCCD:** [ID_NUMBER] (Cấp ngày: [ID_DATE] tại [ID_PLACE])
- **Địa chỉ thường trú:** [PERM_ADDRESS]
- **Chỗ ở hiện tại:** [CUR_ADDRESS]

## 4. Tài chính & Khác
- **Số tài khoản NH:** [BANK_ACCOUNT] - [BANK_NAME]
- **Mã số thuế (PIT):** [TAX_CODE]
- **Sổ BHXH:** [SOCIAL_INSURANCE]
- **Phương tiện đi lại:** [VEHICLE_TYPE] (Biển số: [VEHICLE_PLATE])

---
*Ảnh chụp giấy tờ/Chân dung (nếu có):*
[IMAGE_LINK]
```

- [ ] **Step 1: Viết test trước**

Tạo `tests/employee-md-document.spec.ts` với đúng nội dung sau:

```ts
import { describe, expect, it } from 'vitest';
import employeeTemplateRaw from '../src/ui/data/employee_template.md?raw';
import {
  EmployeeMdDocument,
  createEmptyEmployeeMdDocument,
  parseEmployeeMd,
  renderEmployeeMd,
} from '../src/ui/lifecycle/employee-md-document';

function filledDoc(): EmployeeMdDocument {
  return {
    localId: 'NV123456',
    createDate: '16/9/2026',
    fullName: 'Nguyen Van A',
    position: 'Developer',
    department: 'IT',
    startDate: '2026-09-01',
    phone: '0901234567',
    email: 'a@example.com',
    telegram: '@nva',
    emergency: 'Vo - 0988888888',
    dob: '1995-05-15',
    idNumber: '001095123456',
    idDate: '2020-01-01',
    idPlace: 'Cuc canh sat QLHC',
    permAddress: '123 Duong ABC, Quan 1',
    curAddress: '456 Duong DEF, Quan 3',
    bankAccount: '1903456789',
    bankName: 'Techcombank',
    taxCode: '8392134589',
    socialInsurance: '1234567890',
    vehicleType: 'Honda Airblade',
    vehiclePlate: '59P1-123.45',
    imageLink: '*Chua co anh dinh kem*',
  };
}

describe('renderEmployeeMd', () => {
  it('thay het placeholder, khong con dau ngoac vuong nao sot lai', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw);
    expect(text).not.toMatch(/\[[A-Z_]+\]/);
    expect(text).toContain('**Mã nhân sự:** NV123456');
    expect(text).toContain('- **Họ và Tên:** Nguyen Van A');
  });

  it('khong dien giai $& trong gia tri thanh pattern thay the', () => {
    // `String.replace` voi chuoi thay the se coi `$&` la "toan bo phan khop".
    // Mot dia chi hay ten chua `$` se bi bien dang neu dung chuoi thay vi ham.
    const doc = { ...filledDoc(), permAddress: 'So 1 $& duong $1' };
    const text = renderEmployeeMd(doc, employeeTemplateRaw);
    expect(text).toContain('- **Địa chỉ thường trú:** So 1 $& duong $1');
  });
});

describe('parseEmployeeMd', () => {
  it('doc lai dung tung truong tu van ban da render', () => {
    const doc = filledDoc();
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed).not.toBeNull();
    expect(parsed!.doc).toEqual(doc);
    expect(parsed!.missingLabels).toEqual([]);
  });

  it('round-trip: render(parse(x)) tra ve dung x', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw);
    const parsed = parseEmployeeMd(text);
    expect(renderEmployeeMd(parsed!.doc, employeeTemplateRaw)).toBe(text);
  });

  it('round-trip van dung khi moi truong deu rong', () => {
    // Truong hop nay la bay: dong ngan hang rong se thanh ` - `, neu trim truoc khi
    // tach thi mat dau tach va hai truong bi gop lam mot.
    const empty = createEmptyEmployeeMdDocument();
    const text = renderEmployeeMd(empty, employeeTemplateRaw);
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc).toEqual(empty);
    expect(renderEmployeeMd(parsed!.doc, employeeTemplateRaw)).toBe(text);
  });

  it('tra null khi van ban khong phai ho so theo mau', () => {
    // Quan trong: form sua render lai TOAN BO tu template, nen mo form tren mot file
    // khong doc duoc se xoa sach file do khi bam luu. Phai chan ngay tu day.
    expect(parseEmployeeMd('# Ghi chu linh tinh\nmot hai ba')).toBeNull();
    expect(parseEmployeeMd('')).toBeNull();
  });

  it('tach dung ten ngan hang co chua dau gach ngang', () => {
    const doc = { ...filledDoc(), bankName: 'Techcombank - Chi nhanh Q1' };
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed!.doc.bankAccount).toBe('1903456789');
    expect(parsed!.doc.bankName).toBe('Techcombank - Chi nhanh Q1');
  });

  it('tach dung noi cap CCCD co chua dau ngoac don', () => {
    const doc = { ...filledDoc(), idPlace: 'Cuc CS (QLHC)' };
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed!.doc.idNumber).toBe('001095123456');
    expect(parsed!.doc.idDate).toBe('2020-01-01');
    expect(parsed!.doc.idPlace).toBe('Cuc CS (QLHC)');
  });

  it('bao ten nhan khong doc duoc thay vi am tham tra ve rong', () => {
    // File co H1 nhung thieu dong: nguoi dung phai duoc canh bao truoc khi luu,
    // vi luu se ghi chuoi rong de len truong do.
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw)
      .split(/\r?\n/)
      .filter(line => !line.includes('**Sổ BHXH:**') && !line.includes('**Telegram:**'))
      .join('\r\n');
    const parsed = parseEmployeeMd(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.missingLabels).toEqual(['Telegram', 'Sổ BHXH']);
    expect(parsed!.doc.socialInsurance).toBe('');
    expect(parsed!.doc.fullName).toBe('Nguyen Van A');
  });

  it('doc duoc file dung LF thay vi CRLF', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw).replace(/\r\n/g, '\n');
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc.vehiclePlate).toBe('59P1-123.45');
    expect(parsed!.missingLabels).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npx vitest run tests/employee-md-document.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/lifecycle/employee-md-document"`.

- [ ] **Step 3: Viết module**

Tạo `src/ui/lifecycle/employee-md-document.ts` với đúng nội dung sau:

```ts
/**
 * Đọc và sinh lại file hồ sơ nhân sự dạng Markdown.
 *
 * File được sinh từ `src/ui/data/employee_template.md` — 23 chỗ trống `[TÊN]`. Module
 * này thuần: không chạm `app`, nhận template làm tham số để test được mà không cần
 * dựng môi trường Vite.
 *
 * Template dùng CRLF, nên mọi phép tách dòng ở đây dùng `/\r?\n/`.
 */

export interface EmployeeMdDocument {
  localId: string;
  createDate: string;
  fullName: string;
  position: string;
  department: string;
  startDate: string;
  phone: string;
  email: string;
  telegram: string;
  emergency: string;
  dob: string;
  idNumber: string;
  idDate: string;
  idPlace: string;
  permAddress: string;
  curAddress: string;
  bankAccount: string;
  bankName: string;
  taxCode: string;
  socialInsurance: string;
  vehicleType: string;
  vehiclePlate: string;
  imageLink: string;
}

export interface ParsedEmployeeMd {
  doc: EmployeeMdDocument;
  /** Nhãn tiếng Việt của những trường không đọc được, để UI cảnh báo trước khi ghi đè. */
  missingLabels: string[];
}

export const EMPLOYEE_MD_HEADER = '# HỒ SƠ NHÂN SỰ';

const IMAGE_LINK_ANCHOR = '*Ảnh chụp giấy tờ/Chân dung (nếu có):*';

const PLACEHOLDERS: ReadonlyArray<readonly [string, keyof EmployeeMdDocument]> = [
  ['[LOCAL_ID]', 'localId'],
  ['[CREATE_DATE]', 'createDate'],
  ['[FULL_NAME]', 'fullName'],
  ['[POSITION]', 'position'],
  ['[DEPARTMENT]', 'department'],
  ['[START_DATE]', 'startDate'],
  ['[PHONE]', 'phone'],
  ['[EMAIL]', 'email'],
  ['[TELEGRAM]', 'telegram'],
  ['[EMERGENCY]', 'emergency'],
  ['[DOB]', 'dob'],
  ['[ID_NUMBER]', 'idNumber'],
  ['[ID_DATE]', 'idDate'],
  ['[ID_PLACE]', 'idPlace'],
  ['[PERM_ADDRESS]', 'permAddress'],
  ['[CUR_ADDRESS]', 'curAddress'],
  ['[BANK_ACCOUNT]', 'bankAccount'],
  ['[BANK_NAME]', 'bankName'],
  ['[TAX_CODE]', 'taxCode'],
  ['[SOCIAL_INSURANCE]', 'socialInsurance'],
  ['[VEHICLE_TYPE]', 'vehicleType'],
  ['[VEHICLE_PLATE]', 'vehiclePlate'],
  ['[IMAGE_LINK]', 'imageLink'],
];

/** Nhãn của những dòng chỉ chứa đúng một giá trị, theo đúng thứ tự trong template. */
const SIMPLE_LABELS: ReadonlyArray<readonly [string, keyof EmployeeMdDocument]> = [
  ['Mã nhân sự', 'localId'],
  ['Ngày tạo hồ sơ', 'createDate'],
  ['Họ và Tên', 'fullName'],
  ['Vị trí công việc', 'position'],
  ['Phòng ban', 'department'],
  ['Ngày bắt đầu làm việc', 'startDate'],
  ['Số điện thoại', 'phone'],
  ['Email công việc', 'email'],
  ['Telegram', 'telegram'],
  ['Liên hệ khẩn cấp', 'emergency'],
  ['Ngày sinh', 'dob'],
  ['Địa chỉ thường trú', 'permAddress'],
  ['Chỗ ở hiện tại', 'curAddress'],
  ['Mã số thuế (PIT)', 'taxCode'],
  ['Sổ BHXH', 'socialInsurance'],
];

/**
 * Nhóm cuối tham lam (`(.*)` chứ không phải `(.*?)`) để nơi cấp chứa được dấu `)`:
 * "Cuc CS (QLHC)" vẫn phải về nguyên vẹn.
 */
const ID_LINE = /^(.*?)\s*\(Cấp ngày:\s*(.*?)\s*tại\s*(.*)\)$/;
const VEHICLE_LINE = /^(.*?)\s*\(Biển số:\s*(.*)\)$/;

export function createEmptyEmployeeMdDocument(): EmployeeMdDocument {
  return {
    localId: '',
    createDate: '',
    fullName: '',
    position: '',
    department: '',
    startDate: '',
    phone: '',
    email: '',
    telegram: '',
    emergency: '',
    dob: '',
    idNumber: '',
    idDate: '',
    idPlace: '',
    permAddress: '',
    curAddress: '',
    bankAccount: '',
    bankName: '',
    taxCode: '',
    socialInsurance: '',
    vehicleType: '',
    vehiclePlate: '',
    imageLink: '',
  };
}

/**
 * Thay chỗ trống bằng hàm replacer chứ không phải chuỗi. `String.replace` với chuỗi
 * thay thế sẽ diễn giải `$&`, `$1`... thành pattern, nên một địa chỉ hay tên chứa
 * `$` sẽ bị biến dạng. Mỗi chỗ trống xuất hiện đúng một lần trong template nên
 * `replace` (thay lần đầu) là đủ.
 */
export function renderEmployeeMd(doc: EmployeeMdDocument, template: string): string {
  let out = template;
  for (const [token, key] of PLACEHOLDERS) {
    out = out.replace(token, () => doc[key] ?? '');
  }
  return out;
}

/**
 * Phần còn lại của dòng sau `**Nhãn:**`, đã bỏ đúng MỘT khoảng trắng phân cách.
 *
 * Không `trim()` ở đây: dòng ngân hàng khi cả hai giá trị đều rỗng là ` - `, mà
 * `trim()` biến nó thành `-` và làm mất dấu tách.
 */
function readLabelBody(lines: string[], label: string): string | undefined {
  const marker = `**${label}:**`;
  for (const line of lines) {
    const idx = line.indexOf(marker);
    if (idx === -1) continue;
    const rest = line.slice(idx + marker.length);
    return rest.startsWith(' ') ? rest.slice(1) : rest;
  }
  return undefined;
}

export function parseEmployeeMd(text: string): ParsedEmployeeMd | null {
  if (!text.includes(EMPLOYEE_MD_HEADER)) return null;

  const lines = text.split(/\r?\n/);
  const doc = createEmptyEmployeeMdDocument();
  const missingLabels: string[] = [];

  for (const [label, key] of SIMPLE_LABELS) {
    const body = readLabelBody(lines, label);
    if (body === undefined) {
      missingLabels.push(label);
      continue;
    }
    doc[key] = body.trim();
  }

  const idBody = readLabelBody(lines, 'Số CMND/CCCD');
  const idMatch = idBody === undefined ? null : ID_LINE.exec(idBody);
  if (idMatch) {
    doc.idNumber = idMatch[1].trim();
    doc.idDate = idMatch[2].trim();
    doc.idPlace = idMatch[3].trim();
  } else {
    missingLabels.push('Số CMND/CCCD');
    if (idBody !== undefined) doc.idNumber = idBody.trim();
  }

  const vehicleBody = readLabelBody(lines, 'Phương tiện đi lại');
  const vehicleMatch = vehicleBody === undefined ? null : VEHICLE_LINE.exec(vehicleBody);
  if (vehicleMatch) {
    doc.vehicleType = vehicleMatch[1].trim();
    doc.vehiclePlate = vehicleMatch[2].trim();
  } else {
    missingLabels.push('Phương tiện đi lại');
    if (vehicleBody !== undefined) doc.vehicleType = vehicleBody.trim();
  }

  // Tách ở ` - ` ĐẦU TIÊN: số tài khoản không chứa dấu gạch, còn tên ngân hàng thì
  // có ("Techcombank - Chi nhanh Q1"), nên tách ở lần cuối hoặc tách hết là sai.
  const bankBody = readLabelBody(lines, 'Số tài khoản NH');
  const bankSep = bankBody === undefined ? -1 : bankBody.indexOf(' - ');
  if (bankBody !== undefined && bankSep !== -1) {
    doc.bankAccount = bankBody.slice(0, bankSep).trim();
    doc.bankName = bankBody.slice(bankSep + 3).trim();
  } else {
    missingLabels.push('Số tài khoản NH');
    if (bankBody !== undefined) doc.bankAccount = bankBody.trim();
  }

  const anchorIdx = lines.findIndex(line => line.trim() === IMAGE_LINK_ANCHOR);
  if (anchorIdx !== -1 && anchorIdx + 1 < lines.length) {
    doc.imageLink = lines[anchorIdx + 1].trim();
  }

  return { doc, missingLabels };
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npx vitest run tests/employee-md-document.spec.ts`
Expected: PASS — 10 test.

- [ ] **Step 5: Typecheck và chạy lại toàn bộ test**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch. Test: 305 test, 304 pass, 1 fail — đúng cái `tests/manifest.spec.ts` có sẵn trong Global Constraints, không thêm fail nào khác.

**Không commit.** Người dùng cấm mọi lệnh git ghi.

---

### Task 2: Lớp I/O đọc-ghi file và giao dịch lưu

**Files:**
- Create: `src/ui/lifecycle/services/employee-md-file.ts`
- Create: `src/ui/lifecycle/services/employee-md-save.ts`
- Test: `tests/employee-md-file.spec.ts`
- Test: `tests/employee-md-save.spec.ts`

**Interfaces:**
- Consumes: `readRoomFileText(app, file, downloadTimeoutMs?)`, `restCall(app, method, path, opts?)` và `class OptionalFeatureUnavailableError` — cả ba đã có sẵn trong `src/ui/privos-rest.ts` (**không được sửa file đó**).
- Produces:
  - `interface EmployeeMdFileRef { fileId?: string; downloadUrl?: string; folderId?: string; fileName?: string }`
  - `interface EmployeeMdFileSource { attachedFileObj?: any; attachedFileId?: string; attachedFileUrl?: string }`
  - `type EmployeeMdWriteRoute = 'update-content' | 'upload-replace'`
  - `function describeFileError(error: unknown): string`
  - `function resolveEmployeeMdFileRef(source: EmployeeMdFileSource): EmployeeMdFileRef | null`
  - `function readEmployeeMdText(app: McpApp, ref: EmployeeMdFileRef): Promise<string>`
  - `function writeEmployeeMdText(app: McpApp, roomId: string, ref: EmployeeMdFileRef, content: string): Promise<EmployeeMdWriteRoute>`
  - `type SaveEmployeeMdResult = { status: 'saved'; route: EmployeeMdWriteRoute } | { status: 'saved-item-stale'; route: EmployeeMdWriteRoute; detail: string }`
  - `function saveEmployeeMd(params: { app: McpApp; roomId: string; ref: EmployeeMdFileRef; content: string; syncItem: () => Promise<void> }): Promise<SaveEmployeeMdResult>`

**Bối cảnh cho người làm — ba điều dễ làm sai:**

1. **Hub trả File Object dùng snake_case.** Khoá thư mục là `folder_id`, không phải `folderId` (`privos-dev-docs/file-management/file-management-api.md:37`). Object lưu trong item là thứ `app.uploadFile` trả về nên có thể đã bọc lại thành camelCase — đọc cả hai.

2. **Đường ghi chính là `POST file-management.files/:fileId/update-content`** với body JSON `{ content }` (`file-management-api.md:370-394`). Nó nhận fileId nên không phải giải quyết thư mục, không phải encode base64. Chưa chắc chắn 100% path này nằm trong allowlist REST cho scope `files:write` (allowlist mô tả bằng path-prefix `file-management.files.*` dùng dấu chấm, còn path này dùng gạch chéo), nên **phải có đường dự phòng**: `app.uploadFile` + `duplicateAction: 'replace'`. Từ 2026-05-13 `replace` là upsert tại chỗ và giữ nguyên `_id` (`stable-file-id-and-replace-semantics.md:18-38`).

3. **Đường dự phòng chỉ được chạy khi biết cả `folderId` lẫn `fileName`.** Thiếu `folderId`, upload sẽ rơi vào thư mục gốc và tạo file THỨ HAI thay vì ghi đè, để lại file mồ côi. Thà ném lỗi.

Và một cái bẫy về thông báo: `restCall` biến **mọi** 403 thành `OptionalFeatureUnavailableError` có nội dung "quyền tuỳ chọn chưa được cấp" (`privos-rest.ts:85`). Nhưng `files:read` và `files:write` trong `privos-app.json` đều khai `requirement: "required"`, nên 403 ở đây là Room từ chối theo ACL, không phải thiếu scope. Hiển thị câu kia sẽ chỉ sai hướng người dùng, nên `describeFileError` phải viết lại câu đó.

- [ ] **Step 1: Viết test cho lớp I/O**

Tạo `tests/employee-md-file.spec.ts` với đúng nội dung sau:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  resolveEmployeeMdFileRef,
  writeEmployeeMdText,
} from '../src/ui/lifecycle/services/employee-md-file';

type RestCall = { method: string; path: string; body?: any };
type UploadCall = Record<string, unknown>;

/**
 * `employee-md-file` chi cham `app.rest` va `app.uploadFile`, nen hai ham nay la
 * stub day du. `app.rest` tra `{ statusCode, body }` dung nhu SDK that, vi
 * `restCall` doc hai truong do de quyet dinh nem hay khong.
 */
function createAppStub(options: {
  restStatus?: number;
  restBody?: any;
  uploadThrows?: Error;
} = {}) {
  const restCalls: RestCall[] = [];
  const uploadCalls: UploadCall[] = [];
  const app = {
    async rest(params: any) {
      restCalls.push({ method: params.method, path: params.path, body: params.body });
      return {
        statusCode: options.restStatus ?? 200,
        body: options.restBody ?? { success: true },
      };
    },
    async uploadFile(params: UploadCall) {
      uploadCalls.push(params);
      if (options.uploadThrows) throw options.uploadThrows;
      return { file: { _id: 'file-1' } };
    },
  };
  return { app: app as any, restCalls, uploadCalls };
}

describe('resolveEmployeeMdFileRef', () => {
  it('doc folder_id snake_case cua Hub, khong chi doc folderId', () => {
    // File Object cua Hub dung snake_case (`file-management-api.md:37`). Doc sai khoa
    // thi nhanh du phong tuong la khong biet thu muc va tu choi ghi.
    const ref = resolveEmployeeMdFileRef({
      attachedFileObj: {
        _id: 'file-1',
        name: 'ho-so.md',
        folder_id: 'folder-9',
        downloadUrl: 'https://minio/ho-so.md',
      },
    });
    expect(ref).toEqual({
      fileId: 'file-1',
      downloadUrl: 'https://minio/ho-so.md',
      folderId: 'folder-9',
      fileName: 'ho-so.md',
    });
  });

  it('chap nhan folderId camelCase khi khong co folder_id', () => {
    const ref = resolveEmployeeMdFileRef({
      attachedFileObj: { id: 'file-2', fileName: 'x.md', folderId: 'folder-3' },
    });
    expect(ref!.fileId).toBe('file-2');
    expect(ref!.folderId).toBe('folder-3');
    expect(ref!.fileName).toBe('x.md');
  });

  it('tut ve fileId trong description khi khong co file object', () => {
    const ref = resolveEmployeeMdFileRef({ attachedFileId: 'file-4' });
    expect(ref).toEqual({ fileId: 'file-4' });
  });

  it('bo qua chuoi "null" ma luong cu ghi vao fileUrl', () => {
    expect(resolveEmployeeMdFileRef({ attachedFileUrl: 'null' })).toBeNull();
  });

  it('tra null khi ho so khong co file dinh kem nao', () => {
    expect(resolveEmployeeMdFileRef({})).toBeNull();
  });
});

describe('writeEmployeeMdText', () => {
  it('uu tien update-content va khong dung toi uploadFile', async () => {
    const { app, restCalls, uploadCalls } = createAppStub();
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, '# noi dung'))
      .resolves.toBe('update-content');
    expect(restCalls).toEqual([{
      method: 'POST',
      path: 'file-management.files/file-1/update-content',
      body: { content: '# noi dung' },
    }]);
    expect(uploadCalls).toHaveLength(0);
  });

  it('tut ve uploadFile replace khi update-content bi tu choi', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, '# noi dung'))
      .resolves.toBe('upload-replace');
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      channelId: 'room-1',
      fileName: 'ho-so.md',
      folderId: 'folder-9',
      mimeType: 'text/markdown',
      duplicateAction: 'replace',
    });
  });

  it('khong upload khi thieu folderId, de khong de ra file lac cho', async () => {
    // Thieu folderId thi upload roi vao thu muc goc va tao file THU HAI thay vi ghi
    // de, de lai file mo coi ma item khong tro toi.
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });

    await expect(writeEmployeeMdText(app, 'room-1', { fileId: 'file-1', fileName: 'x.md' }, 'noi dung'))
      .rejects.toThrow(/thư mục/);
    expect(uploadCalls).toHaveLength(0);
  });

  it('khong upload khi thieu ten file goc', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });

    await expect(writeEmployeeMdText(app, 'room-1', { fileId: 'file-1', folderId: 'folder-9' }, 'noi dung'))
      .rejects.toThrow(/tên file/);
    expect(uploadCalls).toHaveLength(0);
  });

  it('nem loi khi ca hai duong deu hong', async () => {
    const { app } = createAppStub({ restStatus: 500, uploadThrows: new Error('MinIO down') });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, 'noi dung'))
      .rejects.toThrow(/MinIO down/);
  });

  it('doi ma loi tho cua Hub thanh cau nguoi dung doc duoc', async () => {
    // `error-quota-exceeded` hien nguyen xi len banner thi khong ai biet phai lam gi.
    const { app } = createAppStub({
      restStatus: 500,
      uploadThrows: new Error('error-quota-exceeded'),
    });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await expect(writeEmployeeMdText(app, 'room-1', ref, 'noi dung'))
      .rejects.toThrow(/Kho lưu trữ của Room đã đầy/);
  });

  it('ma hoa UTF-8 tieng Viet sang base64 chu khong cat dau', async () => {
    const { app, uploadCalls } = createAppStub({ restStatus: 403 });
    const ref = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

    await writeEmployeeMdText(app, 'room-1', ref, '# HỒ SƠ NHÂN SỰ');

    const data = String(uploadCalls[0].base64Data);
    expect(data.startsWith('data:text/markdown;base64,')).toBe(true);
    const decoded = Buffer.from(data.slice('data:text/markdown;base64,'.length), 'base64').toString('utf8');
    expect(decoded).toBe('# HỒ SƠ NHÂN SỰ');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npx vitest run tests/employee-md-file.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/lifecycle/services/employee-md-file"`.

- [ ] **Step 3: Viết module I/O**

Tạo `src/ui/lifecycle/services/employee-md-file.ts` với đúng nội dung sau:

```ts
import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, readRoomFileText, restCall } from '../../privos-rest';

/** Đủ thông tin để đọc file và để ghi đè đúng chỗ. */
export interface EmployeeMdFileRef {
  fileId?: string;
  downloadUrl?: string;
  folderId?: string;
  fileName?: string;
}

/**
 * Phần của một hồ sơ mang tham chiếu tới file. `attachedFileObj` là File Object thô
 * do Hub trả về nên không có schema tĩnh — đây là lý do duy nhất dùng `any` ở đây.
 */
export interface EmployeeMdFileSource {
  attachedFileObj?: any;
  attachedFileId?: string;
  attachedFileUrl?: string;
}

export type EmployeeMdWriteRoute = 'update-content' | 'upload-replace';

const MD_DATA_URI_PREFIX = 'data:text/markdown;base64,';

/**
 * Mã lỗi của file-management (`file-management-api.md:1033-1050`) là chuỗi máy đọc.
 * Hiện nguyên xi lên banner thì người dùng không biết phải làm gì tiếp.
 */
const HUB_ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ['error-quota-exceeded', 'Kho lưu trữ của Room đã đầy, cần dọn bớt file rồi lưu lại.'],
  ['error-rate-limited', 'Hub đang chặn vì có quá nhiều yêu cầu, chờ một lát rồi lưu lại.'],
  ['error-file-not-found', 'File hồ sơ không còn tồn tại trong Room.'],
  ['error-folder-not-found', 'Thư mục chứa file hồ sơ không còn tồn tại trong Room.'],
  ['error-forbidden', 'Room từ chối quyền truy cập file này cho tài khoản đang đăng nhập.'],
];

/**
 * `restCall` biến MỌI 403 thành `OptionalFeatureUnavailableError` với câu "quyền tuỳ
 * chọn chưa được cấp". Nhưng `files:read` và `files:write` trong `privos-app.json`
 * đều khai `requirement: "required"`, nên 403 ở đây là Room từ chối theo ACL chứ
 * không phải thiếu scope — hiện đúng câu kia sẽ chỉ sai hướng người dùng. Không sửa
 * được ở gốc vì `privos-rest.ts` là file cấm đụng, nên viết lại câu tại đây.
 */
export function describeFileError(error: unknown): string {
  if (error instanceof OptionalFeatureUnavailableError) {
    return 'Room từ chối quyền truy cập file này cho tài khoản đang đăng nhập.';
  }
  const raw = error instanceof Error ? error.message : String(error || 'lỗi không rõ');
  for (const [code, message] of HUB_ERROR_MESSAGES) {
    if (raw.includes(code)) return message;
  }
  return raw;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function resolveEmployeeMdFileRef(source: EmployeeMdFileSource): EmployeeMdFileRef | null {
  const obj = source.attachedFileObj;
  const ref: EmployeeMdFileRef = {};

  if (typeof obj === 'string' && obj.length > 0) {
    if (obj.startsWith('http') || obj.startsWith('/')) ref.downloadUrl = obj;
    else ref.fileId = obj;
  } else if (obj && typeof obj === 'object') {
    ref.fileId = readString(obj._id) ?? readString(obj.id);
    ref.downloadUrl = readString(obj.downloadUrl) ?? readString(obj.url);
    // File Object của Hub dùng snake_case (`file-management-api.md:37`); bản do
    // `app.uploadFile` trả về có thể đã bọc lại thành camelCase, nên đọc cả hai.
    ref.folderId = readString(obj.folder_id) ?? readString(obj.folderId);
    ref.fileName = readString(obj.name) ?? readString(obj.fileName);
  }

  if (!ref.fileId) ref.fileId = readString(source.attachedFileId);
  if (!ref.downloadUrl) {
    // Luồng cũ có lúc ghi đúng chuỗi "null" vào description, nên phải loại riêng.
    const url = readString(source.attachedFileUrl);
    if (url && url !== 'null') ref.downloadUrl = url;
  }

  if (!ref.fileId && !ref.downloadUrl) return null;
  return ref;
}

export async function readEmployeeMdText(app: McpApp, ref: EmployeeMdFileRef): Promise<string> {
  if (!ref.fileId && !ref.downloadUrl) {
    throw new Error('Hồ sơ này chưa có file Markdown đính kèm để đọc.');
  }

  try {
    return await readRoomFileText(app, { _id: ref.fileId, downloadUrl: ref.downloadUrl });
  } catch (error) {
    const detail = describeFileError(error);
    // Hub có trả kèm `hint: "id matches a folder, not a file"` để tách trường hợp id
    // trỏ nhầm vào thư mục ra khỏi trường hợp file đã bị xoá
    // (`stable-file-id-and-replace-semantics.md:90-102`), nhưng `restCall` chỉ lấy
    // `body.error` và bỏ `hint`, mà `privos-rest.ts` là file cấm đụng. Nên gộp hai
    // nguyên nhân vào một câu thay vì đoán bừa một trong hai.
    if (/not found/i.test(detail) || detail.includes('không còn tồn tại')) {
      throw new Error(
        `Không đọc được file hồ sơ: ${detail}. `
        + 'Id lưu trong thẻ có thể đang trỏ vào thư mục thay vì file, hoặc file đã bị xoá khỏi Room.',
      );
    }
    throw new Error(`Không đọc được file hồ sơ: ${detail}`);
  }
}

/**
 * Ghi đè nội dung file hồ sơ.
 *
 * Đường chính là `POST file-management.files/:fileId/update-content`
 * (`file-management-api.md:370-394`) — nhận fileId nên không phải giải quyết thư mục,
 * không phải encode base64, và không đụng tới xử lý trùng tên.
 *
 * Đường dự phòng là `app.uploadFile` + `duplicateAction: 'replace'`, cần vì chưa xác
 * nhận được path dạng gạch chéo có nằm trong allowlist REST của scope `files:write`
 * hay không. `replace` là upsert tại chỗ và giữ nguyên `_id`
 * (`stable-file-id-and-replace-semantics.md:18-38`) nên link cũ không gãy.
 */
export async function writeEmployeeMdText(
  app: McpApp,
  roomId: string,
  ref: EmployeeMdFileRef,
  content: string,
): Promise<EmployeeMdWriteRoute> {
  let primaryError: unknown;

  if (ref.fileId) {
    try {
      await restCall(app, 'POST', `file-management.files/${ref.fileId}/update-content`, {
        body: { content },
      });
      return 'update-content';
    } catch (error) {
      primaryError = error;
      console.warn('[employee-md-file] update-content that bai, chuyen sang uploadFile replace:', error);
    }
  }

  // Thiếu thư mục hoặc tên file thì upload sẽ rơi vào thư mục gốc và tạo file THỨ HAI
  // thay vì ghi đè, để lại một file mồ côi mà item không trỏ tới. Dừng còn hơn.
  if (!ref.folderId) {
    const reason = primaryError ? describeFileError(primaryError) : 'thẻ không mang id file';
    throw new Error(
      `Không ghi được file hồ sơ: ${reason}. `
      + 'Đường dự phòng cần biết thư mục gốc của file, không có thì dừng để khỏi tạo file lạc chỗ.',
    );
  }
  if (!ref.fileName) {
    const reason = primaryError ? describeFileError(primaryError) : 'thẻ không mang id file';
    throw new Error(
      `Không ghi được file hồ sơ: ${reason}. `
      + 'Đường dự phòng cần biết tên file gốc, không có thì dừng để khỏi tạo file lạc chỗ.',
    );
  }

  try {
    await app.uploadFile({
      channelId: roomId,
      fileName: ref.fileName,
      folderId: ref.folderId,
      base64Data: MD_DATA_URI_PREFIX + btoa(unescape(encodeURIComponent(content))),
      mimeType: 'text/markdown',
      duplicateAction: 'replace',
    });
  } catch (error) {
    throw new Error(`Không ghi được file hồ sơ: ${describeFileError(error)}`);
  }

  return 'upload-replace';
}
```

- [ ] **Step 4: Chạy test để xác nhận nó pass**

Run: `npx vitest run tests/employee-md-file.spec.ts`
Expected: PASS — 12 test.

- [ ] **Step 5: Viết test cho giao dịch lưu**

Tạo `tests/employee-md-save.spec.ts` với đúng nội dung sau:

```ts
import { describe, expect, it } from 'vitest';
import { saveEmployeeMd } from '../src/ui/lifecycle/services/employee-md-save';

function createAppStub(options: { restStatus?: number } = {}) {
  const app = {
    async rest() {
      return { statusCode: options.restStatus ?? 200, body: { success: true } };
    },
    async uploadFile() {
      return { file: { _id: 'file-1' } };
    },
  };
  return app as any;
}

const REF = { fileId: 'file-1', folderId: 'folder-9', fileName: 'ho-so.md' };

describe('saveEmployeeMd', () => {
  it('ghi file truoc roi moi dong bo item', async () => {
    const order: string[] = [];
    const app = {
      async rest() {
        order.push('write-file');
        return { statusCode: 200, body: { success: true } };
      },
    } as any;

    const result = await saveEmployeeMd({
      app,
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { order.push('sync-item'); },
    });

    expect(result).toEqual({ status: 'saved', route: 'update-content' });
    expect(order).toEqual(['write-file', 'sync-item']);
  });

  it('bao saved-item-stale khi file da ghi xong nhung the chua cap nhat', async () => {
    // Thu nguoi dung vua go DA an toan trong file; chi the Kanban la cu. Bao that bai
    // chung chung se khien ho go lai tu dau va ghi de len ban vua luu dung.
    const result = await saveEmployeeMd({
      app: createAppStub(),
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { throw new Error('updateItem bi tu choi'); },
    });

    expect(result.status).toBe('saved-item-stale');
    expect(result.route).toBe('update-content');
    expect(result).toHaveProperty('detail', 'updateItem bi tu choi');
  });

  it('khong dong bo item khi ghi file that bai', async () => {
    // Dong bo the trong khi file chua ghi duoc se lam the noi mot dang, file noi mot neo.
    let synced = false;
    const app = {
      async rest() { return { statusCode: 500, body: { error: 'MinIO down' } }; },
      async uploadFile() { throw new Error('MinIO down'); },
    } as any;

    await expect(saveEmployeeMd({
      app,
      roomId: 'room-1',
      ref: REF,
      content: '# noi dung',
      syncItem: async () => { synced = true; },
    })).rejects.toThrow(/MinIO down/);
    expect(synced).toBe(false);
  });
});
```

- [ ] **Step 6: Chạy test để xác nhận nó fail**

Run: `npx vitest run tests/employee-md-save.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/lifecycle/services/employee-md-save"`.

- [ ] **Step 7: Viết module giao dịch lưu**

Tạo `src/ui/lifecycle/services/employee-md-save.ts` với đúng nội dung sau:

```ts
import type { McpApp } from '@privos_ai/app-react';
import {
  EmployeeMdFileRef,
  EmployeeMdWriteRoute,
  describeFileError,
  writeEmployeeMdText,
} from './employee-md-file';

export type SaveEmployeeMdResult =
  | { status: 'saved'; route: EmployeeMdWriteRoute }
  | { status: 'saved-item-stale'; route: EmployeeMdWriteRoute; detail: string };

export interface SaveEmployeeMdParams {
  app: McpApp;
  roomId: string;
  ref: EmployeeMdFileRef;
  content: string;
  /** Cập nhật item trong list. Lỗi ở đây không làm hỏng phần đã ghi vào file. */
  syncItem: () => Promise<void>;
}

/**
 * Lưu hồ sơ: ghi file TRƯỚC, đồng bộ item SAU.
 *
 * Thứ tự này là bắt buộc. Hỏng ở bước item thì thứ người dùng vừa gõ đã an toàn trong
 * file, chỉ thẻ Kanban là cũ — gọi lần sau là khớp lại. Ngược thứ tự thì thẻ nói một
 * đằng, file nói một nẻo, và bản ghi thật (file) là bản cũ.
 */
export async function saveEmployeeMd(params: SaveEmployeeMdParams): Promise<SaveEmployeeMdResult> {
  const route = await writeEmployeeMdText(params.app, params.roomId, params.ref, params.content);

  try {
    await params.syncItem();
  } catch (error) {
    return { status: 'saved-item-stale', route, detail: describeFileError(error) };
  }

  return { status: 'saved', route };
}
```

- [ ] **Step 8: Chạy test để xác nhận nó pass**

Run: `npx vitest run tests/employee-md-save.spec.ts`
Expected: PASS — 3 test.

- [ ] **Step 9: Typecheck và chạy lại toàn bộ test**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch. Test: 320 test, 319 pass, 1 fail — đúng cái `tests/manifest.spec.ts` có sẵn.

**Không commit.**

---

### Task 3: Đồng bộ ngược vào item trong list

**Files:**
- Modify: `src/ui/lifecycle/types.ts:1-46`
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:149-185` (chèn method mới ngay sau `updateProfileStatus`)
- Test: `tests/lifecycle-update-profile-fields.spec.ts`

**Interfaces:**
- Consumes: `buildCustomFieldsForCreation(data, fieldDefinitions)` và `ensureValidList(roomId)` — hai private method đã có sẵn trong `PrivOSLifecycleService`.
- Produces:
  - `interface UpdateProfileFieldsInput { name: string; phone?: string; email?: string; position?: string; department?: string; startDate?: string; sourceCandidateId?: string; attachedFileId?: string; attachedFileUrl?: string }`
  - `ILifecycleService.updateProfileFields(roomId: string, profileId: string, data: UpdateProfileFieldsInput): Promise<void>`

**Bối cảnh cho người làm:** `mcpapp.lists.updateItem` nhận `itemId`, `title`, `description`, `customFields` (`tools_lists.md:421-442`). Hai điều phải cẩn thận:

1. Tài liệu chỉ ghi `customFields` là "New custom field values" (`privos-dev-docs/room-scoped-apis/items.md:213`), không nói merge hay replace. Nên **luôn gửi mảng đầy đủ** dựng từ toàn bộ `fieldDefinitions` — an toàn với cả hai ngữ nghĩa. `buildCustomFieldsForCreation` đã làm đúng việc đó, tái dùng nó.
2. `description` bị thay **nguyên khối**, mà description đang chứa cả `[sourceCandidateId:...]` lẫn `[fileId:...]`. Ghi đè mù sẽ làm mất liên kết tới ứng viên nguồn. Phải dựng lại đủ.

Chỉ `PrivOSLifecycleService` implement `ILifecycleService` (đã kiểm tra toàn repo), và không test nào dựng fake của interface này, nên thêm method là an toàn.

- [ ] **Step 1: Viết test trước**

Tạo `tests/lifecycle-update-profile-fields.spec.ts` với đúng nội dung sau:

```ts
import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return { content: [{ type: 'text', text: JSON.stringify(handler(call.arguments ?? {})) }] };
    },
  };
  return { app, calls };
}

const STAGES = [{ _id: 'stage-1', name: 'Mới nhận việc' }];

const HR_LIST = {
  _id: 'list-1',
  name: '[HR-MCP-App] Hồ sơ nhân sự',
  fieldDefinitions: [
    { _id: 'fd-phone', name: 'Số điện thoại', type: 'TEXT' },
    { _id: 'fd-email', name: 'Email', type: 'TEXT' },
    { _id: 'fd-pos', name: 'Vị trí', type: 'SELECT', options: [{ _id: 'opt-dev', value: 'Developer' }] },
    { _id: 'fd-doc', name: 'Hồ sơ đính kèm', type: 'DOCUMENT' },
  ],
};

const CONFIG_ITEM = {
  _id: 'cfg-1',
  name: '[Hệ thống] Không xoá - Cấu hình Kanban',
  description: JSON.stringify(STAGES),
};

function healthyRoom() {
  return {
    'mcpapp.lists.getAll': () => [HR_LIST],
    'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
    'mcpapp.lists.updateItem': () => ({ updated: true }),
  };
}

describe('PrivOSLifecycleService.updateProfileFields', () => {
  it('gui mang customFields day du chu khong chi truong da doi', async () => {
    // Tai lieu khong noi customFields la merge hay replace
    // (`room-scoped-apis/items.md:213`). Gui day du thi dung voi ca hai nghia.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      phone: '0909999999',
      email: 'b@example.com',
      position: 'Developer',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update).toBeDefined();
    expect(update!.arguments!.itemId).toBe('item-1');
    expect(update!.arguments!.title).toBe('Nguyen Van B');
    expect(update!.arguments!.customFields).toEqual([
      { fieldId: 'fd-phone', value: '0909999999' },
      { fieldId: 'fd-email', value: 'b@example.com' },
      { fieldId: 'fd-pos', value: 'opt-dev' },
    ]);
  });

  it('dung lai description du ca sourceCandidateId lan fileId', async () => {
    // `updateItem` thay description nguyen khoi. Ghi de mu se lam mat lien ket toi
    // ung vien nguon, va thanh Kanban mat luon duong dan toi file ho so.
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      sourceCandidateId: 'cand-7',
      attachedFileId: 'file-1',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    const description = String(update!.arguments!.description);
    expect(description).toContain('[sourceCandidateId:cand-7]');
    expect(description).toContain('[fileId:file-1]');
  });

  it('dung fileUrl khi khong co fileId', async () => {
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', {
      name: 'Nguyen Van B',
      attachedFileUrl: 'https://minio/ho-so.md',
    });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(String(update!.arguments!.description)).toContain('[fileUrl:https://minio/ho-so.md]');
  });

  it('khong gui description khi khong co marker nao de ghi', async () => {
    const { app, calls } = createAppStub(healthyRoom());
    const service = new PrivOSLifecycleService(app as any);

    await service.updateProfileFields('room-1', 'item-1', { name: 'Nguyen Van B' });

    const update = calls.find(c => c.name === 'mcpapp.lists.updateItem');
    expect(update!.arguments).not.toHaveProperty('description');
  });

  it('nem loi thay vi im lang khi khong lay duoc danh sach ho so', async () => {
    const { app } = createAppStub({ 'mcpapp.lists.getAll': () => { throw new Error('Hub down'); } });
    const service = new PrivOSLifecycleService(app as any);

    await expect(service.updateProfileFields('room-1', 'item-1', { name: 'X' }))
      .rejects.toThrow(/Hub down/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `npx vitest run tests/lifecycle-update-profile-fields.spec.ts`
Expected: FAIL — `service.updateProfileFields is not a function`.

- [ ] **Step 3: Thêm kiểu vào `types.ts`**

Trong `src/ui/lifecycle/types.ts`, thay khối `EmployeeProfile` hiện tại:

```ts
export interface EmployeeProfile {
  _id: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  startDate?: string;
  sourceCandidateId?: string;
  attachedFileObj?: any;
}
```

bằng:

```ts
export interface EmployeeProfile {
  _id: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  startDate?: string;
  sourceCandidateId?: string;
  attachedFileObj?: any;
  /** Bóc từ `[fileId:...]` trong description của item. */
  attachedFileId?: string;
  /** Bóc từ `[fileUrl:...]` trong description của item. */
  attachedFileUrl?: string;
}
```

Rồi thay khối `ILifecycleService` hiện tại:

```ts
export interface ILifecycleService {
  loadProfiles(roomId: string): Promise<EmployeeProfile[]>;
  loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>;
  createProfile(roomId: string, data: Omit<EmployeeProfile, '_id' | 'status'> & { attachedFileObj?: any }): Promise<EmployeeProfile>;
  updateProfileStatus(roomId: string, profileId: string, newStatus: string): Promise<void>;
}
```

bằng:

```ts
/** Các trường của một hồ sơ được đồng bộ ngược từ file Markdown vào item trong list. */
export interface UpdateProfileFieldsInput {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  startDate?: string;
  sourceCandidateId?: string;
  attachedFileId?: string;
  attachedFileUrl?: string;
}

export interface ILifecycleService {
  loadProfiles(roomId: string): Promise<EmployeeProfile[]>;
  loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>;
  createProfile(roomId: string, data: Omit<EmployeeProfile, '_id' | 'status'> & { attachedFileObj?: any }): Promise<EmployeeProfile>;
  updateProfileStatus(roomId: string, profileId: string, newStatus: string): Promise<void>;
  updateProfileFields(roomId: string, profileId: string, data: UpdateProfileFieldsInput): Promise<void>;
}
```

- [ ] **Step 4: Cài method trong `PrivOSLifecycleService`**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, đổi dòng import đầu file:

```ts
import { EmployeeProfile, ILifecycleService, PassedCandidate } from '../types';
```

thành:

```ts
import { EmployeeProfile, ILifecycleService, PassedCandidate, UpdateProfileFieldsInput } from '../types';
```

Rồi chèn method sau vào ngay sau khi `updateProfileStatus` kết thúc (sau dấu `}` ở dòng 185, trước dòng comment `// --- Private Helper Methods ---`):

```ts
  /**
   * Đồng bộ các trường của một hồ sơ ngược vào item trong list, sau khi file Markdown
   * đã được ghi xong.
   *
   * `customFields` luôn gửi mảng ĐẦY ĐỦ dựng từ toàn bộ `fieldDefinitions`: tài liệu
   * chỉ nói đó là "New custom field values" (`room-scoped-apis/items.md:213`) mà không
   * nói merge hay replace, nên gửi đủ là cách duy nhất đúng với cả hai nghĩa.
   *
   * `description` bị `updateItem` thay nguyên khối, mà nó đang chứa cả marker ứng viên
   * nguồn lẫn marker file. Ghi đè mù sẽ cắt đứt hai liên kết đó, nên phải dựng lại.
   *
   * Không nuốt lỗi: người gọi cần phân biệt được "đã ghi file xong nhưng thẻ chưa cập
   * nhật" với "hỏng hoàn toàn".
   */
  async updateProfileFields(
    roomId: string,
    profileId: string,
    data: UpdateProfileFieldsInput,
  ): Promise<void> {
    const list = await this.ensureValidList(roomId);
    if (!list || !(list._id || list.id)) {
      throw new Error(`Không lấy được danh sách hồ sơ nhân sự hợp lệ của room ${roomId}.`);
    }

    const customFields = this.buildCustomFieldsForCreation(data, list.fieldDefinitions);

    const descriptionParts: string[] = [];
    if (data.sourceCandidateId) {
      descriptionParts.push(`[sourceCandidateId:${data.sourceCandidateId}]`);
    }
    if (data.attachedFileId) {
      descriptionParts.push(`[fileId:${data.attachedFileId}]`);
    } else if (data.attachedFileUrl) {
      descriptionParts.push(`[fileUrl:${data.attachedFileUrl}]`);
    }

    await this.app.callServerTool({
      name: 'mcpapp.lists.updateItem',
      arguments: {
        itemId: profileId,
        title: data.name,
        customFields,
        ...(descriptionParts.length > 0 ? { description: descriptionParts.join('\n\n') } : {}),
      },
    });
  }
```

- [ ] **Step 5: Chạy test để xác nhận nó pass**

Run: `npx vitest run tests/lifecycle-update-profile-fields.spec.ts`
Expected: PASS — 5 test.

- [ ] **Step 6: Typecheck và chạy lại toàn bộ test**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch. Test: 325 test, 324 pass, 1 fail — đúng cái `tests/manifest.spec.ts` có sẵn.

**Không commit.**

---

### Task 4: Form tạo dùng chung renderer

**Files:**
- Modify: `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx:1-6` (import) và `:214-241` (khối render Markdown)

**Interfaces:**
- Consumes: `renderEmployeeMd(doc: EmployeeMdDocument, template: string): string` từ Task 1.
- Produces: không có API mới.

**Bối cảnh cho người làm:** hiện form tạo tự thay 22 chỗ trống bằng 22 lệnh `.replace` với **chuỗi** thay thế. Hai vấn đề: (a) form sửa sẽ dùng một renderer khác, hai bên dễ trôi ra khác nhau; (b) `String.replace` với chuỗi thay thế diễn giải `$&` và `$1` thành pattern, nên một địa chỉ hay tên chứa `$` bị biến dạng ngay ở form tạo. Chuyển sang renderer chung sửa cả hai.

Lưu ý: `formData.momoWallet` được form thu thập nhưng **không có** chỗ trống nào trong template nhận nó. Đó là trường chết sẵn có — **không đụng tới nó** trong task này.

- [ ] **Step 1: Thêm import**

Trong `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx`, ngay sau dòng:

```ts
import employeeTemplateRaw from '../../data/employee_template.md?raw';
```

thêm dòng:

```ts
import { renderEmployeeMd } from '../employee-md-document';
```

- [ ] **Step 2: Thay khối render**

Thay toàn bộ khối hiện tại (từ `// 3. Generate Markdown content` tới hết dòng `mdContent = mdContent.replace('[IMAGE_LINK]', imgLinkStr);`):

```ts
      // 3. Generate Markdown content
      let mdContent = employeeTemplateRaw;
      mdContent = mdContent.replace('[LOCAL_ID]', `NV${Date.now().toString().slice(-6)}`);
      mdContent = mdContent.replace('[CREATE_DATE]', new Date().toLocaleDateString('vi-VN'));
      mdContent = mdContent.replace('[FULL_NAME]', trimmedName);
      mdContent = mdContent.replace('[POSITION]', formData.position);
      mdContent = mdContent.replace('[DEPARTMENT]', formData.department);
      mdContent = mdContent.replace('[START_DATE]', formData.onboardingDate);
      mdContent = mdContent.replace('[PHONE]', trimmedPhone);
      mdContent = mdContent.replace('[EMAIL]', trimmedEmail);
      mdContent = mdContent.replace('[TELEGRAM]', formData.telegram);
      mdContent = mdContent.replace('[EMERGENCY]', formData.emergencyContact);
      mdContent = mdContent.replace('[DOB]', formData.dob);
      mdContent = mdContent.replace('[ID_NUMBER]', formData.idNumber);
      mdContent = mdContent.replace('[ID_DATE]', formData.idIssueDate);
      mdContent = mdContent.replace('[ID_PLACE]', formData.idIssuePlace);
      mdContent = mdContent.replace('[PERM_ADDRESS]', formData.permanentAddress);
      mdContent = mdContent.replace('[CUR_ADDRESS]', formData.currentAddress);
      mdContent = mdContent.replace('[BANK_ACCOUNT]', formData.bankAccount);
      mdContent = mdContent.replace('[BANK_NAME]', formData.bankName);
      mdContent = mdContent.replace('[TAX_CODE]', formData.taxCode);
      mdContent = mdContent.replace('[SOCIAL_INSURANCE]', formData.socialInsurance);
      mdContent = mdContent.replace('[VEHICLE_TYPE]', formData.vehicleType);
      mdContent = mdContent.replace('[VEHICLE_PLATE]', formData.vehiclePlate);
      
      let imgLinkStr = idPhoto ? `*Ảnh thẻ và các tài liệu liên quan được lưu trữ cùng thư mục với hồ sơ này.*` : '*Chưa có ảnh đính kèm*';
      mdContent = mdContent.replace('[IMAGE_LINK]', imgLinkStr);
```

bằng:

```ts
      // 3. Generate Markdown content
      // Dùng chung renderer với form sửa để hai bên không bao giờ sinh ra hai định
      // dạng khác nhau, và để giá trị chứa `$&` hay `$1` không bị `String.replace`
      // diễn giải thành pattern thay thế.
      const mdContent = renderEmployeeMd({
        localId: `NV${Date.now().toString().slice(-6)}`,
        createDate: new Date().toLocaleDateString('vi-VN'),
        fullName: trimmedName,
        position: formData.position,
        department: formData.department,
        startDate: formData.onboardingDate,
        phone: trimmedPhone,
        email: trimmedEmail,
        telegram: formData.telegram,
        emergency: formData.emergencyContact,
        dob: formData.dob,
        idNumber: formData.idNumber,
        idDate: formData.idIssueDate,
        idPlace: formData.idIssuePlace,
        permAddress: formData.permanentAddress,
        curAddress: formData.currentAddress,
        bankAccount: formData.bankAccount,
        bankName: formData.bankName,
        taxCode: formData.taxCode,
        socialInsurance: formData.socialInsurance,
        vehicleType: formData.vehicleType,
        vehiclePlate: formData.vehiclePlate,
        imageLink: idPhoto
          ? '*Ảnh thẻ và các tài liệu liên quan được lưu trữ cùng thư mục với hồ sơ này.*'
          : '*Chưa có ảnh đính kèm*',
      }, employeeTemplateRaw);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sạch. Nếu báo lỗi về `mdContent` đã là `const` mà còn bị gán lại, nghĩa là còn sót dòng `.replace` chưa xoá — xoá nốt.

- [ ] **Step 4: Chạy lại toàn bộ test**

Run: `npm test`
Expected: 325 test, 324 pass, 1 fail — đúng cái `tests/manifest.spec.ts` có sẵn. Không test nào đổi trạng thái so với Task 3.

**Không commit.**

---

### Task 5: Modal sửa và hai nút mở nó

**Files:**
- Create: `src/ui/lifecycle/components/EditProfileModal.tsx`
- Modify: `src/ui/lifecycle/components/ProfileCard.tsx:1-16` (import, state), `:198-219` (khối file đính kèm), `:255-259` (mount modal)
- Modify: `src/ui/lifecycle/components/ProfileListView.tsx:1-16` (import, state), `:229-242` (cột thao tác), `:249-255` (mount modal)

**Interfaces:**
- Consumes:
  - `EmployeeMdDocument`, `parseEmployeeMd`, `renderEmployeeMd` từ `../employee-md-document` (Task 1)
  - `EmployeeMdFileRef`, `describeFileError`, `readEmployeeMdText`, `resolveEmployeeMdFileRef` từ `../services/employee-md-file` (Task 2)
  - `saveEmployeeMd` từ `../services/employee-md-save` (Task 2)
  - `ILifecycleService.updateProfileFields(roomId, profileId, data)` qua `useLifecycleService()` (Task 3)
- Produces: `function EditProfileModal(props: { profile: EmployeeProfile; onClose: () => void })`

**Bối cảnh cho người làm:**

- Repo **không có** React Testing Library, nên task này không có unit test. Toàn bộ logic có thể sai đã nằm ở Task 1-3 và đã được test. Cổng duy nhất ở đây là `npm run typecheck`.
- `ProfileCard` và `ProfileListView` đều nằm dưới `LifecycleServiceProvider` (được bọc ở `LifecycleDashboard.tsx:398`), nên gọi `useLifecycleService()` trong hai file đó là hợp lệ.
- **Không sửa `LifecycleDashboard.tsx`.** Không cần: polling 3 giây ở đó tự kéo item đã cập nhật về sau khi lưu.
- Lớp CSS dùng lại của form tạo: `hr-form-panel`, `hr-form-title`, `hr-label`, `hr-input`, `hr-btn`, `hr-btn-accent`, `hr-btn-subtle`, `hr-status-banner`, `hr-status-success`, `hr-status-error`, `hr-btn-mini`, `spinner`.
- **Không dùng emoji hay icon** trong file mới.

- [ ] **Step 1: Tạo modal**

Tạo `src/ui/lifecycle/components/EditProfileModal.tsx` với đúng nội dung sau:

```tsx
import React, { useEffect, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import employeeTemplateRaw from '../../data/employee_template.md?raw';
import { EmployeeProfile } from '../types';
import { useLifecycleService } from '../di/LifecycleContext';
import { EmployeeMdDocument, parseEmployeeMd, renderEmployeeMd } from '../employee-md-document';
import {
  EmployeeMdFileRef,
  describeFileError,
  readEmployeeMdText,
  resolveEmployeeMdFileRef,
} from '../services/employee-md-file';
import { saveEmployeeMd } from '../services/employee-md-save';

interface EditProfileModalProps {
  profile: EmployeeProfile;
  onClose: () => void;
}

interface FieldDef {
  key: keyof EmployeeMdDocument;
  label: string;
  type?: 'text' | 'date';
  fullWidth?: boolean;
}

/**
 * `imageLink`, `localId` và `createDate` cố tình không có ở đây: hai cái sau là danh
 * tính của hồ sơ, cái đầu là dòng mô tả ảnh do luồng tạo sinh ra. Cả ba được mang
 * nguyên văn từ file gốc sang bản ghi mới.
 */
const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: '1. Thông tin chung',
    fields: [
      { key: 'fullName', label: 'Họ và Tên' },
      { key: 'position', label: 'Vị trí công việc' },
      { key: 'department', label: 'Phòng ban' },
      { key: 'startDate', label: 'Ngày bắt đầu làm việc', type: 'date' },
    ],
  },
  {
    title: '2. Liên hệ',
    fields: [
      { key: 'phone', label: 'Số điện thoại' },
      { key: 'email', label: 'Email công việc' },
      { key: 'telegram', label: 'Telegram' },
      { key: 'emergency', label: 'Liên hệ khẩn cấp' },
    ],
  },
  {
    title: '3. Thông tin cá nhân',
    fields: [
      { key: 'dob', label: 'Ngày sinh', type: 'date' },
      { key: 'idNumber', label: 'Số CMND/CCCD' },
      { key: 'idDate', label: 'Ngày cấp', type: 'date' },
      { key: 'idPlace', label: 'Nơi cấp' },
      { key: 'permAddress', label: 'Địa chỉ thường trú', fullWidth: true },
      { key: 'curAddress', label: 'Chỗ ở hiện tại', fullWidth: true },
    ],
  },
  {
    title: '4. Tài chính và phương tiện',
    fields: [
      { key: 'bankAccount', label: 'Số tài khoản ngân hàng' },
      { key: 'bankName', label: 'Tên ngân hàng / Chi nhánh' },
      { key: 'taxCode', label: 'Mã số thuế (PIT)' },
      { key: 'socialInsurance', label: 'Số sổ BHXH' },
      { key: 'vehicleType', label: 'Loại xe' },
      { key: 'vehiclePlate', label: 'Biển số xe' },
    ],
  },
];

export function EditProfileModal({ profile, onClose }: EditProfileModalProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const service = useLifecycleService();

  const [fileRef, setFileRef] = useState<EmployeeMdFileRef | null>(null);
  const [doc, setDoc] = useState<EmployeeMdDocument | null>(null);
  const [missingLabels, setMissingLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!app) {
        setLoadError('Chưa kết nối được với PrivOS App.');
        setIsLoading(false);
        return;
      }

      const ref = resolveEmployeeMdFileRef(profile);
      if (!ref) {
        setLoadError('Hồ sơ này chưa có file Markdown đính kèm nên không sửa được bằng form.');
        setIsLoading(false);
        return;
      }

      try {
        const text = await readEmployeeMdText(app, ref);
        const parsed = parseEmployeeMd(text);
        if (!isMounted) return;

        // Form này render lại TOÀN BỘ file từ template khi lưu. Mở form trên một file
        // không đọc được nghĩa là bấm lưu sẽ xoá sạch nội dung của nó, nên từ chối mở.
        if (!parsed) {
          setLoadError(
            'File đính kèm không theo mẫu hồ sơ nhân sự nên không sửa được bằng form. '
            + 'Mở file trực tiếp trong Room để xem hoặc sửa tay.',
          );
          setIsLoading(false);
          return;
        }

        setFileRef(ref);
        setDoc(parsed.doc);
        setMissingLabels(parsed.missingLabels);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(describeFileError(error));
        setIsLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [app, profile]);

  const handleChange = (key: keyof EmployeeMdDocument, value: string) => {
    setDoc(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!app || !roomId || !doc || !fileRef || isSaving) return;

    setSaveError('');
    setSaveNotice('');

    if (!doc.fullName.trim()) {
      setSaveError('Vui lòng nhập Họ và Tên nhân sự.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveEmployeeMd({
        app,
        roomId,
        ref: fileRef,
        content: renderEmployeeMd(doc, employeeTemplateRaw),
        syncItem: () => service.updateProfileFields(roomId, profile._id, {
          name: doc.fullName.trim(),
          phone: doc.phone.trim(),
          email: doc.email.trim(),
          position: doc.position.trim(),
          department: doc.department.trim(),
          startDate: doc.startDate.trim(),
          sourceCandidateId: profile.sourceCandidateId,
          attachedFileId: fileRef.fileId,
          attachedFileUrl: fileRef.downloadUrl,
        }),
      });

      if (result.status === 'saved-item-stale') {
        setSaveNotice(
          `Đã lưu file hồ sơ, nhưng chưa cập nhật được thẻ trên bảng: ${result.detail}. `
          + 'Nội dung bạn vừa nhập đã an toàn trong file; bấm lưu lại để đồng bộ thẻ.',
        );
      }
      setIsSaved(true);
    } catch (error) {
      setSaveError(describeFileError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
        display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="hr-form-panel"
        style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="hr-form-title" style={{ margin: 0 }}>Sửa hồ sơ: {profile.name}</h3>
          <button type="button" className="hr-btn hr-btn-subtle" onClick={onClose} title="Đóng form">
            Đóng
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40 }}>
            <div className="spinner"></div>
            <p style={{ marginTop: 16 }}>Đang đọc file hồ sơ...</p>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="hr-status-banner hr-status-error">
            <span>{loadError}</span>
          </div>
        )}

        {!isLoading && !loadError && doc && (
          <form onSubmit={handleSubmit}>
            {isSaved && (
              <div className="hr-status-banner hr-status-success">
                <span>Đã lưu hồ sơ.</span>
              </div>
            )}

            {saveNotice && (
              <div className="hr-status-banner hr-status-error">
                <span>{saveNotice}</span>
              </div>
            )}

            {saveError && (
              <div className="hr-status-banner hr-status-error">
                <span>{saveError}</span>
              </div>
            )}

            {missingLabels.length > 0 && (
              <div className="hr-status-banner hr-status-error">
                <span>
                  Không đọc được các mục sau trong file: {missingLabels.join(', ')}.
                  Bấm lưu sẽ ghi giá trị trong form đè lên chúng, nên hãy kiểm tra lại trước khi lưu.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Mã nhân sự: <strong>{doc.localId || 'không có'}</strong></span>
              <span>Ngày tạo hồ sơ: <strong>{doc.createDate || 'không có'}</strong></span>
            </div>

            {SECTIONS.map(section => (
              <div key={section.title}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, fontSize: '1.1rem' }}>
                  {section.title}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
                  {section.fields.map(field => (
                    <div key={field.key} style={field.fullWidth ? { gridColumn: '1 / -1' } : undefined}>
                      <label className="hr-label">{field.label}</label>
                      <input
                        className="hr-input"
                        type={field.type === 'date' ? 'date' : 'text'}
                        value={doc[field.key]}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="hr-btn" onClick={onClose} disabled={isSaving}>
                Đóng
              </button>
              <button type="submit" className="hr-btn hr-btn-accent" disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Thêm nút Sửa vào `ProfileCard.tsx`**

Đổi khối import đầu file từ:

```tsx
import React, { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';
```

thành:

```tsx
import React, { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';
import { EditProfileModal } from './EditProfileModal';
import { resolveEmployeeMdFileRef } from '../services/employee-md-file';
```

Ngay sau dòng `const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);` thêm:

```tsx
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // Không có file Markdown thì không có gì để đọc vào form, nên khoá nút thay vì mở
  // một form trống — lưu form trống sẽ ghi đè sạch file.
  const canEditMd = resolveEmployeeMdFileRef(profile) !== null;
```

Trong khối hiển thị file đính kèm, thay dòng đóng:

```tsx
                  {getFileName(profile)}
                </a>
              </div>
            </div>
          )}
```

bằng:

```tsx
                  {getFileName(profile)}
                </a>
              </div>
              {canEditMd && (
                <button
                  type="button"
                  className="hr-icon-btn"
                  title="Sửa thông tin trong file hồ sơ"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditModalOpen(true);
                  }}
                >
                  Sửa
                </button>
              )}
            </div>
          )}
```

Cuối cùng, thay khối mount modal ở cuối component từ:

```tsx
    <EmailComposerModal 
        isOpen={isEmailModalOpen} 
        onClose={() => setIsEmailModalOpen(false)} 
        profile={profile} 
      />
    </>
```

thành:

```tsx
    <EmailComposerModal 
        isOpen={isEmailModalOpen} 
        onClose={() => setIsEmailModalOpen(false)} 
        profile={profile} 
      />

    {isEditModalOpen && (
      <EditProfileModal profile={profile} onClose={() => setIsEditModalOpen(false)} />
    )}
    </>
```

- [ ] **Step 3: Thêm nút Sửa vào `ProfileListView.tsx`**

Đổi khối import đầu file từ:

```tsx
import { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';
```

thành:

```tsx
import { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';
import { EditProfileModal } from './EditProfileModal';
import { resolveEmployeeMdFileRef } from '../services/employee-md-file';
```

Ngay sau dòng `const [emailProfile, setEmailProfile] = useState<EmployeeProfile | null>(null);` thêm:

```tsx
  const [editProfile, setEditProfile] = useState<EmployeeProfile | null>(null);
```

Thay toàn bộ ô thao tác:

```tsx
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {nextColumn && onMoveProfile && (
                      <button
                        type="button"
                        className="hr-btn-mini hr-btn-mini-accent"
                        onClick={() => onMoveProfile(profile._id, nextColumn.status)}
                        title={`Chuyển sang [${nextColumn.status}]`}
                      >
                        → {nextColumn.status}
                      </button>
                    )}
                  </div>
                </td>
```

bằng:

```tsx
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {resolveEmployeeMdFileRef(profile) !== null && (
                      <button
                        type="button"
                        className="hr-btn-mini"
                        onClick={() => setEditProfile(profile)}
                        title="Sửa thông tin trong file hồ sơ"
                      >
                        Sửa
                      </button>
                    )}
                    {nextColumn && onMoveProfile && (
                      <button
                        type="button"
                        className="hr-btn-mini hr-btn-mini-accent"
                        onClick={() => onMoveProfile(profile._id, nextColumn.status)}
                        title={`Chuyển sang [${nextColumn.status}]`}
                      >
                        → {nextColumn.status}
                      </button>
                    )}
                  </div>
                </td>
```

Thay khối mount modal ở cuối từ:

```tsx
      {emailProfile && (
        <EmailComposerModal 
          isOpen={true} 
          onClose={() => setEmailProfile(null)} 
          profile={emailProfile} 
        />
      )}
```

bằng:

```tsx
      {emailProfile && (
        <EmailComposerModal 
          isOpen={true} 
          onClose={() => setEmailProfile(null)} 
          profile={emailProfile} 
        />
      )}

      {editProfile && (
        <EditProfileModal profile={editProfile} onClose={() => setEditProfile(null)} />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sạch.

- [ ] **Step 5: Chạy lại toàn bộ test**

Run: `npm test`
Expected: 325 test, 324 pass, 1 fail — đúng cái `tests/manifest.spec.ts` có sẵn. Task này không thêm test vì repo không có React Testing Library.

- [ ] **Step 6: Build để chắc chắn Vite nuốt được import `?raw` ở module mới**

Run: `npm run build`
Expected: build xong, không lỗi.

**Không commit.**

---

## Kiểm thử thủ công sau khi xong (người dùng tự làm trên Room thật)

Không tự động hoá được vì cần một Room PrivOS thật. Thứ tự nên thử:

1. Mở tab Hồ sơ nhân sự, tạo một hồ sơ mới bằng form tạo. Xác nhận file MD xuất hiện trong `hr-miniapp/employees/...`.
2. Bấm "Sửa" trên thẻ vừa tạo. Form phải hiện đúng mọi giá trị vừa nhập, kể cả số tài khoản và nơi cấp CCCD.
3. Đổi số điện thoại và tên ngân hàng, bấm lưu. Mở file MD trong Room: hai giá trị phải đổi, mọi giá trị khác giữ nguyên, và **đường dẫn file cũ vẫn mở được** (nghĩa là `_id` được giữ).
4. Sau 3 giây, thẻ Kanban phải hiện số điện thoại mới mà không cần tải lại trang.
5. Mở Console, tìm dòng `update-content that bai` — nếu có, nghĩa là đường chính không nằm trong allowlist và hệ thống đang chạy bằng đường dự phòng. Ghi lại để quyết định có cần xin thêm quyền hay không.
6. Thử trên một item tạo tay trực tiếp trong giao diện Lists của Room (không có file đính kèm): nút "Sửa" phải không xuất hiện.

---

## Ghi chú rủi ro đã biết, không thuộc phạm vi plan này

1. **File MD đang là dữ liệu công khai trong phòng.** `PrivOSLifecycleService.createNewList` (`:310-319`) tạo list không có `isolatedList: true`, và file nằm trong thư mục channel-public. Nội dung gồm số CCCD, địa chỉ thường trú, số tài khoản ngân hàng, mã số thuế, số BHXH. Trước plan này mọi thành viên phòng đã đọc được; sau plan này mọi thành viên phòng cũng ghi được. Cơ chế của nền tảng cho bài toán này là isolated list + `additionalEditors` (`privos-dev-docs/APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:30-50`).

2. **Nếu bật `isolatedList: true` thì `fetchAllListItems` sẽ hỏng.** Trên isolated list, `getItems` trả tập đã lọc theo ACL của người đọc — "a shorter list is correct, not an error" (`APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:140-142`). `src/ui/list-item-paging.ts` đang đối chiếu số item đọc được với `total` của Hub rồi đọc lại 3 lượt và ném lỗi khi lệch. Hôm nay không nổ vì list không isolated.

3. **Agent AI trong phòng có thể ghi đè file.** Sandbox giữ bản local và push đè lên MinIO (`privos-dev-docs/file-management/sync-deletion-recovery.md:18-35`). Một lượt chạy agent đang ôm bản MD cũ có thể ghi đè mất bản vừa sửa. Không sửa được từ phía app.

4. **Hai người sửa cùng lúc: last-write-wins**, không có phát hiện xung đột.

5. **Đổi tên hoặc phòng ban không di chuyển file MD** sang thư mục mới. File ở lại chỗ cũ, item vẫn link đúng. Đây là lựa chọn có chủ đích: tính lại đường dẫn từ giá trị đã sửa sẽ trỏ sang folder khác và tạo file mồ côi.
