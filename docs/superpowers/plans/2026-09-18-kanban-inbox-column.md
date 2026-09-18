# Cột "Đầu vào" trên Kanban CV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thẻ CV nằm ở stage `01_Dau_Vao` hiện ra trên board, và luồng tạo Kanban báo đúng những thẻ không chuyển được sang cột đích.

**Architecture:** Hàm thuần `getCVColumnsForStages` được thêm cột Đầu vào, có điều kiện hiển thị. `CVScoredTab.tsx` truyền cờ "board đang có thẻ ở Đầu vào" vào hàm này. Vòng lặp chuyển cột trong `PipelineService.createKanbanBatchViaAI` chuyển sang dùng `moveCVToStage`, hàm này ném lỗi khi Hub từ chối. Các thẻ bị kẹt được gom lại và báo qua `onLog`.

**Tech Stack:** TypeScript strict, React (antd), vitest (`environment: 'node'`, không có DOM), SDK `@privos_ai/app-react`.

**Spec:** `docs/superpowers/specs/2026-09-18-kanban-inbox-column-design.md`

## Global Constraints

- KHÔNG commit, KHÔNG push. Git chỉ được dùng read-only: `git status`, `git diff`, `git log`, `git show`, `git blame`, `git rev-parse`.
- TypeScript strict. Không thêm `any` mới, trừ khi có comment giải thích lý do.
- Không dùng emoji trong code, log hay test mới thêm.
- Không sửa: `getTargetStageName`, `pipeline-dashboard.tsx`, `cv-stage-move.ts`, stage `04_Phone_Screening`, danh sách tool của Hub.
- Tên stage: `'01_Dau_Vao'`. Label cột: `'Đầu vào'`. Màu cột: `'#6b7280'`.
- Câu log khi có thẻ kẹt (giữ nguyên văn): `[Kanban] Đã tạo List "${listName}" và lưu ${createdCount} thẻ; ${stuckTitles.length} thẻ chưa chuyển được sang cột đích, đang nằm ở cột "Đầu vào": ${stuckTitles.join(', ')}`
- Câu log khi mọi thẻ chuyển thành công: giữ nguyên dòng hiện tại (`pipeline-service.ts:1176`).
- Lệnh chạy production duy nhất: `npm start`. Test hoặc build pass không có nghĩa là production đang chạy bản mới.
- Chạy mọi lệnh tại `E:\Hoc-tap\WebStormProject\migrate-hr-miniapp-by-hung\migrate-hr-mcp-app`.

---

### Task 1: Cột Đầu vào trong `kanban-stages.ts`

**Files:**
- Modify: `src/ui/cv-scored/kanban-stages.ts:17-34`
- Create: `tests/kanban-stages.spec.ts`

**Interfaces:**
- Produces:
  - `getCVColumnsForStages(stagesMap: Record<string, string>, hasInboxCards?: boolean): CVKanbanColumn[]`. Mặc định `hasInboxCards = false`.
  - `getCVColumnLabel(stagesMap: Record<string, string>, status: string): string | undefined`. Signature không đổi.

- [ ] **Step 1: Viết test fail**

Tạo `tests/kanban-stages.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCVColumnLabel, getCVColumnsForStages } from '../src/ui/cv-scored/kanban-stages';

const NEW_LIST_STAGES: Record<string, string> = {
  s01: '01_Dau_Vao',
  s02: '02_Loai_CV',
  s03: '03_Tiem_Nang',
  s04: '04_Phone_Screening',
  s05: '05_Moi_Phong_Van',
  s06: '06_Sai_JD',
  s07: '07_Chua_Phong_Van',
  s08: '08_Da_Phong_Van',
  s09: '09_CV_Cu',
};

const statuses = (stagesMap: Record<string, string>, hasInboxCards?: boolean) =>
  getCVColumnsForStages(stagesMap, hasInboxCards).map((column) => column.status);

describe('getCVColumnsForStages - cot Dau vao', () => {
  it('list moi co stage 01_Dau_Vao: Dau vao dung dau, tong 8 cot', () => {
    expect(statuses(NEW_LIST_STAGES)).toEqual([
      '01_Dau_Vao',
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
    expect(getCVColumnsForStages(NEW_LIST_STAGES)[0]).toEqual({
      status: '01_Dau_Vao',
      label: 'Đầu vào',
      color: '#6b7280',
    });
  });

  it('list legacy co stage 01_Dau_Vao: Dau vao dung truoc 5 cot legacy', () => {
    expect(statuses({ a: '01_Dau_Vao', b: '02_Loai_CV', c: '07_CV_Cu' })).toEqual([
      '01_Dau_Vao',
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_CV_Cu',
    ]);
  });

  it('khong co stage va khong co the o Dau vao: khong co cot Dau vao', () => {
    expect(statuses({ b: '02_Loai_CV', c: '09_CV_Cu' })).toEqual([
      '02_Loai_CV',
      '03_Tiem_Nang',
      '05_Moi_Phong_Van',
      '06_Sai_JD',
      '07_Chua_Phong_Van',
      '08_Da_Phong_Van',
      '09_CV_Cu',
    ]);
  });

  it('khong co stage nhung board co the o Dau vao: van hien cot Dau vao', () => {
    expect(statuses({ b: '02_Loai_CV', c: '09_CV_Cu' }, true)[0]).toBe('01_Dau_Vao');
    expect(statuses({}, true)[0]).toBe('01_Dau_Vao');
  });

  it('getCVColumnLabel tra label Dau vao ke ca khi list khong co stage do', () => {
    expect(getCVColumnLabel({}, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '01_Dau_Vao')).toBe('Đầu vào');
    expect(getCVColumnLabel(NEW_LIST_STAGES, '03_Tiem_Nang')).toBe('Tiềm năng');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/kanban-stages.spec.ts`
Expected: FAIL ở 4 test có `01_Dau_Vao` (cột đầu hiện tại là `02_Loai_CV`, và `getCVColumnLabel({}, '01_Dau_Vao')` trả `undefined`). Test "khong co stage va khong co the o Dau vao" PASS.

- [ ] **Step 3: Implement**

Trong `src/ui/cv-scored/kanban-stages.ts`, thay đoạn từ `const LEGACY_LIST_COLUMNS` đến hết hàm `getCVColumnLabel` (dòng 17-34) bằng:

```ts
const LEGACY_LIST_COLUMNS: CVKanbanColumn[] = [
  ...NEW_LIST_COLUMNS.slice(0, 4),
  { status: '07_CV_Cu', label: 'CV cũ', color: '#9ca3af' },
];

const INBOX_STATUS = '01_Dau_Vao';

// Tach rieng khoi NEW_LIST_COLUMNS: LEGACY_LIST_COLUMNS dung slice(0, 4) tren mang do.
const INBOX_COLUMN: CVKanbanColumn = { status: INBOX_STATUS, label: 'Đầu vào', color: '#6b7280' };

export function getCVColumnsForStages(
  stagesMap: Record<string, string>,
  hasInboxCards = false,
): CVKanbanColumn[] {
  const stageNames = Object.values(stagesMap);
  const baseColumns = stageNames.includes('09_CV_Cu') ? NEW_LIST_COLUMNS : LEGACY_LIST_COLUMNS;
  return hasInboxCards || stageNames.includes(INBOX_STATUS)
    ? [INBOX_COLUMN, ...baseColumns]
    : baseColumns;
}

export function getInterviewPendingStageId(stagesMap: Record<string, string>): string | undefined {
  return Object.keys(stagesMap).find((stageId) => stagesMap[stageId] === '07_Chua_Phong_Van');
}

export function getCVColumnLabel(stagesMap: Record<string, string>, status: string): string | undefined {
  return getCVColumnsForStages(stagesMap, status === INBOX_STATUS)
    .find((column) => column.status === status)?.label;
}
```

Giữ nguyên `CVKanbanColumn`, `NEW_LIST_COLUMNS` và `canShowInviteMailButton`.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/kanban-stages.spec.ts`
Expected: PASS 5/5.

- [ ] **Step 5: Không commit.** Chạy `git status` để xác nhận chỉ có 2 file: `kanban-stages.ts` và `tests/kanban-stages.spec.ts`.

---

### Task 2: Nối cột Đầu vào vào board trong `CVScoredTab.tsx`

**Files:**
- Modify: `src/ui/cv-scored/CVScoredTab.tsx:228`
- Create: `tests/cv-kanban-inbox-column.spec.ts`

**Interfaces:**
- Consumes: `getCVColumnsForStages(stagesMap, hasInboxCards?)` từ Task 1.

- [ ] **Step 1: Viết test fail**

Project không có môi trường DOM, nên test quét source, giống `tests/cv-kanban-stage-move-regression.spec.ts`. Tạo `tests/cv-kanban-inbox-column.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CVScoredTab hien cot Dau vao khi board co the o 01_Dau_Vao', () => {
  const tab = fs.readFileSync(path.resolve('src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');

  it('truyen hasInboxCards vao getCVColumnsForStages', () => {
    expect(tab).toContain(
      "getCVColumnsForStages(board.stagesMap, board.cvs.some((cv) => cv.status === '01_Dau_Vao'))",
    );
  });

  it('khong con loi goi chi voi stagesMap', () => {
    expect(tab).not.toContain('getCVColumnsForStages(board.stagesMap);');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/cv-kanban-inbox-column.spec.ts`
Expected: FAIL cả 2 test.

- [ ] **Step 3: Implement**

Tại `src/ui/cv-scored/CVScoredTab.tsx:228`, thay:

```tsx
  const columns = getCVColumnsForStages(board.stagesMap);
```

bằng:

```tsx
  const columns = getCVColumnsForStages(board.stagesMap, board.cvs.some((cv) => cv.status === '01_Dau_Vao'));
```

Không sửa chỗ nào khác trong file. Bộ lọc thẻ ở dòng 283 (`cv.status === col.status`) tự khớp với cột mới.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/cv-kanban-inbox-column.spec.ts tests/cv-kanban-stage-move-regression.spec.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Không commit.**

---

### Task 3: Chuyển cột có kiểm tra và báo thẻ kẹt trong `createKanbanBatchViaAI`

**Files:**
- Modify: `src/ui/pipeline-service.ts` (import ở đầu file; vòng lặp dòng 1158-1173; chèn thêm sau dòng 1175)
- Create: `tests/pipeline-kanban-stage-move.spec.ts`

**Interfaces:**
- Consumes: `moveCVToStage(app: CVStageMoveApp, itemId: string, stageId: string): Promise<void>` từ `src/ui/cv-scored/cv-stage-move.ts`, có sẵn và không sửa. Hàm ném lỗi khi Hub trả `isError: true`.
- Consumes: `formatKanbanItemTitle(rawTitle: string): string` từ `src/ui/pipeline-candidate-name.ts` (có sẵn), dùng trong test để tính tiêu đề thẻ.

- [ ] **Step 1: Viết test fail**

Tạo `tests/pipeline-kanban-stage-move.spec.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PipelineService } from '../src/ui/pipeline-service';
import { formatKanbanItemTitle } from '../src/ui/pipeline-candidate-name';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

const STAGES = [
  { _id: 's01', name: '01_Dau_Vao' },
  { _id: 's02', name: '02_Loai_CV' },
  { _id: 's03', name: '03_Tiem_Nang' },
  { _id: 's06', name: '06_Sai_JD' },
];

/**
 * Luong list moi: getAll rong -> create -> batchCreateItems -> createItem (config) -> moveItemToStage.
 * Hub tu choi thi callServerTool van resolve voi isError: true, stub tai tao dung dang do.
 */
function createAppStub(options: { createdItemIds: string[]; rejectMoveFor?: string }) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      switch (call.name) {
        case 'mcpapp.lists.getAll':
          return jsonResult([]);
        case 'mcpapp.lists.create':
          return jsonResult({ list: { _id: 'list-1' }, stages: STAGES });
        case 'mcpapp.lists.batchCreateItems':
          return jsonResult({ items: options.createdItemIds.map((_id) => ({ _id })) });
        case 'mcpapp.lists.createItem':
          return jsonResult({ item: { _id: 'config-1' } });
        case 'mcpapp.lists.moveItemToStage':
          if (call.arguments?.itemId === options.rejectMoveFor) {
            return { isError: true, content: [{ type: 'text', text: 'Stage not found' }] };
          }
          return jsonResult({ moved: true });
        default:
          throw new Error(`unexpected tool: ${call.name}`);
      }
    },
  };
  return { app, calls };
}

const RESULTS = [
  { originalName: 'CV_A.pdf', normalizedName: 'Nguyen Van A', score: 85, category: 'ĐẠT', reason: 'dat' },
  { originalName: 'CV_B.pdf', normalizedName: 'Tran Thi B', score: 30, category: 'KHÔNG ĐẠT', reason: 'khong dat' },
];

async function run(options: { createdItemIds: string[]; rejectMoveFor?: string }) {
  const { app, calls } = createAppStub(options);
  const service = new PipelineService(app as never, 'room-1', {} as never);
  const logs: string[] = [];
  await service.createKanbanBatchViaAI(RESULTS, 'JD_Developer.md', (msg) => logs.push(msg));
  return { calls, logs };
}

describe('createKanbanBatchViaAI - chuyen cot va bao the ket', () => {
  it('Hub tu choi mot lan chuyen cot: log neu dung the ket, khong bao "vao dung stage"', async () => {
    const { logs } = await run({ createdItemIds: ['item-1', 'item-2'], rejectMoveFor: 'item-2' });

    const stuckLog = logs.find((line) => line.includes('chưa chuyển được sang cột đích'));
    expect(stuckLog).toBeDefined();
    expect(stuckLog).toContain('1 thẻ chưa chuyển được sang cột đích, đang nằm ở cột "Đầu vào"');
    expect(stuckLog).toContain(formatKanbanItemTitle('Tran Thi B'));
    expect(stuckLog).not.toContain(formatKanbanItemTitle('Nguyen Van A'));
    expect(logs.some((line) => line.includes('vào đúng stage'))).toBe(false);
  });

  it('moi lan chuyen cot thanh cong: giu log cu, chuyen dung stage', async () => {
    const { calls, logs } = await run({ createdItemIds: ['item-1', 'item-2'] });

    expect(logs.some((line) => line.includes('vào đúng stage'))).toBe(true);
    expect(logs.some((line) => line.includes('chưa chuyển được'))).toBe(false);
    expect(calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'item-1', stageId: 's03' } },
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'item-2', stageId: 's02' } },
    ]);
  });

  it('batchCreateItems tra thieu item: the khong co id duoc bao ket', async () => {
    const { calls, logs } = await run({ createdItemIds: ['item-1'] });

    const stuckLog = logs.find((line) => line.includes('chưa chuyển được sang cột đích'));
    expect(stuckLog).toContain(formatKanbanItemTitle('Tran Thi B'));
    expect(calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toHaveLength(1);
  });

  it('source khong con goi thang moveItemToStage', () => {
    const source = fs.readFileSync(path.resolve('src/ui/pipeline-service.ts'), 'utf8');
    expect(source).not.toContain("'mcpapp.lists.moveItemToStage'");
    expect(source).toContain('await moveCVToStage(this.app, createdId, intendedStageId);');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/pipeline-kanban-stage-move.spec.ts`
Expected:
- Test 1, 3, 4 FAIL. Lời gọi thẳng coi `isError` là thành công; vòng lặp chỉ duyệt `createdItems`; source vẫn còn chuỗi `'mcpapp.lists.moveItemToStage'`.
- Test 2 PASS.

- [ ] **Step 3: Thêm import**

Trong `src/ui/pipeline-service.ts`, ngay sau dòng import `formatKanbanItemTitle` (dòng 10), thêm:

```ts
import { moveCVToStage } from './cv-scored/cv-stage-move';
```

- [ ] **Step 4: Thay vòng lặp chuyển cột**

Thay toàn bộ đoạn dòng 1158-1173 (từ comment `// Explicitly move items to their correct stages ...` đến dấu `}` đóng vòng `for`) bằng:

```ts
      // batchCreateItems dat moi the vao stage dau tien (01_Dau_Vao). The nao khong chuyen duoc
      // se nam lai o do; cot "Dau vao" tren board hien chung, log ben duoi neu ten.
      const createdItems: Array<{ _id?: unknown }> = Array.isArray(batchRes?.items) ? batchRes.items : [];
      const stuckTitles: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const { title, stageId: intendedStageId } = items[i];
        const createdId = createdItems[i]?._id;
        if (typeof createdId !== 'string' || createdId === '') {
          stuckTitles.push(title);
          continue;
        }
        try {
          await moveCVToStage(this.app, createdId, intendedStageId);
        } catch (e) {
          console.warn(`Failed to move item ${createdId} to stage ${intendedStageId}`, e);
          stuckTitles.push(title);
        }
      }
```

- [ ] **Step 5: Chèn nhánh báo thẻ kẹt**

Ngay sau dòng `const createdCount = createdItems.length || items.length;` và trước dòng `if (onLog) onLog(` báo thành công (giữ nguyên dòng đó), chèn:

```ts
      if (stuckTitles.length > 0) {
        if (onLog) onLog(`[Kanban] Đã tạo List "${listName}" và lưu ${createdCount} thẻ; ${stuckTitles.length} thẻ chưa chuyển được sang cột đích, đang nằm ở cột "Đầu vào": ${stuckTitles.join(', ')}`);
        return;
      }
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npx vitest run tests/pipeline-kanban-stage-move.spec.ts`
Expected: PASS 4/4.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: không có lỗi. `this.app` có kiểu `McpApp` và truyền được vào `moveCVToStage`, vì `CVScoredTab.tsx` đã truyền `McpApp` vào đúng hàm này. `stageIdByName` có kiểu `any`, nên `intendedStageId` gán được cho tham số `string`.

- [ ] **Step 8: Không commit.**

---

### Task 4: Kiểm tra toàn bộ và chạy thật

**Files:** không sửa file nào.

- [ ] **Step 1: Toàn bộ test**

Run: `npm test`
Expected: tất cả PASS, gồm 3 file test mới và `tests/cv-kanban-stage-move-regression.spec.ts`.

- [ ] **Step 2: Typecheck với cờ strict-unused**

Run: `npm run typecheck:strict-unused`
Expected: không có lỗi.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build thành công và `manifest:lint` pass.

- [ ] **Step 4: Chạy production và kiểm tra trên board thật**

- Nếu server cũ đang chạy, dừng nó. `serveBuiltUi` chỉ đọc `dist/ui` một lần lúc khởi động.
- Chạy `npm start`.
- Mở `https://roxane-dev.privos.io/group/test-apps-6dps39/mcpapp/6a9fc8fda93fafe030661eb3`, vào tab CV đã chấm. Cần kiểm tra:
  - List SCREENING tạo bởi phiên bản hiện tại có stage `01_Dau_Vao`, nên cột "Đầu vào" đứng đầu board.
  - Kéo một thẻ vào "Đầu vào" rồi kéo ra lại. Cả hai lần thẻ đều giữ vị trí sau lần polling kế tiếp.
  - Mở chi tiết một thẻ nằm ở "Đầu vào": mục "Trạng thái Kanban" hiện "Đầu vào", không hiện `01_Dau_Vao`.
  - Chấm một lô CV mới. Log kết thúc bằng câu "vào đúng stage" khi không có thẻ kẹt.
