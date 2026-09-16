# P3 — Hiệu năng và bug ẩn: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng sáu lỗi P3 đã được xác minh bằng code và tài liệu PrivOS: một lỗi mất dữ liệu đang xảy ra, một lỗi hỏng dữ liệu tiềm ẩn, một promise treo vĩnh viễn, N round-trip relay vô nghĩa mỗi lần load, một vòng poll 10 phút nuốt lỗi mạng, và PII ứng viên rò ra console.

**Architecture:** Ba module thuần mới (`list-item-paging`, `profile-field-aliases`, `log-redaction`) giữ phần logic khó và được test độc lập; các file lớn sẵn có chỉ nối dây vào chúng. Không tái cấu trúc gì ngoài phạm vi sáu lỗi này.

**Tech Stack:** TypeScript strict, React 18, Vite, Vitest, `@privos_ai/app-react` (`callServerTool`, `parseToolResult`), `@privos_ai/app-server`.

**Spec:** Không có file spec riêng. Design đã được duyệt trong hội thoại ngày 2026-09-15; toàn bộ nội dung đã duyệt được chép vào phần "Bối cảnh đã xác minh" bên dưới để plan tự đứng được.

---

## Global Constraints

Mọi task đều ngầm bao gồm các ràng buộc sau.

- **Cấm mọi lệnh git ghi.** Chỉ được dùng `git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`. Không `commit`, không `add`, không `checkout`, không `branch`, không `stash`, không remote. **Các task trong plan này kết thúc ở "test xanh", không có bước commit.** Việc commit là của người dùng.
- **Giữ nguyên line ending.** Mọi file nguồn trong repo là **CRLF** (`file` xác nhận; `.gitattributes` không có luật eol). Sửa file phải giữ CRLF; file mới tạo cũng dùng CRLF. Một lần ghi lại toàn file bằng LF sẽ biến mọi dòng thành xung đột khi merge với nhánh của đồng đội — đây là rủi ro plan này được yêu cầu tránh.
- **Thụt lề:** `src/ui/**`, `src/services/mail/**`, `tests/**` đều dùng **2 dấu cách**. Không dùng tab ở các thư mục này.
- **TypeScript strict.** Không dùng `any` nếu không kèm comment giải thích. Ưu tiên discriminated union và `switch` vét cạn hơn là ép kiểu.
- **Không icon, không emoji** trong code, comment, log, thông báo lỗi, hay bất kỳ chuỗi nào hiển thị cho người dùng. Log hiện có chứa ký tự cảnh báo phải bị gỡ khi đi ngang qua.
- **Comment và thông báo lỗi viết tiếng Việt** khi hướng tới người dùng cuối, tiếng Anh khi giải thích kỹ thuật nội bộ — theo đúng thói quen đang có trong từng file.
- **Baseline test đang đỏ sẵn: 3 test / 2 file.** `tests/manifest.spec.ts` (2 test) và `tests/ui-shell.spec.ts` (1 test) hỏng từ trước vì `privos-app.json` khai `name: ai.privos.mcp-app-demo-can-run` nhưng `ui.resourceUri` lại trỏ `ui://ai.privos.mcp-app-demo-hr-hrm/form.html`. **Không sửa, không đụng.** Trạng thái chuẩn của toàn bộ suite trước khi bắt đầu: `3 failed | 217 passed (220)`. Mọi task phải giữ nguyên con số 3 failed đó; số passed chỉ được tăng.
- **Lệnh chạy test:** `npx vitest run <đường-dẫn-file>` cho một file, `npm test` cho cả suite. Typecheck: `npm run typecheck:strict-unused` (bản này bắt cả biến và tham số thừa — biến để lại không dùng sẽ làm đỏ).

### Ngoài phạm vi (cấm đụng)

Các file dưới đây đang được thành viên khác trong team (`Hng2725`) sửa song song. Merge risk cao. **Không task nào trong plan này được sửa chúng:**

- `src/ui/email-templates/**` (5 commit từ 10/09)
- `src/ui/email-history/EmailMailboxView.tsx`, `src/ui/email-history/EmailTab.tsx`
- `src/ui/lifecycle/components/EmailComposerModal.tsx`
- `src/ui/lifecycle/email/EmployeeEmailTemplateProvider.ts`
- `src/ui/lifecycle/di/EmployeeEmailTemplateContext.tsx`
- `src/ui/data/email-templates/**`
- `src/ui/privos-rest.ts` (3 commit từ 10/09)
- `src/ui/App.tsx`, `src/ui/lifecycle/LifecycleDashboard.tsx`
- `src/ui/pipeline-dashboard.tsx`, `src/ui/jd-chatbot-functional.tsx`, `src/ui/bot-drafting-tab.tsx` — **quyết định đã chốt của người dùng:** không nối dây `AbortController` ở ba call site này. `askAI` nhận thêm tham số optional, chưa ai truyền vào. Nối dây để sau khi đồng đội merge xong.

`src/ui/pipeline-service.ts` cũng nằm trong vùng nóng (`Hng2725` sửa ngày 14/09) nhưng **được phép sửa**, với điều kiện: toàn bộ thay đổi vào file này gói trong **đúng một task** (Task 8) để chỉ tạo một điểm rebase.

`src/ui/email-history/email-history-service.ts` và `src/services/mail/task-queue.ts` **được phép sửa**: `git log` cho thấy chưa ai đụng hai file này kể từ commit migrate `40ea13c` ngày 09/09. Phần email của đồng đội nằm ở tầng template và view, không phải tầng service.

---

## Bối cảnh đã xác minh

Đọc phần này trước khi làm bất kỳ task nào. Mọi con số dưới đây đã được kiểm chứng trực tiếp, không phải phỏng đoán.

**`mcpapp.lists.getItems` có hỗ trợ `offset`, và `count` có max là 100.** Nguồn: `tools_lists.md:266-277` trong repo — bảng tham số ghi `offset` (number, "Position to start from, default 0") và `count` (number, "Number of items to return (default: 50, **max: 100**)"). Ví dụ phân trang ở `tools_lists.md:313-317`. Đây là điều chưa biết lúc viết `fetchListItems` (comment ở `PrivOSLifecycleService.ts:366-368` nói "không được tài liệu hoá"), giờ đã xác nhận.

**Hệ quả:** `src/ui/email-history/email-history-service.ts:73` gửi `count: 1000`. Hub chặn ở 100. Lịch sử email quá 100 bản ghi thì phần dư **đang biến mất im lặng ngay hôm nay**, không có lỗi, không có dấu hiệu.

**`debug_log` không tồn tại.** `PrivOSLifecycleService.ts:479-486` gọi `callServerTool({ name: 'debug_log' })`. Grep toàn bộ `src/` chỉ ra đúng một chỗ: chính call site đó. Không có nơi nào đăng ký tool này. Lỗi bị `.catch` nuốt nên không ai thấy. Nó nằm trong `getStageName`, mà `getStageName` lại được `isPassedCandidateItem` gọi cho **mọi** item ứng viên trong **mọi** list của room, nên mỗi lần load là N round-trip relay vào hư không, mỗi lần mang theo nguyên mảng `stages`.

**`TaskQueue.clear()` treo promise.** `src/services/mail/task-queue.ts` gán `this.queue = []` mà không gọi `reject`. Mọi caller đang `await enqueue(...)` sẽ treo vĩnh viễn. Hiện `src/services/mail/mail-relay-service.ts` chưa gọi `clear()` bao giờ, nên đây là mìn chưa nổ.

**`getProfileValueByFieldName` hỏng dữ liệu thật.** `PrivOSLifecycleService.ts:544-552` trả `data.startDate` cho **mọi** field definition có tên chứa `ngày`. `buildCustomFieldsForCreation` (`:527-542`) duyệt mọi field definition, nên room nào có cả "Ngày sinh" lẫn "Ngày bắt đầu" sẽ bị **ghi ngày vào làm đè lên trường ngày sinh trong DB**. Chiều đọc (`:516-525`) cũng lẫn nhưng chỉ hỏng hiển thị. Schema mặc định (`getInitialFieldDefinitions`, `:561-570`) mỗi loại đúng một trường, nên chỉ room đã tự thêm field mới dính.

**Vòng poll nuốt lỗi.** `src/ui/pipeline-service.ts:773-799`: 300 nhịp × 2 giây. `catch { continue }` ở `:782-785` bỏ qua mọi lỗi mạng, nên một session đã chết vẫn bị poll đủ 600 giây rồi mới báo "AI polling timeout sau 10 phút" — thông báo sai nguyên nhân. Không có `AbortController` nào trong UI ngoài `AbortSignal.timeout` ở `privos-rest.ts:142`, và `restCall` không nhận `signal` (chữ ký ở `privos-rest.ts:69-74` chỉ có `query`, `body`, `timeoutMs`).

**PII ứng viên ra console.** `src/ui/pipeline-service.ts` các dòng `812`, `838`, `841`, `845`, `851`, `852`: tên file CV chính là họ tên ứng viên, được log ở mỗi lần thử đường dẫn (16 đường dẫn mỗi CV) và hai lần đổ nguyên danh sách file khi không tìm thấy.

---

## Sơ đồ file

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `src/ui/list-item-paging.ts` | Tạo | Đọc trọn một list qua `offset`/`count`, phát hiện Hub bỏ qua `offset`, có trần trang |
| `tests/list-item-paging.spec.ts` | Tạo | Test cho trên |
| `src/ui/lifecycle/profile-field-aliases.ts` | Tạo | Bảng alias tên field và hàm khớp chính xác |
| `tests/profile-field-aliases.spec.ts` | Tạo | Test cho trên |
| `src/ui/log-redaction.ts` | Tạo | Che tên file trong log, giữ thư mục và đuôi |
| `tests/log-redaction.spec.ts` | Tạo | Test cho trên |
| `tests/task-queue.spec.ts` | Tạo | Test cho `TaskQueue` |
| `tests/email-history-paging.spec.ts` | Tạo | Test phân trang lịch sử email |
| `tests/pipeline-ai-polling.spec.ts` | Tạo | Test abort và ngưỡng lỗi liên tiếp của `askAI` |
| `src/ui/lifecycle/services/PrivOSLifecycleService.ts` | Sửa | Nối vào 2 module mới, gỡ `debug_log` |
| `src/ui/email-history/email-history-service.ts` | Sửa | Bỏ `count: 1000`, nối vào module phân trang |
| `src/services/mail/task-queue.ts` | Sửa | `clear()` reject các item bị bỏ |
| `src/ui/pipeline-service.ts` | Sửa | `AbortSignal`, ngưỡng lỗi liên tiếp, che PII trong log |
| `tests/lifecycle-load-profiles.spec.ts` | Sửa | Thêm test cho alias tên field |

Thứ tự task được xếp để `src/ui/pipeline-service.ts` — file nóng nhất về merge — nằm ở task cuối cùng, tức commit mới nhất, dễ rebase nhất.

---

### Task 1: Module phân trang list dùng chung

**Files:**
- Create: `src/ui/list-item-paging.ts`
- Test: `tests/list-item-paging.spec.ts`

**Interfaces:**
- Consumes: `parseToolResult` từ `@privos_ai/app-react` (đã là dependency, xem `PrivOSLifecycleService.ts:1`).
- Produces:
  - `type MissingIdPolicy = 'throw' | 'skip'`
  - `interface ListItemPagingApp { callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown> }`
  - `interface ListItemPagingOptions { missingId: MissingIdPolicy; maxPages: number; pageSize?: number }`
  - `const LIST_ITEMS_PAGE_SIZE = 100`
  - `function readItemId(item: unknown): string`
  - `function fetchAllListItems(app: ListItemPagingApp, listId: string, options: ListItemPagingOptions): Promise<any[]>`

Task 2 và Task 3 đều tiêu thụ `fetchAllListItems`.

**Vì sao tách module thay vì chép vòng lặp:** phép dò "Hub bỏ qua `offset`" đủ tinh vi để hai bản sao trôi lệch nhau. Bản trong `PrivOSLifecycleService` hiện đếm item không-id là "fresh", nên một trang toàn item không-id qua mặt được phép dò; với chính sách `throw` thì không bao giờ chạm tới nhánh đó, nhưng logic dùng chung phải đúng cho cả hai chính sách.

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/list-item-paging.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fetchAllListItems, readItemId } from '../src/ui/list-item-paging';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * `fetchAllListItems` chỉ chạm `app.callServerTool`, nên một hàm trả trang là stub đầy đủ.
 * SDK bọc payload thành JSON trong `content[0].text`; stub tái tạo đúng hình dạng đó vì
 * module dùng `parseToolResult` để bóc.
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
  return Array.from({ length: n }, (_, i) => ({ _id: `item-${start + i}`, name: `Item ${start + i}` }));
}

describe('readItemId', () => {
  it('doc _id truoc, roi toi id', () => {
    expect(readItemId({ _id: 'a', id: 'b' })).toBe('a');
    expect(readItemId({ id: 'b' })).toBe('b');
  });

  it('tra chuoi rong khi khong co id nao dung duoc', () => {
    expect(readItemId({ name: 'x' })).toBe('');
    expect(readItemId({ _id: '' })).toBe('');
    expect(readItemId({ _id: 123 })).toBe('');
    expect(readItemId(null)).toBe('');
  });
});

describe('fetchAllListItems', () => {
  it('doc tiep trang sau thay vi cat o 100', async () => {
    const { app, calls } = createAppStub((offset) => (offset === 0 ? page(0, 100) : page(100, 7)));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(107);
    expect(calls.map(c => c.arguments!.offset)).toEqual([0, 100]);
    expect(calls.every(c => c.arguments!.count === 100)).toBe(true);
  });

  it('dung o trang dau ngan, khong hoi trang thu hai', async () => {
    const { app, calls } = createAppStub(() => page(0, 3));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it('chap nhan hinh dang { items: [...] } ben canh mang tran', async () => {
    const { app } = createAppStub(() => ({ items: page(0, 2) }));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .resolves.toHaveLength(2);
  });

  it('nem loi khi Hub bo qua offset thay vi lap vo tan hoac cat bot', async () => {
    const { app } = createAppStub(() => page(0, 100));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/offset/i);
  });

  it('nem loi khi vuot tran so trang', async () => {
    let next = 0;
    const { app } = createAppStub(() => { const p = page(next, 100); next += 100; return p; });

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 3 }))
      .rejects.toThrow(/300 item/);
  });

  it('missingId throw nem loi khi item khong co id', async () => {
    const { app } = createAppStub(() => [{ name: 'Khong co id' }]);

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'throw', maxPages: 10 }))
      .rejects.toThrow(/_id/);
  });

  it('missingId skip bo qua item khong co id va giu phan con lai', async () => {
    const { app } = createAppStub(() => [{ name: 'Khong co id' }, { _id: 'item-1', name: 'Co id' }]);

    const items = await fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 10 });
    expect(items).toEqual([{ _id: 'item-1', name: 'Co id' }]);
  });

  it('khong nham mot trang toan item khong-id thanh tien do khi missingId la skip', async () => {
    // Trang khong co id nao thi khong ket luan duoc gi ve offset, nen chi duoc dung o tran trang,
    // khong duoc nem loi "bo qua offset" sai.
    const { app } = createAppStub(() => Array.from({ length: 100 }, () => ({ name: 'Khong co id' })));

    await expect(fetchAllListItems(app, 'list-1', { missingId: 'skip', maxPages: 2 }))
      .rejects.toThrow(/200 item/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/list-item-paging.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/list-item-paging"`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/ui/list-item-paging.ts` (2 dấu cách, CRLF):

```ts
import { parseToolResult } from '@privos_ai/app-react';

/**
 * Read every item of a PrivOS list.
 *
 * `mcpapp.lists.getItems` caps `count` at 100 (`tools_lists.md:270`) and does support `offset`
 * (`tools_lists.md:269`). Sending a larger `count` is not an error — the hub just returns the
 * first 100 — so every single-shot read in this codebase was silently truncating.
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

export function readItemId(item: unknown): string {
  const record = item as { _id?: unknown; id?: unknown } | null | undefined;
  if (typeof record?._id === 'string' && record._id.length > 0) return record._id;
  if (typeof record?.id === 'string' && record.id.length > 0) return record.id;
  return '';
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
  const pageSize = options.pageSize ?? LIST_ITEMS_PAGE_SIZE;
  const collected: any[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < options.maxPages; page += 1) {
    const res = await app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: { listId, count: pageSize, offset: page * pageSize },
    });

    const parsed: any = parseToolResult(res as never);
    const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);

    let idsOnPage = 0;
    let alreadySeenOnPage = 0;

    for (const item of items) {
      const id = readItemId(item);
      if (id.length === 0) {
        if (options.missingId === 'throw') {
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id nên không đối chiếu được với bảng lương. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
        }
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
    if (idsOnPage > 0 && alreadySeenOnPage === idsOnPage) {
      throw new Error(
        `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
        + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về dữ liệu thiếu.',
      );
    }

    if (items.length < pageSize) return collected;
  }

  throw new Error(
    `Danh sách ${listId} vượt quá ${options.maxPages * pageSize} item. Dừng để không trả về dữ liệu thiếu.`,
  );
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/list-item-paging.spec.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

---

### Task 2: Nối `PrivOSLifecycleService` vào module phân trang

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts` — import ở dòng 1-2, hằng số ở `:10-14`, và toàn bộ `fetchListItems` cùng khối comment trên nó (`:362-414`)
- Test: `tests/lifecycle-load-profiles.spec.ts` (đã có, **không sửa** — dùng làm bằng chứng hành vi không đổi)

**Interfaces:**
- Consumes: `fetchAllListItems`, `LIST_ITEMS_PAGE_SIZE` từ Task 1.
- Produces: không có API mới. `fetchListItems(listId: string): Promise<any[]>` giữ nguyên chữ ký và hành vi.

**Đây là task thay-thế-tương-đương.** Bốn test ở `tests/lifecycle-load-profiles.spec.ts:254-299` (khối `PrivOSLifecycleService roster paging`) là hợp đồng: chúng phải xanh sau khi sửa mà không cần chỉnh một chữ nào. Nếu phải sửa test thì hành vi đã đổi và task này sai. Hai test trong số đó khớp lỗi bằng `/offset/i` và `/không mang _id/i`, cả hai chuỗi đều còn nguyên trong thông báo lỗi của Task 1.

- [ ] **Step 1: Chạy test paging sẵn có để ghi nhận mốc xanh**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: PASS toàn bộ. Ghi lại số test đã xanh — con số này không được giảm.

- [ ] **Step 2: Thêm import**

Ở đầu file, sau hai dòng import sẵn có:

```ts
import { McpApp, parseToolResult } from '@privos_ai/app-react';
import { EmployeeProfile, ILifecycleService, PassedCandidate } from '../types';
import { fetchAllListItems, LIST_ITEMS_PAGE_SIZE } from '../../list-item-paging';
```

- [ ] **Step 3: Đổi hằng số `ITEMS_PAGE_SIZE` sang dùng chung**

Thay khối `:10-14`:

```ts
  /** One `mcpapp.lists.getItems` page. 100 is the value this call has used since the migration. */
  private static readonly ITEMS_PAGE_SIZE = 100;

  /** 100 × 100 = 10,000 items — the same ceiling `PAYROLL_MAX_PAGES` gives the payroll read. */
  private static readonly ITEMS_MAX_PAGES = 100;
```

bằng:

```ts
  /** One `mcpapp.lists.getItems` page. The hub caps this at 100 (`tools_lists.md:270`). */
  private static readonly ITEMS_PAGE_SIZE = LIST_ITEMS_PAGE_SIZE;

  /** 100 × 100 = 10,000 items — the same ceiling `PAYROLL_MAX_PAGES` gives the payroll read. */
  private static readonly ITEMS_MAX_PAGES = 100;
```

- [ ] **Step 4: Thay thân `fetchListItems`**

Thay toàn bộ khối comment và thân `fetchListItems` (`:362-414`) bằng:

```ts
  /**
   * Read EVERY item of a list.
   *
   * This used to send a bare `count: 100` and return whatever came back. `PayrollDashboard`
   * treats any employee missing from this roster as an orphan and deletes their payroll row, so
   * a silently truncated read at employee 101 destroyed real salary data.
   *
   * `missingId: 'throw'` because `mapItemToProfile` gives an id-less item `_id: undefined`, and
   * the payroll GC reconciles on exactly that `_id` — a roster carrying anonymous items makes the
   * GC tombstone the wrong salary row. Returning a partial roster is the failure mode this method
   * exists to prevent, so it is never the fallback.
   */
  private async fetchListItems(listId: string): Promise<any[]> {
    return fetchAllListItems(this.app, listId, {
      missingId: 'throw',
      maxPages: PrivOSLifecycleService.ITEMS_MAX_PAGES,
      pageSize: PrivOSLifecycleService.ITEMS_PAGE_SIZE,
    });
  }
```

- [ ] **Step 5: Chạy lại test paging**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: PASS, đúng số test như Step 1, **không sửa file test**.

Nếu test `throws instead of returning a partial roster when the hub ignores offset` đỏ: kiểm tra stub trả cùng một trang 100 item mỗi lần, và `fetchAllListItems` đang nhận đúng `pageSize: 100`. Nếu test `throws instead of accepting a roster item that has no id` đỏ: kiểm tra `missingId: 'throw'` đã được truyền.

- [ ] **Step 6: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 227 passed` (217 baseline + 10 test của Task 1). Typecheck sạch — `parseToolResult` vẫn được dùng ở `:201` và `:314` nên import không thừa.

---

### Task 3: Bỏ `count: 1000` ở lịch sử email

**Files:**
- Modify: `src/ui/email-history/email-history-service.ts` — import ở đầu file, và khối `:71-76` trong `load`
- Test: `tests/email-history-paging.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `fetchAllListItems` từ Task 1.
- Produces: không có API mới. `EmailHistoryService.load(roomId: string): Promise<EmailHistoryRecord[]>` giữ nguyên chữ ký, nên `EmailMailboxView.tsx` của đồng đội không bị ảnh hưởng.

**Vì sao `missingId: 'skip'` chứ không phải `'throw'`:** một bản ghi email không có id thì UI không retry (`retry(roomId, itemId)`) và không xoá (`delete(itemId)`) được — nó vô dụng. Làm hỏng cả hộp thư vì một dòng vô dụng là phản ứng quá tay, khác hẳn trường hợp roster nhân sự nơi một item vô danh làm GC xoá nhầm lương.

- [ ] **Step 1: Viết test đỏ**

`EMAIL_HISTORY_STAGES` là một **object** (`{ interviewSent, interviewFailed, employeeSent, employeeFailed }`, xem `src/services/mail/email-history-model.ts:3-8`), không phải mảng. `parseEmailHistoryItem` (`:106-142`) trả `null` trừ khi item có đủ `_id`, `listId`, `stageId` hợp lệ **và** custom field `source` khớp đúng source của stage, cùng với `recipient_name`, `recipient_email`, `subject`, `html_content`, `created_at`, `updated_at`. Fixture dưới đây theo đúng khuôn mẫu đã dùng ở `tests/email-history-model.spec.ts:9-24`. `listId` không cần trong item thô vì `EmailHistoryService.load` tự chèn vào.

Tạo `tests/email-history-paging.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EmailHistoryService } from '../src/ui/email-history/email-history-service';
import { EMAIL_HISTORY_LIST_NAME, EMAIL_HISTORY_STAGES } from '../src/services/mail/email-history-model';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/** Stage thật, gán id giả. `resolveStageIds` khớp theo `name` nên tên phải đúng từng chữ. */
const STAGES = [
  { _id: 's1', name: EMAIL_HISTORY_STAGES.interviewSent },
  { _id: 's2', name: EMAIL_HISTORY_STAGES.interviewFailed },
  { _id: 's3', name: EMAIL_HISTORY_STAGES.employeeSent },
  { _id: 's4', name: EMAIL_HISTORY_STAGES.employeeFailed },
];

const LIST = { _id: 'list-mail', name: EMAIL_HISTORY_LIST_NAME, stages: STAGES };

/** Item tối thiểu mà `parseEmailHistoryItem` chấp nhận. `stageId: 's1'` nên `source` phải là `cv_scored`. */
function mailItem(index: number) {
  return {
    _id: `mail-${index}`,
    stageId: 's1',
    customFields: [
      { fieldId: 'source', value: 'cv_scored' },
      { fieldId: 'recipient_name', value: `Nguoi Nhan ${index}` },
      { fieldId: 'recipient_email', value: `nguoinhan${index}@example.com` },
      { fieldId: 'subject', value: 'Thu moi phong van' },
      { fieldId: 'html_content', value: '<p>noi dung</p>' },
      { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' },
      { fieldId: 'updated_at', value: new Date(Date.UTC(2026, 8, 2, 0, 0, index)).toISOString() },
    ],
  };
}

function createAppStub(pageFor: (offset: number) => unknown[]) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      if (call.name === 'mcpapp.lists.getAll') {
        return { content: [{ type: 'text', text: JSON.stringify([LIST]) }] };
      }
      if (call.name === 'mcpapp.lists.getItems') {
        const payload = pageFor(Number(call.arguments?.offset ?? 0));
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      }
      throw new Error(`unexpected tool call: ${call.name}`);
    },
    async rest() {
      throw new Error('rest() khong duoc goi khi list da mang san stages');
    },
  };
  return { app, calls };
}

describe('EmailHistoryService phan trang', () => {
  it('doc qua 100 ban ghi thay vi de Hub cat im lang', async () => {
    const { app, calls } = createAppStub((offset) =>
      offset === 0
        ? Array.from({ length: 100 }, (_, i) => mailItem(i))
        : Array.from({ length: 23 }, (_, i) => mailItem(100 + i)),
    );
    const service = new EmailHistoryService(app as never);

    await expect(service.load('room-1')).resolves.toHaveLength(123);
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('khong bao gio gui count vuot tran 100 cua Hub', async () => {
    const { app, calls } = createAppStub(() => [mailItem(0)]);
    const service = new EmailHistoryService(app as never);

    await service.load('room-1');
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.every(c => Number(c.arguments!.count) <= 100)).toBe(true);
  });

  it('bo qua ban ghi khong co id thay vi lam hong ca hop thu', async () => {
    const withoutId: Record<string, unknown> = { ...mailItem(0) };
    delete withoutId._id;

    const { app } = createAppStub(() => [withoutId, mailItem(1)]);
    const service = new EmailHistoryService(app as never);

    await expect(service.load('room-1')).resolves.toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/email-history-paging.spec.ts`
Expected: FAIL — test đầu nhận 100 thay vì 123, và `offset` là `[undefined]` thay vì `[0, 100]`.

Nếu cả ba test đỏ vì `toHaveLength(0)`: fixture chưa khớp yêu cầu của `parseEmailHistoryItem`. Đối chiếu lại với `tests/email-history-model.spec.ts:9-24` rồi sửa `mailItem`. **Không nới lỏng assertion.**

- [ ] **Step 3: Sửa `load`**

Thêm import vào đầu `src/ui/email-history/email-history-service.ts`, ngay sau `import { restCall } from '../privos-rest';`:

```ts
import { fetchAllListItems } from '../list-item-paging';
```

Thêm hằng số ngay dưới khối import, trên `type EmailHistoryApp`:

```ts
/**
 * 20 × 100 = 2.000 bản ghi. Trước đây chỗ này gửi `count: 1000` một phát, nhưng Hub chặn `count`
 * ở 100 (`tools_lists.md:270`) và không báo lỗi khi vượt — hộp thư quá 100 email đang mất phần
 * dư trong im lặng. Có trần để một list hỏng không kéo tab treo vô hạn.
 */
const EMAIL_HISTORY_MAX_PAGES = 20;
```

Thay khối `:71-76`:

```ts
    const itemsResponse = parseToolResponse(await this.app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: { listId, count: 1000 },
    }));
    const items = Array.isArray(itemsResponse) ? itemsResponse : itemsResponse?.items;
    if (!Array.isArray(items)) return [];
```

bằng:

```ts
    const items = await fetchAllListItems(this.app, listId, {
      missingId: 'skip',
      maxPages: EMAIL_HISTORY_MAX_PAGES,
    });
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/email-history-paging.spec.ts`
Expected: PASS, 3 test.

- [ ] **Step 5: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 230 passed`. Typecheck sạch.

Nếu `typecheck:strict-unused` báo `parseToolResponse` không còn được dùng: kiểm tra lại — nó vẫn được gọi cho `mcpapp.lists.getAll` ở `:49`. Chỉ khi thật sự không còn call site nào thì mới xoá hàm đó.

---

### Task 4: Gỡ `debug_log`

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:476-487` (bên trong `getStageName`)
- Test: `tests/lifecycle-load-profiles.spec.ts` (thêm một test)

**Interfaces:**
- Consumes: không.
- Produces: không có API mới. `getStageName` giữ nguyên chữ ký và giá trị trả về.

**Bản chất:** `debug_log` không phải tool của PrivOS và không được đăng ký ở đâu trong repo này. Mỗi item không khớp `stageId` tốn một round-trip relay vào hư không, mang theo nguyên mảng `stages`. `getStageName` được gọi cho mọi item của mọi list nên đây là chi phí theo N. Lỗi bị `.catch` nuốt nên nó chạy im lặng suốt.

`console.warn` giữ lại nhưng bỏ `stages` khỏi payload: `stages` giống hệt nhau cho mọi item trong cùng một list, log lại N lần là rác thuần tuý.

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `tests/lifecycle-load-profiles.spec.ts` (giữ nguyên các `describe` sẵn có):

```ts
describe('PrivOSLifecycleService khong goi tool khong ton tai', () => {
  it('khong goi debug_log khi mot item khong khop stageId', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // stageId khong co trong STAGES, dung nhanh fallback cua getStageName.
      'mcpapp.lists.getItems': () => [
        { _id: 'emp-1', name: 'NV 1', stageId: 'stage-khong-ton-tai', customFields: [] },
      ],
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.loadProfiles('room-1');
    expect(calls.map(c => c.name)).not.toContain('debug_log');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "debug_log"`
Expected: FAIL. `createAppStub` ném `unexpected tool call: debug_log` khi service gọi tool không có handler, hoặc assertion `not.toContain` thất bại.

- [ ] **Step 3: Xoá khối `debug_log` và rút gọn log**

Thay khối `:476-487`:

```ts
    console.warn(`[PrivOSLifecycleService] Item ${item._id} mapped to status: "${resolvedStatus}". Raw item info:`, { stageId, stage: item.stage, status: item.status, stages });
    
    // Also send log to backend IDE terminal
    try {
      this.app.callServerTool({
        name: 'debug_log',
        arguments: {
          message: `Item ${item._id} mapped to status: "${resolvedStatus}"`,
          data: { stageId, stage: item.stage, status: item.status, stages }
        }
      }).catch(err => console.error("Failed to send debug log", err));
    } catch(e) {}

    return resolvedStatus;
```

bằng:

```ts
    // `stages` is identical for every item in the list, so it is left out: logging it once per
    // item buried the one field that differs. The `debug_log` tool call that used to sit here was
    // removed — no such tool is registered anywhere, so it was one failed relay round-trip per
    // unmatched item, swallowed by its own `.catch`.
    console.warn(
      `[PrivOSLifecycleService] Item ${item._id} mapped to status: "${resolvedStatus}"`,
      { stageId, stage: item.stage, status: item.status },
    );

    return resolvedStatus;
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: PASS toàn bộ, gồm test mới.

- [ ] **Step 5: Xác nhận không còn call site nào**

Run: `npx rg -n "debug_log" src/`
Expected: không có kết quả.

- [ ] **Step 6: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 231 passed`. Typecheck sạch — chú ý biến `stages` trong `getStageName` vẫn được `isValidStatus` dùng nên không thừa.

---

### Task 5: `TaskQueue.clear()` reject các item bị bỏ

**Files:**
- Modify: `src/services/mail/task-queue.ts` (thêm class lỗi, sửa `clear()`)
- Test: `tests/task-queue.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: không.
- Produces:
  - `class TaskQueueClearedError extends Error` — `name === 'TaskQueueClearedError'`
  - `TaskQueue.clear(): void` giữ nguyên chữ ký, đổi hành vi: reject mọi item đang chờ.

**Bản chất:** `clear()` hiện gán `this.queue = []` mà không gọi `reject`, nên mọi caller đang `await enqueue(...)` treo vĩnh viễn — không resolve, không reject, không timeout. `mail-relay-service.ts` chưa gọi `clear()` bao giờ nên lỗi chưa nổ, nhưng nó là API công khai của một class dùng chung.

Task này **không** thêm giới hạn kích thước hàng đợi: nguồn cấp duy nhất là `sendTracked` do người dùng bấm, không có đường tự sinh.

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/task-queue.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TaskQueue, TaskQueueClearedError } from '../src/services/mail/task-queue';

describe('TaskQueue', () => {
  it('chay tuan tu theo dung thu tu enqueue', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    const order: number[] = [];

    await Promise.all([
      queue.enqueue(async () => { order.push(1); }),
      queue.enqueue(async () => { order.push(2); }),
      queue.enqueue(async () => { order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('tra ve gia tri that cua task cho nguoi goi', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    await expect(queue.enqueue(async () => 'ket qua')).resolves.toBe('ket qua');
  });

  it('day loi cua task ve cho nguoi goi thay vi nuot', async () => {
    const queue = new TaskQueue({ delayMs: 0 });
    await expect(queue.enqueue(async () => { throw new Error('task hong'); }))
      .rejects.toThrow('task hong');
  });

  it('clear() reject moi item dang cho thay vi de chung treo vinh vien', async () => {
    const queue = new TaskQueue({ delayMs: 50 });

    // Task dau chiem cho xu ly, hai task sau nam lai trong hang doi.
    const running = queue.enqueue(async () => 'xong');
    const pendingA = queue.enqueue(async () => 'khong bao gio chay');
    const pendingB = queue.enqueue(async () => 'khong bao gio chay');

    queue.clear();

    await expect(pendingA).rejects.toBeInstanceOf(TaskQueueClearedError);
    await expect(pendingB).rejects.toBeInstanceOf(TaskQueueClearedError);
    await expect(running).resolves.toBe('xong');
  });

  it('clear() dua getPendingCount ve 0', async () => {
    const queue = new TaskQueue({ delayMs: 50 });
    const running = queue.enqueue(async () => 'xong');
    const dropped = queue.enqueue(async () => 'bi bo');

    queue.clear();
    expect(queue.getPendingCount()).toBe(0);

    await expect(dropped).rejects.toBeInstanceOf(TaskQueueClearedError);
    await running;
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/task-queue.spec.ts`
Expected: FAIL — `TaskQueueClearedError` chưa được export, và hai test cuối treo tới khi vitest timeout (đúng bản chất của lỗi).

- [ ] **Step 3: Sửa `task-queue.ts`**

Thêm ngay trên `export class TaskQueue`:

```ts
/**
 * Thrown into every task still queued when `clear()` runs. Before this existed `clear()` dropped
 * the items without settling their promises, so every caller sitting on `await enqueue(...)`
 * waited forever — no resolve, no reject, no timeout.
 */
export class TaskQueueClearedError extends Error {
  constructor() {
    super('Tác vụ bị huỷ vì hàng đợi đã được xoá.');
    this.name = 'TaskQueueClearedError';
  }
}
```

Thay `clear()`:

```ts
  /**
   * Xóa toàn bộ tác vụ đang chờ
   */
  public clear(): void {
    this.queue = [];
  }
```

bằng:

```ts
  /**
   * Xoá toàn bộ tác vụ đang chờ. Task đang chạy dở không bị ảnh hưởng — nó đã rời hàng đợi.
   */
  public clear(): void {
    const dropped = this.queue;
    this.queue = [];
    for (const item of dropped) {
      item.reject(new TaskQueueClearedError());
    }
  }
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/task-queue.spec.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 236 passed`. `tests/mail-relay-service.spec.ts` phải vẫn xanh — `mail-relay-service` không gọi `clear()` nên hành vi của nó không đổi.

---

### Task 6: Module alias tên field

**Files:**
- Create: `src/ui/lifecycle/profile-field-aliases.ts`
- Test: `tests/profile-field-aliases.spec.ts`

**Interfaces:**
- Consumes: không. Module thuần, không import gì.
- Produces:
  - `type ProfileFieldKey = 'phone' | 'email' | 'position' | 'department' | 'startDate' | 'attachedFileObj'`
  - `function normalizeFieldName(fieldName: string): string`
  - `function resolveProfileFieldKey(fieldName: string): ProfileFieldKey | undefined`

Task 7 tiêu thụ `resolveProfileFieldKey` và `ProfileFieldKey`.

**Chuẩn hoá:** NFD tách dấu, xoá dấu, `đ`/`Đ` thành `d`, gộp khoảng trắng liên tiếp thành một, viết hoa, trim. Thứ tự quan trọng: xoá dấu trước, rồi mới thay `đ` (NFD không tách `đ` vì nó là chữ cái riêng, không phải nguyên âm có dấu).

- [ ] **Step 1: Viết test đỏ**

Tạo `tests/profile-field-aliases.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeFieldName, resolveProfileFieldKey } from '../src/ui/lifecycle/profile-field-aliases';

describe('normalizeFieldName', () => {
  it('xoa dau, doi d gach ngang, viet hoa, gop khoang trang', () => {
    expect(normalizeFieldName('Ngày bắt  đầu')).toBe('NGAY BAT DAU');
    expect(normalizeFieldName('  sđt ')).toBe('SDT');
    expect(normalizeFieldName('Phòng ban')).toBe('PHONG BAN');
  });

  it('chiu duoc chuoi rong', () => {
    expect(normalizeFieldName('')).toBe('');
  });
});

describe('resolveProfileFieldKey', () => {
  it('khop ten chuan trong getInitialFieldDefinitions', () => {
    expect(resolveProfileFieldKey('Số điện thoại')).toBe('phone');
    expect(resolveProfileFieldKey('Email')).toBe('email');
    expect(resolveProfileFieldKey('Vị trí')).toBe('position');
    expect(resolveProfileFieldKey('Phòng ban')).toBe('department');
    expect(resolveProfileFieldKey('Ngày bắt đầu')).toBe('startDate');
    expect(resolveProfileFieldKey('Hồ sơ đính kèm')).toBe('attachedFileObj');
  });

  it('khop bat ke hoa thuong va dau', () => {
    expect(resolveProfileFieldKey('NGAY BAT DAU')).toBe('startDate');
    expect(resolveProfileFieldKey('ngày vào làm')).toBe('startDate');
    expect(resolveProfileFieldKey('SĐT')).toBe('phone');
  });

  it('KHONG khop Ngay sinh vao startDate', () => {
    // Day chinh la loi cu: `includes('ngày')` khop ca hai, nen ngay vao lam bi ghi de len ngay sinh.
    expect(resolveProfileFieldKey('Ngày sinh')).toBeUndefined();
    expect(resolveProfileFieldKey('Ngày ký hợp đồng')).toBeUndefined();
  });

  it('tra undefined cho ten khong nam trong bang alias', () => {
    expect(resolveProfileFieldKey('Ghi chú nội bộ')).toBeUndefined();
    expect(resolveProfileFieldKey('')).toBeUndefined();
  });

  it('khong khop nham khi ten chi CHUA mot alias', () => {
    // `includes` cu se khop het nhung cai nay; khop chinh xac thi khong.
    expect(resolveProfileFieldKey('Email cá nhân')).toBeUndefined();
    expect(resolveProfileFieldKey('Số phòng')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/profile-field-aliases.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/lifecycle/profile-field-aliases"`.

- [ ] **Step 3: Viết implementation**

Tạo `src/ui/lifecycle/profile-field-aliases.ts` (2 dấu cách, CRLF):

```ts
/**
 * Room admins name the custom fields on the employee list, so mapping a field name onto a profile
 * property has to be a lookup. It used to be a chain of `includes` tests, and a room holding both
 * "Ngày sinh" and "Ngày bắt đầu" matched both on `includes('ngày')` — the write path then stored
 * the start date into the birthday field, corrupting real data.
 *
 * Matching is exact against this table instead. A field name that is not listed is left alone:
 * that field stops syncing, which is visible and recoverable, rather than overwriting a neighbour.
 */

export type ProfileFieldKey =
  | 'phone'
  | 'email'
  | 'position'
  | 'department'
  | 'startDate'
  | 'attachedFileObj';

/** Keys here MUST already be normalised — `resolveProfileFieldKey` normalises only its input. */
const ALIASES = new Map<string, ProfileFieldKey>([
  ['SO DIEN THOAI', 'phone'],
  ['SDT', 'phone'],
  ['DIEN THOAI', 'phone'],
  ['PHONE', 'phone'],

  ['EMAIL', 'email'],
  ['THU DIEN TU', 'email'],

  ['VI TRI', 'position'],
  ['CHUC DANH', 'position'],
  ['POSITION', 'position'],

  ['PHONG BAN', 'department'],
  ['BO PHAN', 'department'],
  ['DEPARTMENT', 'department'],

  ['NGAY BAT DAU', 'startDate'],
  ['NGAY VAO LAM', 'startDate'],
  ['START DATE', 'startDate'],

  ['HO SO DINH KEM', 'attachedFileObj'],
  ['TAI LIEU', 'attachedFileObj'],
  ['DOCUMENT', 'attachedFileObj'],
]);

/**
 * Diacritics are stripped before `đ` is replaced: NFD does not decompose `đ`, it is a distinct
 * letter rather than a vowel carrying a mark.
 */
export function normalizeFieldName(fieldName: string): string {
  return (fieldName || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

export function resolveProfileFieldKey(fieldName: string): ProfileFieldKey | undefined {
  return ALIASES.get(normalizeFieldName(fieldName));
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/profile-field-aliases.spec.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:strict-unused`
Expected: không lỗi.

---

### Task 7: Nối `PrivOSLifecycleService` vào bảng alias

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts` — import, `assignProfileFieldByName` (`:516-525`), `getProfileValueByFieldName` (`:544-552`)
- Test: `tests/lifecycle-load-profiles.spec.ts` (thêm một `describe`)

**Interfaces:**
- Consumes: `resolveProfileFieldKey` từ Task 6.
- Produces: không có API mới. Hai method private giữ nguyên chữ ký.

**Đây là task sửa lỗi hỏng dữ liệu.** Chiều ghi quan trọng hơn chiều đọc: `buildCustomFieldsForCreation` duyệt mọi field definition và hỏi `getProfileValueByFieldName`, nên hàm đó trả `data.startDate` cho "Ngày sinh" nghĩa là ngày vào làm được ghi đè lên ngày sinh trong DB.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `tests/lifecycle-load-profiles.spec.ts`:

```ts
describe('PrivOSLifecycleService khop ten field chinh xac', () => {
  const LIST_HAI_TRUONG_NGAY = {
    _id: 'list-1',
    name: '[HR-MCP-App] Hồ sơ nhân sự',
    fieldDefinitions: [
      { _id: 'fd-ngay-sinh', name: 'Ngày sinh', type: 'DATE' },
      { _id: 'fd-ngay-bat-dau', name: 'Ngày bắt đầu', type: 'DATE' },
    ],
    stages: STAGES,
  };

  it('khong ghi ngay vao lam de len truong Ngay sinh khi tao ho so', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_HAI_TRUONG_NGAY],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.createItem': () => ({ _id: 'emp-moi' }),
    });
    const service = new PrivOSLifecycleService(app as never);

    await service.createProfile('room-1', {
      name: 'NV Moi',
      startDate: '2026-01-05',
    } as never);

    const createCall = calls.find(c => c.name === 'mcpapp.lists.createItem');
    const customFields = createCall!.arguments!.customFields as Array<{ fieldId: string; value: unknown }>;
    expect(customFields.map(f => f.fieldId)).toEqual(['fd-ngay-bat-dau']);
    expect(customFields.find(f => f.fieldId === 'fd-ngay-sinh')).toBeUndefined();
  });

  it('doc startDate tu Ngay bat dau chu khong phai Ngay sinh', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [LIST_HAI_TRUONG_NGAY],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{
        _id: 'emp-1',
        name: 'NV 1',
        stageId: 'stage-1',
        customFields: [
          { fieldId: 'fd-ngay-sinh', value: '1990-03-20' },
          { fieldId: 'fd-ngay-bat-dau', value: '2026-01-05' },
        ],
      }],
    });
    const service = new PrivOSLifecycleService(app as never);

    const profiles = await service.loadProfiles('room-1');
    expect(profiles[0].startDate).toBe('2026-01-05');
  });

  it('bo qua truong co ten khong nam trong bang alias', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [{
        ...LIST_HAI_TRUONG_NGAY,
        fieldDefinitions: [{ _id: 'fd-ghi-chu', name: 'Ghi chú nội bộ', type: 'TEXT' }],
      }],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': () => [{
        _id: 'emp-1',
        name: 'NV 1',
        stageId: 'stage-1',
        customFields: [{ fieldId: 'fd-ghi-chu', value: 'khong duoc gan vao dau ca' }],
      }],
    });
    const service = new PrivOSLifecycleService(app as never);

    const profile = (await service.loadProfiles('room-1'))[0] as Record<string, unknown>;
    expect(Object.values(profile)).not.toContain('khong duoc gan vao dau ca');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "khop ten field chinh xac"`
Expected: FAIL.
- Test 1 đỏ: `customFields` chứa cả `fd-ngay-sinh` lẫn `fd-ngay-bat-dau` vì `includes('ngày')` khớp cả hai.
- Test 2 có thể đã xanh sẵn (thứ tự field quyết định ai ghi sau) — nó là test hồi quy, không phải test dẫn dắt. Nếu nó xanh ở bước này thì bình thường.

Nếu `createProfile` yêu cầu tham số khác với `(roomId, data)`, đọc lại chữ ký ở `PrivOSLifecycleService.ts` (khoảng `:75-140`) và chỉnh lời gọi trong test cho khớp. Không đổi assertion.

- [ ] **Step 3: Thêm import**

```ts
import { resolveProfileFieldKey } from '../profile-field-aliases';
```

- [ ] **Step 4: Thay `assignProfileFieldByName`**

Thay `:516-525`:

```ts
  private assignProfileFieldByName(profile: any, fieldName: string, value: any): void {
    const fname = fieldName.toLowerCase();

    if (fname.includes('thoại') || fname.includes('phone')) profile.phone = value;
    else if (fname.includes('email')) profile.email = value;
    else if (fname.includes('vị trí') || fname.includes('position')) profile.position = value;
    else if (fname.includes('phòng')) profile.department = value;
    else if (fname.includes('ngày') || fname.includes('date')) profile.startDate = value;
    else if (fname.includes('hồ sơ') || fname.includes('document')) profile.attachedFileObj = Array.isArray(value) ? value[0] : value;
  }
```

bằng:

```ts
  /**
   * `profile` is built up field by field from room-defined custom fields, so it is `any` until
   * it is cast to `EmployeeProfile` at the end of `mapItemToProfile`.
   */
  private assignProfileFieldByName(profile: any, fieldName: string, value: any): void {
    const key = resolveProfileFieldKey(fieldName);
    if (!key) return;

    switch (key) {
      case 'phone': profile.phone = value; return;
      case 'email': profile.email = value; return;
      case 'position': profile.position = value; return;
      case 'department': profile.department = value; return;
      case 'startDate': profile.startDate = value; return;
      case 'attachedFileObj':
        profile.attachedFileObj = Array.isArray(value) ? value[0] : value;
        return;
    }
  }
```

- [ ] **Step 5: Thay `getProfileValueByFieldName`**

Thay `:544-552`:

```ts
  private getProfileValueByFieldName(data: any, fieldName: string): any {
    const fname = fieldName.toLowerCase();
    if (fname.includes('thoại') || fname.includes('phone')) return data.phone;
    if (fname.includes('email')) return data.email;
    if (fname.includes('vị trí') || fname.includes('position')) return data.position;
    if (fname.includes('phòng')) return data.department;
    if (fname.includes('ngày') || fname.includes('date')) return data.startDate;
    return undefined;
  }
```

bằng:

```ts
  /** `data` is the caller-supplied profile payload; its fields are room-defined, hence `any`. */
  private getProfileValueByFieldName(data: any, fieldName: string): any {
    const key = resolveProfileFieldKey(fieldName);
    if (!key) return undefined;

    switch (key) {
      case 'phone': return data.phone;
      case 'email': return data.email;
      case 'position': return data.position;
      case 'department': return data.department;
      case 'startDate': return data.startDate;
      // Tệp hồ sơ đi qua mcpapp.files rồi gắn vào description, không ghi thành custom field.
      case 'attachedFileObj': return undefined;
    }
  }
```

- [ ] **Step 6: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`
Expected: PASS toàn bộ, gồm ba test mới.

- [ ] **Step 7: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 246 passed`. Typecheck sạch — `switch` vét cạn trên `ProfileFieldKey` nên không cần nhánh `default`.

---

### Task 8: `pipeline-service.ts` — abort, ngưỡng lỗi, che PII

**Files:**
- Create: `src/ui/log-redaction.ts`
- Test: `tests/log-redaction.spec.ts`
- Test: `tests/pipeline-ai-polling.spec.ts`
- Modify: `src/ui/pipeline-service.ts` — thêm import và hai helper cấp module, sửa `askAI` (`:732-800`), sửa các dòng log trong `getMarkdownContent` (`:812`, `:838`, `:841`, `:845`, `:851-852`)

**Interfaces:**
- Consumes: không có gì từ task trước.
- Produces:
  - `function redactFileName(pathOrName: string): string`
  - `askAI(content: string, _fileName?: string, fileId?: string, onLog?: (msg: string) => void, customFlowChatId?: string, signal?: AbortSignal): Promise<{ text: string }>` — thêm tham số thứ sáu, optional, nên bốn call site hiện có không phải sửa.

**Gộp ba việc vào một task là quyết định có chủ ý.** `src/ui/pipeline-service.ts` là file đồng đội sửa gần nhất (14/09). Mỗi commit chạm vào nó là một điểm rebase. Gộp lại thì chỉ có một.

**Không nối dây `AbortController` ở call site** — `pipeline-dashboard.tsx`, `jd-chatbot-functional.tsx`, `bot-drafting-tab.tsx` nằm trong danh sách cấm đụng. `askAI` nhận `signal` nhưng chưa ai truyền vào; giá trị thu được ngay trong task này là ngưỡng lỗi liên tiếp và phần che PII.

- [ ] **Step 1: Viết test đỏ cho `redactFileName`**

Tạo `tests/log-redaction.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { redactFileName } from '../src/ui/log-redaction';

describe('redactFileName', () => {
  it('giu thu muc va duoi, xoa ten file', () => {
    expect(redactFileName('room/hr-miniapp/jds/Nguyen Van A_CV.md')).toBe('room/hr-miniapp/jds/***.md');
  });

  it('xu ly ten tran khong co thu muc', () => {
    expect(redactFileName('Nguyen Van A.pdf')).toBe('***.pdf');
  });

  it('xu ly file khong co duoi', () => {
    expect(redactFileName('a/b/NguyenVanA')).toBe('a/b/***');
  });

  it('xu ly dau gach nguoc kieu Windows', () => {
    expect(redactFileName('a\\b\\Nguyen Van A.docx')).toBe('a\\b\\***.docx');
  });

  it('khong bao gio de lot ten nguoi ra ngoai', () => {
    const redacted = redactFileName('outputs-cv/2026-09/02-passed_screening/Tran Thi Bich Ngoc.md');
    expect(redacted).not.toMatch(/Tran|Thi|Bich|Ngoc/);
  });

  it('chiu duoc chuoi rong', () => {
    expect(redactFileName('')).toBe('***');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/log-redaction.spec.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/log-redaction"`.

- [ ] **Step 3: Viết `log-redaction.ts`**

Tạo `src/ui/log-redaction.ts` (2 dấu cách, CRLF):

```ts
/**
 * A CV file name is the applicant's full name, which makes it personal data. These paths get
 * logged on every pipeline run — sixteen probe attempts per CV — so the name must not reach the
 * console. The directory chain and the extension are what an operator actually debugs with, so
 * those stay and only the basename goes.
 */
export function redactFileName(pathOrName: string): string {
  const separator = Math.max(pathOrName.lastIndexOf('/'), pathOrName.lastIndexOf('\\'));
  const directory = separator >= 0 ? pathOrName.slice(0, separator + 1) : '';
  const base = pathOrName.slice(separator + 1);
  const dot = base.lastIndexOf('.');
  const extension = dot > 0 ? base.slice(dot) : '';
  return `${directory}***${extension}`;
}
```

- [ ] **Step 4: Chạy test để xác nhận nó xanh**

Run: `npx vitest run tests/log-redaction.spec.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Viết test đỏ cho vòng poll**

Tạo `tests/pipeline-ai-polling.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PipelineService } from '../src/ui/pipeline-service';

/**
 * `askAI` chi cham `app.rest`: mot lan `ai-messages.send`, mot lan `ai-messages.startGeneration`,
 * roi lap `ai-messages.list`. Stub tra ve theo path nen khong can dung toi SDK that.
 *
 * `PipelineService` nhan ba tham so: `(app: McpApp, roomId: string, _contextBuilder: ICvContextBuilder)`.
 * Tham so thu ba khong duoc dung trong luong nay nen truyen mot object rong la du.
 */
function createAppStub(onList: () => unknown) {
  let listCalls = 0;
  const app = {
    async rest(req: { method: string; path: string }) {
      if (req.path === 'ai-messages.send') {
        return { statusCode: 200, body: { sessionId: 'sess-1', aiMessage: { _id: 'msg-1' } } };
      }
      if (req.path === 'ai-messages.startGeneration') {
        return { statusCode: 200, body: {} };
      }
      if (req.path === 'ai-messages.list') {
        listCalls += 1;
        return { statusCode: 200, body: onList() };
      }
      throw new Error(`unexpected rest path: ${req.path}`);
    },
    get listCalls() { return listCalls; },
  };
  return app;
}

describe('askAI', () => {
  it('tra ve ngay khi AI bao completed', async () => {
    const app = createAppStub(() => ({ messages: [{ type: 'ai', status: 'completed', content: 'xong roi' }] }));
    const service = new PipelineService(app as never, 'room-1', {} as never);

    await expect(service.askAI('prompt')).resolves.toEqual({ text: 'xong roi' });
  });

  it('nem loi sau nguong that bai lien tiep thay vi poll du 10 phut', async () => {
    const app = createAppStub(() => { throw new Error('mang chet'); });
    const service = new PipelineService(app as never, 'room-1', {} as never);

    await expect(service.askAI('prompt')).rejects.toThrow(/mất kết nối/i);
    // Phai dung o nguong, khong phai 300 nhip.
    expect(app.listCalls).toBeLessThanOrEqual(10);
  });

  it('dung ngay khi signal bi abort', async () => {
    const controller = new AbortController();
    const app = createAppStub(() => ({ messages: [{ type: 'ai', status: 'processing' }] }));
    const service = new PipelineService(app as never, 'room-1', {} as never);

    const pending = service.askAI('prompt', undefined, undefined, undefined, undefined, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(/abort/i);
  });
});
```

- [ ] **Step 6: Chạy test để xác nhận nó đỏ**

Run: `npx vitest run tests/pipeline-ai-polling.spec.ts`
Expected: FAIL — test thứ hai chạy rất lâu rồi báo "AI polling timeout sau 10 phút" thay vì "mất kết nối"; test thứ ba không reject.

Nếu constructor của `PipelineService` khác `(app, roomId)`, đọc lại chữ ký thật ở đầu `src/ui/pipeline-service.ts` và chỉnh lời gọi trong test. Nếu class export dưới tên khác, dùng đúng tên đó. Không đổi assertion.

Nếu test 1 cũng chạy mất 2 giây: đúng, vòng lặp ngủ trước lần poll đầu. Không tối ưu chỗ này trong task hiện tại.

- [ ] **Step 7: Thêm helper cấp module vào `pipeline-service.ts`**

Thêm import cùng nhóm với các import sẵn có:

```ts
import { redactFileName } from './log-redaction';
```

Thêm ngay dưới khối import, trên khai báo class:

```ts
/**
 * Number of back-to-back `ai-messages.list` failures tolerated before giving up. The poll loop
 * used to `continue` past every network error, so a session whose transport had died still burned
 * the full ten minutes and then reported a timeout — the wrong cause.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 10;

/**
 * `setTimeout` that also loses to an abort. The poll below runs for up to ten minutes; without
 * this an unmounted tab keeps the loop, and its REST calls, alive to the end.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

  return new Promise<void>((resolve, reject) => {
    let onAbort: () => void = () => {};
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
```

- [ ] **Step 8: Sửa chữ ký và vòng lặp của `askAI`**

Đổi chữ ký ở `:732`:

```ts
  async askAI(content: string, _fileName?: string, fileId?: string, onLog?: (msg: string) => void, customFlowChatId?: string): Promise<{ text: string }> {
```

thành:

```ts
  async askAI(content: string, _fileName?: string, fileId?: string, onLog?: (msg: string) => void, customFlowChatId?: string, signal?: AbortSignal): Promise<{ text: string }> {
```

Thay toàn bộ vòng lặp `:773-799`:

```ts
    // Tăng số lần lặp lên 300 (300 x 2s = 600s = 10 phút) để đảm bảo AI có đủ thời gian đọc và xuất MD
    for (let i = 0; i < 300; i++) {
      await new Promise(r => setTimeout(r, 2000));

      let res;
      try {
        res = await restCall<any>(this.app, 'GET', 'ai-messages.list', {
          query: { sessionId, count: 20 }
        });
      } catch (err: any) {
        if (onLog) onLog(`>> Lỗi mạng tạm thời, đang thử lại... (Chi tiết: ${err.message || err})`);
        continue; // Bỏ qua lần lặp này và thử lại ở lần sau
      }

      const list = Array.isArray(res?.messages) ? res.messages : [];
      const aiMsg = [...list].reverse().find((m: any) => m.type === 'ai');

      if (aiMsg) {
        if (onLog) onLog(`>> Đang chờ (status = ${aiMsg.status})...`);
        if (['completed', 'failed', 'cancelled'].includes(aiMsg.status || '')) {
          if (onLog) onLog(`>> AI phản hồi hoàn tất!`);
          return { text: aiMsg.content || '' };
        }
      }
    }

    throw new Error('AI polling timeout sau 10 phút');
```

bằng:

```ts
    // 300 x 2s = 600s = 10 phút, đủ để AI đọc file rồi xuất MD.
    let consecutiveFailures = 0;

    for (let i = 0; i < 300; i++) {
      await sleep(2000, signal);

      let res;
      try {
        res = await restCall<any>(this.app, 'GET', 'ai-messages.list', {
          query: { sessionId, count: 20 }
        });
        consecutiveFailures = 0;
      } catch (err: any) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          throw new Error(
            `Mất kết nối khi chờ AI: ${MAX_CONSECUTIVE_POLL_FAILURES} lần gọi ai-messages.list liên tiếp `
            + `đều lỗi. Lần cuối: ${err?.message || err}`
          );
        }
        if (onLog) onLog(`>> Lỗi mạng tạm thời (${consecutiveFailures}/${MAX_CONSECUTIVE_POLL_FAILURES}), đang thử lại... (Chi tiết: ${err?.message || err})`);
        continue;
      }

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const list = Array.isArray(res?.messages) ? res.messages : [];
      const aiMsg = [...list].reverse().find((m: any) => m.type === 'ai');

      if (aiMsg) {
        if (onLog) onLog(`>> Đang chờ (status = ${aiMsg.status})...`);
        if (['completed', 'failed', 'cancelled'].includes(aiMsg.status || '')) {
          if (onLog) onLog(`>> AI phản hồi hoàn tất!`);
          return { text: aiMsg.content || '' };
        }
      }
    }

    throw new Error('AI polling timeout sau 10 phút');
```

- [ ] **Step 9: Chạy test poll để xác nhận nó xanh**

Run: `npx vitest run tests/pipeline-ai-polling.spec.ts`
Expected: PASS, 3 test.

- [ ] **Step 10: Che PII trong các log của `getMarkdownContent`**

Thay `:812`:

```ts
    console.log(`[Email Debug] Bắt đầu tìm file MD cho: ${normalizedName} (BaseName: ${baseName}, Sanitize: ${sanitizedBaseName})`);
```

bằng (ba tên đều là cùng một người, che rồi thì log ba lần là vô nghĩa):

```ts
    console.log(`[Email Debug] Bắt đầu tìm file MD cho: ${redactFileName(normalizedName)}`);
```

Thay `:838`:

```ts
      console.log(`[Email Debug] Đang thử lấy nội dung từ đường dẫn: ${path}`);
```

bằng:

```ts
      console.log(`[Email Debug] Đang thử lấy nội dung từ đường dẫn: ${redactFileName(path)}`);
```

Thay `:841`:

```ts
        console.log(`[Email Debug] ĐÃ TÌM THẤY file tại: ${path} (Độ dài: ${content.length} ký tự)`);
```

bằng:

```ts
        console.log(`[Email Debug] ĐÃ TÌM THẤY file tại: ${redactFileName(path)} (Độ dài: ${content.length} ký tự)`);
```

Thay `:845` (ký tự cảnh báo bị gỡ theo luật không-icon):

```ts
    console.warn(`[Email Debug] ⚠ KHÔNG TÌM THẤY file MD nào cho: ${normalizedName}.`);
```

bằng:

```ts
    console.warn(`[Email Debug] KHÔNG TÌM THẤY file MD nào cho: ${redactFileName(normalizedName)}.`);
```

Thay `:851-852`:

```ts
      console.log(`[Email Debug] DANH SÁCH CÁC FILE ĐANG CÓ TRONG 02-passed_screening/:`, listPass?.body?.files || listPass?.files);
      console.log(`[Email Debug] DANH SÁCH CÁC FILE ĐANG CÓ TRONG 01-failed/:`, listFail?.body?.files || listFail?.files);
```

bằng (tên file trong danh sách cũng là tên ứng viên, nên chỉ log số lượng):

```ts
      const passedFiles = listPass?.body?.files || listPass?.files;
      const failedFiles = listFail?.body?.files || listFail?.files;
      console.log(`[Email Debug] Số file trong 02-passed_screening/: ${Array.isArray(passedFiles) ? passedFiles.length : 'không đọc được'}`);
      console.log(`[Email Debug] Số file trong 01-failed/: ${Array.isArray(failedFiles) ? failedFiles.length : 'không đọc được'}`);
```

- [ ] **Step 11: Kiểm tra không còn biến thô nào lọt vào log**

Run: `npx rg -n "Email Debug" src/ui/pipeline-service.ts`
Expected: mọi dòng còn lại hoặc đi qua `redactFileName`, hoặc chỉ in số đếm. Không dòng nào nội suy thẳng `normalizedName`, `baseName`, `sanitizedBaseName`, `path`, hay một mảng file.

Run: `npx rg -n "sanitizedBaseName" src/ui/pipeline-service.ts`
Expected: biến vẫn được dùng để dựng `processPaths`. Nếu nó chỉ còn ở phần khai báo, `typecheck:strict-unused` sẽ báo — khi đó xoá luôn khai báo.

- [ ] **Step 12: Chạy cả suite và typecheck**

Run: `npm test && npm run typecheck:strict-unused`
Expected: `3 failed | 255 passed`. Typecheck sạch.

- [ ] **Step 13: Build để chắc bundle vẫn dựng được**

Run: `npm run build`
Expected: build xong, không lỗi. (`npm run preflight` sẽ hỏng trên Windows vì SDK kiểm tra `(stat.mode & 0o777) !== 0o600` mà NTFS không biểu diễn được — đây là hỏng-do-môi-trường đã biết, không phải hồi quy do plan này.)

---

## Kiểm tra cuối

Sau khi cả tám task xong:

- [ ] `npm test` cho đúng `3 failed | 255 passed`. Ba test đỏ phải là hai của `tests/manifest.spec.ts` và một của `tests/ui-shell.spec.ts` — đúng baseline, không phải cái khác.
- [ ] `npm run typecheck:strict-unused` sạch.
- [ ] `npm run build` xong.
- [ ] `npx rg -n "debug_log" src/` không có kết quả.
- [ ] `npx rg -n "count: 1000" src/` không có kết quả.
- [ ] `git diff --stat` chỉ liệt kê các file trong bảng "Sơ đồ file". Bất kỳ file nào trong danh sách "Ngoài phạm vi" xuất hiện ở đây là lỗi, phải hoàn tác.
- [ ] `git diff --stat` cho thấy `src/ui/pipeline-service.ts` có số dòng đổi nhỏ và khu trú — nếu nó báo gần như toàn file thì line ending đã bị chuyển sang LF, phải hoàn tác và sửa lại với CRLF.
- [ ] **Không commit.** Bàn giao working tree cho người dùng.

## Việc chưa làm, cố ý

Ghi lại để không ai tưởng là bỏ sót:

- **`createProfile` vẫn khớp trường tài liệu bằng `includes`** — `PrivOSLifecycleService.ts:92-96`. Phát hiện trong lúc chạy Task 7, **ngoài phạm vi sáu mục của plan này nên cố ý không sửa**. Đây là cùng một loại lỗi mà Task 7 đóng, còn sống trong chính file đó:

  ```ts
  const fileFieldDef = (list.fieldDefinitions || []).find((fd: any) =>
    fd.type === 'DOCUMENT' ||
    (fd.name || '').toLowerCase().includes('hồ sơ') ||
    (fd.name || '').toLowerCase().includes('document')
  );
  ```

  `.find()` duyệt từng phần tử với **toàn bộ** vị từ OR theo thứ tự mảng, nên `fd.type === 'DOCUMENT'` **không** được ưu tiên. Một trường SELECT tên "Loại hồ sơ" đứng trước trường DOCUMENT thật sẽ thắng: file tải lên bị ghi thành giá trị của trường SELECT đó, còn trường đính kèm thật im lặng không nhận gì.

  Không ghi đè dữ liệu cũ (chỉ chạy ở đường tạo mới) và cần room đặt tên trùng mới kích hoạt, nên nhẹ hơn lỗi Task 7 đã đóng. Sửa đúng cách cần một phép tra hai lượt — quét hết `type === 'DOCUMENT'` trước, chỉ khi không có mới lùi về khớp tên — cộng test mà chỗ này hiện chưa có. Đó là một task riêng, không phải một miếng vá.

- **Nối `AbortController` ở ba call site UI** — bị chặn vì merge risk. `askAI` đã nhận `signal`, chỉ còn thiếu bên gọi. Làm sau khi `Hng2725` merge xong.
- **`TaskQueue` không giới hạn kích thước** — nguồn cấp duy nhất là thao tác người dùng, chưa có đường tự sinh.
- **`generateLocalId()` trả `local-${Date.now()}`**, va chạm trong cùng millisecond, tồn tại hai bản (`PrivOSLifecycleService.ts:185` và `lifecycleService.ts:88`).
- **`isScreeningList` coi mọi list không phải list nhân sự đều là list ứng viên**, nên mỗi lần load phân trang qua cả list lịch sử email và list cấu hình. Hệ quả bị chặn ở `isSystemConfigItem` và `isPassedCandidateItem` nên không sinh ứng viên rác, chỉ tốn round-trip.
- **Bundle 1,18 MB / 365 kB gzip** inline vào shell mỗi lần mở tab.
- **File quá lớn**: `pipeline-dashboard.tsx` 1698, `CVScoredTab.tsx` 1246, `pipeline-service.ts` 1133, `PayrollDashboard.tsx` 892.
- **`usePayrollAccessPolling` đã tắt polling** — thu hồi quyền owner giữa phiên chỉ lan tới UI nếu Hub có đẩy `HOST_CONTEXT_CHANGED` khi đổi role, điều tài liệu không khẳng định. Dù sao đây cũng chỉ là cổng UI; server không chặn.
