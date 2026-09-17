# Passed Candidate Position Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chọn nhanh ứng viên trong form "Thêm Hồ Sơ Nhân Sự Chi Tiết" phải điền đúng vị trí (lấy từ JD của list chấm CV) và đúng họ tên đầy đủ, và ô "Vị trí công việc" phải hiển thị đúng giá trị sẽ được lưu.

**Architecture:** Phần tách tên và vị trí được đưa ra module thuần `src/ui/lifecycle/passed-candidate-parsing.ts` (không phụ thuộc SDK, test trực tiếp được). `PrivOSLifecycleService.mapItemToPassedCandidate` lấy vị trí từ tên list `SCREENING_<VI_TRI>` thay vì từ phần đuôi tên file CV, và khớp từ khoá theo nguyên từ thay vì chuỗi con. Form dùng `withCurrentOption` có sẵn để ô select hiện đúng giá trị không nằm trong `POSITION_OPTIONS`.

**Tech Stack:** TypeScript strict, React 19, Vitest (`environment: 'node'`, không có DOM test).

**Spec:** Không có file spec. Thiết kế đã được duyệt trong hội thoại ngày 2026-09-17 ("cần sửa lại ở đâu và sửa những gì"). Nguyên nhân gốc đã xác minh:
- `PrivOSLifecycleService.ts:802-821` `cleanCandidateName` cắt tiêu đề thẻ `2026-09-11_CV_Vu_Viet_Nghia.md` theo `_`, lấy `parts[0]` làm tên và phần còn lại làm vị trí; `replace(/([A-Z])/g, ' $1')` chèn khoảng trắng trước mọi chữ hoa, sinh ra "L U U".
- `PrivOSLifecycleService.ts:823-833` `normalizePosition` dùng `includes` nên "Pham" khớp `pm`, "Bui" khớp `ui`; không khớp thì trả về chuỗi rác.
- `pipeline-service.ts:926-954` đặt tên list là `SCREENING_<VI_TRI>` từ tên file JD; item trong list không có trường vị trí riêng.
- `CreateDetailedProfileForm.tsx:371-375` select `position` không có option cho giá trị ngoài `POSITION_OPTIONS`, nên hiện "Developer" trong khi state giữ giá trị khác.

## Global Constraints

- Không commit, không push, không chạy bất kỳ lệnh git ghi nào (`git add`, `git commit`, `git reset`, `git checkout`, `git stash`...). Chỉ được dùng `git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`.
- TypeScript strict. Không thêm `any` mới trong module `passed-candidate-parsing.ts`.
- Không dùng icon, emoji trong code, comment, chuỗi hiển thị hay test.
- Không sửa `src/ui/pipeline-service.ts`, `src/ui/pipeline-candidate-name.ts`, `src/ui/lifecycle/profile-form-options.ts`.
- Không chuyển file, không ghi file ra ngoài thư mục project.
- Baseline test trước khi làm: 369 test, 368 pass, 1 fail có sẵn ở `tests/manifest.spec.ts` (tên package khác manifest). Fail này không thuộc phạm vi plan.
- Comment trong code viết tiếng Việt, ngắn, giải thích lý do (khớp phong cách file lifecycle hiện có).

## File Structure

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `src/ui/lifecycle/passed-candidate-parsing.ts` | Tạo mới | `normalizePosition`, `positionFromScreeningListName`, `parseCandidateName` |
| `tests/passed-candidate-parsing.spec.ts` | Tạo mới | Unit test module trên |
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | Sửa `:1-4`, `:758-780`, xoá `:802-833` | Dùng module mới cho ứng viên chọn nhanh |
| `tests/lifecycle-load-passed-candidates.spec.ts` | Tạo mới | Test `loadPassedCandidates` qua app stub |
| `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx` | Sửa `:17`, `:372` | Select vị trí hiện đúng giá trị ngoài danh sách |
| `tests/create-profile-position-option.spec.ts` | Tạo mới | Test quét mã nguồn form |

---

### Task 1: Module tách tên và vị trí ứng viên

**Files:**
- Create: `src/ui/lifecycle/passed-candidate-parsing.ts`
- Test: `tests/passed-candidate-parsing.spec.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `export function normalizePosition(rawPosition: string): string`
  - `export function positionFromScreeningListName(listName: string): string | undefined`
  - `export function parseCandidateName(rawTitle: string): string`

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/passed-candidate-parsing.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  normalizePosition,
  parseCandidateName,
  positionFromScreeningListName,
} from '../src/ui/lifecycle/passed-candidate-parsing';

describe('normalizePosition', () => {
  it('khớp theo nguyên từ nên tên người không bị coi là vị trí', () => {
    // Bản cũ dùng includes: "Pham" chứa "pm", "Bui" chứa "ui".
    expect(normalizePosition('Pham Van Bui')).toBe('Pham Van Bui');
    expect(normalizePosition('Tuan Devi')).toBe('Tuan Devi');
  });

  it('chuẩn hoá các vị trí có trong danh sách chọn', () => {
    expect(normalizePosition('BACKEND DEVELOPER')).toBe('Developer');
    expect(normalizePosition('QA ENGINEER')).toBe('Tester');
    expect(normalizePosition('UX DESIGNER')).toBe('Designer');
    expect(normalizePosition('PRODUCT OWNER')).toBe('Product Manager');
    expect(normalizePosition('Nhân sự tổng hợp')).toBe('HR');
    expect(normalizePosition('SALES EXECUTIVE')).toBe('Sales');
    expect(normalizePosition('DIGITAL MARKETING')).toBe('Marketing');
  });

  it('giữ nguyên vị trí không nhận diện được', () => {
    expect(normalizePosition(' KE TOAN ')).toBe('KE TOAN');
  });
});

describe('positionFromScreeningListName', () => {
  it('lấy vị trí từ tên list SCREENING_<VI_TRI>', () => {
    expect(positionFromScreeningListName('SCREENING_UX_DESIGNER')).toBe('Designer');
    expect(positionFromScreeningListName('SCREENING_BACKEND_DEVELOPER')).toBe('Developer');
    expect(positionFromScreeningListName('SCREENING_QA_ENGINEER')).toBe('Tester');
    expect(positionFromScreeningListName('SCREENING_KE_TOAN')).toBe('KE TOAN');
  });

  it('trả về undefined khi list không mang vị trí', () => {
    expect(positionFromScreeningListName('SCREENING_UNKNOWN')).toBeUndefined();
    expect(positionFromScreeningListName('SCREENING_')).toBeUndefined();
    expect(positionFromScreeningListName('')).toBeUndefined();
  });
});

describe('parseCandidateName', () => {
  it('lấy toàn bộ họ tên sau tiền tố ngày và CV_', () => {
    expect(parseCandidateName('2026-09-11_CV_Vu_Viet_Nghia.md')).toBe('Vu Viet Nghia');
  });

  it('không chèn khoảng trắng giữa các chữ hoa liền nhau', () => {
    expect(parseCandidateName('2026-09-17_CV_LUU_SON_TRUONG.md')).toBe('LUU SON TRUONG');
  });

  it('tách tên viết liền kiểu CamelCase', () => {
    expect(parseCandidateName('CV_NguyenVanA.pdf')).toBe('Nguyen Van A');
  });

  it('trả về tên mặc định khi tiêu đề rỗng sau khi làm sạch', () => {
    expect(parseCandidateName('2026-09-11_CV_.md')).toBe('Không có tên');
    expect(parseCandidateName('')).toBe('Không có tên');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/passed-candidate-parsing.spec.ts`
Expected: FAIL với lỗi `Failed to resolve import "../src/ui/lifecycle/passed-candidate-parsing"`.

- [ ] **Step 3: Viết implementation**

Tạo `src/ui/lifecycle/passed-candidate-parsing.ts`:

```ts
const POSITION_RULES: ReadonlyArray<{ value: string; keys: ReadonlyArray<string> }> = [
  { value: 'Developer', keys: ['dev', 'developer', 'programmer', 'lap trinh'] },
  { value: 'Tester', keys: ['test', 'tester', 'qa', 'qc', 'kiem thu'] },
  { value: 'Designer', keys: ['design', 'designer', 'ui', 'ux'] },
  { value: 'Product Manager', keys: ['product', 'pm'] },
  { value: 'HR', keys: ['hr', 'nhan su', 'recruiter'] },
  { value: 'Sales', keys: ['sale', 'sales', 'kinh doanh'] },
  { value: 'Marketing', keys: ['marketing'] },
];

const UNNAMED_CANDIDATE = 'Không có tên';

function toSearchText(raw: string): string {
  const tokens = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return ` ${tokens.join(' ')} `;
}

/** Khớp theo nguyên từ, để "pm" không ăn vào "Pham" và "ui" không ăn vào "Bui". */
export function normalizePosition(rawPosition: string): string {
  const text = toSearchText(rawPosition);
  const rule = POSITION_RULES.find(r => r.keys.some(key => text.includes(` ${key} `)));
  return rule ? rule.value : rawPosition.trim();
}

/**
 * Item trong list chấm CV không có trường vị trí; vị trí chỉ nằm ở tên list,
 * do pipeline đặt là `SCREENING_<VI_TRI>` theo tên file JD.
 */
export function positionFromScreeningListName(listName: string): string | undefined {
  const raw = listName.replace(/^.*?SCREENING_?/i, '').replace(/_+/g, ' ').trim();
  if (!raw || raw.toUpperCase() === 'UNKNOWN') return undefined;
  return normalizePosition(raw);
}

/** Tiêu đề thẻ có dạng `2026-09-11_CV_Vu_Viet_Nghia.md`; họ tên là toàn bộ phần sau `CV_`. */
export function parseCandidateName(rawTitle: string): string {
  const name = rawTitle
    .replace(/\.(md|pdf|docx|doc)$/i, '')
    .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_]?/, '')
    .replace(/^CV[-_]?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || UNNAMED_CANDIDATE;
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/passed-candidate-parsing.spec.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: không có lỗi.

- [ ] **Step 6: Không commit**

Chỉ chạy `git status` để xác nhận hai file mới xuất hiện ở trạng thái untracked. Không chạy `git add` hay `git commit`.

---

### Task 2: Service dùng module mới cho ứng viên chọn nhanh

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:1-4` (import)
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:758-780` (`mapItemToPassedCandidate`)
- Delete: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:802-833` (`cleanCandidateName`, `normalizePosition` private)
- Test: `tests/lifecycle-load-passed-candidates.spec.ts`

**Interfaces:**
- Consumes (Task 1): `parseCandidateName(rawTitle: string): string`, `positionFromScreeningListName(listName: string): string | undefined` từ `src/ui/lifecycle/passed-candidate-parsing.ts`.
- Produces: `PrivOSLifecycleService.loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>` giữ nguyên chữ ký; `PassedCandidate.name` là họ tên đầy đủ, `PassedCandidate.position` lấy từ tên list.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/lifecycle-load-passed-candidates.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Service chỉ gọi `app.callServerTool`; SDK thật bọc payload thành JSON trong `content[0].text`. */
function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  return {
    async callServerTool(call: ToolCall) {
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return { content: [{ type: 'text', text: JSON.stringify(handler(call.arguments ?? {})) }] };
    },
  };
}

const STAGE_INVITED = { _id: 'stage-05', name: '05_Moi_Phong_Van' };

function screeningRoom(listName: string, itemTitle: string) {
  const list = { _id: 'screening-1', name: listName, stages: [STAGE_INVITED] };
  const item = {
    _id: 'cv-1',
    name: itemTitle,
    stageId: STAGE_INVITED._id,
    customFields: [{ fieldId: 'tong_diem', value: 82 }],
  };
  return createAppStub({
    'mcpapp.lists.getAll': () => [list],
    'mcpapp.lists.getItems': () => [item],
  });
}

async function loadOnlyCandidate(listName: string, itemTitle: string) {
  const app = screeningRoom(listName, itemTitle);
  // Stub chỉ cài đúng phần McpApp mà service dùng tới.
  const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
  const candidates = await service.loadPassedCandidates('room-1');
  expect(candidates).toHaveLength(1);
  return candidates[0];
}

describe('PrivOSLifecycleService.loadPassedCandidates', () => {
  it('lấy vị trí từ tên list JD, không đoán từ tên ứng viên', async () => {
    // Bản cũ: "Van Bui" chứa "ui" nên thành Designer dù JD là Backend Developer.
    const candidate = await loadOnlyCandidate('SCREENING_BACKEND_DEVELOPER', '2026-09-11_CV_Pham_Van_Bui.md');
    expect(candidate.position).toBe('Developer');
  });

  it('giữ họ tên đầy đủ của ứng viên', async () => {
    // Bản cũ chỉ giữ phần trước dấu gạch dưới đầu tiên: "Pham".
    const candidate = await loadOnlyCandidate('SCREENING_BACKEND_DEVELOPER', '2026-09-11_CV_Pham_Van_Bui.md');
    expect(candidate.name).toBe('Pham Van Bui');
  });

  it('không tách chữ hoa liền nhau thành từng ký tự', async () => {
    // Bản cũ sinh "L U U" và vị trí "S O N T R U O N G".
    const candidate = await loadOnlyCandidate('SCREENING_UX_DESIGNER', '2026-09-17_CV_LUU_SON_TRUONG.md');
    expect(candidate.name).toBe('LUU SON TRUONG');
    expect(candidate.position).toBe('Designer');
  });

  it('để trống vị trí khi list không mang tên JD', async () => {
    const candidate = await loadOnlyCandidate('SCREENING_UNKNOWN', '2026-09-11_CV_Vu_Viet_Nghia.md');
    expect(candidate.position).toBeUndefined();
    expect(candidate.score).toBe(82);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/lifecycle-load-passed-candidates.spec.ts`
Expected: FAIL ở cả 4 test. Ví dụ: `expected 'Designer' to be 'Developer'`, `expected 'Pham' to be 'Pham Van Bui'`, `expected 'L U U' to be 'LUU SON TRUONG'`, `expected 'Viet Nghia' to be undefined`.

Nếu test fail vì lý do khác (ví dụ `unexpected tool call: ...`), dừng lại và đọc `fetchAllListItems` trong `src/ui/list-item-paging.ts` để bổ sung handler còn thiếu vào stub, rồi chạy lại cho tới khi fail đúng các assertion trên.

- [ ] **Step 3: Thêm import**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, sau dòng `import { resolveProfileFieldKey } from '../profile-field-aliases';` thêm:

```ts
import { parseCandidateName, positionFromScreeningListName } from '../passed-candidate-parsing';
```

- [ ] **Step 4: Sửa `mapItemToPassedCandidate`**

Thay toàn bộ phương thức (hiện ở dòng 758-780) bằng:

```ts
  private mapItemToPassedCandidate(item: any, list: any): PassedCandidate {
    const rawTitle = item.name || item.title || '';
    const scoreVal = this.extractFieldValue(item.customFields, ['tong_diem', 'điểm', 'score', 'diem']);
    const categoryVal = this.extractFieldValue(item.customFields, ['phan_loai', 'loại', 'category', 'ket_qua']);
    const reasonVal = this.extractFieldValue(item.customFields, ['ly_do', 'lý do', 'reason', 'nhan_xet']);
    const emailVal = this.extractFieldValue(item.customFields, ['email', 'thu_dien_tu']);
    const phoneVal = this.extractFieldValue(item.customFields, ['sdt', 'sđt', 'phone', 'dien_thoai', 'điện thoại']);

    return {
      _id: item._id || item.id,
      name: parseCandidateName(rawTitle),
      listName: list.name || 'Screening List',
      listId: list._id || list.id,
      score: typeof scoreVal === 'number' ? scoreVal : (scoreVal ? Number(scoreVal) : undefined),
      category: categoryVal ? String(categoryVal) : undefined,
      stageName: this.getStageName(item, list.stages || []),
      reason: reasonVal ? String(reasonVal) : (item.description || undefined),
      // Tên file CV chỉ chứa họ tên; vị trí ứng tuyển nằm ở tên list JD.
      position: positionFromScreeningListName(list.name || ''),
      email: emailVal ? String(emailVal).trim() : undefined,
      phone: phoneVal ? String(phoneVal).trim() : undefined,
    };
  }
```

- [ ] **Step 5: Xoá hai phương thức cũ**

Xoá nguyên khối `private cleanCandidateName(rawTitle: string): { name: string, position?: string } { ... }` và `private normalizePosition(rawPosition: string): string { ... }` ở cuối class (hiện ở dòng 802-833). Giữ dấu `}` đóng class.

Run: `npx rg -n "cleanCandidateName|this\.normalizePosition" src tests`
Expected: không có kết quả. Nếu máy không có `rg`, dùng `grep -rn "cleanCandidateName\|this.normalizePosition" src tests` với cùng kỳ vọng.

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npx vitest run tests/lifecycle-load-passed-candidates.spec.ts tests/passed-candidate-parsing.spec.ts tests/lifecycle-load-profiles.spec.ts tests/lifecycle-update-profile-fields.spec.ts`
Expected: PASS toàn bộ.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: không có lỗi.

- [ ] **Step 8: Không commit**

Chỉ chạy `git status`. Không chạy `git add` hay `git commit`.

---

### Task 3: Ô "Vị trí công việc" hiện đúng giá trị sẽ lưu

**Files:**
- Modify: `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx:17` (import)
- Modify: `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx:372` (danh sách option)
- Test: `tests/create-profile-position-option.spec.ts`

**Interfaces:**
- Consumes: `withCurrentOption(options: ReadonlyArray<ProfileFormOption>, current: string): ReadonlyArray<ProfileFormOption>` có sẵn ở `src/ui/lifecycle/profile-form-options.ts` (đang được `EditProfileModal` dùng); `PassedCandidate.position` từ Task 2 có thể là giá trị ngoài `POSITION_OPTIONS` (ví dụ `KE TOAN`).
- Produces: không có interface mới.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/create-profile-position-option.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSITION_OPTIONS, withCurrentOption } from '../src/ui/lifecycle/profile-form-options';

/**
 * Project không có môi trường DOM test (`vitest.config.ts` đặt `environment: 'node'`), nên phần
 * nối dây trong `.tsx` được kiểm qua mã nguồn như `tests/ui-error-surfacing.spec.ts`.
 * Trước khi sửa, select vị trí chỉ render `POSITION_OPTIONS`; vị trí JD ngoài danh sách
 * khiến ô hiện "Developer" trong khi giá trị lưu xuống là chuỗi khác.
 */
function source(relative: string): string {
  return fs.readFileSync(path.resolve(relative), 'utf8');
}

describe('CreateDetailedProfileForm position select', () => {
  const form = source('src/ui/lifecycle/components/CreateDetailedProfileForm.tsx');

  it('render option cho vị trí hiện tại kể cả khi ngoài danh sách chuẩn', () => {
    expect(form).toContain('withCurrentOption(POSITION_OPTIONS, formData.position)');
  });

  it('không còn render thẳng POSITION_OPTIONS', () => {
    expect(form).not.toContain('{POSITION_OPTIONS.map(');
  });

  it('withCurrentOption đưa vị trí JD lạ lên đầu danh sách', () => {
    const options = withCurrentOption(POSITION_OPTIONS, 'KE TOAN');
    expect(options[0]).toEqual({ value: 'KE TOAN', label: 'KE TOAN' });
    expect(options).toHaveLength(POSITION_OPTIONS.length + 1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/create-profile-position-option.spec.ts`
Expected: FAIL ở 2 test quét mã nguồn; test `withCurrentOption đưa vị trí JD lạ lên đầu danh sách` PASS (hàm đã có sẵn).

- [ ] **Step 3: Sửa import**

Trong `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx`, thay:

```ts
import { DEPARTMENT_OPTIONS, POSITION_OPTIONS } from '../profile-form-options';
```

bằng:

```ts
import { DEPARTMENT_OPTIONS, POSITION_OPTIONS, withCurrentOption } from '../profile-form-options';
```

- [ ] **Step 4: Sửa danh sách option**

Thay:

```tsx
              {POSITION_OPTIONS.map(option => (
```

bằng:

```tsx
              {withCurrentOption(POSITION_OPTIONS, formData.position).map(option => (
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npx vitest run tests/create-profile-position-option.spec.ts`
Expected: PASS, 3 test.

- [ ] **Step 6: Không commit**

Chỉ chạy `git status`. Không chạy `git add` hay `git commit`.

---

### Task 4: Kiểm tra toàn bộ

**Files:** không sửa file.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: không có lỗi.

- [ ] **Step 2: Toàn bộ test**

Run: `npx vitest run`
Expected: 385 test, 384 pass, 1 fail duy nhất ở `tests/manifest.spec.ts` (fail có sẵn). Số test tăng 16 = 9 (Task 1) + 4 (Task 2) + 3 (Task 3). Nếu `tests/packaging.spec.ts` fail, chạy riêng `npx vitest run tests/packaging.spec.ts` một lần nữa; test này chập chờn trong shell con.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build thành công, bước `manifest:lint` in `"valid": true`.

- [ ] **Step 4: Rà diff**

Run: `git status` và `git diff -- src/ui/lifecycle/services/PrivOSLifecycleService.ts src/ui/lifecycle/components/CreateDetailedProfileForm.tsx`
Expected: diff chỉ gồm import mới, `mapItemToPassedCandidate` mới, hai phương thức cũ bị xoá, và hai dòng trong form. Không có thay đổi nào khác trong hai file này.

- [ ] **Step 5: Kiểm thử tay trong Room (người dùng thực hiện)**

1. Mở tab Hồ sơ NS, bấm thêm hồ sơ chi tiết.
2. Trong ô "Chọn nhanh từ ứng viên", chọn một ứng viên thuộc list `SCREENING_<VI_TRI>` đã biết.
3. Kỳ vọng: "Họ và Tên" là họ tên đầy đủ không dấu; "Vị trí công việc" khớp JD của list; ô select hiện đúng giá trị đó; "Phòng ban" theo vị trí.
4. Hồ sơ đã lưu sai trước đây (ví dụ "L U U") không tự sửa; mở "Sửa" để chỉnh tay.
