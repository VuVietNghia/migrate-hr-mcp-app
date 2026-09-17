# Kanban CV Pipeline - dong bo trang thai khi Hub tu choi chuyen stage - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi Hub từ chối `mcpapp.lists.moveItemToStage`, tab CV Pipeline phải biết là thất bại: kéo-thả thì hoàn tác thẻ ngay, gửi mail mời thì không đặt thẻ vào cột "Chưa phỏng vấn" và báo đúng là mail đã gửi nhưng chưa chuyển cột.

**Architecture:** `app.callServerTool` chỉ reject khi lỗi đường truyền; Hub từ chối thì vẫn resolve với `{ isError: true, content: [...] }`. Chỉ `parseToolResult` của `@privos_ai/app-react` biến trường hợp đó thành lỗi ném ra. Plan tách lời gọi chuyển stage ra module thuần `cv-stage-move.ts` (có test), và tách phần quyết định kết quả sau khi gửi mail mời ra `invite-sent-outcome.ts` (có test). `CVScoredTab.tsx` chỉ còn gọi hai module này.

**Tech Stack:** React 18, TypeScript strict, Vitest, `@privos_ai/app-react`.

**Spec:** Không có file spec riêng (task bounded). Thiết kế đã duyệt nằm ở mục "Thiết kế" ngay dưới; mục đó là căn cứ ràng buộc.

## Global Constraints

- **Không commit, không chạy bất kỳ lệnh git ghi nào.** Thay mọi bước "Commit" bằng bước chạy lại toàn bộ test. Việc commit là của người dùng. Lệnh git chỉ đọc được phép: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`.
- **Chỉ ghi file bằng công cụ Write/Edit**, không dùng heredoc hay chuyển hướng shell (tiếng Việt sẽ hỏng mã).
- **Không dùng icon, emoji** trong code, comment, chuỗi hiển thị mới.
- **TypeScript strict.** Không thêm `any` mới.
- **Chỉ sửa đúng các file liệt kê trong từng task.** Không sửa `src/ui/cv-scored/kanban-stages.ts`, `src/ui/cv-scored/polling-sync.ts`, `src/ui/cv-scored/cv-list-reader.ts`, `src/ui/privos-rest.ts`, `src/ui/list-item-paging.ts`.
- **Giữ nguyên nguyên văn hai thông báo cũ** khi chuyển stage không lỗi: `Đã gửi email mời phỏng vấn thành công tới ${targetEmail}!` và `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.`
- **Baseline test trước khi bắt đầu: 349 test, 348 pass, 1 fail.** Test fail sẵn có là `tests/manifest.spec.ts > manifest > serves the canonical Marketplace manifest`. Không sửa nó, không tính nó là hỏng do mình. `tests/packaging.spec.ts` đôi khi fail do môi trường shell của subagent; nếu gặp, chạy riêng file đó để xác nhận trước khi báo cáo.
- **Lệnh chạy test:** `npx vitest run <đường dẫn file test>` cho một file, `npm test` cho toàn bộ. **Typecheck:** `npm run typecheck`.
- Thư mục làm việc cho mọi lệnh: `E:/Hoc-tap/WebStormProject/migrate-hr-miniapp-by-hung/migrate-hr-mcp-app`.

---

## Thiết kế

### Hiện trạng (đã đọc code, đã kiểm)

1. `CVScoredTab.tsx` `handleMove` (kéo-thả, khoảng dòng 807-850): cập nhật lạc quan cột mới, gọi `app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', ... })` trong `try`, `catch` hoàn tác về `previousStatus`, `finally` gọi `endMove` và `pollStageMoves(true)`.
   - Hub từ chối -> không ném -> `catch` không chạy -> không hoàn tác, không log.
   - Vòng poll ép buộc ở `finally` đọc lại trạng thái thật qua `fetchAllListItems` (đã dùng `parseToolResult`) nên thẻ thường tự nhảy về sau một vòng đọc. Hậu quả: thẻ nhảy sai rồi nhảy lại, không có log hay dấu vết nào. Nếu chính lần đọc lại cũng lỗi (bị `catch` của `pollStageMoves` nuốt, giữ nguyên state) thì thẻ nằm sai cột cho tới lần poll thành công kế tiếp.
2. `CVScoredTab.tsx` `handleSendInviteEmail` (khoảng dòng 411-480): gửi mail -> `restCall('items.update')` đánh dấu đã gửi -> `callServerTool(moveItemToStage)` sang stage `07_Chua_Phong_Van` -> đặt state `status: '07_Chua_Phong_Van'` -> `alert` thành công -> đóng modal.
   - Hub từ chối chuyển stage -> không ném -> state vẫn đặt cột "Chưa phỏng vấn", báo thành công. Không có vòng poll ép buộc nào sau đó, và `pollStageMoves` chỉ ghi đè khi trạng thái đọc được khác state, nên thẻ nằm sai cột tới lần poll kế tiếp đọc được dữ liệu; nếu poll không chạy (tab không active) thì nằm sai tới khi tải lại tab.
3. Dạng phản hồi thành công của tool (`tools_lists.md`): `{ "moved": true }`.
4. `parseToolResult(result: unknown): Record<string, unknown>`: `isError` -> ném `Error(content[0].text || 'Tool call failed')`; ngược lại parse JSON `content[0].text`.

### Quyết định

- **Kéo-thả:** thay lời gọi trực tiếp bằng `moveCVToStage(app, id, stageId)`. Hub từ chối -> ném -> `catch` sẵn có hoàn tác và `console.error`. `finally` giữ nguyên.
- **Gửi mail mời - điều chỉnh so với thiết kế trình bày trong chat.** Thiết kế trong chat để lỗi chuyển stage rơi vào `catch` chung. Khi viết plan phát hiện cách đó sai: tới lúc chuyển stage thì email ĐÃ gửi và `items.update` ĐÃ đánh dấu đã gửi, nên `catch` sẽ báo "Lỗi gửi email", nút vẫn là "Gửi mail pv", người dùng gửi lại -> ứng viên nhận mail trùng. Plan chọn: chuyển stage thất bại là **thành công một phần** -> vẫn đánh dấu đã gửi (`sentInviteCVIds`, `customFields`, `inviteMailSent: true`), **không** đổi `status`, `console.error` chi tiết, và thông báo nói rõ mail đã gửi, chưa chuyển cột, kéo thẻ thủ công, không cần gửi lại.
- Không có stage `07_Chua_Phong_Van` trong list (list kiểu cũ) -> hành vi như hiện tại: không gọi Hub, không đổi `status`, thông báo cũ.

### Ngoài phạm vi (đã thấy, cố ý không làm)

- `items.update` lỗi sau khi mail đã gửi vẫn rơi vào `catch` và báo "Lỗi gửi email" -> nguy cơ gửi trùng. Cùng dạng lỗi nhưng khác lời gọi (REST, không phải tool); để task riêng.
- Poll đang chạy dở lúc gửi mail mời có thể ghi đè `status` vừa đặt, vì `handleSendInviteEmail` không đi qua `CVBoardPollingGuard.beginMove`. Vòng poll sau tự sửa.
- `interview-email-template-repository.ts` `delete`/`listFiles` cũng không kiểm `isError` (mục 2 của báo cáo quét).

---

## File Structure

- Create `src/ui/cv-scored/cv-stage-move.ts` - một lời gọi Hub chuyển CV sang stage, ném lỗi khi Hub từ chối.
- Create `tests/cv-stage-move.spec.ts`.
- Create `src/ui/cv-scored/invite-sent-outcome.ts` - chuyển stage sau khi gửi mail mời (không ném, trả kết quả), dựng thông báo, áp kết quả vào state board.
- Create `tests/invite-sent-outcome.spec.ts`.
- Modify `src/ui/cv-scored/CVScoredTab.tsx` - `handleMove` (Task 1), `handleSendInviteEmail` (Task 2), import.

---

### Task 1: `moveCVToStage` và kéo-thả

**Files:**
- Create: `src/ui/cv-scored/cv-stage-move.ts`
- Create: `tests/cv-stage-move.spec.ts`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx` (import ở đầu file; lời gọi trong `handleMove`, khoảng dòng 831-835)

**Interfaces:**
- Consumes: `parseToolResult` từ `@privos_ai/app-react`.
- Produces:
  - `export interface CVStageMoveApp { callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>; }`
  - `export async function moveCVToStage(app: CVStageMoveApp, itemId: string, stageId: string): Promise<void>` - resolve khi Hub chuyển xong; reject với `Error` mang thông điệp của Hub khi `isError`; reject nguyên lỗi khi đường truyền lỗi.

- [ ] **Step 1: Viết test fail**

Tạo `tests/cv-stage-move.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { moveCVToStage } from '../src/ui/cv-scored/cv-stage-move';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * `callServerTool` chỉ reject khi lỗi đường truyền; Hub từ chối thì vẫn resolve với
 * `{ isError: true, ... }`. Stub trả nguyên object `respond` đưa ra để tái tạo cả hai dạng.
 */
function createAppStub(respond: (call: ToolCall) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      return respond(call);
    },
  };
  return { app, calls };
}

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

describe('moveCVToStage', () => {
  it('goi mcpapp.lists.moveItemToStage voi itemId va stageId, resolve khi Hub chuyen xong', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).resolves.toBeUndefined();
    expect(calls).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'cv-1', stageId: 'stage-7' } },
    ]);
  });

  it('reject voi thong diep cua Hub khi Hub tu choi (isError) thay vi coi la thanh cong', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: 'You do not have permission to edit this item' }],
    }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow(
      'You do not have permission to edit this item',
    );
  });

  it('reject khi isError du text loi la JSON hop le', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: '{}' }],
    }));

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow();
  });

  it('de nguyen loi duong truyen', async () => {
    const app = {
      async callServerTool(): Promise<unknown> {
        throw new Error('network down');
      },
    };

    await expect(moveCVToStage(app, 'cv-1', 'stage-7')).rejects.toThrow('network down');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/cv-stage-move.spec.ts`
Expected: FAIL, lỗi không tìm thấy module `../src/ui/cv-scored/cv-stage-move`.

- [ ] **Step 3: Viết code tối thiểu**

Tạo `src/ui/cv-scored/cv-stage-move.ts`:

```ts
import { parseToolResult } from '@privos_ai/app-react';

export interface CVStageMoveApp {
  callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
}

// `callServerTool` chỉ reject khi lỗi đường truyền; Hub từ chối thì vẫn resolve với
// `isError: true`. `parseToolResult` biến trường hợp đó thành lỗi ném ra.
export async function moveCVToStage(app: CVStageMoveApp, itemId: string, stageId: string): Promise<void> {
  parseToolResult(await app.callServerTool({
    name: 'mcpapp.lists.moveItemToStage',
    arguments: { itemId, stageId },
  }));
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/cv-stage-move.spec.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Nối vào `handleMove`**

Trong `src/ui/cv-scored/CVScoredTab.tsx`, thêm import ngay dưới dòng `import { CVBoardPollingGuard } from './polling-sync';`:

```ts
import { moveCVToStage } from './cv-stage-move';
```

Trong `handleMove`, thay đoạn:

```tsx
    try {
      await app.callServerTool({
        name: 'mcpapp.lists.moveItemToStage',
        arguments: { itemId: id, stageId }
      });
    } catch (err) {
```

bằng:

```tsx
    try {
      await moveCVToStage(app, id, stageId);
    } catch (err) {
```

Không đổi gì khác trong `handleMove` (khối `catch` hoàn tác và khối `finally` giữ nguyên).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 7: Chạy toàn bộ test (thay bước commit)**

Run: `npm test`
Expected: 353 test, 352 pass, 1 fail (chỉ `tests/manifest.spec.ts`).

---

### Task 2: Kết quả sau khi gửi mail mời

**Files:**
- Create: `src/ui/cv-scored/invite-sent-outcome.ts`
- Create: `tests/invite-sent-outcome.spec.ts`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx` (import ở đầu file; `handleSendInviteEmail`, khoảng dòng 451-473)

**Interfaces:**
- Consumes (từ Task 1): `CVStageMoveApp`, `moveCVToStage(app, itemId, stageId): Promise<void>` từ `./cv-stage-move`.
- Consumes (có sẵn): `export interface CVBoardData { listId: string; listName: string; stagesMap: Record<string, string>; cvs: CVProfile[] }` trong `src/ui/cv-scored/CVScoredTab.tsx` (import kiểu bằng `import type`).
- Produces:
  - `export type InviteStageMoveResult = { status: 'moved'; stageId: string } | { status: 'no-stage' } | { status: 'failed'; detail: string };`
  - `export async function moveInvitedCVToPendingStage(app: CVStageMoveApp, itemId: string, stageId: string | undefined): Promise<InviteStageMoveResult>` - không bao giờ reject.
  - `export function buildInviteSentMessage(input: { targetEmail: string; logged: boolean; stageMove: InviteStageMoveResult }): string`
  - `export function applyInviteSentToBoards(boards: CVBoardData[], cvId: string, customFields: unknown, stageMove: InviteStageMoveResult): CVBoardData[]`

- [ ] **Step 1: Viết test fail**

Tạo `tests/invite-sent-outcome.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyInviteSentToBoards,
  buildInviteSentMessage,
  moveInvitedCVToPendingStage,
} from '../src/ui/cv-scored/invite-sent-outcome';
import type { CVBoardData } from '../src/ui/cv-scored/CVScoredTab';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function createAppStub(respond: (call: ToolCall) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      return respond(call);
    },
  };
  return { app, calls };
}

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function boardsFixture(): CVBoardData[] {
  return [
    {
      listId: 'list-1',
      listName: 'Backend Dev',
      stagesMap: { 'stage-5': '05_Moi_Phong_Van', 'stage-7': '07_Chua_Phong_Van' },
      cvs: [
        { _id: 'cv-1', name: 'Nguyen Van A', status: '05_Moi_Phong_Van' },
        { _id: 'cv-2', name: 'Tran Thi B', status: '05_Moi_Phong_Van' },
      ],
    },
  ];
}

describe('moveInvitedCVToPendingStage', () => {
  it('khong goi Hub khi list khong co stage Chua phong van', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', undefined)).resolves.toEqual({ status: 'no-stage' });
    expect(calls).toEqual([]);
  });

  it('tra moved khi Hub chuyen xong', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'moved',
      stageId: 'stage-7',
    });
    expect(calls).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'cv-1', stageId: 'stage-7' } },
    ]);
  });

  it('tra failed kem thong diep Hub khi Hub tu choi, khong reject', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: 'Stage not found' }],
    }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'failed',
      detail: 'Stage not found',
    });
  });

  it('tra failed khi loi duong truyen, khong reject', async () => {
    const app = {
      async callServerTool(): Promise<unknown> {
        throw new Error('network down');
      },
    };

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'failed',
      detail: 'network down',
    });
  });
});

describe('buildInviteSentMessage', () => {
  it('giu nguyen thong bao thanh cong cu khi da luu lich su va da chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: true,
      stageMove: { status: 'moved', stageId: 'stage-7' },
    })).toBe('Đã gửi email mời phỏng vấn thành công tới a@x.com!');
  });

  it('giu nguyen thong bao cu khi chua luu lich su nhung khong loi chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: false,
      stageMove: { status: 'no-stage' },
    })).toBe('Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.');
  });

  it('bao da gui mail nhung chua chuyen cot khi chuyen stage that bai', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: true,
      stageMove: { status: 'failed', detail: 'Stage not found' },
    })).toBe(
      'Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa chuyển được CV sang cột "Chưa phỏng vấn" (Stage not found), hãy kéo thẻ thủ công. Không cần gửi lại email.',
    );
  });

  it('gop ca hai luu y khi vua chua luu lich su vua chua chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: false,
      stageMove: { status: 'failed', detail: 'Stage not found' },
    })).toBe(
      'Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa lưu được vào lịch sử email và chưa chuyển được CV sang cột "Chưa phỏng vấn" (Stage not found), hãy kéo thẻ thủ công. Không cần gửi lại email.',
    );
  });
});

describe('applyInviteSentToBoards', () => {
  it('dat cot Chua phong van va danh dau da gui khi chuyen stage thanh cong', () => {
    const boards = boardsFixture();
    const next = applyInviteSentToBoards(boards, 'cv-1', [{ _id: 'f', value: true }], {
      status: 'moved',
      stageId: 'stage-7',
    });

    expect(next[0].cvs[0]).toEqual({
      _id: 'cv-1',
      name: 'Nguyen Van A',
      status: '07_Chua_Phong_Van',
      customFields: [{ _id: 'f', value: true }],
      inviteMailSent: true,
    });
    expect(next[0].cvs[1]).toBe(boards[0].cvs[1]);
  });

  it('giu nguyen cot nhung van danh dau da gui khi chuyen stage that bai', () => {
    const next = applyInviteSentToBoards(boardsFixture(), 'cv-1', [], {
      status: 'failed',
      detail: 'Stage not found',
    });

    expect(next[0].cvs[0].status).toBe('05_Moi_Phong_Van');
    expect(next[0].cvs[0].inviteMailSent).toBe(true);
  });

  it('giu nguyen cot khi list khong co stage Chua phong van', () => {
    const next = applyInviteSentToBoards(boardsFixture(), 'cv-1', [], { status: 'no-stage' });

    expect(next[0].cvs[0].status).toBe('05_Moi_Phong_Van');
    expect(next[0].cvs[0].inviteMailSent).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/invite-sent-outcome.spec.ts`
Expected: FAIL, lỗi không tìm thấy module `../src/ui/cv-scored/invite-sent-outcome`.

- [ ] **Step 3: Viết code tối thiểu**

Tạo `src/ui/cv-scored/invite-sent-outcome.ts`:

```ts
import { moveCVToStage, type CVStageMoveApp } from './cv-stage-move';
import type { CVBoardData } from './CVScoredTab';

const INTERVIEW_PENDING_STATUS = '07_Chua_Phong_Van';
const INTERVIEW_PENDING_LABEL = 'Chưa phỏng vấn';

export type InviteStageMoveResult =
  | { status: 'moved'; stageId: string }
  | { status: 'no-stage' }
  | { status: 'failed'; detail: string };

// Không reject: tới bước này email đã gửi, nên lỗi chuyển cột là thành công một phần,
// không được rơi vào nhánh "Lỗi gửi email" khiến người dùng gửi lại.
export async function moveInvitedCVToPendingStage(
  app: CVStageMoveApp,
  itemId: string,
  stageId: string | undefined,
): Promise<InviteStageMoveResult> {
  if (!stageId) return { status: 'no-stage' };
  try {
    await moveCVToStage(app, itemId, stageId);
    return { status: 'moved', stageId };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

export function buildInviteSentMessage(input: {
  targetEmail: string;
  logged: boolean;
  stageMove: InviteStageMoveResult;
}): string {
  const { targetEmail, logged, stageMove } = input;

  if (stageMove.status !== 'failed') {
    return logged
      ? `Đã gửi email mời phỏng vấn thành công tới ${targetEmail}!`
      : `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.`;
  }

  const stageNote = `chưa chuyển được CV sang cột "${INTERVIEW_PENDING_LABEL}" (${stageMove.detail}), hãy kéo thẻ thủ công`;
  const notes = logged ? stageNote : `chưa lưu được vào lịch sử email và ${stageNote}`;
  return `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: ${notes}. Không cần gửi lại email.`;
}

export function applyInviteSentToBoards(
  boards: CVBoardData[],
  cvId: string,
  customFields: unknown,
  stageMove: InviteStageMoveResult,
): CVBoardData[] {
  return boards.map((board) => ({
    ...board,
    cvs: board.cvs.map((cv) => cv._id === cvId
      ? {
          ...cv,
          customFields,
          inviteMailSent: true,
          ...(stageMove.status === 'moved' ? { status: INTERVIEW_PENDING_STATUS } : {}),
        }
      : cv),
  }));
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/invite-sent-outcome.spec.ts`
Expected: PASS, 11 test.

- [ ] **Step 5: Nối vào `handleSendInviteEmail`**

Trong `src/ui/cv-scored/CVScoredTab.tsx`, thêm import ngay dưới dòng `import { moveCVToStage } from './cv-stage-move';` (thêm ở Task 1):

```ts
import { applyInviteSentToBoards, buildInviteSentMessage, moveInvitedCVToPendingStage } from './invite-sent-outcome';
```

Trong `handleSendInviteEmail`, thay đoạn:

```tsx
      const interviewPendingStageId = getInterviewPendingStageId(selectedBoard.stagesMap);
      if (interviewPendingStageId) {
        await app.callServerTool({
          name: 'mcpapp.lists.moveItemToStage',
          arguments: { itemId: selectedCVForInvite._id, stageId: interviewPendingStageId },
        });
      }
      setSentInviteCVIds((previous) => new Set(previous).add(selectedCVForInvite._id));
      setBoards((previous) => previous.map((board) => ({
        ...board,
        cvs: board.cvs.map((cv) => cv._id === selectedCVForInvite._id
          ? {
              ...cv,
              customFields: updatedCustomFields,
              inviteMailSent: true,
              ...(interviewPendingStageId ? { status: '07_Chua_Phong_Van' } : {}),
            }
          : cv),
      })));
      alert(logged
        ? `Đã gửi email mời phỏng vấn thành công tới ${targetEmail}!`
        : `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.`);
      setInviteModalOpen(false);
```

bằng:

```tsx
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

`getInterviewPendingStageId` vẫn được dùng, giữ nguyên import của nó. Khối `catch`/`finally` của hàm giữ nguyên.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 7: Kiểm không còn lời gọi chuyển stage trực tiếp trong component**

Dùng Grep tìm `moveItemToStage` trong `src/ui/cv-scored/CVScoredTab.tsx`.
Expected: không còn kết quả nào.

- [ ] **Step 8: Chạy toàn bộ test (thay bước commit)**

Run: `npm test`
Expected: 364 test, 363 pass, 1 fail (chỉ `tests/manifest.spec.ts`).

---

## Kiểm thử thủ công trên Room thật (người dùng tự làm sau khi xong)

1. Kéo thẻ CV sang cột khác bình thường -> thẻ ở lại cột mới, tải lại tab vẫn đúng cột.
2. Gửi mail mời cho CV ở cột "Mời phỏng vấn" trên list có stage `07_Chua_Phong_Van` -> thông báo thành công như cũ, thẻ sang cột "Chưa phỏng vấn", nút thành "Đã gửi mail".
3. Tái hiện Hub từ chối: dùng tài khoản không có quyền sửa item (list isolated, người dùng không nằm trong `additionalEditors`), hoặc xoá stage `07_Chua_Phong_Van` khỏi list trong lúc tab đang mở rồi gửi mail mời.
   - Kéo-thả: thẻ về cột cũ ngay, Console có lỗi từ `handleMove`.
   - Gửi mail mời: thông báo "Đã gửi email mời phỏng vấn tới ... chưa chuyển được CV sang cột "Chưa phỏng vấn" ... Không cần gửi lại email.", thẻ ở nguyên cột, nút là "Đã gửi mail".
