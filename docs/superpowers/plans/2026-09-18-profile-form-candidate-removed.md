# Xoá form hồ sơ khi ứng viên bị kéo khỏi cột — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi ứng viên đang được chọn trong form "Thêm Hồ Sơ Nhân Sự Chi Tiết" bị kéo ra khỏi cột `05_Moi_Phong_Van` / `08_Da_Phong_Van`, lần poll kế tiếp phải xoá toàn bộ dữ liệu đã nhập và báo lý do.

**Architecture:** Polling 3 giây đã có ở `LifecycleDashboard.tsx:108-111` và giữ nguyên. Service `loadPassedCandidates` thôi nuốt lỗi, để một lần poll hỏng không bị hiểu thành "ứng viên biến mất". Form so sánh `selectedCandidateId` với danh sách mới qua hàm thuần `isSelectedCandidateGone`, rồi reset bằng `createInitialFormData()`.

**Tech Stack:** React 18 + TypeScript strict, vitest (`environment: 'node'`, không có DOM).

**Spec:** `docs/superpowers/specs/2026-09-18-profile-form-candidate-removed-design.md`

## Global Constraints

- Không commit, không push. Git chỉ được dùng read-only (`status`, `diff`, `log`, `show`, `blame`, `rev-parse`).
- TypeScript strict. Không thêm `any` mới trừ khi có comment giải thích lý do.
- Không dùng icon hay emoji trong code, comment hoặc chuỗi mới.
- Không ghi file ra ngoài thư mục project.
- Chuỗi thông báo, dùng nguyên văn: `Ứng viên "${goneName}" đã bị chuyển khỏi cột Mời phỏng vấn / Đã phỏng vấn nên thông tin đã nhập được xoá.`
- Chỉ sửa `CreateDetailedProfileForm.tsx`. Không sửa `CreateProfileForm.tsx` (code chết).
- `tests/manifest.spec.ts` đang fail sẵn từ trước (lệch tên app giữa `package.json` và `privos-app.json`), ngoài phạm vi.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/ui/lifecycle/candidate-selection.ts` (mới) | Hàm thuần `isSelectedCandidateGone` |
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | `loadPassedCandidates` ném lỗi thay vì trả `[]` |
| `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx` | `createInitialFormData`, refs, `useEffect` reset |
| `tests/candidate-selection.spec.ts` (mới) | Test hàm thuần |
| `tests/lifecycle-load-passed-candidates.spec.ts` | Test service reject khi lỗi |
| `tests/lifecycle-load-profiles.spec.ts:558-560` | Cập nhật comment đã lỗi thời |
| `tests/profile-form-candidate-removed.spec.ts` (mới) | Quét source để kiểm tra wiring của form |

---

### Task 1: Service không nuốt lỗi

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:38-76`
- Modify: `tests/lifecycle-load-profiles.spec.ts:558-560` (chỉ comment)
- Test: `tests/lifecycle-load-passed-candidates.spec.ts`

**Interfaces:**
- Produces: `loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>` giữ nguyên signature. Promise bị reject khi đọc list hoặc item lỗi. Vẫn resolve `[]` khi room không có list SCREENING.

- [ ] **Step 1: Viết test fail**

Thêm vào cuối `tests/lifecycle-load-passed-candidates.spec.ts` (file này đã có `createAppStub`, `STAGE_INVITED` và import `PrivOSLifecycleService`):

```ts
describe('PrivOSLifecycleService.loadPassedCandidates — lỗi', () => {
  it('reject khi đọc item lỗi, không trả về danh sách rỗng', async () => {
    // Trả [] khi lỗi làm form hiểu nhầm là ứng viên đã bị kéo khỏi cột và xoá dữ liệu đang nhập.
    const app = createAppStub({
      'mcpapp.lists.getAll': () => [{ _id: 'screening-1', name: 'SCREENING_BACKEND_DEVELOPER', stages: [STAGE_INVITED] }],
      'mcpapp.lists.getItems': () => { throw new Error('hub down'); },
    });
    // Stub chỉ cài đúng phần McpApp mà service dùng tới.
    const service = new PrivOSLifecycleService(app as unknown as ConstructorParameters<typeof PrivOSLifecycleService>[0]);
    await expect(service.loadPassedCandidates('room-1')).rejects.toThrow('hub down');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/lifecycle-load-passed-candidates.spec.ts`
Expected: test mới FAIL (promise resolve `[]` thay vì reject). 5 test cũ PASS.

- [ ] **Step 3: Sửa service**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, thay toàn bộ thân `loadPassedCandidates` (dòng 38-76) bằng:

```ts
  async loadPassedCandidates(roomId: string): Promise<PassedCandidate[]> {
    // Không nuốt lỗi thành []: form tạo hồ sơ coi "ứng viên không còn trong danh sách" là bị kéo
    // khỏi cột và xoá dữ liệu đang nhập. Caller (refreshCandidates) tự catch và giữ danh sách cũ.
    const allLists = await this.fetchAllLists(roomId);
    const screeningLists = allLists.filter(list => this.isScreeningList(list));

    console.log(`[PrivOSLifecycleService] Found ${allLists.length} lists in room, ${screeningLists.length} candidate lists:`,
      screeningLists.map(l => l.name)
    );

    if (screeningLists.length === 0) return [];

    const candidatesPromises = screeningLists.map(async (list) => {
      const listId = list._id || list.id;
      let stages = list.stages;
      if (!Array.isArray(stages) || stages.length === 0) {
        stages = await this.fetchListStages(listId);
      }

      const items = await this.fetchListItems(listId);
      const validItems = items.filter(item => !this.isSystemConfigItem(item));
      const passedItems = validItems.filter(item => this.isPassedCandidateItem(item, stages));

      console.log(`[PrivOSLifecycleService] List "${list.name}" (${listId}): ${validItems.length} total items, ${passedItems.length} stage 05/08 candidates`);

      return passedItems.map(item => this.mapItemToPassedCandidate(item, { ...list, stages }));
    });

    const candidatesNested = await Promise.all(candidatesPromises);
    const allCandidates = candidatesNested.flat();

    console.log(`[PrivOSLifecycleService] Total loaded passed candidates (Stage 05/08): ${allCandidates.length}`);

    // Sort by score descending (highest score first)
    return allCandidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
```

- [ ] **Step 4: Cập nhật comment lỗi thời trong `tests/lifecycle-load-profiles.spec.ts`**

Thay đúng hai dòng comment (558-559):

```ts
      // Van khai bao handler nay: neu bo qua, loi "unexpected tool call" se bi
      // `loadPassedCandidates` nuot va tra ve [] — test se pass vi ly do sai.
```

bằng:

```ts
      // Van khai bao handler nay: neu bo qua va service lo goi getItems, loi
      // "unexpected tool call" lam test fail o `resolves` thay vi o assertion ben duoi.
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `npx vitest run tests/lifecycle-load-passed-candidates.spec.ts tests/lifecycle-load-profiles.spec.ts`
Expected: toàn bộ PASS.

- [ ] **Step 6: Không commit.** Thay đổi để nguyên trong working tree.

---

### Task 2: Hàm thuần `isSelectedCandidateGone`

**Files:**
- Create: `src/ui/lifecycle/candidate-selection.ts`
- Test: `tests/candidate-selection.spec.ts`

**Interfaces:**
- Produces: `export function isSelectedCandidateGone(selectedId: string, candidates: ReadonlyArray<Pick<PassedCandidate, '_id'>>): boolean`

- [ ] **Step 1: Viết test fail**

Tạo `tests/candidate-selection.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSelectedCandidateGone } from '../src/ui/lifecycle/candidate-selection';

describe('isSelectedCandidateGone', () => {
  const candidates = [{ _id: 'cv-1' }, { _id: 'cv-2' }];

  it('false khi chưa chọn ứng viên nào', () => {
    expect(isSelectedCandidateGone('', candidates)).toBe(false);
    expect(isSelectedCandidateGone('', [])).toBe(false);
  });

  it('false khi ứng viên đang chọn vẫn còn trong danh sách', () => {
    expect(isSelectedCandidateGone('cv-2', candidates)).toBe(false);
  });

  it('true khi ứng viên đang chọn không còn trong danh sách', () => {
    expect(isSelectedCandidateGone('cv-3', candidates)).toBe(true);
    expect(isSelectedCandidateGone('cv-1', [])).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/candidate-selection.spec.ts`
Expected: FAIL, không resolve được module `../src/ui/lifecycle/candidate-selection`.

- [ ] **Step 3: Viết hàm**

Tạo `src/ui/lifecycle/candidate-selection.ts`:

```ts
import type { PassedCandidate } from './types';

/**
 * Ứng viên đang chọn trong form không còn trong danh sách mới nhất (bị kéo khỏi cột 05/08,
 * hoặc đã có hồ sơ). Danh sách chỉ đáng tin khi lần tải thành công: loadPassedCandidates ném lỗi
 * thay vì trả [] nên một lần poll hỏng không tới được đây.
 */
export function isSelectedCandidateGone(
  selectedId: string,
  candidates: ReadonlyArray<Pick<PassedCandidate, '_id'>>,
): boolean {
  return selectedId !== '' && !candidates.some((candidate) => candidate._id === selectedId);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/candidate-selection.spec.ts`
Expected: 3 PASS.

- [ ] **Step 5: Không commit.**

---

### Task 3: Reset form khi ứng viên biến mất

**Files:**
- Modify: `src/ui/lifecycle/components/CreateDetailedProfileForm.tsx` (dòng 1, 45-70, 104-126, 427)
- Test: `tests/profile-form-candidate-removed.spec.ts`

**Interfaces:**
- Consumes: `isSelectedCandidateGone` từ Task 2 (`src/ui/lifecycle/candidate-selection.ts`). Task 1 đảm bảo `passedCandidates` không bị thay bằng `[]` khi poll lỗi.
- Produces: không có interface mới cho task khác.

- [ ] **Step 1: Viết test fail**

Vitest chạy `environment: 'node'`, không có DOM, nên test kiểm tra wiring bằng cách quét source. Logic đã được test ở Task 2.

Tạo `tests/profile-form-candidate-removed.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../src/ui/lifecycle/components/CreateDetailedProfileForm.tsx'),
  'utf8',
);

describe('CreateDetailedProfileForm — ứng viên bị kéo khỏi cột', () => {
  it('dùng isSelectedCandidateGone với danh sách ứng viên mới nhất', () => {
    expect(source).toContain("import { isSelectedCandidateGone } from '../candidate-selection';");
    expect(source).toContain('isSelectedCandidateGone(selectedCandidateId, passedCandidates)');
  });

  it('không reset khi đang lưu hoặc vừa lưu xong', () => {
    expect(source).toContain('if (isSubmitting || isSuccess) return;');
  });

  it('reset toàn bộ form, ảnh CCCD và báo lý do', () => {
    expect(source).toContain('setFormData(createInitialFormData());');
    expect(source).toContain('setIdPhoto(null);');
    expect(source).toContain('đã bị chuyển khỏi cột Mời phỏng vấn / Đã phỏng vấn nên thông tin đã nhập được xoá.');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/profile-form-candidate-removed.spec.ts`
Expected: 3 FAIL.

- [ ] **Step 3: Sửa import (dòng 1 và sau dòng 18)**

Dòng 1:

```ts
import React, { useState } from 'react';
```

thành:

```ts
import React, { useEffect, useRef, useState } from 'react';
```

Ngay sau dòng `import { isValidEmailAddress } from '../../utils/email-validation';`, thêm:

```ts
import { isSelectedCandidateGone } from '../candidate-selection';
```

- [ ] **Step 4: Tách giá trị ban đầu của form**

Ngay trước `export function CreateDetailedProfileForm({`, thêm hàm module-level:

```ts
function createInitialFormData() {
  return {
    fullName: '',
    email: '',
    phone: '',
    position: 'Developer',
    department: 'IT',
    onboardingDate: new Date().toISOString().split('T')[0],
    dob: '',
    idNumber: '',
    idIssueDate: '',
    idIssuePlace: '',
    permanentAddress: '',
    currentAddress: '',
    vehiclePlate: '',
    vehicleType: '',
    socialInsurance: '',
    taxCode: '',
    bankAccount: '',
    bankName: '',
    momoWallet: '',
    telegram: '',
    emergencyContact: '',
  };
}
```

Thay khối `const [formData, setFormData] = useState({ ... });` (dòng 45-67, gồm 21 trường như trên) bằng:

```ts
  const [formData, setFormData] = useState(createInitialFormData);
```

Ngay sau dòng `const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');`, thêm:

```ts
  // Tên ứng viên lúc chọn: khi họ bị kéo khỏi cột thì không còn trong passedCandidates để tra lại.
  const selectedCandidateNameRef = useRef('');
  const idPhotoInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 5: Ghi tên ứng viên khi chọn**

Trong `handleSelectCandidate`, thay:

```ts
    setSelectedCandidateId(candidateId);
    if (!candidateId) return;

    const candidate = passedCandidates.find(c => c._id === candidateId);
    if (!candidate) return;
```

bằng:

```ts
    setSelectedCandidateId(candidateId);
    selectedCandidateNameRef.current = '';
    if (!candidateId) return;

    const candidate = passedCandidates.find(c => c._id === candidateId);
    if (!candidate) return;
    selectedCandidateNameRef.current = candidate.name;
```

- [ ] **Step 6: Thêm effect reset**

Ngay sau khi hàm `handleSelectCandidate` kết thúc (trước `const handleChange = ...`), thêm:

```ts
  // Polling ở LifecycleDashboard làm mới passedCandidates mỗi 3 giây. Ứng viên đang chọn biến
  // mất nghĩa là đã bị kéo khỏi cột 05/08 (hoặc đã có hồ sơ): xoá toàn bộ dữ liệu đã nhập, vì
  // các trường nhập tay cũng thuộc về người đó. Lúc đang lưu / vừa lưu, ứng viên tự rời danh sách
  // do vừa có hồ sơ nên không reset.
  useEffect(() => {
    if (isSubmitting || isSuccess) return;
    if (!isSelectedCandidateGone(selectedCandidateId, passedCandidates)) return;

    const goneName = selectedCandidateNameRef.current;
    selectedCandidateNameRef.current = '';
    setSelectedCandidateId('');
    setFormData(createInitialFormData());
    setIdPhoto(null);
    if (idPhotoInputRef.current) idPhotoInputRef.current.value = '';
    setErrorMsg(`Ứng viên "${goneName}" đã bị chuyển khỏi cột Mời phỏng vấn / Đã phỏng vấn nên thông tin đã nhập được xoá.`);
  }, [passedCandidates, selectedCandidateId, isSubmitting, isSuccess]);
```

`isSubmitting`, `isSuccess` và `setErrorMsg` được khai báo ở dòng 97-100, trước `handleSelectCandidate`, nên có thể dùng ở đây.

- [ ] **Step 7: Gắn ref vào file input (dòng 427)**

Thay:

```tsx
            <input id="idPhotoInput" type="file" accept="image/*" onChange={handleFileChange}
```

bằng:

```tsx
            <input id="idPhotoInput" ref={idPhotoInputRef} type="file" accept="image/*" onChange={handleFileChange}
```

Phần còn lại của dòng giữ nguyên.

- [ ] **Step 8: Chạy test và typecheck**

Run: `npx vitest run tests/profile-form-candidate-removed.spec.ts tests/candidate-selection.spec.ts`
Expected: 6 PASS.

Run: `npm run typecheck`
Expected: không có lỗi.

- [ ] **Step 9: Không commit.**

---

### Task 4: Kiểm tra toàn bộ

- [ ] **Step 1:** `npm test`. Expected: tất cả PASS, trừ `tests/manifest.spec.ts` "serves the canonical Marketplace manifest" (fail sẵn từ trước).
- [ ] **Step 2:** `npm run typecheck:strict-unused`. Expected: không có lỗi.
- [ ] **Step 3:** `npm run build`. Expected: build thành công.
- [ ] **Step 4:** Người dùng tự khởi động lại bằng `npm start`, rồi kiểm tra thủ công:
  1. Mở "+ Tạo Hồ Sơ Mới", chọn một ứng viên ở cột Mời phỏng vấn, nhập thêm CCCD.
  2. Ở tab CV đã chấm, kéo ứng viên đó sang cột khác (ví dụ Loại CV).
  3. Trong khoảng 3 giây: form trống, dropdown về "-- Chọn ứng viên ... --", và banner đỏ hiện thông báo.
  4. Kéo một ứng viên khác không phải người đang chọn: form không đổi.
