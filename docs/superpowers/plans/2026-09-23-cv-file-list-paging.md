# Đọc đủ danh sách file CV trong room — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PipelineService.fetchAvailableFiles` trả về toàn bộ file trong room thay vì chỉ 50 file đầu, để CV nằm ngoài 50 file đầu không còn bị coi là "đã bị xóa".

**Architecture:** Gọi `file-management.files.channel` lần lượt từng trang (`count: 100`, tăng `offset`), dừng theo trang ngắn hoặc `total`.
- Nếu không thể trả về danh sách đầy đủ thì báo lỗi, không trả danh sách thiếu. Các trường hợp đó: vượt 50 trang, phản hồi sai định dạng, Hub bỏ qua `offset`, `total` đổi liên tục qua 3 lần đọc.
- Nếu `total` đổi giữa chừng (có file được thêm hoặc xoá lúc đang đọc) thì đọc lại từ đầu, tối đa 3 lần.
- Các chỗ gọi hàm trong `pipeline-dashboard.tsx` giữ nguyên, trừ `loadFiles` được thêm dòng log lỗi cho người dùng thấy.

**Tech Stack:** React 18 + TypeScript strict, `@privos_ai/app-react` (`app.rest`), vitest (`environment: 'node'`).

**Spec:** Thiết kế mục 7 đã trình bày trong hội thoại ngày 2026-09-23. Không có file spec riêng. Nguồn tham chiếu API: `privos-dev-docs/file-management/file-management-api.md:260-278`. Endpoint `GET /file-management.files.channel/:channelId` nhận các tham số sau:
- `folderId`;
- `count` (mặc định 50, tối đa 100);
- `offset` (mặc định 0).

Endpoint trả về `{ success, files, count, offset, total }`.

## Global Constraints

- Chỉ sửa mục 7. **Không** đụng tới mục 8 (`package.json` / `package-lock.json`) và mục 3 (`bot-drafting-tab.tsx`).
- Không commit, không push. Git chỉ được dùng read-only (`status`, `diff`, `log`, `show`, `blame`, `rev-parse`).
- Lệnh hợp lệ duy nhất để chạy code là `npm start`. Vitest, typecheck và build chỉ là công cụ lúc phát triển. Kết quả của chúng không được báo là "pass" hay "hoàn thành".
- TypeScript strict. Không thêm `any` mới ngoài cách `restCall<any>` mà file đang dùng sẵn.
- Không dùng icon hay emoji trong code, comment hoặc chuỗi mới.
- Kích thước trang: `100`. Số trang tối đa: `50` (tức 5000 file). Số lần đọc lại khi `total` đổi: tối đa `3`. Timeout mỗi request: `15000` ms, như code hiện tại.
- Giữ nguyên bộ lọc ẩn file có `/skills/` trong tên và cách map sang `CVFile` (`_id`, `name`, `size ?? file_size`, `downloadUrl`).
- `tests/manifest.spec.ts` đang fail sẵn từ trước (lệch tên app), ngoài phạm vi.

## Review Focus

1. **Room có nhiều hơn 100 file và CV cần chọn nằm ở trang sau:** CV phải có trong danh sách. Test ở Task 1: "keeps a CV that sits beyond the first page".
2. **Có người upload hoặc xoá file đúng lúc đang đọc các trang** (`total` đổi): không được trả về danh sách bị lệch một file, vì như vậy CV đang chọn sẽ bị bỏ chọn kèm cảnh báo "đã bị xóa". Test ở Task 1: "restarts the read when total changes between pages".
3. **Hub bỏ qua `offset` và luôn trả trang đầu:** phải dừng và báo lỗi, không lặp 50 lần rồi trả danh sách trùng lặp. Test ở Task 1: "refuses a Hub that ignores offset".
4. **Trang cuối vừa đúng 100 file:** phải dừng theo `total`, không gọi thêm một trang rỗng vô ích. Test ở Task 1: "stops on total when the last page is exactly full".
5. **Đọc danh sách lỗi khi mở tab:** người dùng phải thấy lý do trong log của pipeline, không chỉ trong console. Việc đọc lỗi trong vòng đối chiếu mỗi 3 giây không được bỏ chọn CV nào. Test ở Task 2 (quét source).

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/ui/pipeline-service.ts` | Thêm hằng số phân trang, `readAllRoomFiles` (private), sửa `fetchAvailableFiles` |
| `src/ui/pipeline-dashboard.tsx` | `loadFiles` ghi lỗi vào log pipeline |
| `tests/fetch-available-files.spec.ts` (mới) | Test phân trang và các trường hợp báo lỗi |
| `tests/pipeline-file-list-errors.spec.ts` (mới) | Quét source: `loadFiles` báo lỗi ra log; đối chiếu 3 giây không nuốt lỗi trước khi bỏ chọn |

---

### Task 1: Phân trang trong `fetchAvailableFiles`

**Files:**
- Modify: `src/ui/pipeline-service.ts:233-248` (thay nguyên phương thức `fetchAvailableFiles`) và thêm hằng số ngay trên `export class PipelineService {` (dòng 217)
- Test: `tests/fetch-available-files.spec.ts`

**Interfaces:**
- Consumes: `restCall` từ `./privos-rest` (đã import ở dòng 2); `CVFile` (dòng 68).
- Produces:
  - `export const ROOM_FILES_PAGE_SIZE = 100`
  - `export const ROOM_FILES_MAX_PAGES = 50`
  - `export const ROOM_FILES_MAX_ATTEMPTS = 3`
  - `PipelineService.fetchAvailableFiles(): Promise<CVFile[]>`: chữ ký không đổi. Nay có thể throw `Error` hoặc `PrivosRestError` thay vì âm thầm trả mảng thiếu hoặc mảng rỗng.

- [ ] **Step 1: Viết test (sẽ fail)**

Tạo `tests/fetch-available-files.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PipelineService,
  ROOM_FILES_MAX_PAGES,
  ROOM_FILES_PAGE_SIZE,
} from '../src/ui/pipeline-service';

type RestRequest = { method: string; path: string; query?: Record<string, unknown> };
type RestResponse = { statusCode?: number; body: unknown };

/**
 * `fetchAvailableFiles` only touches `app.rest` on `file-management.files.channel/room-1`.
 * `respond` gets the requested offset and the 0-based call index, so a test can model a Hub
 * whose answer changes between calls.
 */
function roomFilesApp(respond: (offset: number, callIndex: number) => RestResponse) {
  const calls: RestRequest[] = [];
  const app = {
    async rest(req: RestRequest) {
      calls.push(req);
      if (req.path !== 'file-management.files.channel/room-1') {
        throw new Error(`unexpected rest path: ${req.path}`);
      }
      const { statusCode = 200, body } = respond(Number(req.query?.offset ?? 0), calls.length - 1);
      return { statusCode, body };
    },
  };
  return { app, calls };
}

/** `count` distinct files numbered from `from`: `{ _id: 'f-150', name: 'f-150.pdf' }`. */
function files(from: number, count: number, prefix = 'f') {
  return Array.from({ length: count }, (_, i) => ({
    _id: `${prefix}-${from + i}`,
    name: `${prefix}-${from + i}.pdf`,
  }));
}

/** A consistent Hub: `total` files, served page by page at whatever offset is asked. */
function consistentRoom(total: number) {
  return (offset: number): RestResponse => ({
    body: {
      success: true,
      files: files(offset, Math.max(0, Math.min(ROOM_FILES_PAGE_SIZE, total - offset))),
      total,
    },
  });
}

const service = (app: unknown) => new PipelineService(app as never, 'room-1', {} as never);

describe('PipelineService.fetchAvailableFiles', () => {
  it('reads every page with count 100 and increasing offsets', async () => {
    const { app, calls } = roomFilesApp(consistentRoom(230));
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(230);
    expect(calls.map((call) => call.query)).toEqual([
      { count: 100, offset: 0 },
      { count: 100, offset: 100 },
      { count: 100, offset: 200 },
    ]);
  });

  it('keeps a CV that sits beyond the first page', async () => {
    const { app } = roomFilesApp(consistentRoom(230));
    const result = await service(app).fetchAvailableFiles();
    expect(result.some((file) => file._id === 'f-150')).toBe(true);
  });

  it('stops on total when the last page is exactly full', async () => {
    const { app, calls } = roomFilesApp(consistentRoom(200));
    await expect(service(app).fetchAvailableFiles()).resolves.toHaveLength(200);
    expect(calls).toHaveLength(2);
  });

  it('stops on a short page when the Hub sends no total', async () => {
    const { app, calls } = roomFilesApp((offset) => ({
      body: offset === 0 ? files(0, 100) : files(100, 7),
    }));
    await expect(service(app).fetchAvailableFiles()).resolves.toHaveLength(107);
    expect(calls).toHaveLength(2);
  });

  it('keeps the existing mapping and hides skill files on every page', async () => {
    const { app } = roomFilesApp((offset) => ({
      body: {
        success: true,
        total: 101,
        files: offset === 0
          ? [...files(0, 99), { _id: 'skill', name: 'hr-miniapp/skills/cv-evaluator-skill.md' }]
          : [{ _id: 'cv-x', name: 'cv-x.pdf', file_size: 42, downloadUrl: 'https://hub/cv-x' }],
      },
    }));
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(100);
    expect(result.some((file) => file._id === 'skill')).toBe(false);
    expect(result.find((file) => file._id === 'cv-x')).toEqual({
      _id: 'cv-x',
      name: 'cv-x.pdf',
      size: 42,
      downloadUrl: 'https://hub/cv-x',
    });
  });

  it('restarts the read when total changes between pages', async () => {
    // First read: page 0 says 201 files, then a file is deleted and page 1 says 200.
    const { app, calls } = roomFilesApp((offset, callIndex) => {
      if (callIndex === 0) return { body: { success: true, files: files(0, 100), total: 201 } };
      return consistentRoom(200)(offset);
    });
    const result = await service(app).fetchAvailableFiles();

    expect(result).toHaveLength(200);
    expect(calls.map((call) => call.query?.offset)).toEqual([0, 100, 0, 100]);
  });

  it('gives up when total keeps changing on every attempt', async () => {
    const { app } = roomFilesApp((offset, callIndex) => ({
      body: { success: true, files: files(offset, 100), total: 1000 + callIndex },
    }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/thay đổi liên tục/);
  });

  it('refuses a Hub that ignores offset', async () => {
    const { app } = roomFilesApp(() => ({ body: { success: true, files: files(0, 100), total: 500 } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/bỏ qua offset/);
  });

  it('refuses to return a truncated list past the page budget', async () => {
    const { app, calls } = roomFilesApp((offset) => ({
      body: { success: true, files: files(offset, 100), total: 999999 },
    }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/hơn 5000 file/);
    expect(calls).toHaveLength(ROOM_FILES_MAX_PAGES);
  });

  it('refuses a response without a file list instead of reporting an empty room', async () => {
    const { app } = roomFilesApp(() => ({ body: { success: true } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow(/không có danh sách file/);
  });

  it('propagates a Hub failure', async () => {
    const { app } = roomFilesApp(() => ({ statusCode: 500, body: { success: false, error: 'boom' } }));
    await expect(service(app).fetchAvailableFiles()).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/fetch-available-files.spec.ts`
Expected: FAIL. Import `ROOM_FILES_PAGE_SIZE` / `ROOM_FILES_MAX_PAGES` không tồn tại, và hàm hiện tại chỉ gọi một lần với `count: 50`.

- [ ] **Step 3: Thêm hằng số**

Trong `src/ui/pipeline-service.ts`, chèn ngay trên dòng `export class PipelineService {`:

```ts
/** `file-management.files.channel` caps `count` at 100 (privos-dev-docs file-management-api.md). */
export const ROOM_FILES_PAGE_SIZE = 100;
/** 50 × 100 = 5000 files: a hard stop so a Hub that never returns a short page cannot loop forever. */
export const ROOM_FILES_MAX_PAGES = 50;
/** Full re-reads allowed when `total` changes mid-read (a file uploaded or deleted meanwhile). */
export const ROOM_FILES_MAX_ATTEMPTS = 3;

/** One entry of `file-management.files.channel` — only the fields this service maps. */
type RoomFileRow = {
  _id?: string;
  name?: string;
  size?: number;
  file_size?: number;
  downloadUrl?: string;
};
```

- [ ] **Step 4: Thay phương thức `fetchAvailableFiles`**

Thay nguyên khối từ `async fetchAvailableFiles(): Promise<CVFile[]> {` đến dấu `}` đóng của nó (dòng 233-248 hiện tại) bằng:

```ts
  /**
   * Every file of the room, read page by page. A partial list is never returned: the CV Pipeline
   * treats a selected CV missing from this list as deleted, so a truncated read used to unselect
   * real CVs and skip them as `cv-deleted`. Any read that cannot be proven complete throws instead,
   * and the callers keep their current state.
   */
  async fetchAvailableFiles(): Promise<CVFile[]> {
    for (let attempt = 0; attempt < ROOM_FILES_MAX_ATTEMPTS; attempt += 1) {
      const rows = await this.readAllRoomFiles();
      if (rows === null) continue; // `total` changed mid-read: an offset shift may have skipped a file.

      // Hide guideline files completely from the UI
      return rows
        .filter((f) => !(f.name || '').includes('/skills/'))
        .map((f) => ({
          _id: f._id as string,
          name: f.name as string,
          size: f.size ?? f.file_size,
          downloadUrl: f.downloadUrl,
        }));
    }
    throw new Error('Danh sách file trong room thay đổi liên tục khi đang đọc. Vui lòng thử lại sau.');
  }

  /**
   * One complete pass over `file-management.files.channel`, or `null` when `total` changed between
   * pages. Stops on a short page, or once `offset + page length` reaches `total`.
   */
  private async readAllRoomFiles(): Promise<RoomFileRow[] | null> {
    const collected: RoomFileRow[] = [];
    const seenIds = new Set<string>();
    let firstTotal: number | undefined;

    for (let page = 0; page < ROOM_FILES_MAX_PAGES; page += 1) {
      const offset = page * ROOM_FILES_PAGE_SIZE;
      const body = await restCall<any>(this.app, 'GET', `file-management.files.channel/${this.roomId}`, {
        query: { count: ROOM_FILES_PAGE_SIZE, offset },
        timeoutMs: 15000,
      });

      const pageFiles: unknown = body?.files ?? body?.data ?? (Array.isArray(body) ? body : undefined);
      if (!Array.isArray(pageFiles)) {
        throw new Error('Không đọc được danh sách file trong room: phản hồi không có danh sách file.');
      }

      const total = typeof body?.total === 'number' ? body.total : undefined;
      if (page === 0) firstTotal = total;
      else if (total !== firstTotal) return null;

      let added = 0;
      for (const file of pageFiles as RoomFileRow[]) {
        const id = typeof file?._id === 'string' ? file._id : '';
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        collected.push(file);
        added += 1;
      }
      // A non-empty page with nothing new means the Hub served the same rows again (offset ignored).
      if (pageFiles.length > 0 && added === 0) {
        throw new Error('Hub bỏ qua offset khi phân trang danh sách file. Dừng để không lặp vô hạn.');
      }

      const isLastPage =
        pageFiles.length < ROOM_FILES_PAGE_SIZE || (total !== undefined && offset + pageFiles.length >= total);
      if (isLastPage) return collected;
    }

    throw new Error(
      `Room có hơn ${ROOM_FILES_MAX_PAGES * ROOM_FILES_PAGE_SIZE} file. Dừng để không trả về danh sách CV thiếu.`,
    );
  }
```

Ghi chú cho người thực hiện:
- `_id: f._id as string` và `name: f.name as string` giữ nguyên hành vi cũ. Code cũ map thẳng `f._id` / `f.name` từ `any`, nay kiểu là `RoomFileRow` với trường tuỳ chọn, nên cần cast để khớp `CVFile`.
- Trong test "restarts the read…", lần đọc thứ hai trả `total: 200` ở cả hai trang nên không đọc lại thêm. Offset được gọi theo thứ tự `[0, 100, 0, 100]`.

- [ ] **Step 5: Chạy test**

Run: `npx vitest run tests/fetch-available-files.spec.ts tests/pipeline-ai-polling.spec.ts tests/pipeline-kanban-stage-move.spec.ts tests/skill-templates.spec.ts`
Expected: tất cả xanh. Ba file sau là test cũ cũng import `PipelineService`, chạy kèm để chắc không vỡ. Đây chỉ là tín hiệu lúc phát triển.

- [ ] **Step 6: Kiểm tra kiểu**

Run: `npm run typecheck:strict-unused`
Expected: không có lỗi mới trong `src/ui/pipeline-service.ts`.

- [ ] **Step 7: Không commit.**

---

### Task 2: Hiện lỗi đọc danh sách CV cho người dùng

**Files:**
- Modify: `src/ui/pipeline-dashboard.tsx:651-656` (`loadFiles`)
- Test: `tests/pipeline-file-list-errors.spec.ts`

**Interfaces:**
- Consumes: `fetchAvailableFiles()` từ Task 1 (có thể throw); `addLog(msg: string)` đã có ở `pipeline-dashboard.tsx:634`.
- Produces: không có interface mới.

Bối cảnh các chỗ gọi hiện có, không sửa:
- `reconcileSelectedFiles` (dòng 659-680) gọi `fetchAvailableFiles()` trước mọi `setFiles` / `setSelectedIds`. Nếu hàm throw, `usePolling` bắt lỗi (`src/ui/hooks/usePolling.ts:102-103`) và không có lựa chọn CV nào bị bỏ. Đó là hành vi đúng.
- `checkScoringFiles` trong `startPipeline` có `catch` trả `'available'`.
- Luồng upload (dòng 763) nằm trong `try` của handler upload.

- [ ] **Step 1: Viết test (sẽ fail)**

Tạo `tests/pipeline-file-list-errors.spec.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = fs.readFileSync('src/ui/pipeline-dashboard.tsx', 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = dashboard.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = dashboard.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return dashboard.slice(start, end);
}

describe('CV Pipeline surfaces a failed file-list read', () => {
  it('loadFiles writes the failure into the pipeline log, not only the console', () => {
    const loadFiles = block('const loadFiles = async () => {', 'const reconcileSelectedFiles');
    const catchBlock = loadFiles.slice(loadFiles.indexOf('catch'));
    expect(catchBlock).toContain('addLog(');
    expect(catchBlock).toContain('Không tải được danh sách CV');
  });

  it('the 3 s reconcile reads the list before touching the selection, with no local catch', () => {
    const reconcile = block('const reconcileSelectedFiles', 'usePolling(reconcileSelectedFiles');
    const read = reconcile.indexOf('fetchAvailableFiles()');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(reconcile.indexOf('setSelectedIds('));
    // A local catch returning an empty list would unselect every CV on a failed read.
    expect(reconcile).not.toMatch(/catch\s*\(/);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/pipeline-file-list-errors.spec.ts`
Expected: test đầu FAIL vì `catch` của `loadFiles` chưa gọi `addLog(`. Test thứ hai đã xanh; test này giữ để chặn hồi quy.

- [ ] **Step 3: Sửa `loadFiles`**

Trong `src/ui/pipeline-dashboard.tsx`, thay:

```tsx
    try { setFiles(await serviceRef.current.fetchAvailableFiles()); }
    catch (err) { console.error(err); }
```

bằng:

```tsx
    try { setFiles(await serviceRef.current.fetchAvailableFiles()); }
    catch (err) {
      console.error(err);
      // The list is kept as it was: an incomplete read must never replace it with a partial one.
      addLog(`[LỖI] Không tải được danh sách CV: ${err instanceof Error ? err.message : String(err)}`);
    }
```

- [ ] **Step 4: Chạy test và kiểm tra kiểu**

Run: `npx vitest run tests/pipeline-file-list-errors.spec.ts` rồi `npm run typecheck:strict-unused`
Expected: test xanh, không có lỗi kiểu mới. Chỉ là tín hiệu lúc phát triển.

- [ ] **Step 5: Không commit.**

---

### Task 3: Kiểm tra trên môi trường thật (kiểm tra hợp lệ duy nhất)

**Files:** không sửa file nào.

- [ ] **Step 1: Chạy toàn bộ công cụ phát triển (chỉ để tham khảo)**

Run: `npx vitest run` và `npm run typecheck:strict-unused`
Expected: chỉ còn `tests/manifest.spec.ts` fail (đã fail từ trước). Không báo kết quả này là "pass".

- [ ] **Step 2: Người dùng chạy `npm start` và mở tab CV Pipeline trong room HR có hơn 100 file**

Nếu room chưa đủ file, upload thêm file bất kỳ cho vượt 100. Đếm cả file skill, JD và file kết quả.

- [ ] **Step 3: Kiểm tra**

1. DevTools > Network: có nhiều request `file-management.files.channel/<roomId>` với `count=100` và `offset=0`, `100`, `200`, ...
2. Một CV được upload sớm, nằm ngoài 100 file đầu theo thứ tự Hub trả về, vẫn hiện trong danh sách CV.
3. Chọn CV đó và để yên 30 giây: không có cảnh báo "CV đã chọn không còn trong Room Files", CV vẫn được chọn.
4. Chạy chấm CV đó: không bị bỏ qua với lý do "đã bị xóa khỏi Room Files".
5. Upload một CV có tên trùng tên một CV cũ ở trang sau: file mới được đổi tên thành `...(1).pdf`, không báo lỗi trùng.
6. Xoá một CV đang chọn trong Room Files: trong vòng khoảng 3 giây CV bị bỏ chọn kèm cảnh báo. Hành vi đúng này vẫn phải còn.

- [ ] **Step 4: Không commit.**
