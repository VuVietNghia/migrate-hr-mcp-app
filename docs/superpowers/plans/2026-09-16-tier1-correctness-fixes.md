# Tier 1 Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 4 lỗi đã xác định trong đợt rà soát 2026-09-16: file đính kèm bị gán nhầm field khi tạo hồ sơ, ID local trùng nhau, thông báo lỗi dùng chung viết cứng nghiệp vụ bảng lương, và 2 điểm đọc list CV bị cắt cụt im lặng.

**Architecture:** Cả 4 việc đều sửa tại chỗ trên code đã có, tái dùng hai tiện ích sẵn có trong repo: bảng alias khớp tên field chính xác (`profile-field-aliases.ts`) và module phân trang (`list-item-paging.ts`). Việc duy nhất tạo file mới là tách 2 hàm đọc list ra khỏi `CVScoredTab.tsx` để test được — component React không test được trực tiếp vì repo không có hạ tầng render-hook.

**Tech Stack:** TypeScript strict, React 18, Vitest 2.1.9, PrivOS MCP App SDK (`@privos_ai/app-react`).

**Spec:** Không có file spec riêng. Đây là bounded task, thiết kế đã được duyệt trực tiếp trong hội thoại ngày 2026-09-16; toàn bộ nội dung thiết kế được chép nguyên văn vào từng task bên dưới, không cần đọc thêm tài liệu nào khác.

## Global Constraints

- **Tuyệt đối không commit, không push, không chạy bất kỳ lệnh git ghi nào.** Git chỉ được dùng ở chế độ đọc (`git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`). Mỗi task kết thúc bằng bước chạy test + typecheck, KHÔNG có bước commit. Người dùng tự quyết định việc commit.
- **Ghi file chỉ bằng công cụ Write/Edit, tuyệt đối không dùng shell heredoc / redirection (`>`, `>>`, `cat <<EOF`).** Trên Windows đường shell mã hoá lại UTF-8 và làm hỏng toàn bộ tiếng Việt trong file (mojibake). Đây là lỗi đã xảy ra thật ở đợt plan trước.
- **Không dùng emoji, icon trong code, comment, tên test hay bất kỳ output nào.**
- **Không được chạm vào các file đang bị thành viên khác sửa song song (rủi ro merge):** `src/ui/email-templates/**`, `src/ui/email-history/EmailMailboxView.tsx`, `src/ui/email-history/EmailTab.tsx`, `src/ui/lifecycle/di/EmployeeEmailTemplateContext.tsx`, `src/ui/data/email-templates/**`, `src/ui/privos-rest.ts`, `src/ui/App.tsx`, `src/ui/lifecycle/LifecycleDashboard.tsx`, `src/ui/pipeline-dashboard.tsx`, `src/ui/jd-chatbot-functional.tsx`, `src/ui/bot-drafting-tab.tsx`. Không task nào trong plan này cần chạm vào chúng.
- **TypeScript strict.** Không thêm `any` mới mà không có comment giải thích ngay bên cạnh. `any` có sẵn trên các dòng đang sửa là quy ước cũ của repo — giữ nguyên, không mở rộng thêm.
- **Baseline test trước khi bắt đầu: 262 test, 259 pass, 3 fail.** Ba fail này là lỗi có sẵn, ngoài phạm vi: `tests/manifest.spec.ts` (2 fail), `tests/ui-shell.spec.ts` (1 fail). Sau mỗi task, đây phải vẫn là 3 fail DUY NHẤT.
- **Lệnh chạy test:** `npm test` (tức `vitest run`). Chạy một file: `npx vitest run tests/<tên file>`.
- **Lệnh typecheck:** `npm run typecheck:strict-unused`.
- **Không sửa `src/ui/lifecycle/services/lifecycleService.ts`.** File này là dead code, đã kiểm tra không còn ai import trong toàn bộ `src/`. Nó cũng chứa bản trùng của 2 lỗi trong plan này; sửa ở đó không có tác dụng thật. Việc xoá file là một task dọn dẹp riêng, ngoài phạm vi plan này.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | Sửa lookup field file đính kèm; sửa sinh ID local | 1, 2 |
| `tests/lifecycle-load-profiles.spec.ts` | Test cho 2 sửa đổi trên | 1, 2 |
| `src/ui/list-item-paging.ts` | Bỏ tham chiếu nghiệp vụ "bảng lương" khỏi thông báo lỗi dùng chung | 3 |
| `tests/list-item-paging.spec.ts` | Test ghim thông báo lỗi trung lập nghiệp vụ | 3 |
| `src/ui/cv-scored/cv-list-reader.ts` (TẠO MỚI) | Hai hàm đọc list CV có phân trang: đọc item của list SCREENING, và chụp trạng thái stage của một board | 4 |
| `tests/cv-list-reader.spec.ts` (TẠO MỚI) | Test phân trang, lọc item hệ thống, giữ thứ tự hiển thị | 4 |
| `src/ui/cv-scored/CVScoredTab.tsx` | Thay 2 lời gọi `getItems` thô bằng 2 hàm mới | 4 |

---

### Task 1: Sửa `createProfile` gán file đính kèm vào đúng trường

**Bối cảnh lỗi:** Tại `PrivOSLifecycleService.ts:92-96`, việc tìm trường để gắn file dùng một `.find()` với predicate OR gộp. `.find()` duyệt TỪNG PHẦN TỬ của mảng theo thứ tự và chạy TOÀN BỘ predicate cho phần tử đó, nên `fd.type === 'DOCUMENT'` KHÔNG hề được ưu tiên. Trong một room có trường SELECT tên "Loại hồ sơ" đứng trước trường DOCUMENT thật trong `fieldDefinitions`, nhánh `includes('hồ sơ')` khớp ngay ở phần tử đầu, file upload bị ghi vào trường SELECT và trường đính kèm thật để trống.

**Cách sửa:** Tách thành hai lượt duyệt riêng. Lượt 1 chỉ chấp nhận `fd.type === 'DOCUMENT'`. Lượt 2 (chỉ chạy khi lượt 1 không tìm được) dùng `resolveProfileFieldKey` — bảng alias khớp tên CHÍNH XÁC đã có sẵn trong `src/ui/lifecycle/profile-field-aliases.ts`, nơi `attachedFileObj` đã được khai báo cho 3 tên: `HO SO DINH KEM`, `TAI LIEU`, `DOCUMENT`.

**Lưu ý — đây là điều chỉnh so với thiết kế duyệt trong hội thoại:** thiết kế ban đầu nói lượt 2 giữ nguyên `includes('hồ sơ')`. Dùng `resolveProfileFieldKey` tốt hơn và được chọn thay thế, vì: (a) bảng alias tồn tại chính xác để diệt kiểu khớp `includes` này, (b) tên "Loại hồ sơ" chuẩn hoá thành `LOAI HO SO` không có trong bảng nên bị loại đúng đắn, (c) đây là chỗ `includes()` cuối cùng còn sót lại trong luồng khớp tên field. `resolveProfileFieldKey` đã được import sẵn ở dòng 4 của file, không cần thêm import.

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:90-100`
- Test: `tests/lifecycle-load-profiles.spec.ts` (thêm một `describe` mới vào cuối file)

**Interfaces:**
- Consumes: `resolveProfileFieldKey(fieldName: string): ProfileFieldKey | undefined` từ `../profile-field-aliases` (đã import sẵn ở dòng 4).
- Produces: không có API mới. Hành vi của `createProfile(roomId, data)` thay đổi: trường nhận file được chọn theo `type === 'DOCUMENT'` trước, sau đó mới tới khớp alias chính xác.

- [ ] **Step 1: Viết test thất bại**

Thêm vào CUỐI file `tests/lifecycle-load-profiles.spec.ts`:

```ts
describe('PrivOSLifecycleService gan file dinh kem dung truong', () => {
  const LIST_CO_TRUONG_LOAI_HO_SO = {
    _id: 'list-1',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    fieldDefinitions: [
      // Dat TRUOC truong DOCUMENT that. `.find()` duyet theo thu tu mang va chay ca predicate
      // cho tung phan tu, nen mot predicate OR gop se chon dung truong nay.
      { _id: 'fd-loai-ho-so', name: 'Loại hồ sơ', type: 'SELECT', options: [] },
      { _id: 'fd-tep-dinh-kem', name: 'Hồ sơ đính kèm', type: 'DOCUMENT' },
    ],
    stages: STAGES,
  };

  function customFieldsOfCreateCall(calls: ToolCall[]) {
    const createCall = calls.find(c => c.name === 'mcpapp.lists.createItem');
    return createCall!.arguments!.customFields as Array<{ fieldId: string; value: unknown }>;
  }

  it('gan file vao truong DOCUMENT chu khong phai truong SELECT ten "Loai ho so"', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_CO_TRUONG_LOAI_HO_SO],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1', downloadUrl: 'https://example.com/cv.pdf' },
    } as never);

    const customFields = customFieldsOfCreateCall(calls);
    expect(customFields.find(f => Array.isArray(f.value))!.fieldId).toBe('fd-tep-dinh-kem');
    expect(customFields.some(f => f.fieldId === 'fd-loai-ho-so')).toBe(false);
  });

  it('khong gan file vao truong chi chua chu "ho so" khi khong co truong DOCUMENT nao', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_CO_TRUONG_LOAI_HO_SO,
        fieldDefinitions: [{ _id: 'fd-loai-ho-so', name: 'Loại hồ sơ', type: 'SELECT', options: [] }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1' },
    } as never);

    expect(customFieldsOfCreateCall(calls).some(f => f.fieldId === 'fd-loai-ho-so')).toBe(false);
  });

  it('van gan duoc file qua bang alias khi truong khong khai bao type DOCUMENT', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_CO_TRUONG_LOAI_HO_SO,
        fieldDefinitions: [{ _id: 'fd-tai-lieu', name: 'Tài liệu', type: 'TEXT' }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      attachedFileObj: { _id: 'file-1' },
    } as never);

    expect(customFieldsOfCreateCall(calls).find(f => Array.isArray(f.value))!.fieldId).toBe('fd-tai-lieu');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`

Expected: 3 test mới đều FAIL.
- Test 1 fail vì `fileFieldDef` hiện trả về `fd-loai-ho-so` (khớp `includes('hồ sơ')` ở phần tử đầu tiên), nên assertion `toBe('fd-tep-dinh-kem')` sai.
- Test 2 fail vì `fd-loai-ho-so` bị gán file, `toBe(false)` sai.
- Test 3 fail vì "Tài liệu" không chứa chuỗi `hồ sơ` lẫn `document`, không trường nào khớp, `customFields.find(...)` trả `undefined` và truy cập `.fieldId` ném `TypeError`.

Nếu bất kỳ test nào PASS ở bước này, DỪNG LẠI và đọc lại code — nghĩa là giả định về lỗi sai.

- [ ] **Step 3: Sửa code**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, thay nguyên khối dòng 90-100:

```ts
        if (fileObjToSave) {
          // Tìm trường có type là DOCUMENT hoặc tên chứa 'hồ sơ' / 'document'
          const fileFieldDef = (list.fieldDefinitions || []).find((fd: any) =>
            fd.type === 'DOCUMENT' ||
            (fd.name || '').toLowerCase().includes('hồ sơ') ||
            (fd.name || '').toLowerCase().includes('document')
          );
          if (fileFieldDef) {
            customFields.push({ fieldId: fileFieldDef._id || fileFieldDef.id, value: [fileObjToSave] });
          }
        }
```

bằng:

```ts
        if (fileObjToSave) {
          // Hai lượt tách bạch, không gộp thành một predicate OR: `.find()` chạy cả predicate
          // cho từng phần tử theo thứ tự mảng, nên gộp lại thì `type === 'DOCUMENT'` không hề
          // được ưu tiên — một trường SELECT tên "Loại hồ sơ" đứng trước sẽ thắng và nuốt file.
          // Lượt 2 khớp tên qua bảng alias chính xác thay vì `includes`, cùng lý do đã bỏ
          // `includes` ở luồng đọc: "Loại hồ sơ" không nằm trong bảng nên bị loại đúng đắn.
          const fieldDefs: any[] = list.fieldDefinitions || [];
          const fileFieldDef =
            fieldDefs.find((fd: any) => fd.type === 'DOCUMENT')
            ?? fieldDefs.find((fd: any) => resolveProfileFieldKey(fd.name) === 'attachedFileObj');
          if (fileFieldDef) {
            customFields.push({ fieldId: fileFieldDef._id || fileFieldDef.id, value: [fileObjToSave] });
          }
        }
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: toàn bộ file PASS, không có warning nào trong output.

- [ ] **Step 5: Chạy toàn bộ suite và typecheck**

Run: `npm test`
Expected: đúng 3 fail có sẵn (`manifest.spec.ts` ×2, `ui-shell.spec.ts` ×1), không có fail nào khác.

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

KHÔNG commit. Báo cáo kết quả kèm số test trước/sau.

---

### Task 2: Sửa `generateLocalId` sinh ID trùng trong cùng một mili-giây

**Bối cảnh lỗi:** `PrivOSLifecycleService.ts:186-188` sinh ID dự phòng bằng `local-${Date.now()}`. Khi người dùng bấm tạo hồ sơ hai lần rất nhanh, hoặc khi tạo liên tiếp trong lúc Hub đang lỗi (cả hai lần đều rơi vào nhánh fallback), hai hồ sơ nhận cùng một `_id`. React dựng danh sách theo `_id` nên hai dòng trùng key, và mọi thao tác sau đó tác động nhầm dòng.

**Cách sửa:** Thêm thành phần ngẫu nhiên vào ID. Không dùng `crypto.randomUUID()` vì UI chạy trong iframe sandbox `Origin: null`, chưa xác nhận API này khả dụng ở đó; `Math.random()` chắc chắn chạy và đủ để tách hai lần gọi trong cùng mili-giây.

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:186-188`
- Test: `tests/lifecycle-load-profiles.spec.ts` (thêm một `describe` mới vào cuối file, và sửa dòng import ở đầu file)

**Interfaces:**
- Consumes: không có gì mới.
- Produces: `generateLocalId()` (private) vẫn trả `string` bắt đầu bằng `local-`, nhưng không còn là hàm thuần theo thời gian. Không caller nào ngoài class này dùng tới.

- [ ] **Step 1: Viết test thất bại**

Trước hết sửa dòng import ĐẦU TIÊN của `tests/lifecycle-load-profiles.spec.ts`, thêm `vi`:

```ts
import { describe, expect, it, vi } from 'vitest';
```

Rồi thêm vào CUỐI file:

```ts
describe('PrivOSLifecycleService id local khi tao ho so that bai', () => {
  it('sinh id khac nhau cho hai ho so tao trong cung mot mili-giay', async () => {
    // Dong bang dong ho de hai lan goi chac chan roi vao cung mot mili-giay. Neu de thoi gian
    // that chay, test se lúc pass lúc fail tuy toc do may — dung cai can tranh o day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:00:00.000Z'));
    try {
      const { app } = createAppStub({
        'mcpapp.lists.getAll': () => { throw new Error('hub khong phan hoi'); },
      });
      const service = new PrivOSLifecycleService(app as never);

      const dau = await service.createProfile('room-1', { name: 'NV A' } as never);
      const sau = await service.createProfile('room-1', { name: 'NV B' } as never);

      expect(dau._id).not.toBe(sau._id);
      expect(dau._id.startsWith('local-')).toBe(true);
      expect(sau._id.startsWith('local-')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "cung mot mili-giay"`

Expected: FAIL tại `expect(dau._id).not.toBe(sau._id)` — cả hai đều là `local-1789...` giống hệt nhau vì `Date.now()` đã bị đóng băng.

- [ ] **Step 3: Sửa code**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, thay:

```ts
  private generateLocalId(): string {
    return `local-${Date.now()}`;
  }
```

bằng:

```ts
  private generateLocalId(): string {
    // Hậu tố ngẫu nhiên là bắt buộc: hai hồ sơ tạo trong cùng một mili-giây (bấm hai lần nhanh,
    // hoặc tạo liên tiếp khi Hub đang lỗi) sẽ nhận cùng `Date.now()` và trùng `_id`.
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: toàn bộ file PASS, output sạch.

- [ ] **Step 5: Chạy toàn bộ suite và typecheck**

Run: `npm test`
Expected: đúng 3 fail có sẵn, không thêm fail nào.

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

KHÔNG commit.

---

### Task 3: Bỏ tham chiếu "bảng lương" khỏi thông báo lỗi của module dùng chung

**Bối cảnh lỗi:** `list-item-paging.ts:88-91` ném lỗi với câu "...nên không đối chiếu được với bảng lương." Module này là module dùng chung; hiện chỉ roster nhân sự dùng `missingId: 'throw'` nên câu chữ tình cờ đúng. Ngay khi caller thứ hai dùng `'throw'` (Task 4 dùng `'skip'`, nhưng tương lai không chắc), người dùng sẽ nhận một thông báo nói về nghiệp vụ hoàn toàn không liên quan tới thao tác họ vừa làm.

**Cách sửa:** Bỏ mệnh đề nghiệp vụ, giữ nguyên phần mô tả kỹ thuật và phần lý do dừng.

**Files:**
- Modify: `src/ui/list-item-paging.ts:88-91`
- Test: `tests/list-item-paging.spec.ts` (thêm 1 test vào cuối `describe('fetchAllListItems')`)

**Interfaces:**
- Consumes: không có gì mới.
- Produces: không đổi chữ ký. Chỉ đổi nội dung chuỗi lỗi. Hai test hiện có vẫn khớp: `tests/list-item-paging.spec.ts` khớp `/_id/`, `tests/lifecycle-load-profiles.spec.ts:296` khớp `/không mang _id/i` — chuỗi mới vẫn chứa cả hai.

- [ ] **Step 1: Viết test thất bại**

Thêm vào trong `describe('fetchAllListItems', ...)` của `tests/list-item-paging.spec.ts`, ngay trước dấu đóng `});` cuối cùng của describe đó:

```ts
  it('khong gan cung nghiep vu bang luong vao thong bao loi dung chung', async () => {
    // Module dung chung cho nhieu man hinh. Cau bao loi khong duoc noi ve bang luong, vi
    // caller `throw` tiep theo se hien mot thong bao sai nghiep vu cho nguoi dung.
    const { app } = createAppStub(() => [{ name: 'Khong co id' }]);

    const error = await fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 })
      .then(() => null, (e: unknown) => e as Error);

    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toContain('không mang _id lẫn id');
    expect(error!.message).not.toContain('bảng lương');
  });
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/list-item-paging.spec.ts -t "bang luong"`

Expected: FAIL tại `expect(error!.message).not.toContain('bảng lương')` — thông báo hiện tại chứa đúng cụm đó.

- [ ] **Step 3: Sửa code**

Trong `src/ui/list-item-paging.ts`, thay:

```ts
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id nên không đối chiếu được với bảng lương. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
```

bằng:

```ts
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run tests/list-item-paging.spec.ts tests/lifecycle-load-profiles.spec.ts`
Expected: cả hai file PASS. Chạy kèm `lifecycle-load-profiles.spec.ts` vì file đó có một assertion khớp regex trên chính chuỗi lỗi này (dòng 296).

- [ ] **Step 5: Chạy toàn bộ suite và typecheck**

Run: `npm test`
Expected: đúng 3 fail có sẵn.

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

KHÔNG commit.

---

### Task 4: Đọc hết list CV thay vì cắt cụt ở trang đầu

**Bối cảnh lỗi:** `CVScoredTab.tsx:642-645` và `:762-765` gọi thẳng `mcpapp.lists.getItems` không truyền `count`/`offset`. Hub mặc định chỉ trả trang đầu, không báo lỗi khi list dài hơn. Điểm gọi thứ nhất dựng danh sách CV hiển thị trên Kanban; điểm thứ hai dựng map trạng thái dùng để đồng bộ khi polling — CV nào rơi ngoài trang đầu sẽ không bao giờ được cập nhật trạng thái.

**Vì sao phải tách file mới:** `loadData` và `pollStageMoves` là `useCallback` khai báo bên trong component, không export, nên không test được nếu không dựng React. Repo không có `@testing-library/react` lẫn jsdom, và thêm hạ tầng đó nằm ngoài phạm vi. Tách hai đoạn đọc dữ liệu ra một module thuần async là cách duy nhất vừa test được vừa không thêm dependency — đồng thời giảm bớt kích thước cho `CVScoredTab.tsx` (1246 dòng, đã bị đánh dấu là file quá lớn).

**Cảnh báo hồi quy phải chặn:** lời gọi cũ ăn theo mặc định `createdAt desc` của Hub (mới nhất trước), còn `fetchAllListItems` ghim `createdAt asc`. Nếu bê nguyên, thứ tự thẻ CV trên Kanban sẽ lật ngược so với hiện tại. Hàm đọc phải `reverse()` lại để giữ đúng hành vi cũ, và phải có test ghim việc này.

**Files:**
- Create: `src/ui/cv-scored/cv-list-reader.ts`
- Create: `tests/cv-list-reader.spec.ts`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx` (thêm import; thay khối 642-648; thay khối 761-776)

**Interfaces:**
- Consumes: `fetchAllListItems(app, listId, { missingId, maxPages, pageSize? })` và type `ListItemPagingApp` từ `src/ui/list-item-paging.ts`.
- Produces:
  - `CV_LIST_MAX_PAGES: number` (= 100)
  - `fetchScreeningListItems(app: ListItemPagingApp, listId: string): Promise<any[]>` — trả toàn bộ item của list, đã loại item cấu hình hệ thống, thứ tự mới-nhất-trước.
  - `readBoardStatuses(app: ListItemPagingApp, listId: string, stagesMap: Record<string, string>): Promise<Map<string, string>>` — map `itemId -> tên stage`.

- [ ] **Step 1: Viết test thất bại**

Tạo file MỚI `tests/cv-list-reader.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fetchScreeningListItems, readBoardStatuses } from '../src/ui/cv-scored/cv-list-reader';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * Hai ham chi cham `app.callServerTool`, nen mot ham tra trang la stub day du.
 * SDK boc payload thanh JSON trong `content[0].text`; stub tai tao dung hinh dang do.
 */
function createAppStub(pages: (offset: number) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const payload = pages(Number(call.arguments?.offset ?? 0));
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  };
  return { app, calls };
}

function page(start: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `cv-${start + i}`,
    name: `CV ${start + i}`,
    stageId: 'stage-1',
  }));
}

describe('fetchScreeningListItems', () => {
  it('doc tiep trang sau thay vi cat danh sach CV o trang dau', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    await expect(fetchScreeningListItems(app, 'list-1')).resolves.toHaveLength(107);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('loai item cau hinh he thong ra khoi danh sach CV', async () => {
    const { app } = createAppStub(() => [
      { _id: 'cfg-1', name: '[Hệ thống] Không xoá - Cấu hình Kanban' },
      { _id: 'cv-1', name: 'Nguyen Van A' },
    ]);

    const items = await fetchScreeningListItems(app, 'list-1');
    expect(items.map((i: { _id: string }) => i._id)).toEqual(['cv-1']);
  });

  it('giu thu tu moi-nhat-truoc nhu truoc khi chuyen sang phan trang', async () => {
    // `fetchAllListItems` ghim `createdAt asc`, trong khi loi goi cu an theo mac dinh
    // `createdAt desc` cua Hub. Khong dao lai thi thu tu the CV tren Kanban bi lat nguoc.
    const { app } = createAppStub(() => page(0, 3));

    const items = await fetchScreeningListItems(app, 'list-1');
    expect(items.map((i: { _id: string }) => i._id)).toEqual(['cv-2', 'cv-1', 'cv-0']);
  });
});

describe('readBoardStatuses', () => {
  it('doc het cac trang de khong bo sot CV khi dong bo trang thai', async () => {
    const { app } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    const statuses = await readBoardStatuses(app, 'list-1', { 'stage-1': '03_Tiem_Nang' });
    expect(statuses.size).toBe(107);
    expect(statuses.get('cv-106')).toBe('03_Tiem_Nang');
  });

  it('uu tien ten stage tu stagesMap, roi moi den stage/status tren item', async () => {
    const { app } = createAppStub(() => [
      { _id: 'cv-1', stageId: 'stage-1' },
      { _id: 'cv-2', stageId: 'stage-la', stage: '01_Dau_Vao' },
      { _id: 'cv-3', stageId: 'stage-la', status: '02_Loai_CV' },
    ]);

    const statuses = await readBoardStatuses(app, 'list-1', { 'stage-1': '03_Tiem_Nang' });
    expect(statuses.get('cv-1')).toBe('03_Tiem_Nang');
    expect(statuses.get('cv-2')).toBe('01_Dau_Vao');
    expect(statuses.get('cv-3')).toBe('02_Loai_CV');
  });

  it('bo qua item khong co id thay vi nem loi giua luc polling', async () => {
    const { app } = createAppStub(() => [{ stageId: 'stage-1', name: 'Khong co id' }]);

    await expect(readBoardStatuses(app, 'list-1', { 'stage-1': '03_Tiem_Nang' }))
      .resolves.toEqual(new Map());
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/cv-list-reader.spec.ts`

Expected: FAIL ngay ở bước import — `Cannot find module '../src/ui/cv-scored/cv-list-reader'` (file chưa tồn tại).

- [ ] **Step 3: Tạo module mới**

Tạo file MỚI `src/ui/cv-scored/cv-list-reader.ts`:

```ts
import { fetchAllListItems, type ListItemPagingApp } from '../list-item-paging';

/** 100 × 100 = 10.000 CV mỗi list, cùng trần với roster nhân sự và hộp thư email. */
export const CV_LIST_MAX_PAGES = 100;

const SYSTEM_ITEM_MARKER = '[Hệ thống] Không xoá';

function isSystemConfigItem(item: { name?: unknown; title?: unknown }): boolean {
  if (typeof item.name === 'string') return item.name.includes(SYSTEM_ITEM_MARKER);
  if (typeof item.title === 'string') return item.title.includes(SYSTEM_ITEM_MARKER);
  return false;
}

/**
 * Đọc hết item của một list SCREENING, bỏ item cấu hình hệ thống.
 *
 * `missingId: 'skip'` chứ không phải `'throw'`: đây là dữ liệu hiển thị, mất một thẻ dễ thấy
 * hơn nhiều so với việc cả tab trắng vì một item hỏng. Roster nhân sự thì ngược lại, vì nó
 * dùng để đối chiếu và xoá dòng lương.
 *
 * Kết quả được đảo ngược: `fetchAllListItems` ghim `createdAt asc`, còn lời gọi
 * `mcpapp.lists.getItems` trước đây ăn theo mặc định `createdAt desc` của Hub. Không đảo thì
 * thứ tự thẻ trên Kanban lật ngược so với hành vi người dùng đang quen.
 */
export async function fetchScreeningListItems(
  app: ListItemPagingApp,
  listId: string,
): Promise<any[]> {
  const items = await fetchAllListItems(app, listId, {
    missingId: 'skip',
    maxPages: CV_LIST_MAX_PAGES,
  });
  return items.filter((item) => !isSystemConfigItem(item)).reverse();
}

/**
 * Ảnh chụp trạng thái stage của một board để đối chiếu khi polling.
 * Thứ tự không ảnh hưởng gì ở đây vì kết quả là một Map tra theo id.
 */
export async function readBoardStatuses(
  app: ListItemPagingApp,
  listId: string,
  stagesMap: Record<string, string>,
): Promise<Map<string, string>> {
  const items = await fetchAllListItems(app, listId, {
    missingId: 'skip',
    maxPages: CV_LIST_MAX_PAGES,
  });
  const statuses = new Map<string, string>();

  for (const item of items) {
    const itemId = item._id || item.id;
    const status = stagesMap[item.stageId]
      || (typeof item.stage === 'string' ? item.stage : undefined)
      || (typeof item.status === 'string' ? item.status : undefined);
    if (itemId && status) statuses.set(itemId, status);
  }

  return statuses;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run tests/cv-list-reader.spec.ts`
Expected: cả 6 test PASS, output sạch.

- [ ] **Step 5: Nối module vào `CVScoredTab.tsx`**

Thêm dòng import, đặt ngay sau dòng 11 (`import { CVBoardPollingGuard } from './polling-sync';`):

```ts
import { fetchScreeningListItems, readBoardStatuses } from './cv-list-reader';
```

Thay khối dòng 642-648:

```ts
        const itemsRes: any = await app.callServerTool({
          name: 'mcpapp.lists.getItems',
          arguments: { listId: lId }
        });
        const itemsParsed = JSON.parse(itemsRes?.content?.[0]?.text || '[]');
        let items = Array.isArray(itemsParsed) ? itemsParsed : (itemsParsed.items || []);
        items = items.filter((item: any) => !(item.name || item.title || '').includes('[Hệ thống] Không xoá'));
```

bằng:

```ts
        const items = await fetchScreeningListItems(app, lId);
```

Thay khối dòng 761-776 (phần đầu của callback trong `Promise.all`):

```ts
      const snapshots = await Promise.all(boards.map(async (board) => {
        const itemsRes: any = await app.callServerTool({
          name: 'mcpapp.lists.getItems',
          arguments: { listId: board.listId }
        });
        const parsed = JSON.parse(itemsRes?.content?.[0]?.text || '[]');
        const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
        const statuses = new Map<string, string>();

        for (const item of items) {
          const itemId = item._id || item.id;
          const status = board.stagesMap[item.stageId]
            || (typeof item.stage === 'string' ? item.stage : undefined)
            || (typeof item.status === 'string' ? item.status : undefined);
          if (itemId && status) statuses.set(itemId, status);
        }

        return { listId: board.listId, statuses };
      }));
```

bằng:

```ts
      const snapshots = await Promise.all(boards.map(async (board) => {
        const statuses = await readBoardStatuses(app, board.listId, board.stagesMap);
        return { listId: board.listId, statuses };
      }));
```

- [ ] **Step 6: Chạy typecheck**

Run: `npm run typecheck:strict-unused`

Expected: không lỗi. Nếu báo biến không dùng, kiểm tra xem `itemsRes`/`itemsParsed`/`parsed` còn sót dòng nào chưa xoá không.

- [ ] **Step 7: Chạy toàn bộ suite**

Run: `npm test`
Expected: đúng 3 fail có sẵn (`manifest.spec.ts` ×2, `ui-shell.spec.ts` ×1), không thêm fail nào. Tổng số test tăng thêm đúng số test mới đã viết trong plan này.

KHÔNG commit.

- [ ] **Step 8: Kiểm tra thật trên app đang chạy**

Đây là thay đổi UI, test không chứng minh được thứ tự hiển thị thật. Chạy `npm start`, mở tab CV đã chấm điểm, và xác nhận bằng mắt:
1. Danh sách CV hiển thị đúng thứ tự mới nhất ở trên như trước khi sửa.
2. Item `[Hệ thống] Không xoá - Cấu hình Kanban` không xuất hiện thành một thẻ CV.
3. Kéo một thẻ sang cột khác, chờ polling chạy, trạng thái không bị nhảy về chỗ cũ.

Nếu không mở được app, nói rõ là chưa kiểm tra được trên UI thật thay vì bỏ qua bước này.

---

## Self-Review

**1. Phủ hết thiết kế đã duyệt:** Cả 4 mục Tier 1 đều có task riêng — gán nhầm field file (Task 1), `getItems` thiếu `count` tại 2 điểm trong `CVScoredTab.tsx` (Task 4), `generateLocalId` trùng (Task 2), thông báo lỗi hardcode "bảng lương" (Task 3). Mục thứ 3 trong thiết kế ban đầu còn nhắc bản trùng ở `lifecycleService.ts`; plan này loại nó ra có chủ đích và đã ghi rõ lý do ở Global Constraints (dead code, không ai import).

**2. Không có placeholder:** mọi bước sửa code đều có khối code trước/sau đầy đủ; mọi bước test đều có nội dung test đầy đủ; mọi bước chạy lệnh đều có lệnh chính xác và kết quả mong đợi cụ thể.

**3. Nhất quán kiểu và tên:** `fetchScreeningListItems` và `readBoardStatuses` được khai báo ở phần Interfaces của Task 4, định nghĩa ở Step 3, dùng ở Step 5 — cùng tên, cùng chữ ký. `ListItemPagingApp` và `fetchAllListItems` khớp với khai báo thật tại `src/ui/list-item-paging.ts:21-23` và `:46-50`. `resolveProfileFieldKey` khớp với `src/ui/lifecycle/profile-field-aliases.ts:60`. `ToolCall` dùng trong helper của Task 1 đã có sẵn ở đầu `tests/lifecycle-load-profiles.spec.ts:4`.

**4. Điểm lệch so với thiết kế duyệt trong hội thoại, đã ghi rõ tại chỗ:** Task 1 dùng bảng alias thay cho `includes()` ở lượt tìm thứ hai. Task 4 phát sinh thêm việc tách file mới và phải `reverse()` để giữ thứ tự hiển thị — cả hai đều được giải thích trong phần bối cảnh của task tương ứng.
