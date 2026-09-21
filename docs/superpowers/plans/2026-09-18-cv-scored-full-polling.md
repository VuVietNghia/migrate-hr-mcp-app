# Polling đầy đủ cho tab "CV đã chấm" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi lần poll 3 giây, tab "CV đã chấm" phải phản ánh đầy đủ trạng thái trên Hub: có thẻ mới, mất thẻ đã bị xoá, và thẻ nào đổi cột, điểm, phân loại, lý do, email, SĐT, cờ đã gửi mail hay customFields thì được cập nhật.

**Architecture:** Tách logic "item Hub → `CVProfile`" từ `loadData` ra hàm thuần `mapItemsToCVProfiles`, để lần tải đầu và poll dùng chung. Poll tải toàn bộ item (chi phí mạng như hiện tại), dựng lại thẻ, và chỉ `setBoards` khi `areCvListsEqual` hoặc `areStageMapsEqual` báo có khác biệt. Luồng gửi mail mời được bọc bằng `CVBoardPollingGuard` để poll không trả dữ liệu cũ đè lên.

**Tech Stack:** React 18 + TypeScript strict, vitest (`environment: 'node'`, không có DOM).

**Spec:** `docs/superpowers/specs/2026-09-18-cv-scored-full-polling-design.md`

## Global Constraints

- Không commit, không push. Git chỉ được dùng read-only (`status`, `diff`, `log`, `show`, `blame`, `rev-parse`).
- Lệnh hợp lệ duy nhất để chạy code là `npm start`. Vitest, typecheck và build chỉ là công cụ lúc phát triển. Kết quả của chúng không được báo là "pass" hay "hoàn thành".
- TypeScript strict. Không thêm `any` mới trừ khi có comment giải thích lý do.
- Không dùng icon hay emoji trong code, comment hoặc chuỗi mới.
- Không ghi file ra ngoài thư mục project.
- Không đổi chu kỳ poll (3000 ms), `immediate: false` và điều kiện `enabled` của `usePolling`.
- Không sửa `src/ui/cv-scored/polling-sync.ts` (`CVBoardPollingGuard`).
- `tests/manifest.spec.ts` đang fail sẵn từ trước (lệch tên app giữa `package.json` và `privos-app.json`), ngoài phạm vi.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/ui/cv-scored/cv-item-mapper.ts` (mới) | `mapItemsToCVProfiles`: item Hub → `CVProfile[]` + stagesMap đã bổ sung |
| `src/ui/cv-scored/cv-poll-diff.ts` (mới) | `areCvListsEqual`, `areStageMapsEqual` |
| `src/ui/cv-scored/CVScoredTab.tsx` | `CVBoardData.fieldsMap`, `loadData` dùng mapper, `pollBoards`, chặn poll trong luồng gửi mail mời |
| `src/ui/cv-scored/cv-list-reader.ts` | Xoá `readBoardStatuses` |
| `tests/cv-item-mapper.spec.ts` (mới) | Test mapper |
| `tests/cv-poll-diff.spec.ts` (mới) | Test hàm so sánh |
| `tests/cv-scored-full-polling.spec.ts` (mới) | Quét source để kiểm tra wiring của `CVScoredTab.tsx` |
| `tests/cv-list-reader.spec.ts` | Xoá khối `describe('readBoardStatuses')` và import của nó |
| `tests/invite-sent-outcome.spec.ts` | Fixture thêm `fieldsMap` |

---

### Task 1: Hàm thuần `mapItemsToCVProfiles`

**Files:**
- Create: `src/ui/cv-scored/cv-item-mapper.ts`
- Test: `tests/cv-item-mapper.spec.ts`

**Interfaces:**
- Consumes: `CVProfile` (type, export sẵn từ `src/ui/cv-scored/CVScoredTab.tsx:27`), `wasInviteMailSent` (`src/ui/cv-scored/invite-mail-persistence.ts`).
- Produces:
  ```ts
  export interface MappedBoardCVs { cvs: CVProfile[]; stagesMap: Record<string, string>; }
  export function mapItemsToCVProfiles(
    items: ReadonlyArray<any>,
    fieldsMap: Readonly<Record<string, string>>,
    stagesMap: Readonly<Record<string, string>>,
  ): MappedBoardCVs
  ```

- [ ] **Step 1: Viết test fail**

Tạo `tests/cv-item-mapper.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapItemsToCVProfiles } from '../src/ui/cv-scored/cv-item-mapper';

const FIELDS = {
  f1: 'Tổng điểm',
  f2: 'Phân loại',
  f3: 'Lý do',
  f4: 'Email',
  f5: 'SĐT',
};

describe('mapItemsToCVProfiles', () => {
  it('đọc customFields dạng mảng theo tên field', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{
        _id: 'cv-1',
        name: 'CV Nguyen Van A',
        stageId: 's3',
        customFields: [
          { fieldId: 'f1', value: 82 },
          { fieldId: 'f2', value: 'ĐẠT' },
          { fieldId: 'f3', value: 'Kinh nghiệm tốt' },
          { fieldId: 'f4', value: 'a@company.com' },
          { fieldId: 'f5', value: '0901234567' },
          { fieldId: 'interview_invite_sent', value: true },
        ],
      }],
      FIELDS,
      { s3: '03_Tiem_Nang' },
    );

    expect(cvs).toHaveLength(1);
    expect(cvs[0]).toMatchObject({
      _id: 'cv-1',
      name: 'CV Nguyen Van A',
      status: '03_Tiem_Nang',
      score: 82,
      category: 'ĐẠT',
      reason: 'Kinh nghiệm tốt',
      email: 'a@company.com',
      sdt: '0901234567',
      inviteMailSent: true,
    });
  });

  it('đọc customFields dạng object theo key khi fieldsMap không có tên', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{ _id: 'cv-2', name: 'CV B', stageId: 's2', customFields: { tong_diem: 55, phan_loai: 'KHÔNG ĐẠT' } }],
      {},
      { s2: '02_Loai_CV' },
    );

    expect(cvs[0]).toMatchObject({ score: 55, category: 'KHÔNG ĐẠT', status: '02_Loai_CV', inviteMailSent: false });
  });

  it('dò email và SĐT từ text khi không có field', () => {
    const { cvs } = mapItemsToCVProfiles(
      [{ _id: 'cv-3', name: 'CV Tran C nva@gmail.com', description: 'Liên hệ 0912 345 678', stageId: 's3' }],
      {},
      { s3: '03_Tiem_Nang' },
    );

    expect(cvs[0].email).toBe('nva@gmail.com');
    expect(cvs[0].sdt).toBe('0912345678');
  });

  it('đoán stage theo phân loại cho stageId lạ, không sửa stagesMap đầu vào', () => {
    const input: Record<string, string> = {};
    const { cvs, stagesMap } = mapItemsToCVProfiles(
      [
        { _id: 'cv-4', name: 'CV D', stageId: 'sx', customFields: [{ fieldId: 'f2', value: 'SAI JD' }] },
        { _id: 'cv-5', name: 'CV E', stageId: 'sx', customFields: [{ fieldId: 'f2', value: 'ĐẠT' }] },
      ],
      FIELDS,
      input,
    );

    expect(cvs.map((cv) => cv.status)).toEqual(['06_Sai_JD', '06_Sai_JD']);
    expect(stagesMap).toEqual({ sx: '06_Sai_JD' });
    expect(input).toEqual({});
  });

  it('dùng giá trị mặc định khi item thiếu tên và stage', () => {
    const { cvs } = mapItemsToCVProfiles([{ id: 'cv-6' }], {}, {});

    expect(cvs[0]).toMatchObject({ _id: 'cv-6', name: 'Không tên', status: '01_Dau_Vao', email: '', sdt: '' });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/cv-item-mapper.spec.ts`
Expected: FAIL, không resolve được module `../src/ui/cv-scored/cv-item-mapper`.

- [ ] **Step 3: Viết mapper**

Tạo `src/ui/cv-scored/cv-item-mapper.ts`. Thân vòng `map` là nguyên văn `CVScoredTab.tsx:634-708`, với `fMap` đổi thành `fieldsMap` và `sMap` là bản sao cục bộ:

```ts
import type { CVProfile } from './CVScoredTab';
import { wasInviteMailSent } from './invite-mail-persistence';

export interface MappedBoardCVs {
  cvs: CVProfile[];
  /** Bản sao stagesMap đầu vào, cộng các stage đoán theo phân loại cho stageId chưa biết. */
  stagesMap: Record<string, string>;
}

/**
 * Item Hub -> thẻ CV. Dùng chung cho lần tải đầu (loadData) và mỗi lần poll, để poll làm mới
 * được cả thẻ mới, thẻ bị xoá và mọi field chứ không chỉ cột.
 * stagesMap đầu vào không bị sửa: stage đoán được ghi vào bản sao trả về, và các item phía sau
 * trong cùng lần gọi dùng lại stage đã đoán, giống hành vi cũ trong loadData.
 */
export function mapItemsToCVProfiles(
  // Item thô từ mcpapp.lists.getItems: Hub không có kiểu cho payload, customFields có thể là mảng
  // hoặc object tuỳ phiên bản Hub.
  items: ReadonlyArray<any>,
  fieldsMap: Readonly<Record<string, string>>,
  stagesMap: Readonly<Record<string, string>>,
): MappedBoardCVs {
  const sMap: Record<string, string> = { ...stagesMap };

  const cvs: CVProfile[] = items.map((item: any) => {
    let score, category, reason, email, sdt;
    const inviteMailSent = wasInviteMailSent(item.customFields);
    if (Array.isArray(item.customFields)) {
      item.customFields.forEach((cf: any) => {
        const fieldIdStr = cf.fieldId || cf.fieldDefinitionId;
        const fieldName = (fieldsMap[fieldIdStr] || fieldIdStr || '').toLowerCase();
        if (fieldName.includes('tổng điểm') || fieldName.includes('tong_diem') || fieldName.includes('điểm')) score = cf.value;
        else if (fieldName.includes('phân loại') || fieldName.includes('phan_loai') || fieldName.includes('loại')) category = cf.value;
        else if (fieldName.includes('lý do') || fieldName.includes('ly_do') || fieldName.includes('nhận xét')) reason = cf.value;
        else if (fieldName.includes('email') || fieldName.includes('thu_dien_tu')) email = cf.value;
        else if (fieldName.includes('sdt') || fieldName.includes('sđt') || fieldName.includes('phone') || fieldName.includes('điện thoại')) sdt = cf.value;
      });
    } else if (item.customFields && typeof item.customFields === 'object') {
      Object.keys(item.customFields).forEach(key => {
        const fieldName = (fieldsMap[key] || key || '').toLowerCase();
        const val = item.customFields[key];
        if (fieldName.includes('tổng điểm') || fieldName.includes('tong_diem') || fieldName.includes('điểm')) score = val;
        else if (fieldName.includes('phân loại') || fieldName.includes('phan_loai') || fieldName.includes('loại')) category = val;
        else if (fieldName.includes('lý do') || fieldName.includes('ly_do') || fieldName.includes('nhận xét')) reason = val;
        else if (fieldName.includes('email') || fieldName.includes('thu_dien_tu')) email = val;
        else if (fieldName.includes('sdt') || fieldName.includes('sđt') || fieldName.includes('phone') || fieldName.includes('điện thoại')) sdt = val;
      });
    }

    // Fallback: scanner for candidate email if not present in customFields
    const textToScan = `${item.name || ''} ${item.title || ''} ${reason || ''} ${item.description || ''}`;
    if (!email) {
      const gmailMatch = textToScan.match(/[a-zA-Z0-9._%+-]+@gmail\.com/i);
      if (gmailMatch) {
        email = gmailMatch[0].toLowerCase();
      } else {
        const generalMatch = textToScan.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
        if (generalMatch) {
          email = generalMatch[0].toLowerCase();
        }
      }
    }

    if (!sdt) {
      const phoneMatch = textToScan.match(/(?:\+84|84|0)[35789][0-9\s\.\-]{8,12}\b/);
      if (phoneMatch) {
        sdt = phoneMatch[0].replace(/[^\d+]/g, '');
      }
    }

    // Fallback deduce stageId if sMap is missing this specific stageId
    if (!sMap[item.stageId] && item.stageId && category) {
      const normalized = String(category || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D').trim();
      if (normalized.includes('SAI JD')) {
        sMap[item.stageId] = '06_Sai_JD';
      } else if (normalized.includes('KHONG DAT') || normalized.includes('KHONG TUYEN')) {
        sMap[item.stageId] = '02_Loai_CV';
      } else if (normalized.includes('DAT') || normalized.includes('CAN NHAC')) {
        sMap[item.stageId] = '03_Tiem_Nang';
      } else {
        sMap[item.stageId] = '01_Dau_Vao';
      }
    }

    return {
      _id: item._id || item.id,
      name: item.name || item.title || 'Không tên',
      status: sMap[item.stageId] || item.stage || item.status || '01_Dau_Vao',
      score,
      category,
      reason,
      email: email || '',
      sdt: sdt || '',
      customFields: item.customFields,
      inviteMailSent,
    };
  });

  return { cvs, stagesMap: sMap };
}
```

Trước khi viết, đối chiếu từng dòng với `CVScoredTab.tsx:634-708` hiện tại. Nếu file đã lệch khỏi đoạn trên, chép theo file (logic phải giống hệt code đang chạy) và ghi phần lệch vào report.

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/cv-item-mapper.spec.ts`
Expected: 5 PASS.

- [ ] **Step 5: Không commit.**

---

### Task 2: Hàm so sánh cho poll

**Files:**
- Create: `src/ui/cv-scored/cv-poll-diff.ts`
- Test: `tests/cv-poll-diff.spec.ts`

**Interfaces:**
- Consumes: `CVProfile` (type, từ `src/ui/cv-scored/CVScoredTab.tsx`).
- Produces:
  ```ts
  export function areCvListsEqual(a: ReadonlyArray<CVProfile>, b: ReadonlyArray<CVProfile>): boolean
  export function areStageMapsEqual(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean
  ```

- [ ] **Step 1: Viết test fail**

Tạo `tests/cv-poll-diff.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { areCvListsEqual, areStageMapsEqual } from '../src/ui/cv-scored/cv-poll-diff';
import type { CVProfile } from '../src/ui/cv-scored/CVScoredTab';

function cv(id: string, overrides: Partial<CVProfile> = {}): CVProfile {
  return {
    _id: id,
    name: `CV ${id}`,
    status: '03_Tiem_Nang',
    score: 80,
    category: 'ĐẠT',
    reason: 'ok',
    email: `${id}@x.com`,
    sdt: '0901234567',
    customFields: [{ fieldId: 'f1', value: 80 }],
    inviteMailSent: false,
    ...overrides,
  };
}

describe('areCvListsEqual', () => {
  it('true khi không có gì đổi, kể cả là object khác', () => {
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('a'), cv('b')])).toBe(true);
  });

  it('false khi thẻ đổi cột', () => {
    expect(areCvListsEqual([cv('a')], [cv('a', { status: '05_Moi_Phong_Van' })])).toBe(false);
  });

  it('false khi có thẻ mới hoặc thẻ bị xoá', () => {
    expect(areCvListsEqual([cv('a')], [cv('a'), cv('b')])).toBe(false);
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('a')])).toBe(false);
  });

  it('false khi đổi thứ tự hoặc thay thẻ khác cùng số lượng', () => {
    expect(areCvListsEqual([cv('a'), cv('b')], [cv('b'), cv('a')])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('c')])).toBe(false);
  });

  it('false khi đổi điểm, cờ đã gửi mail hoặc customFields', () => {
    expect(areCvListsEqual([cv('a')], [cv('a', { score: 90 })])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('a', { inviteMailSent: true })])).toBe(false);
    expect(areCvListsEqual([cv('a')], [cv('a', { customFields: [{ fieldId: 'f1', value: 81 }] })])).toBe(false);
  });
});

describe('areStageMapsEqual', () => {
  it('true khi cùng key và giá trị, không phụ thuộc thứ tự key', () => {
    expect(areStageMapsEqual({ s1: '01_Dau_Vao', s2: '02_Loai_CV' }, { s2: '02_Loai_CV', s1: '01_Dau_Vao' })).toBe(true);
  });

  it('false khi thêm key hoặc đổi giá trị', () => {
    expect(areStageMapsEqual({ s1: '01_Dau_Vao' }, { s1: '01_Dau_Vao', sx: '06_Sai_JD' })).toBe(false);
    expect(areStageMapsEqual({ s1: '01_Dau_Vao' }, { s1: '02_Loai_CV' })).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/cv-poll-diff.spec.ts`
Expected: FAIL, không resolve được module `../src/ui/cv-scored/cv-poll-diff`.

- [ ] **Step 3: Viết hàm**

Tạo `src/ui/cv-scored/cv-poll-diff.ts`:

```ts
import type { CVProfile } from './CVScoredTab';

/** Các field hiển thị trên thẻ, so bằng ===. customFields là mảng/object nên so riêng. */
const COMPARED_FIELDS = ['status', 'name', 'score', 'category', 'reason', 'email', 'sdt', 'inviteMailSent'] as const;

/**
 * Hai danh sách thẻ giống nhau về mọi thứ người dùng thấy và mọi thứ luồng gửi mail mời ghi lại
 * (customFields). Poll chỉ setBoards khi hàm này trả false, để không re-render mỗi 3 giây.
 */
export function areCvListsEqual(a: ReadonlyArray<CVProfile>, b: ReadonlyArray<CVProfile>): boolean {
  if (a.length !== b.length) return false;
  return a.every((cv, index) => {
    const other = b[index];
    return cv._id === other._id
      && COMPARED_FIELDS.every((field) => cv[field] === other[field])
      && JSON.stringify(cv.customFields) === JSON.stringify(other.customFields);
  });
}

export function areStageMapsEqual(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}
```

- [ ] **Step 4: Chạy test**

Run: `npx vitest run tests/cv-poll-diff.spec.ts`
Expected: 7 PASS.

- [ ] **Step 5: Không commit.**

---

### Task 3: Wiring trong `CVScoredTab.tsx`

**Files:**
- Modify: `src/ui/cv-scored/CVScoredTab.tsx` (import dòng 15; `CVBoardData` dòng 206-211; luồng gửi mail mời dòng 445-462; `loadData` dòng 631-716; poll dòng 741-796; `handleMove` dòng 836)
- Modify: `src/ui/cv-scored/cv-list-reader.ts` (xoá `readBoardStatuses`, dòng 37-60)
- Modify: `tests/cv-list-reader.spec.ts` (xoá import và khối `describe('readBoardStatuses')`)
- Modify: `tests/invite-sent-outcome.spec.ts` (fixture thêm `fieldsMap`)
- Test: `tests/cv-scored-full-polling.spec.ts`

**Interfaces:**
- Consumes: `mapItemsToCVProfiles` (Task 1, `./cv-item-mapper`), `areCvListsEqual` và `areStageMapsEqual` (Task 2, `./cv-poll-diff`), `fetchScreeningListItems` (đã có, `./cv-list-reader`).
- Produces: `CVBoardData` có thêm `fieldsMap: Record<string, string>`.

Mọi thay đổi dưới đây khớp theo nội dung chuỗi cũ, không theo số dòng. Số dòng chỉ để tham khảo.

- [ ] **Step 1: Viết test fail**

Vitest chạy `environment: 'node'`, không có DOM, nên wiring được kiểm tra bằng cách quét source.

Tạo `tests/cv-scored-full-polling.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tab = readFileSync(resolve(__dirname, '../src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');
const reader = readFileSync(resolve(__dirname, '../src/ui/cv-scored/cv-list-reader.ts'), 'utf8');

describe('CVScoredTab — poll làm mới đầy đủ board', () => {
  it('lần tải đầu và poll dùng chung một mapper', () => {
    expect(tab).toContain('mapItemsToCVProfiles(items, fMap, sMap)');
    expect(tab).toContain('mapItemsToCVProfiles(items, board.fieldsMap, board.stagesMap)');
  });

  it('poll đọc toàn bộ item, không còn chỉ đọc cột', () => {
    expect(tab).not.toContain('readBoardStatuses');
    expect(reader).not.toContain('readBoardStatuses');
    expect(tab).toContain('await fetchScreeningListItems(app, board.listId)');
  });

  it('chỉ thay board khi có khác biệt', () => {
    expect(tab).toContain('areCvListsEqual(board.cvs, snapshot.cvs)');
    expect(tab).toContain('areStageMapsEqual(board.stagesMap, snapshot.stagesMap)');
  });

  it('luồng gửi mail mời chặn poll trong lúc ghi', () => {
    expect(tab).toContain('pollingGuardRef.current.beginMove(inviteCvId)');
    expect(tab).toContain('pollingGuardRef.current.endMove(inviteCvId)');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/cv-scored-full-polling.spec.ts`
Expected: 4 FAIL.

- [ ] **Step 3: Import**

Thay:

```ts
import { fetchScreeningListItems, readBoardStatuses } from './cv-list-reader';
```

bằng:

```ts
import { fetchScreeningListItems } from './cv-list-reader';
import { mapItemsToCVProfiles } from './cv-item-mapper';
import { areCvListsEqual, areStageMapsEqual } from './cv-poll-diff';
```

Và thay:

```ts
import { markInviteMailSent, wasInviteMailSent, INVITE_MAIL_SENT_FIELD_ID } from './invite-mail-persistence';
```

bằng (sau Step 5, `wasInviteMailSent` chỉ còn được gọi trong `cv-item-mapper.ts`):

```ts
import { markInviteMailSent, INVITE_MAIL_SENT_FIELD_ID } from './invite-mail-persistence';
```

- [ ] **Step 4: `CVBoardData` thêm `fieldsMap`**

Thay:

```ts
export interface CVBoardData {
  listId: string;
  listName: string;
  stagesMap: Record<string, string>;
  cvs: CVProfile[];
}
```

bằng:

```ts
export interface CVBoardData {
  listId: string;
  listName: string;
  stagesMap: Record<string, string>;
  /** fieldId -> tên field; poll cần để đọc lại điểm, phân loại, email, SĐT. */
  fieldsMap: Record<string, string>;
  cvs: CVProfile[];
}
```

- [ ] **Step 5: `loadData` dùng mapper**

Trong `loadData`, thay cả đoạn từ dòng `const items = await fetchScreeningListItems(app, lId);` tới hết lời gọi `loadedBoards.push({ ... });` (gồm toàn bộ khối `const loadedCvs: CVProfile[] = items.map((item: any) => { ... });`) bằng:

```ts
        const items = await fetchScreeningListItems(app, lId);
        const mapped = mapItemsToCVProfiles(items, fMap, sMap);

        loadedBoards.push({
          listId: lId,
          listName: targetList.name,
          stagesMap: mapped.stagesMap,
          fieldsMap: fMap,
          cvs: mapped.cvs,
        });
```

Sau bước này, `loadData` không được còn biến `loadedCvs` hay bất kỳ dòng nào của khối map cũ.

- [ ] **Step 6: Viết lại poll**

Thay toàn bộ khối từ `const pollStageMoves = useCallback(async (required = false) => {` tới hết `}, [app, boards]);` bằng:

```ts
  // Mỗi lần poll dựng lại toàn bộ board từ item trên Hub: thẻ mới xuất hiện, thẻ bị xoá biến mất,
  // mọi field được làm mới. Chỉ setBoards khi có khác biệt để không re-render mỗi 3 giây.
  const pollBoards = useCallback(async (required = false) => {
    if (!app || boards.length === 0) return;
    const pollId = required
      ? pollingGuardRef.current.requestPoll()
      : pollingGuardRef.current.tryBeginPoll();
    if (pollId === null) return;

    try {
      const snapshots = await Promise.all(boards.map(async (board) => {
        const items = await fetchScreeningListItems(app, board.listId);
        return { listId: board.listId, ...mapItemsToCVProfiles(items, board.fieldsMap, board.stagesMap) };
      }));

      if (!pollingGuardRef.current.canApplyPoll(pollId)) return;
      const snapshotsByList = new Map(snapshots.map(snapshot => [snapshot.listId, snapshot]));
      setBoards((previous) => {
        let boardsChanged = false;
        const nextBoards = previous.map((board) => {
          const snapshot = snapshotsByList.get(board.listId);
          if (!snapshot) return board;
          if (
            areCvListsEqual(board.cvs, snapshot.cvs)
            && areStageMapsEqual(board.stagesMap, snapshot.stagesMap)
          ) {
            return board;
          }
          boardsChanged = true;
          return { ...board, stagesMap: snapshot.stagesMap, cvs: snapshot.cvs };
        });
        return boardsChanged ? nextBoards : previous;
      });
    } catch (error) {
      console.error('[CVScoredTab] Không thể đồng bộ board CV:', error);
    } finally {
      if (pollingGuardRef.current.finishPoll(pollId)) {
        pendingPollRunnerRef.current();
      }
    }
  }, [app, boards]);
```

Ngay sau đó, trong effect và `usePolling`, đổi `pollStageMoves` thành `pollBoards`:

```ts
  useEffect(() => {
    pendingPollRunnerRef.current = () => { void pollBoards(); };
  }, [pollBoards]);

  usePolling(
    pollBoards,
    {
      enabled: active && Boolean(app && roomId),
      interval: 3000,
      immediate: false,
    }
  );
```

Trong `handleMove`, thay `void pollStageMoves(true);` bằng `void pollBoards(true);`.

Sau bước này, file không được còn chuỗi `pollStageMoves`.

- [ ] **Step 7: Chặn poll trong luồng gửi mail mời**

Trong handler gửi mail mời, thay:

```ts
      const updatedCustomFields = markInviteMailSent(selectedCVForInvite.customFields);
      await restCall(app, 'POST', 'items.update', {
        body: {
          itemId: selectedCVForInvite._id,
          name: selectedCVForInvite.name,
          customFields: updatedCustomFields,
        },
      });
      const stageMove = await moveInvitedCVToPendingStage(
        app,
        selectedCVForInvite._id,
        getInterviewPendingStageId(selectedBoard.stagesMap),
      );
      if (stageMove.status === 'failed') {
        console.error('[CVScoredTab] Đã gửi mail mời nhưng không chuyển được CV sang cột Chưa phỏng vấn:', stageMove.detail);
      }
      setSentInviteCVIds((previous) => new Set(previous).add(selectedCVForInvite._id));
      setBoards((previous) => applyInviteSentToBoards(previous, selectedCVForInvite._id, updatedCustomFields, stageMove));
      alert(buildInviteSentMessage({ targetEmail, logged, stageMove }));
      setInviteModalOpen(false);
```

bằng:

```ts
      // Poll đang chạy có thể mang dữ liệu trước khi ghi cờ đã gửi mail / đổi cột, rồi đè lên cập
      // nhật lạc quan bên dưới. Coi thao tác này như một lần kéo thẻ để guard chặn poll đó.
      const inviteCvId = selectedCVForInvite._id;
      const guardedInvite = pollingGuardRef.current.beginMove(inviteCvId);
      try {
        const updatedCustomFields = markInviteMailSent(selectedCVForInvite.customFields);
        await restCall(app, 'POST', 'items.update', {
          body: {
            itemId: inviteCvId,
            name: selectedCVForInvite.name,
            customFields: updatedCustomFields,
          },
        });
        const stageMove = await moveInvitedCVToPendingStage(
          app,
          inviteCvId,
          getInterviewPendingStageId(selectedBoard.stagesMap),
        );
        if (stageMove.status === 'failed') {
          console.error('[CVScoredTab] Đã gửi mail mời nhưng không chuyển được CV sang cột Chưa phỏng vấn:', stageMove.detail);
        }
        setSentInviteCVIds((previous) => new Set(previous).add(inviteCvId));
        setBoards((previous) => applyInviteSentToBoards(previous, inviteCvId, updatedCustomFields, stageMove));
        alert(buildInviteSentMessage({ targetEmail, logged, stageMove }));
        setInviteModalOpen(false);
      } finally {
        if (guardedInvite) {
          pollingGuardRef.current.endMove(inviteCvId);
          void pollBoards(true);
        }
      }
```

`alert` và `setInviteModalOpen(false)` nằm trong `try` để `stageMove` là `const`. `alert` chặn luồng JS nên poll không thể chạy trong lúc hộp thoại mở, vì thế việc guard vẫn giữ trong lúc đó không làm thay đổi hành vi. Khi `try` ném lỗi, `finally` trả guard trước, rồi `catch` ngoài cùng hiện "Lỗi gửi email" như cũ.

`pollingGuardRef` và `pollBoards` được khai báo sau handler này trong thân component. Chúng chỉ được đọc khi handler chạy (sau render), nên không vi phạm TDZ. `handleMove` hiện cũng dùng `pollStageMoves` theo cách tương tự.

- [ ] **Step 8: Xoá `readBoardStatuses`**

Trong `src/ui/cv-scored/cv-list-reader.ts`, xoá toàn bộ khối JSDoc `/** Ảnh chụp trạng thái stage của một board ... */` cùng hàm `export async function readBoardStatuses(...) { ... }` (dòng 37-60).

Kiểm tra `CV_LIST_MAX_PAGES` và `fetchAllListItems` vẫn còn được `fetchScreeningListItems` dùng, nên giữ nguyên import.

Trong `tests/cv-list-reader.spec.ts`:
- Thay `import { fetchScreeningListItems, readBoardStatuses } from '../src/ui/cv-scored/cv-list-reader';` bằng `import { fetchScreeningListItems } from '../src/ui/cv-scored/cv-list-reader';`
- Xoá toàn bộ khối `describe('readBoardStatuses', () => { ... });` (3 test). Test "đọc hết các trang" đã có tương đương cho `fetchScreeningListItems` ở khối phía trên, và poll giờ dùng hàm đó.

- [ ] **Step 9: Fixture test**

Trong `tests/invite-sent-outcome.spec.ts`, hàm `boardsFixture`, thay:

```ts
      stagesMap: { 'stage-5': '05_Moi_Phong_Van', 'stage-7': '07_Chua_Phong_Van' },
```

bằng:

```ts
      stagesMap: { 'stage-5': '05_Moi_Phong_Van', 'stage-7': '07_Chua_Phong_Van' },
      fieldsMap: {},
```

- [ ] **Step 10: Chạy test và typecheck (công cụ phát triển, không phải bằng chứng pass)**

Run: `npx vitest run tests/cv-scored-full-polling.spec.ts tests/cv-item-mapper.spec.ts tests/cv-poll-diff.spec.ts tests/cv-list-reader.spec.ts tests/invite-sent-outcome.spec.ts`
Expected: toàn bộ PASS.

Run: `npm run typecheck:strict-unused`
Expected: không có lỗi. Nếu có lỗi dạng unused (ví dụ `wasInviteMailSent` hoặc `CVProfile` không còn dùng trong `CVScoredTab.tsx`), chỉ xoá đúng tên bị báo khỏi import và ghi vào report.

- [ ] **Step 11: Không commit.**

---

### Task 4: Kiểm tra toàn bộ

- [ ] **Step 1:** `npm test`. Kết quả chỉ là tham khảo, không phải bằng chứng pass. Kỳ vọng: không có fail nào ngoài `tests/manifest.spec.ts` (fail sẵn từ trước).
- [ ] **Step 2:** `npm run typecheck:strict-unused` và `npm run build`. Kết quả chỉ là tham khảo.
- [ ] **Step 3 (kiểm tra hợp lệ duy nhất):** người dùng chạy `npm start`, mở tab "CV đã chấm" và mở Hub ở một tab khác:
  1. Thêm một thẻ vào list SCREENING trên Hub. Thẻ phải hiện trên board trong khoảng 3 giây.
  2. Xoá một thẻ trên Hub. Thẻ phải biến mất khỏi board trong khoảng 3 giây.
  3. Sửa "Tổng điểm" của một thẻ trên Hub. Điểm trên thẻ phải đổi trong khoảng 3 giây.
  4. Kéo một thẻ sang cột khác trên Hub. Thẻ phải chuyển cột trên board trong khoảng 3 giây.
  5. Gửi mail mời phỏng vấn cho một thẻ trong app. Nút phải giữ trạng thái "đã gửi" và thẻ phải nằm ở cột "Chưa phỏng vấn", không bị bật ngược lại sau lần poll kế tiếp.
  6. Để yên tab 30 giây khi không có thay đổi. Trong DevTools, React Profiler không được ghi nhận commit nào của `CVScoredTab` do poll gây ra.
