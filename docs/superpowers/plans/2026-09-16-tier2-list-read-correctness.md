# Tier 2 List-Read Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa hai vấn đề Tier 2 còn lại: `isScreeningList` nhận nhầm mọi list không phải nhân sự là list ứng viên, và module phân trang dùng chung không phát hiện được khi list bị sửa giữa lúc đang đọc.

**Architecture:** Cả hai việc đều sửa tại chỗ, không tạo file nguồn mới. Task 1 đổi một hàm nhận diện từ logic loại trừ sang logic khẳng định, khớp đúng quy ước đã có sẵn ở hai nơi khác trong codebase. Task 2 tận dụng trường `total` mà Hub đã trả kèm mỗi trang nhưng module đang bỏ qua, biến một rủi ro trước nay không phát hiện được thành một tín hiệu đọc lại được kiểm soát.

**Tech Stack:** TypeScript strict, React 18, Vitest 2.1.9, PrivOS MCP App SDK (`@privos_ai/app-react`).

**Spec:** Không có file spec riêng. Đây là bounded task, thiết kế đã trình bày và được duyệt trực tiếp trong hội thoại ngày 2026-09-16; toàn bộ nội dung thiết kế được chép nguyên văn vào từng task bên dưới. Có một điểm khác so với bản trình bày lúc duyệt, ghi rõ tại đầu Task 2.

## Global Constraints

- **Tuyệt đối không commit, không push, không chạy bất kỳ lệnh git ghi nào.** Git chỉ được dùng ở chế độ đọc (`git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`). Mỗi task kết thúc bằng bước chạy test + typecheck, KHÔNG có bước commit. Người dùng tự quyết định việc commit.
- **Ghi file chỉ bằng công cụ Write/Edit, tuyệt đối không dùng shell heredoc / redirection (`>`, `>>`, `cat <<EOF`).** Trên Windows đường shell mã hoá lại UTF-8 và làm hỏng toàn bộ tiếng Việt trong file (mojibake). Đây là lỗi đã xảy ra thật ở các đợt plan trước.
- **Không dùng emoji, icon trong code, comment, tên test hay bất kỳ output nào.**
- **Không được chạm vào các file đang bị thành viên khác sửa song song (rủi ro merge):** `src/ui/email-templates/**`, `src/ui/email-history/EmailMailboxView.tsx`, `src/ui/email-history/EmailTab.tsx`, `src/ui/lifecycle/di/EmployeeEmailTemplateContext.tsx`, `src/ui/data/email-templates/**`, `src/ui/privos-rest.ts`, `src/ui/App.tsx`, `src/ui/lifecycle/LifecycleDashboard.tsx`, `src/ui/pipeline-dashboard.tsx`, `src/ui/jd-chatbot-functional.tsx`, `src/ui/bot-drafting-tab.tsx`. Không task nào trong plan này cần chạm vào chúng. Riêng `LifecycleDashboard.tsx` là caller của hàm Task 1 sửa — được phép ĐỌC để hiểu ngữ cảnh, tuyệt đối không sửa.
- **TypeScript strict.** Không thêm `any` mới mà không có comment giải thích ngay bên cạnh. `any` có sẵn trên các dòng đang sửa là quy ước cũ của repo cho dữ liệu list do room tự định nghĩa — giữ nguyên, không mở rộng thêm.
- **Baseline test trước khi bắt đầu: 274 test, 271 pass, 3 fail.** Ba fail này là lỗi có sẵn, ngoài phạm vi: `tests/manifest.spec.ts` (2 fail), `tests/ui-shell.spec.ts` (1 fail). Sau mỗi task, đây phải vẫn là 3 fail DUY NHẤT.
- **Lệnh chạy test:** `npm test` (tức `vitest run`). Chạy một file: `npx vitest run tests/<tên file>`. Chạy một test theo tên: `npx vitest run tests/<tên file> -t "<một phần tên test>"`.
- **Lệnh typecheck:** `npm run typecheck:strict-unused`.
- **Không sửa `src/ui/lifecycle/services/lifecycleService.ts`.** File này là dead code, đã kiểm tra không còn ai import trong toàn bộ `src/`. Việc xoá nó là task dọn dẹp riêng, ngoài phạm vi plan này.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | Đổi `isScreeningList` sang khớp khẳng định theo quy ước `SCREENING` | 1 |
| `tests/lifecycle-load-profiles.spec.ts` | Test cho `loadPassedCandidates` — hiện chưa có test nào | 1 |
| `src/ui/list-item-paging.ts` | Đối chiếu `total` của Hub để phát hiện list đổi giữa chừng, đọc lại có giới hạn | 2 |
| `tests/list-item-paging.spec.ts` | Test phát hiện mutation, đọc lại, và các trường hợp không được báo động giả | 2 |

Hai task độc lập hoàn toàn: không dùng chung file nguồn, không dùng chung file test, không có thứ tự bắt buộc. Thực hiện theo thứ tự 1 rồi 2 để mỗi lần chạy suite chỉ có một biến số mới.

---

### Task 1: `isScreeningList` khớp khẳng định thay vì loại trừ

**Bối cảnh lỗi:** `PrivOSLifecycleService.ts:608-621` hiện định nghĩa "list ứng viên" bằng phép loại trừ — mọi list mà tên KHÔNG chứa `HO SO NHAN SU` / `NHAN SU` / `LIFECYCLE` / `EMPLOYEE` đều bị coi là list ứng viên:

```ts
private isScreeningList(list: any): boolean {
  const rawName = (list.name || '').toUpperCase();
  const normalizedName = this.normalizeText(rawName);

  // Explicitly exclude HR lifecycle lists
  const isHrLifecycle =
    normalizedName.includes('HO SO NHAN SU') ||
    normalizedName.includes('NHAN SU') ||
    normalizedName.includes('LIFECYCLE') ||
    normalizedName.includes('EMPLOYEE');

  // In a recruitment room, all other lists are candidate screening/recruitment lists
  return !isHrLifecycle;
}
```

Trong khi đó, chính codebase này đã có quy ước khẳng định ở hai nơi:
- `src/ui/pipeline-service.ts:952` TẠO list ứng viên với tên `SCREENING_${cleanPosition}`.
- `src/ui/cv-scored/CVScoredTab.tsx:562` LỌC list ứng viên bằng `.filter((l: any) => (l.name || '').includes('SCREENING'))`.

Hai định nghĩa khác nhau cho cùng một khái niệm trong cùng một codebase, và bản trong `PrivOSLifecycleService` là bản sai.

**Tác động thật:** hàm dùng `isScreeningList` là `loadPassedCandidates` (`PrivOSLifecycleService.ts:37-75`). Nó được gọi qua polling **mỗi 3 giây** khi form tạo hồ sơ đang mở (`LifecycleDashboard.tsx:112-115` — chỉ đọc để xác nhận, không sửa). Với định nghĩa loại trừ, mọi list rác trong room (bảng chi phí, bảng kế hoạch, bất cứ thứ gì room admin tạo) đều bị đọc item và đọc stage mỗi 3 giây. Tệ hơn phí băng thông: nếu một list rác tình cờ có stage tên bắt đầu bằng `05` hoặc chứa `MOI PHONG VAN`, item của nó lọt thẳng vào danh sách "ứng viên đạt" hiển thị cho người dùng chọn khi tạo hồ sơ nhân sự.

**Thay đổi hành vi có chủ đích, cần ghi nhận:** sau khi sửa, list ứng viên KHÔNG có chữ `SCREENING` trong tên sẽ không còn được `loadPassedCandidates` đọc. Đây là ý muốn, không phải hồi quy: `CVScoredTab` — màn hình CV chính — vốn đã bỏ qua các list đó rồi, nên việc này chỉ đưa hai chỗ về cùng một định nghĩa. Giữ nguyên phân biệt hoa thường (`.includes('SCREENING')`, không lowercase) để khớp CHÍNH XÁC hành vi của `CVScoredTab.tsx:562`; làm "thông minh hơn" bằng cách bỏ phân biệt hoa thường sẽ tạo ra định nghĩa thứ ba, khác cả hai chỗ đang có.

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:608-621`
- Test: `tests/lifecycle-load-profiles.spec.ts` (thêm một `describe` mới vào cuối file)

**Interfaces:**
- Consumes: không có gì mới. `this.normalizeText` vẫn tồn tại và vẫn được `isPassedCandidateItem` (`PrivOSLifecycleService.ts:625`) dùng — KHÔNG được xoá hàm đó, chỉ bỏ lời gọi bên trong `isScreeningList`.
- Produces: không có API mới. `loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>` giữ nguyên chữ ký, chỉ thu hẹp tập list mà nó đọc.

- [ ] **Step 1: Viết test thất bại**

Thêm vào CUỐI file `tests/lifecycle-load-profiles.spec.ts`:

```ts
describe('PrivOSLifecycleService chi doc list SCREENING', () => {
  const STAGE_05 = [{ _id: 'stage-05', name: '05_Moi_Phong_Van' }];

  const SCREENING_LIST = {
    _id: 'list-screening',
    name: 'SCREENING_Backend_Developer',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  // List khong lien quan gi den tuyen dung, nhung ten cung khong chua tu khoa nhan su nao,
  // nen logic loai tru cu xep no vao dien "list ung vien".
  const UNRELATED_LIST = {
    _id: 'list-khac',
    name: 'Bảng theo dõi chi phí',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  const HR_LIFECYCLE_LIST = {
    _id: 'list-nhan-su',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    stages: STAGE_05,
    fieldDefinitions: [],
  };

  const CANDIDATE_ITEM = {
    _id: 'ung-vien-1',
    name: 'Nguyen Van A',
    stageId: 'stage-05',
    customFields: [],
  };

  it('khong doc item cua list khong phai SCREENING', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [SCREENING_LIST, UNRELATED_LIST, HR_LIFECYCLE_LIST],
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.loadPassedCandidates('room-1');

    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.listId)).toEqual(['list-screening']);
  });

  it('chi tra ve ung vien cua list SCREENING', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [SCREENING_LIST, UNRELATED_LIST],
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    const candidates = await service.loadPassedCandidates('room-1');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].listId).toBe('list-screening');
    expect(candidates[0].listName).toBe('SCREENING_Backend_Developer');
  });

  it('tra ve rong khi room khong co list SCREENING nao', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [UNRELATED_LIST, HR_LIFECYCLE_LIST],
      // Van khai bao handler nay: neu bo qua, loi "unexpected tool call" se bi
      // `loadPassedCandidates` nuot va tra ve [] — test se pass vi ly do sai.
      'mcpapp.lists.getItems': () => [CANDIDATE_ITEM],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadPassedCandidates('room-1')).resolves.toEqual([]);
    expect(calls.some(c => c.name === 'mcpapp.lists.getItems')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "chi doc list SCREENING"`

Expected: cả 3 test FAIL.
- Test 1 fail: `UNRELATED_LIST` lọt qua bộ lọc cũ, nên `itemCalls` là `['list-screening', 'list-khac']` chứ không phải `['list-screening']`.
- Test 2 fail: hai list cùng lọt qua, mỗi list trả một ứng viên, nên `candidates` có 2 phần tử chứ không phải 1.
- Test 3 fail: `UNRELATED_LIST` lọt qua nên `loadPassedCandidates` trả về 1 ứng viên chứ không phải `[]`, và `mcpapp.lists.getItems` có được gọi.

Nếu bất kỳ test nào PASS ở bước này, DỪNG LẠI và đọc lại code — giả định về lỗi sai.

- [ ] **Step 3: Sửa code**

Trong `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, thay nguyên hàm ở dòng 608-621:

```ts
  private isScreeningList(list: any): boolean {
    const rawName = (list.name || '').toUpperCase();
    const normalizedName = this.normalizeText(rawName);

    // Explicitly exclude HR lifecycle lists
    const isHrLifecycle =
      normalizedName.includes('HO SO NHAN SU') ||
      normalizedName.includes('NHAN SU') ||
      normalizedName.includes('LIFECYCLE') ||
      normalizedName.includes('EMPLOYEE');

    // In a recruitment room, all other lists are candidate screening/recruitment lists
    return !isHrLifecycle;
  }
```

bằng:

```ts
  /**
   * Khớp khẳng định, không phải loại trừ. Bản cũ coi MỌI list không mang tên nhân sự là list
   * ứng viên, nên một bảng bất kỳ trong room cũng bị đọc item mỗi nhịp polling, và item của nó
   * lọt vào danh sách ứng viên đạt nếu stage tình cờ bắt đầu bằng 05.
   *
   * `SCREENING` là quy ước có thật: `pipeline-service.ts` tạo list với tên `SCREENING_<vị trí>`,
   * và `CVScoredTab.tsx` lọc đúng bằng phép này. Giữ nguyên phân biệt hoa thường để khớp chính
   * xác hai chỗ đó, không tạo thêm định nghĩa thứ ba.
   */
  private isScreeningList(list: any): boolean {
    return (list.name || '').includes('SCREENING');
  }
```

KHÔNG xoá `normalizeText` — `isPassedCandidateItem` vẫn dùng nó.

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: toàn bộ file PASS, output sạch, không warning.

- [ ] **Step 5: Chạy toàn bộ suite và typecheck**

Run: `npm test`
Expected: đúng 3 fail có sẵn (`manifest.spec.ts` ×2, `ui-shell.spec.ts` ×1), không có fail nào khác. Tổng số test tăng đúng 3.

Run: `npm run typecheck:strict-unused`
Expected: không lỗi. Nếu báo biến không dùng, kiểm tra xem đã xoá hết `rawName` / `normalizedName` / `isHrLifecycle` chưa.

KHÔNG commit. Báo cáo kèm số test trước/sau.

---

### Task 2: Phát hiện list đổi giữa lúc phân trang, đọc lại có giới hạn

**Điểm khác so với bản thiết kế lúc duyệt — đọc kỹ trước khi làm.** Khi trình bày thiết kế, tôi kết luận mục này "không có fix khả thi" vì `mcpapp.lists.getItems` chỉ cho sort theo `createdAt | name | order` (`tools_lists.md:271`), không có khoá phụ để phá tie. Kết luận đó sai ở chỗ nó chỉ nhìn phía sort. Đọc lại phần Response của cùng tài liệu (`tools_lists.md:298-301`) thì mỗi trang Hub trả về đã kèm sẵn `total`:

```json
{
  "items": [ ... ],
  "count": 50,
  "offset": 0,
  "total": 150
}
```

Module hiện bỏ qua hoàn toàn trường này (`list-item-paging.ts:79` chỉ đọc `parsed?.items`). `total` chính là tín hiệu phát hiện mutation mà thiết kế trước cho là không có. Task này dùng nó.

**Bối cảnh lỗi:** module ghim `sortBy: 'createdAt', sortOrder: 'asc'` để một dòng MỚI tạo giữa lúc đọc rơi xuống cuối thay vì chèn lên đầu và đẩy lệch mọi dòng sau. Nhưng chiều ngược lại vẫn hở: một dòng bị XOÁ giữa lúc đọc sẽ kéo mọi dòng sau nó lùi một bậc, nên dòng đang ở vị trí 100 nhảy về 99, và lần đọc trang sau với `offset: 100` nhảy qua nó luôn. `seenIds` không cứu được: nó chỉ bắt được dòng LẶP, không bắt được dòng THIẾU. Docstring hiện tại của module thừa nhận đúng rủi ro này ở dòng 12-15 nhưng chưa làm gì với nó.

**Cách sửa — hai tín hiệu, một cơ chế đọc lại:**
1. `total` đổi giữa hai trang của cùng một lượt đọc. Cùng một trường, cùng một nguồn, đổi giá trị: list đã bị sửa, mọi offset đang giữ đều không còn đáng tin.
2. Đọc xong nhưng số item thu được không khớp `total`. Bắt được trường hợp vừa xoá vừa thêm nên `total` không đổi mà nội dung đã lệch — đúng cái lỗ mà `seenIds` bỏ sót.

Gặp một trong hai thì bỏ toàn bộ kết quả lượt đó và đọc lại từ `offset: 0`, tối đa 2 lần đọc lại (3 lượt tất cả). Hết lượt vẫn lệch thì ném lỗi, đúng triết lý sẵn có của module là thà báo lỗi còn hơn trả dữ liệu thiếu trong im lặng.

**Ba ràng buộc bắt buộc, sai một cái là hỏng:**
- **Response kiểu mảng trần không có `total`.** Module đang hỗ trợ cả hai hình dạng (`Array.isArray(parsed) ? parsed : parsed?.items`), và phần lớn test hiện có dùng mảng trần. Khi không có `total`, mọi phép đối chiếu phải bị BỎ QUA, không được coi là lệch. Sai chỗ này thì gần như mọi test cũ vỡ.
- **Chỉ tín hiệu mutation mới được đọc lại.** Ba lỗi đang có sẵn — thiếu `_id` với `missingId: 'throw'`, Hub bỏ qua `offset`, vượt trần số trang — đều là lỗi cứng, phải ném ra ngoài NGAY, không được đọc lại. Đọc lại một lỗi cứng chỉ nhân ba số request rồi vẫn hỏng.
- **Item bị bỏ qua vì thiếu id vẫn phải được tính vào tổng.** Với `missingId: 'skip'`, item không id không vào mảng kết quả nhưng Hub vẫn đếm nó trong `total`. Không đếm riêng phần này thì mọi list có item thiếu id sẽ bị báo lệch giả, đọc lại 3 lần rồi ném lỗi — hỏng nặng hơn lỗi đang sửa.

**Ảnh hưởng tới caller (không sửa file nào của họ):** ba nơi đang dùng `fetchAllListItems` — `PrivOSLifecycleService.fetchListItems` (roster nhân sự, `missingId: 'throw'`), `email-history-service.ts:83` (hộp thư, `'skip'`), `cv-list-reader.ts` (list CV, `'skip'`). Cả ba tự động được cơ chế này, không đổi dòng code nào. Lưu ý về chi phí: với list dưới 100 item, cả lượt đọc chỉ có một trang nên không có phép so sánh giữa các trang nào chạy, chi phí thêm bằng không; cơ chế chỉ kích hoạt ở đúng chỗ có rủi ro là lượt đọc nhiều trang.

**Files:**
- Modify: `src/ui/list-item-paging.ts` (viết lại phần lớn file — xem code đầy đủ ở Step 3)
- Test: `tests/list-item-paging.spec.ts` (thêm 6 test vào cuối `describe('fetchAllListItems')`)

**Interfaces:**
- Consumes: `parseToolResult` từ `@privos_ai/app-react` (đã import sẵn ở dòng 1).
- Produces:
  - `LIST_ITEMS_PAGE_SIZE: number` (= 100) — giữ nguyên, đã có.
  - `LIST_ITEMS_MAX_RESTARTS: number` (= 2) — hằng số MỚI, export.
  - `readItemId(item: unknown): string` — giữ nguyên, không đổi.
  - `fetchAllListItems(app, listId, options): Promise<any[]>` — giữ nguyên chữ ký và giữ nguyên `ListItemPagingOptions` (KHÔNG thêm option mới; số lần đọc lại là hằng số của module, chưa caller nào cần chỉnh riêng).

- [ ] **Step 1: Viết test thất bại**

Thêm 6 test sau vào file `tests/list-item-paging.spec.ts`, ĐẶT BÊN TRONG `describe('fetchAllListItems', ...)`, ngay trước dấu `});` đóng describe đó (tức sau test `'khong gan cung nghiep vu bang luong vao thong bao loi dung chung'`):

```ts
  it('khong doc lai khi Hub tra total on dinh qua cac trang', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0
      ? { items: page(0, 100), total: 107 }
      : { items: page(100, 7), total: 107 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(107);
    expect(calls).toHaveLength(2);
  });

  it('doc lai tu dau khi total doi giua chung', async () => {
    // Luot 1 bat dau voi total 107 roi tut xuong 106 o trang hai: co dong bi xoa giua chung,
    // moi offset dang giu deu khong con dang tin. Luot 2 doc lai on dinh o 106.
    let attempt = 0;
    const { app, calls } = createAppStub((offset) => {
      if (offset === 0) attempt += 1;
      if (attempt === 1) {
        return offset === 0
          ? { items: page(0, 100), total: 107 }
          : { items: page(100, 7), total: 106 };
      }
      return offset === 0
        ? { items: page(0, 100), total: 106 }
        : { items: page(100, 6), total: 106 };
    });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(106);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100, 0, 100]);
  });

  it('phat hien dong bi xoa qua so item khong khop total, roi doc lai', async () => {
    // Hub bao tong 5 nhung chi tra ve 4 dong. `seenIds` mu truoc truong hop nay vi no chi bat
    // duoc dong LAP, khong bat duoc dong THIEU — day la lo hong ma phep doi chieu total va lap.
    let attempt = 0;
    const { app } = createAppStub(() => {
      attempt += 1;
      return attempt === 1
        ? { items: page(0, 4), total: 5 }
        : { items: page(0, 5), total: 5 };
    });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(5);
  });

  it('nem loi khi list doi lien tuc qua moi luot doc lai', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0
      ? { items: page(0, 100), total: 107 }
      : { items: page(100, 7), total: 106 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/thay đổi liên tục/);
    // 3 luot doc, moi luot 2 trang: co tran cung, khong doc lai vo han.
    expect(calls).toHaveLength(6);
  });

  it('khong bao lech gia khi item thieu id bi bo qua nhung van nam trong total', async () => {
    // Voi missingId 'skip', item khong id khong vao mang ket qua nhung Hub van dem no trong
    // total. Neu khong tinh rieng phan bi bo qua thi moi list co item hong se bi doc lai 3 lan
    // roi nem loi — hong nang hon chinh loi dang sua.
    const { app, calls } = createAppStub(() => ({
      items: [{ name: 'Khong co id' }, { _id: 'item-1', name: 'Co id' }],
      total: 2,
    }));

    const items = await fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 10 });
    expect(items).toEqual([{ _id: 'item-1', name: 'Co id' }]);
    expect(calls).toHaveLength(1);
  });

  it('khong doc lai khi loi la loi cung chu khong phai list bi doi', async () => {
    // Hub bo qua offset la loi cung: doc lai chi nhan ba lan so request roi van hong y het.
    const { app, calls } = createAppStub(() => ({ items: page(0, 100), total: 100 }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/offset/i);
    expect(calls).toHaveLength(2);
  });
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

Run: `npx vitest run tests/list-item-paging.spec.ts`

Expected: test 1 (`total on dinh`) PASS sẵn — nó chỉ mô tả hành vi đang đúng, đóng vai trò chốt chặn hồi quy. Năm test còn lại FAIL:
- `doc lai tu dau khi total doi giua chung`: fail ở assertion offset — code hiện tại không đọc lại, chỉ gọi `[0, 100]`.
- `phat hien dong bi xoa qua so item khong khop total`: fail vì code hiện tại trả về 4 item của lượt đầu chứ không đọc lại.
- `nem loi khi list doi lien tuc`: fail vì code hiện tại resolve bình thường với 107 item, không ném lỗi.
- `khong bao lech gia khi item thieu id`: cũng có thể PASS sẵn (code hiện tại không đối chiếu gì cả) — đây là test chống hồi quy cho Step 3, giữ nguyên.
- `khong doc lai khi loi la loi cung`: PASS sẵn vì hiện chưa có cơ chế đọc lại — cũng là chốt chặn hồi quy cho Step 3.

Ghi rõ trong báo cáo test nào FAIL và test nào PASS-sẵn-làm-chốt-chặn. Ba test phải FAIL là: `doc lai tu dau khi total doi giua chung`, `phat hien dong bi xoa qua so item khong khop total`, `nem loi khi list doi lien tuc qua moi luot doc lai`. Nếu ba test đó không FAIL, DỪNG LẠI và đọc lại code.

- [ ] **Step 3: Sửa code**

Thay TOÀN BỘ nội dung `src/ui/list-item-paging.ts` bằng:

```ts
import { parseToolResult } from '@privos_ai/app-react';

/**
 * Read every item of a PrivOS list.
 *
 * `mcpapp.lists.getItems` caps `count` at 100 (`tools_lists.md:270`) and does support `offset`
 * (`tools_lists.md:269`). Sending a larger `count` is not an error — the hub just returns the
 * first 100 — so every single-shot read in this codebase was silently truncating.
 *
 * Paging is pinned to `sortBy: 'createdAt', sortOrder: 'asc'` (see the call below) instead of
 * the hub's `createdAt desc` default, so a row created mid-read appends past the end instead of
 * shifting every later row toward `offset` skew.
 *
 * Pinning the sort is not enough on its own. `createdAt` is not a unique key and the hub offers
 * no secondary sort key (`tools_lists.md:271` allows only `createdAt`, `name`, `order`), and a
 * row DELETED mid-read pulls every later row back one position, so `offset` paging skips one.
 * `seenIds` cannot see that: it catches a repeated row, never a missing one. The walk therefore
 * reconciles against the `total` the hub returns with every page (`tools_lists.md:298-301`) — a
 * `total` that changes between pages, or a final count that disagrees with it, means the list
 * moved under the read, and the whole walk restarts from offset 0.
 *
 * Detection needs that envelope. A bare-array response carries no `total`, and those reads keep
 * the older, unverified behaviour rather than inventing a signal that isn't there.
 */

/** Xử lý item không mang `_id` lẫn `id`. */
export type MissingIdPolicy = 'throw' | 'skip';

export interface ListItemPagingApp {
  callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
}

export interface ListItemPagingOptions {
  missingId: MissingIdPolicy;
  /** Trần số trang đọc trước khi bỏ cuộc. */
  maxPages: number;
  /** Item mỗi trang. Hub chặn ở 100. */
  pageSize?: number;
}

export const LIST_ITEMS_PAGE_SIZE = 100;

/**
 * Số lần đọc lại từ đầu khi phát hiện list đổi giữa chừng, dùng chung cho mọi caller.
 * `LifecycleDashboard` và `CVScoredTab` đều gọi qua polling 3 giây, nên một vòng đọc lại không
 * trần sẽ nhân số request lên đúng vào lúc room đang bị sửa nhiều nhất.
 */
export const LIST_ITEMS_MAX_RESTARTS = 2;

export function readItemId(item: unknown): string {
  const record = item as { _id?: unknown; id?: unknown } | null | undefined;
  if (typeof record?._id === 'string' && record._id.length > 0) return record._id;
  if (typeof record?.id === 'string' && record.id.length > 0) return record.id;
  return '';
}

/**
 * `mutated` chỉ dành cho trường hợp list đổi giữa chừng — thứ đọc lại thì cứu được. Lỗi cứng
 * (thiếu id, Hub bỏ qua offset, vượt trần trang) ném thẳng ra ngoài, không đi qua kiểu này.
 */
type WalkOutcome =
  | { status: 'complete'; items: any[] }
  | { status: 'mutated'; detail: string };

function reconcileWalk(
  collected: any[],
  skippedMissingId: number,
  expectedTotal: number | undefined,
): WalkOutcome {
  // Mảng trần không kèm `total`: không có gì để đối chiếu, giữ nguyên hành vi cũ.
  if (expectedTotal === undefined) return { status: 'complete', items: collected };

  // Item thiếu id bị loại khỏi `collected` nhưng Hub vẫn đếm nó, nên phải cộng lại mới so được.
  const accountedFor = collected.length + skippedMissingId;
  if (accountedFor !== expectedTotal) {
    return {
      status: 'mutated',
      detail: `đọc được ${accountedFor} item nhưng Hub báo tổng ${expectedTotal}`,
    };
  }

  return { status: 'complete', items: collected };
}

/**
 * List items carry room-defined custom fields and have no static schema, so `any` here is the
 * real shape of the data rather than a skipped type.
 */
async function walkAllPages(
  app: ListItemPagingApp,
  listId: string,
  options: ListItemPagingOptions,
  pageSize: number,
): Promise<WalkOutcome> {
  const collected: any[] = [];
  const seenIds = new Set<string>();
  let skippedMissingId = 0;
  let expectedTotal: number | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    const res = await app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: {
        listId,
        count: pageSize,
        offset: page * pageSize,
        // Ascending, pinned — lý do đầy đủ ở docstring đầu file: mặc định của Hub là
        // `createdAt desc`, dưới desc một dòng mới chèn lên đầu và đẩy lệch mọi dòng sau nó.
        sortBy: 'createdAt',
        sortOrder: 'asc',
      },
    });

    const parsed: any = parseToolResult(res);
    const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);
    const total: number | undefined = typeof parsed?.total === 'number' ? parsed.total : undefined;

    if (total !== undefined) {
      if (expectedTotal === undefined) {
        expectedTotal = total;
      } else if (total !== expectedTotal) {
        return {
          status: 'mutated',
          detail: `tổng số item đổi từ ${expectedTotal} thành ${total} giữa lúc đang phân trang`,
        };
      }
    }

    let idsOnPage = 0;
    let alreadySeenOnPage = 0;

    for (const item of items) {
      const id = readItemId(item);
      if (id.length === 0) {
        if (options.missingId === 'throw') {
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
        }
        skippedMissingId += 1;
        continue;
      }

      idsOnPage += 1;
      if (seenIds.has(id)) {
        alreadySeenOnPage += 1;
        continue;
      }
      seenIds.add(id);
      collected.push(item);
    }

    // Trang có id, và mọi id đều đã thu thập trước đó: Hub đang phát lại trang 0, tức là
    // `offset` bị bỏ qua. Lặp tiếp thì quay vòng, cắt ngang thì mất dữ liệu âm thầm — cả hai
    // đều tệ hơn là nói thẳng. Trang không có id nào thì không kết luận được gì, bỏ qua phép dò.
    // Đây là lỗi cứng, không phải list bị đổi: ném thẳng, đọc lại cũng chỉ ra kết quả y hệt.
    if (idsOnPage > 0 && alreadySeenOnPage === idsOnPage) {
      throw new Error(
        `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
        + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về dữ liệu thiếu.',
      );
    }

    if (items.length < pageSize) return reconcileWalk(collected, skippedMissingId, expectedTotal);
  }

  throw new Error(
    `Danh sách ${listId} vượt quá ${options.maxPages * pageSize} item. Dừng để không trả về dữ liệu thiếu.`,
  );
}

/**
 * List items carry room-defined custom fields and have no static schema, so `any` here is the
 * real shape of the data rather than a skipped type.
 */
export async function fetchAllListItems(
  app: ListItemPagingApp,
  listId: string,
  options: ListItemPagingOptions,
): Promise<any[]> {
  // Clamped, not trusted: the hub caps `count` at 100 (`tools_lists.md:270`) and returns 100
  // without erroring when asked for more. An unclamped `pageSize: 1000` would make
  // `items.length < pageSize` true on a full page, so the loop would exit after one page and
  // return a silently truncated read — the exact defect this module exists to prevent,
  // reintroduced through its own option.
  const pageSize = Math.min(options.pageSize ?? LIST_ITEMS_PAGE_SIZE, LIST_ITEMS_PAGE_SIZE);

  let lastDetail = '';
  for (let attempt = 0; attempt <= LIST_ITEMS_MAX_RESTARTS; attempt += 1) {
    const outcome = await walkAllPages(app, listId, options, pageSize);
    if (outcome.status === 'complete') return outcome.items;
    lastDetail = outcome.detail;
  }

  throw new Error(
    `Danh sách ${listId} thay đổi liên tục trong lúc đọc, đã thử ${LIST_ITEMS_MAX_RESTARTS + 1} lượt. `
    + `Lần cuối: ${lastDetail}. Dừng để không trả về dữ liệu thiếu.`,
  );
}
```

- [ ] **Step 4: Chạy test file này, xác nhận PASS**

Run: `npx vitest run tests/list-item-paging.spec.ts`
Expected: toàn bộ file PASS — 9 test cũ + 6 test mới = 15 test. Output sạch, không warning.

Nếu test cũ `'chap nhan hinh dang { items: [...] } ben canh mang tran'` hoặc `'missingId skip bo qua item khong co id va giu phan con lai'` vỡ, nguyên nhân gần như chắc chắn là nhánh `expectedTotal === undefined` trong `reconcileWalk` bị bỏ sót — đọc lại Step 3.

- [ ] **Step 5: Chạy các file test của caller**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts tests/cv-list-reader.spec.ts tests/email-history-paging.spec.ts`

Expected: tất cả PASS. Ba file này test ba caller của `fetchAllListItems`; stub của chúng trả về mảng trần không kèm `total`, nên cơ chế mới phải im lặng hoàn toàn với chúng. Bất kỳ fail nào ở đây nghĩa là phép đối chiếu đang bắt nhầm cả trường hợp không có `total`.

- [ ] **Step 6: Chạy toàn bộ suite và typecheck**

Run: `npm test`
Expected: đúng 3 fail có sẵn (`manifest.spec.ts` ×2, `ui-shell.spec.ts` ×1), không có fail nào khác. Tổng số test tăng đúng 6 so với sau Task 1.

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

KHÔNG commit.

- [ ] **Step 7: Ghi nhận khoảng trống chưa kiểm chứng được**

Cơ chế này dựa trên giả định Hub thật sự trả `total` đúng như tài liệu mô tả (`tools_lists.md:298-301`). Test dùng stub nên chỉ chứng minh logic đúng với dữ liệu đúng tài liệu, không chứng minh được Hub thật hành xử y vậy.

Nếu chạy được app thật (`npm start`, mở tab có list nhiều hơn 100 item), ghi lại trong báo cáo: list đó có tải đủ item không, console có dòng lỗi "thay đổi liên tục" nào không. Nếu không có room thật để thử, ghi rõ trong báo cáo là chưa kiểm chứng được trên Hub thật — KHÔNG bỏ qua bước này trong im lặng.

Rủi ro nếu Hub trả `total` không đáng tin (ví dụ đếm có độ trễ, hoặc đếm khác tập mà `getItems` trả): mọi lượt đọc nhiều trang sẽ đọc lại 3 lần rồi ném lỗi. Dấu hiệu nhận biết ngay: lỗi "thay đổi liên tục trong lúc đọc" xuất hiện đều đặn trên một room không ai sửa gì. Cách xử lý khi gặp: đổi `reconcileWalk` sao cho nhánh lệch-số-lượng chỉ `console.warn` rồi trả `complete`, giữ lại nhánh `total` đổi giữa chừng — nhưng chỉ làm vậy khi có bằng chứng thật từ Hub, không làm phòng xa.

---

## Self-Review

**1. Phủ hết phạm vi đã duyệt:** Hai mục Tier 2 đều có task riêng. Task 1 sửa `isScreeningList`. Task 2 sửa lỗ hổng phân trang — với hướng khác hẳn bản trình bày lúc duyệt (lúc đó tôi kết luận không fix được), điểm khác này được ghi ngay đầu Task 2 kèm bằng chứng tài liệu, không giấu trong phần thân.

**2. Không có placeholder:** mọi bước sửa code đều có khối code đầy đủ trước và sau; mọi bước test đều có nội dung test đầy đủ; mọi bước chạy lệnh đều có lệnh chính xác kèm kết quả mong đợi cụ thể, gồm cả việc nêu đích danh test nào phải FAIL và test nào PASS sẵn ở bước RED của Task 2.

**3. Nhất quán kiểu và tên:** `LIST_ITEMS_MAX_RESTARTS`, `WalkOutcome`, `reconcileWalk`, `walkAllPages` được khai báo ở phần Interfaces của Task 2 và định nghĩa đúng tên đó trong Step 3. `ListItemPagingOptions` giữ nguyên ba trường cũ, không thêm trường mới — khớp với lời hứa ở Interfaces. `fetchAllListItems` giữ nguyên chữ ký nên ba caller không phải sửa gì, đúng như phần Ảnh hưởng tới caller đã nêu. Task 1 không xoá `normalizeText`, khớp với ghi chú ở Interfaces rằng `isPassedCandidateItem` vẫn dùng hàm đó.

**4. Kiểm tra chéo với file cấm:** Task 1 sửa `PrivOSLifecycleService.ts`, caller của nó là `LifecycleDashboard.tsx` nằm trong danh sách cấm — plan chỉ yêu cầu đọc file đó, không sửa. Task 2 sửa `list-item-paging.ts`, ba caller của nó (`PrivOSLifecycleService.ts`, `email-history-service.ts`, `cv-list-reader.ts`) đều không nằm trong danh sách cấm và đều không cần sửa.
