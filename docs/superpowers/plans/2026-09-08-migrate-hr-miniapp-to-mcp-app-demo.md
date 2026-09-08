# Migrate `hr-miniapp` → `privos-mcp-app-demo` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển toàn bộ tính năng HR của `hr-miniapp` (relay-only, manifest cũ, SDK `@privos/app-react` hỏng) vào scaffold `privos-mcp-app-demo` (schemaVersion 3, `@privos_ai/app-server@^0.10`, split-asset UI), với authorization thật ở server cho Payroll và Mail.

**Architecture:** Backend giữ mô hình của target: `handleMcpMessage(method, id, params, actor)` nhận `VerifiedActor` từ SDK; hai nhóm tool mới `hrm.payroll.*` và `hrm.mail.*` chỉ chạy khi có `actor`, khoá cứng `roomId = actor.roomId`, và gọi Hub qua `callAppPlatformTool` (credential agent-bot của app). UI port từ `hr-miniapp/src/ui` gần như nguyên khối, áp một bộ quy tắc thay thế cơ học (SDK scope, namespace tool, polling, alert), rồi cắm vào `App.tsx` mới với nav 2 nhóm. Toàn bộ demo panel của scaffold bị gỡ để `scope-audit.spec.ts` chỉ còn kiểm các scope HR thật.

**Tech Stack:** Node 22, TypeScript strict, ESM, `@privos_ai/app-server@^0.10.0`, `@privos_ai/app-react@^0.6.0`, React 18, Vite 5 (split assets qua `serveBuiltUi`), vitest 2, `docx`, `xlsx`, `@ant-design/icons`.

**Spec:** Nội dung prompt của người dùng ngày 2026-09-08 (5 bước) + hai báo cáo review: `hr-miniapp/PRE-MIGRATION-REVIEW.md` và `REVIEW-privos-dev-docs-va-mcp-app-demo.md` (thư mục cha).

## Global Constraints

- Thư mục nguồn: `E:\Hoc-tap\WebStormProject\migrate-hr-miniapp-by-hung\hr-miniapp` — **chỉ đọc**, không sửa.
- Thư mục đích: `E:\Hoc-tap\WebStormProject\migrate-hr-miniapp-by-hung\privos-mcp-app-demo` — mọi lệnh `npm`/`npx` trong plan chạy tại đây.
- **Không tự chạy `npm install`.** Task 1 dừng lại và yêu cầu người dùng xác nhận trước khi cài.
- **Không chạy lệnh git ghi** (commit/add/checkout…) từ agent. Mỗi bước "Commit" trong plan là việc **người dùng** thực hiện; agent chỉ in ra lệnh gợi ý.
- Giữ nguyên `name` = `ai.privos.mcp-app-demo-can-run` và `tools[0].ui.resourceUri` = `ui://ai.privos.mcp-app-demo-can-run/form.html` (đã có test chốt).
- Bundle: giữ `serveBuiltUi` + split assets; **không** thêm `vite-plugin-singlefile`. Mỗi asset < 2 MiB (`MAX_ASSET_BYTES` của SDK).
- Dependency thêm đúng 3: `@ant-design/icons@^6.3.2`, `docx@^9.7.1`, `xlsx@^0.18.5`. **Không** thêm `@emailjs/browser`, `pdfjs-dist`, `gitnexus`, `vite-plugin-singlefile`.
- Không port: `hr-miniapp/src/ui/onboarding/**`, `hr-miniapp/src/services/PrivosApi.ts`, `scratch-test.ts`, `test-docx-gen.ts`, `test-upload-md.ts`, `mock-pipeline-service.ts`, `training-dashboard.tsx`, `list-items-table.tsx`, `contact-collector-form.tsx`, `test-mail.ts`.
- Mọi `usePolling` trong UI: `enabled` phải gate theo tab đang active, `interval >= 3000`, `pauseOnTabHidden: true` (mặc định của hook).
- Không `alert()` trong file service (`*-service.ts`, `services/**`). `alert()` trong component (`*.tsx`) giữ nguyên — ngoài phạm vi spec.
- Version mới: `3.0.0` (breaking: đổi toàn bộ UI + tool surface). `package.json`, `privos-app.json`, `CHANGELOG.md` đổi trong cùng một commit.

## Sai lệch có chủ ý so với spec (đọc trước khi bắt đầu)

| Spec nói | Plan làm | Lý do (đã kiểm chứng) |
|---|---|---|
| Khai `sandbox:skills:use` optional | **Không khai** | `hr-miniapp/src/ui` không có call site nào gọi skills API. `tests/scope-audit.spec.ts` bắt buộc mỗi scope khai báo phải xuất hiện trong `src/ui` → khai sẽ đỏ test, và vi phạm least-privilege. |
| Khai `lists:query` required | **Không khai** | Không có call site (`hr-miniapp` không dùng `items.query`/`mcpapp.lists.queryItems`). Cùng lý do trên. |
| Chỉ khai `sandbox:ai-chat` | Khai thêm **`sandbox:ai-chat:write`** (optional) | `company-home.tsx:26` và `pipeline-service.ts:758` gọi `ai-messages.send` + `ai-messages.startGeneration`; theo `privos-dev-docs/mcp-app-platform/api-reference.md:239` hai endpoint này cần `sandbox:ai-chat:write`. Thiếu scope → chấm CV và Company Home không chạy. |
| `PayrollDocument` có 6 field | Thêm `bankName?`, `contractType?`, `applyProbationRate?`, `probationRate?` | `PayrollDashboard.tsx` + `payroll/utils.ts calculateNetSalary` dùng 4 field này. Bỏ là mất dữ liệu lương thử việc. |
| Index `{ fields: ['roomId','employeeId'], unique: true }` | `{ fields: { roomId: 1, employeeId: 1 }, unique: true }` | Đúng cú pháp `mcpapp.db.registerCollection` trong `tools-database.md` (object map, không phải array). |
| "Bỏ toàn bộ `alert()` trong các service" | Chỉ bỏ trong `pipeline-service.ts` (3 chỗ) | Đó là file service duy nhất có `alert()`. 11 chỗ còn lại nằm trong component `.tsx`. |

## Tiền đề vận hành (không phải code, nhưng thiếu thì runtime không chạy)

1. Workspace admin đã cấp `PRIVOS_AGENT_BOT_CREDENTIAL` + `PRIVOS_AGENT_BOT_USER_ID` cho app (Admin → Apps → app → Settings). `hrm.payroll.*` và `hrm.mail.*` gọi Hub bằng credential này.
2. Agent bot của app đã là **thành viên** của room dùng thử. Hub xác thực tư cách thành viên của bot khi `roomId` được truyền (`rest-tool-call.md` § Security).
3. Đã pair ở chế độ dev (`npm run dev` → nhập pairing URL) để `.env` có `MCP_APP_ID` — `resolveOwnMcpAppId()` cần nó.
4. Tài khoản EmailJS có bật "Allow EmailJS API for non-browser applications" (bắt buộc để gọi từ server, cần `accessToken`).

## Quy tắc port cơ học (áp cho MỌI file copy từ `hr-miniapp/src/ui`)

| # | Tìm | Thay bằng |
|---|---|---|
| R1 | `from '@privos/app-react'` | `from '@privos_ai/app-react'` |
| R2 | `name: 'privos.` (trong `callServerTool`) | `name: 'mcpapp.` |
| R3 | `restCall(..., 'POST', 'mcp.callTool', { body: { name: 'privos.files.delete', arguments: { fileId } } })` | `app.callServerTool({ name: 'mcpapp.files.delete', arguments: { fileId } })` |
| R4 | `restCall(..., 'POST', 'mcp.callTool', { body: { name: 'privos.files.update', arguments: { fileId, name: newName } } })` | `app.callServerTool({ name: 'mcpapp.files.update', arguments: { fileId, name: newName } })` |
| R5 | `usePolling(cb, { enabled: X, interval: 1000, ... })` | `usePolling(cb, { enabled: active && X, interval: 3000, ... })` — `active: boolean` là prop mới của component (App.tsx truyền `active={tab === '<id>'}`) |
| R6 | `pauseOnTabHidden: false` | xoá dòng (mặc định `true`) |
| R7 | import model email history `'../../email-history/email-history-model'` | `'../../services/mail/email-history-model'` |
| R8 | `ensureTemplatesExistGlobal(app, roomId, true)` | `ensureTemplatesExistGlobal(app, roomId, false)` |

Lệnh áp R1 + R2 hàng loạt cho một thư mục vừa copy (chạy trong Git Bash tại `privos-mcp-app-demo`):

```bash
grep -rl "@privos/app-react" src/ui --include=*.ts --include=*.tsx | xargs sed -i "s#@privos/app-react#@privos_ai/app-react#g"
grep -rl "name: 'privos\." src/ui --include=*.ts --include=*.tsx | xargs sed -i "s#name: 'privos\.#name: 'mcpapp.#g"
```

## File Structure

**Backend mới (`src/`):**

| File | Trách nhiệm |
|---|---|
| `src/services/hub-tool-caller.ts` | `HubToolCaller` — gọi một tool `mcpapp.*` bất kỳ bằng credential bot, khoá `roomId`; map tool → `requiredScope` |
| `src/services/payroll/payroll-repository.ts` | `PayrollDocument`, `PayrollInput`, `IPayrollRepository` (interface thuần) |
| `src/services/payroll/app-db-payroll-repository.ts` | `AppDbPayrollRepository` — impl trên `mcpapp.db.*` |
| `src/payroll-tools.ts` | Tool defs `hrm.payroll.*` + `handlePayrollTool(name, args, actor)` với actor/room guard |
| `src/services/mail/email-history-model.ts` | Port nguyên văn `hr-miniapp/src/email-history/email-history-model.ts` (pure) |
| `src/services/mail/email-history-repository.ts` | Port `EmailHistoryRepository`, đổi `privos.`→`mcpapp.`, dùng `mcpapp.lists.getItem` thay full-scan |
| `src/services/mail/task-queue.ts` | Port nguyên văn `hr-miniapp/src/utils/TaskQueue.ts` |
| `src/services/mail/mail-relay-service.ts` | `MailRelayService` — gửi EmailJS bằng `fetch` server-side, inject `fetch` + env |
| `src/services/mail/tracked-mail-service.ts` | Port `TrackedMailService` (constructor injection, giữ nguyên) |
| `src/services/mail/html-sanitizer.ts` | `sanitizeEmailHtml()` — bỏ `<script>`, `on*=`, `javascript:` |
| `src/mail-tools.ts` | Tool defs `hrm.mail.send`/`hrm.mail.retry` + `handleMailTool(name, args, actor)` |
| `src/mcp-message-handlers.ts` | Sửa: gỡ `hr_app_object_store`/`hr_app_db_store`, cắm `hrm.*` |

**UI (`src/ui/`)** — copy từ `hr-miniapp/src/ui/` giữ nguyên cây thư mục: `company-home.tsx`, `recruitment-panel.tsx`, `pipeline-dashboard.tsx`, `pipeline-service.ts`, `cv-context-builder.ts`, `cv-pipeline-display-reason.ts`, `cv-scoring-policy.ts`, `pipeline-candidate-name.ts`, `screening-strategy.ts`, `docx-export-service.ts`, `jd-chatbot-*.tsx`, `jd-chat-history.ts`, `bot-drafting-tab.tsx`, `bot-drafting.css`, `hr-premium-styles.css`, `contact-form-styles.css` (ghi đè bản của target), `hooks/usePolling.ts`, `cv-scored/**`, `drafting/**`, `email-history/**`, `email-templates/**`, `lifecycle/**`, `payroll/**`, `data/**`. Thêm hàm vào `src/ui/privos-rest.ts` (giữ file của target, nối thêm). `App.tsx` viết mới. Giữ `theme-provider.tsx`, `lazy-boundary.tsx`, `privos-rest.ts`, `vite-env.d.ts`, `index.html`, `main.tsx` của target.

**Xoá khỏi target (Task 16):** mọi panel demo trong `src/ui/*.tsx` và `src/ui/panels/**` trừ 4 file giữ ở trên; `src/app-objects-demo-tool.ts`, `src/app-db-demo-tool.ts`, `src/app-platform-demo-tool-defs.ts`; test tương ứng.

**Tests mới (`tests/`):** `hub-tool-caller.spec.ts`, `app-db-payroll-repository.spec.ts`, `payroll-tools.spec.ts`, `email-history-model.spec.ts`, `email-history-repository.spec.ts`, `mail-relay-service.spec.ts`, `tracked-mail-service.spec.ts`, `html-sanitizer.spec.ts`, `mail-tools.spec.ts`.

---

### Task 1: Cổng chất lượng xanh trước khi chạm vào tính năng

`verify:fast-pr` hiện đỏ ở 2 chỗ (xem báo cáo review A1/A3). Sửa trước, thêm dependency, bump version.

**Files:**
- Modify: `tests/packaging.spec.ts:10`
- Modify: `tests/ui-shell.spec.ts:22-26`
- Modify: `package.json` (version, dependencies)
- Modify: `privos-app.json:5` (version)
- Modify: `vite.config.ts:20-24` (manualChunks)
- Modify: `CHANGELOG.md` (thêm mục 3.0.0)

- [ ] **Step 1: Sửa tên archive trong `tests/packaging.spec.ts`**

Thay dòng 10:
```ts
const archive = `dist-source/ai.privos.mcp-app-demo-${pkg.version}.zip`;
```
bằng (khớp `safe_name="${name//\//-}"` trong `scripts/package-source.sh`):
```ts
const archive = `dist-source/${pkg.name.replace(/\//g, '-')}-${pkg.version}.zip`;
```

- [ ] **Step 2: Sửa spawn cross-platform trong `tests/ui-shell.spec.ts`**

Thay khối `beforeAll` (dòng 21-26) bằng:
```ts
beforeAll(() => {
  // `node_modules/.bin/vite` là shell script không đuôi — spawnSync không chạy được trên Windows.
  // Gọi thẳng entry JS của vite bằng chính node đang chạy test: chạy trên mọi OS.
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      `vite build failed ahead of the UI shell tests: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
});
```

- [ ] **Step 3: Chạy test để xác nhận 2 suite trên đã xanh (chưa đụng gì khác)**

Run: `npx vitest run tests/packaging.spec.ts tests/ui-shell.spec.ts`
Expected: `packaging.spec.ts` PASS (2 tests); `ui-shell.spec.ts` PASS (7 tests, không còn skipped).

- [ ] **Step 4: Thêm dependency + bump version trong `package.json`**

Sửa `"version": "2.17.5"` → `"version": "3.0.0"`.
Trong `"dependencies"` thêm 3 dòng (giữ thứ tự alphabet):
```json
"@ant-design/icons": "^6.3.2",
"@privos_ai/app-server": "^0.10.0",
"docx": "^9.7.1",
"dotenv": "^17.3.1",
"tsx": "^4.0.0",
"ws": "^8.21.0",
"xlsx": "^0.18.5"
```

- [ ] **Step 5: Bump version trong `privos-app.json`**

Dòng 5: `"version": "2.17.5",` → `"version": "3.0.0",`.

- [ ] **Step 6: Tách chunk cho thư viện nặng trong `vite.config.ts`**

Thay khối `manualChunks`:
```ts
manualChunks: {
  vendor: ['react', 'react-dom', '@privos_ai/app-react'],
  docx: ['docx'],
  xlsx: ['xlsx'],
  'antd-icons': ['@ant-design/icons'],
},
```

- [ ] **Step 7: Thêm mục CHANGELOG cho 3.0.0**

Chèn ngay dưới dòng `---` đầu file (trước `## [2.17.3]`):
```markdown
## [3.0.0] - 2026-09-08

### Changed

- **Replaced the platform demo dashboard with the HR Mini App feature set** migrated from
  `privos-demo-hrm-ws`: Company home, Email history + interview templates, Recruitment, CV
  Pipeline (AI scoring), Scored CVs kanban, JD editor, Employee lifecycle, Payroll, Drafting bot.
- **New app-owned tools** `hrm.payroll.query/create/update/delete` and `hrm.mail.send/retry`.
  Every call requires a Hub-verified actor and is pinned to `actor.roomId`; the Hub is reached
  with the installation-bot credential (`mcpapp.db.*`, `mcpapp.lists.*`).
- **Permissions narrowed** to what the HR features call: `basic:information`, `lists:read`,
  `lists:write`, `files:read`, `files:write`, `db:*` (required); `sandbox:ai-chat`,
  `sandbox:ai-chat:write` (optional). All other demo scopes removed.
- **New secret env**: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`,
  `EMAILJS_PRIVATE_KEY` (server-side EmailJS relay).

### Removed

- All platform demo tabs and the `hr_app_object_store` / `hr_app_db_store` demo tools.

### Fixed

- `tests/packaging.spec.ts` derived the archive name from the version but hard-coded the app
  name; `tests/ui-shell.spec.ts` could not spawn `node_modules/.bin/vite` on Windows and silently
  skipped 7 contract tests.
```

- [ ] **Step 8: DỪNG — xin xác nhận cài dependency**

In ra cho người dùng:
```
Cần cài 3 package mới (@ant-design/icons, docx, xlsx). Lệnh: npm install --no-audit --no-fund
Xác nhận rồi tôi mới chạy.
```
Chỉ chạy `npm install --no-audit --no-fund` **sau khi** người dùng đồng ý. Sau khi cài, `package-lock.json` sẽ tự cập nhật `version: 3.0.0`.

- [ ] **Step 9: Kiểm chứng cổng**

Run: `npm run typecheck:strict-unused && npx vitest run && npm run preflight`
Expected: typecheck exit 0; vitest `Test Files 18 passed`, `Tests 93 passed, 0 skipped`; preflight kết thúc **không** có dòng `Preflight failed` (mục 3.0.0 đã có trong CHANGELOG).

- [ ] **Step 10: Commit (người dùng thực hiện)**

```bash
git add tests/packaging.spec.ts tests/ui-shell.spec.ts package.json package-lock.json privos-app.json vite.config.ts CHANGELOG.md
git commit -m "chore: green verify gate, add docx/xlsx/antd-icons, bump 3.0.0"
```

---

### Task 2: `HubToolCaller` — cầu nối server → Hub khoá theo room

**Files:**
- Create: `src/services/hub-tool-caller.ts`
- Test: `tests/hub-tool-caller.spec.ts`

**Interfaces:**
- Consumes: `callAppPlatformTool(toolName: string, args: Record<string, unknown>, requiredScope: string, roomId: string): Promise<unknown>` từ `src/app-platform-tool-call.ts` (đã có).
- Produces:
  ```ts
  export type HubToolCaller = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  export type HubToolTransport = typeof callAppPlatformTool;
  export function resolveRequiredScope(toolName: string): string;
  export function createRoomHubToolCaller(roomId: string, transport?: HubToolTransport): HubToolCaller;
  ```

- [ ] **Step 1: Viết test thất bại**

`tests/hub-tool-caller.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createRoomHubToolCaller, resolveRequiredScope } from '../src/services/hub-tool-caller';

describe('resolveRequiredScope', () => {
  it('maps db tools to the four db scopes', () => {
    expect(resolveRequiredScope('mcpapp.db.registerCollection')).toBe('db:schema:write');
    expect(resolveRequiredScope('mcpapp.db.getSchema')).toBe('db:schema:read');
    expect(resolveRequiredScope('mcpapp.db.query')).toBe('db:read');
    expect(resolveRequiredScope('mcpapp.db.count')).toBe('db:read');
    expect(resolveRequiredScope('mcpapp.db.create')).toBe('db:write');
    expect(resolveRequiredScope('mcpapp.db.update')).toBe('db:write');
    expect(resolveRequiredScope('mcpapp.db.delete')).toBe('db:write');
  });

  it('maps list read tools to lists:read and everything else under lists to lists:write', () => {
    expect(resolveRequiredScope('mcpapp.lists.getAll')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.getItems')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.getItem')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.stages.getByList')).toBe('lists:read');
    expect(resolveRequiredScope('mcpapp.lists.create')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.createItem')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.updateItem')).toBe('lists:write');
    expect(resolveRequiredScope('mcpapp.lists.moveItemToStage')).toBe('lists:write');
  });

  it('throws on a tool outside the allowlist', () => {
    expect(() => resolveRequiredScope('mcpapp.files.delete')).toThrow('not allowed from the server');
  });
});

describe('createRoomHubToolCaller', () => {
  it('pins roomId and passes the resolved scope to the transport', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    const call = createRoomHubToolCaller('room-1', transport);
    await expect(call('mcpapp.db.query', { collection: 'x' })).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledWith('mcpapp.db.query', { collection: 'x' }, 'db:read', 'room-1');
  });

  it('defaults args to an empty object', async () => {
    const transport = vi.fn().mockResolvedValue(null);
    await createRoomHubToolCaller('room-1', transport)('mcpapp.lists.getAll');
    expect(transport).toHaveBeenCalledWith('mcpapp.lists.getAll', {}, 'lists:read', 'room-1');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run tests/hub-tool-caller.spec.ts`
Expected: FAIL — `Cannot find module '../src/services/hub-tool-caller'`.

- [ ] **Step 3: Viết implementation**

`src/services/hub-tool-caller.ts`:
```ts
/**
 * Server-side bridge to one mediated Hub tool, executed with this app's own
 * installation-bot credential and pinned to ONE room. Every `hrm.*` tool
 * handler builds its caller from `actor.roomId` (Hub-verified) — never from a
 * caller-supplied argument — so the bot can only ever be pointed at the room
 * the human actually made the request from.
 *
 * The allowlist below is the complete set of Hub tools the server is permitted
 * to reach. Anything else throws before a request is made.
 */
import { callAppPlatformTool } from '../app-platform-tool-call';

export type HubToolCaller = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
export type HubToolTransport = typeof callAppPlatformTool;

const SCOPE_BY_TOOL: Readonly<Record<string, string>> = {
	'mcpapp.db.registerCollection': 'db:schema:write',
	'mcpapp.db.getSchema': 'db:schema:read',
	'mcpapp.db.query': 'db:read',
	'mcpapp.db.count': 'db:read',
	'mcpapp.db.get': 'db:read',
	'mcpapp.db.create': 'db:write',
	'mcpapp.db.update': 'db:write',
	'mcpapp.db.delete': 'db:write',
	'mcpapp.lists.getAll': 'lists:read',
	'mcpapp.lists.get': 'lists:read',
	'mcpapp.lists.getItems': 'lists:read',
	'mcpapp.lists.getItem': 'lists:read',
	'mcpapp.stages.getByList': 'lists:read',
	'mcpapp.lists.create': 'lists:write',
	'mcpapp.lists.createItem': 'lists:write',
	'mcpapp.lists.updateItem': 'lists:write',
	'mcpapp.lists.moveItemToStage': 'lists:write',
};

export function resolveRequiredScope(toolName: string): string {
	const scope = SCOPE_BY_TOOL[toolName];
	if (!scope) throw new Error(`Hub tool "${toolName}" is not allowed from the server`);
	return scope;
}

export function createRoomHubToolCaller(roomId: string, transport: HubToolTransport = callAppPlatformTool): HubToolCaller {
	return (name, args = {}) => transport(name, args, resolveRequiredScope(name), roomId);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/hub-tool-caller.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit (người dùng thực hiện)**

```bash
git add src/services/hub-tool-caller.ts tests/hub-tool-caller.spec.ts
git commit -m "feat(server): room-pinned HubToolCaller over the installation-bot transport"
```

---

### Task 3: Payroll repository trên `mcpapp.db.*`

**Files:**
- Create: `src/services/payroll/payroll-repository.ts`
- Create: `src/services/payroll/app-db-payroll-repository.ts`
- Test: `tests/app-db-payroll-repository.spec.ts`

**Interfaces:**
- Consumes: `HubToolCaller`, `createRoomHubToolCaller(roomId)` (Task 2).
- Produces:
  ```ts
  export interface PayrollDocument {
    readonly _id?: string; readonly roomId: string; readonly employeeId: string; readonly baseSalary: number;
    readonly taxId?: string; readonly bankAccount?: string; readonly bankName?: string; readonly contractType?: string;
    readonly applyProbationRate?: boolean; readonly probationRate?: number;
    readonly _createdAt?: string; readonly _updatedAt?: string;
  }
  export type PayrollInput = Omit<PayrollDocument, '_id' | 'roomId' | '_createdAt' | '_updatedAt'>;
  export interface IPayrollRepository {
    initializeSchema(roomId: string): Promise<void>;
    queryByRoom(roomId: string): Promise<readonly PayrollDocument[]>;
    create(roomId: string, data: PayrollInput): Promise<PayrollDocument>;
    update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void>;
    delete(roomId: string, id: string): Promise<void>;
  }
  export const PAYROLL_COLLECTION = 'hr_payroll_records';
  export class AppDbPayrollRepository implements IPayrollRepository {
    constructor(callerFactory?: (roomId: string) => HubToolCaller);
  }
  ```

- [ ] **Step 1: Viết test thất bại**

`tests/app-db-payroll-repository.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { AppDbPayrollRepository } from '../src/services/payroll/app-db-payroll-repository';
import { PAYROLL_COLLECTION } from '../src/services/payroll/payroll-repository';

function fakeCaller(responses: Record<string, unknown> = {}) {
  const calls: Array<{ roomId: string; name: string; args: Record<string, unknown> }> = [];
  const factory = (roomId: string) => async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ roomId, name, args });
    if (responses[name] instanceof Error) throw responses[name];
    return responses[name] ?? {};
  };
  return { factory, calls };
}

describe('AppDbPayrollRepository', () => {
  it('registers a room-scoped collection with the unique (roomId, employeeId) index', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).initializeSchema('room-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].roomId).toBe('room-1');
    expect(calls[0].name).toBe('mcpapp.db.registerCollection');
    expect(calls[0].args.collection).toBe(PAYROLL_COLLECTION);
    expect(calls[0].args.scope).toBe('room');
    expect(calls[0].args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
    const fields = calls[0].args.fields as Array<{ name: string; required?: boolean }>;
    expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
  });

  it('treats "already registered" as success', async () => {
    const { factory } = fakeCaller({ 'mcpapp.db.registerCollection': new Error('Collection already registered') });
    await expect(new AppDbPayrollRepository(factory).initializeSchema('room-1')).resolves.toBeUndefined();
  });

  it('queries only the given room and returns records', async () => {
    const { factory, calls } = fakeCaller({ 'mcpapp.db.query': { records: [{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }], total: 1 } });
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toEqual([{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }]);
    expect(calls[0].args).toEqual({
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: 'room-1' }],
      orderBy: [{ field: '_createdAt', direction: 'desc' }],
      limit: 1000,
    });
  });

  it('create stamps roomId from the argument, never from data', async () => {
    const { factory, calls } = fakeCaller({ 'mcpapp.db.create': { _id: 'new', roomId: 'room-1', employeeId: 'e1', baseSalary: 5 } });
    const created = await new AppDbPayrollRepository(factory).create('room-1', { employeeId: 'e1', baseSalary: 5, ...( { roomId: 'room-EVIL' } as object) } as any);
    expect(created._id).toBe('new');
    expect(calls[0].name).toBe('mcpapp.db.create');
    expect((calls[0].args.data as Record<string, unknown>).roomId).toBe('room-1');
  });

  it('update and delete forward id and pin roomId in data', async () => {
    const { factory, calls } = fakeCaller();
    const repo = new AppDbPayrollRepository(factory);
    await repo.update('room-1', 'id-1', { baseSalary: 9 });
    await repo.delete('room-1', 'id-1');
    expect(calls[0]).toEqual({ roomId: 'room-1', name: 'mcpapp.db.update', args: { collection: PAYROLL_COLLECTION, id: 'id-1', data: { baseSalary: 9, roomId: 'room-1' } } });
    expect(calls[1]).toEqual({ roomId: 'room-1', name: 'mcpapp.db.delete', args: { collection: PAYROLL_COLLECTION, id: 'id-1' } });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Viết interface**

`src/services/payroll/payroll-repository.ts`:
```ts
/**
 * Payroll persistence contract. The only layer allowed to know that records
 * live in this app's room-scoped App Database collection is the
 * implementation in `app-db-payroll-repository.ts`; tool handlers depend on
 * this interface so they can be unit-tested with an in-memory fake.
 */
export const PAYROLL_COLLECTION = 'hr_payroll_records';

export interface PayrollDocument {
	readonly _id?: string;
	readonly roomId: string;
	readonly employeeId: string;
	readonly baseSalary: number;
	readonly taxId?: string;
	readonly bankAccount?: string;
	readonly bankName?: string;
	readonly contractType?: string;
	readonly applyProbationRate?: boolean;
	readonly probationRate?: number;
	readonly _createdAt?: string;
	readonly _updatedAt?: string;
}

export type PayrollInput = Omit<PayrollDocument, '_id' | 'roomId' | '_createdAt' | '_updatedAt'>;

export interface IPayrollRepository {
	initializeSchema(roomId: string): Promise<void>;
	queryByRoom(roomId: string): Promise<readonly PayrollDocument[]>;
	create(roomId: string, data: PayrollInput): Promise<PayrollDocument>;
	update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void>;
	delete(roomId: string, id: string): Promise<void>;
}
```

- [ ] **Step 4: Viết implementation**

`src/services/payroll/app-db-payroll-repository.ts`:
```ts
import { createRoomHubToolCaller, type HubToolCaller } from '../hub-tool-caller';
import { PAYROLL_COLLECTION, type IPayrollRepository, type PayrollDocument, type PayrollInput } from './payroll-repository';

/** Schema is fixed here; `mcpapp.db.registerCollection` enforces it server-side on every write. */
const PAYROLL_FIELDS = [
	{ name: 'roomId', type: 'string', required: true, maxLength: 64 },
	{ name: 'employeeId', type: 'string', required: true, maxLength: 64 },
	{ name: 'baseSalary', type: 'number', required: true, min: 0 },
	{ name: 'taxId', type: 'string', maxLength: 32 },
	{ name: 'bankAccount', type: 'string', maxLength: 64 },
	{ name: 'bankName', type: 'string', maxLength: 128 },
	{ name: 'contractType', type: 'string', maxLength: 64 },
	{ name: 'applyProbationRate', type: 'boolean' },
	{ name: 'probationRate', type: 'number', min: 0, max: 100 },
] as const;

/** Index uses: queryByRoom (roomId prefix); uniqueness of one payroll row per employee per room. */
const PAYROLL_INDEXES = [{ fields: { roomId: 1, employeeId: 1 }, unique: true }] as const;

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class AppDbPayrollRepository implements IPayrollRepository {
	constructor(private readonly callerFactory: (roomId: string) => HubToolCaller = createRoomHubToolCaller) {}

	async initializeSchema(roomId: string): Promise<void> {
		try {
			await this.callerFactory(roomId)('mcpapp.db.registerCollection', {
				collection: PAYROLL_COLLECTION,
				scope: 'room',
				fields: PAYROLL_FIELDS,
				indexes: PAYROLL_INDEXES,
			});
		} catch (error) {
			// registerCollection is not idempotent on the Hub — re-running in the same room throws.
			const message = error instanceof Error ? error.message : String(error);
			if (!/already registered/i.test(message)) throw error;
		}
	}

	async queryByRoom(roomId: string): Promise<readonly PayrollDocument[]> {
		// Uses index { roomId: 1, employeeId: 1 } via its roomId prefix.
		const response = asRecord(await this.callerFactory(roomId)('mcpapp.db.query', {
			collection: PAYROLL_COLLECTION,
			where: [{ field: 'roomId', op: '==', value: roomId }],
			orderBy: [{ field: '_createdAt', direction: 'desc' }],
			limit: 1000,
		}));
		const records = Array.isArray(response.records) ? response.records : [];
		return records as PayrollDocument[];
	}

	async create(roomId: string, data: PayrollInput): Promise<PayrollDocument> {
		const { roomId: _ignored, ...safe } = data as PayrollInput & { roomId?: string };
		const created = await this.callerFactory(roomId)('mcpapp.db.create', {
			collection: PAYROLL_COLLECTION,
			data: { ...safe, roomId },
		});
		return asRecord(created) as unknown as PayrollDocument;
	}

	async update(roomId: string, id: string, data: Partial<PayrollInput>): Promise<void> {
		const { roomId: _ignored, ...safe } = data as Partial<PayrollInput> & { roomId?: string };
		await this.callerFactory(roomId)('mcpapp.db.update', {
			collection: PAYROLL_COLLECTION,
			id,
			data: { ...safe, roomId },
		});
	}

	async delete(roomId: string, id: string): Promise<void> {
		await this.callerFactory(roomId)('mcpapp.db.delete', { collection: PAYROLL_COLLECTION, id });
	}
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit (người dùng thực hiện)**

```bash
git add src/services/payroll tests/app-db-payroll-repository.spec.ts
git commit -m "feat(payroll): IPayrollRepository + AppDb implementation on mcpapp.db.*"
```

---

### Task 4: Tool `hrm.payroll.*` với actor/room guard

**Files:**
- Create: `src/payroll-tools.ts`
- Modify: `src/mcp-message-handlers.ts` (import + `tools/list` + `tools/call`)
- Modify: `privos-app.json` (`tools` array)
- Test: `tests/payroll-tools.spec.ts`

**Interfaces:**
- Consumes: `IPayrollRepository`, `PayrollInput`, `AppDbPayrollRepository` (Task 3); `VerifiedActor` từ `@privos_ai/app-server` (`{ userId, username?, roomId, claims, provenance }`).
- Produces:
  ```ts
  export const PAYROLL_TOOL_NAMES = ['hrm.payroll.query','hrm.payroll.create','hrm.payroll.update','hrm.payroll.delete'] as const;
  export const PAYROLL_TOOL_DEFINITIONS: readonly ToolDefinition[];   // đưa vào tools/list
  export function isPayrollTool(name: unknown): name is PayrollToolName;
  export function handlePayrollTool(name: PayrollToolName, args: unknown, actor: VerifiedActor | undefined): Promise<{ content: [{ type: 'text'; text: string }] }>;
  export function setPayrollToolDependencies(deps: { repository: IPayrollRepository }): void;  // test seam
  ```

- [ ] **Step 1: Viết test thất bại**

`tests/payroll-tools.spec.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedActor } from '@privos_ai/app-server';
import { handlePayrollTool, setPayrollToolDependencies } from '../src/payroll-tools';
import type { IPayrollRepository } from '../src/services/payroll/payroll-repository';

const actor: VerifiedActor = Object.freeze({ userId: 'u1', username: 'alice', roomId: 'room-1', claims: Object.freeze({}), provenance: 'user-token' });

function fakeRepo(): IPayrollRepository & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    initializeSchema: vi.fn(async (roomId) => { calls.push(['init', roomId]); }),
    queryByRoom: vi.fn(async (roomId) => { calls.push(['query', roomId]); return [{ roomId, employeeId: 'e1', baseSalary: 1 }]; }),
    create: vi.fn(async (roomId, data) => { calls.push(['create', roomId, data]); return { _id: 'n', roomId, ...data }; }),
    update: vi.fn(async (roomId, id, data) => { calls.push(['update', roomId, id, data]); }),
    delete: vi.fn(async (roomId, id) => { calls.push(['delete', roomId, id]); }),
  };
}

describe('hrm.payroll.* tools', () => {
  let repo: ReturnType<typeof fakeRepo>;
  beforeEach(() => { repo = fakeRepo(); setPayrollToolDependencies({ repository: repo }); });

  it('refuses every payroll tool without a verified actor', async () => {
    await expect(handlePayrollTool('hrm.payroll.query', {}, undefined)).rejects.toThrow('verified caller identity');
    expect(repo.calls).toEqual([]);
  });

  it('refuses a roomId that differs from the verified actor room', async () => {
    await expect(handlePayrollTool('hrm.payroll.query', { roomId: 'room-OTHER' }, actor)).rejects.toThrow('does not match');
    expect(repo.calls).toEqual([]);
  });

  it('query initializes the schema then reads the actor room', async () => {
    const result = await handlePayrollTool('hrm.payroll.query', { roomId: 'room-1' }, actor);
    expect(repo.calls).toEqual([['init', 'room-1'], ['query', 'room-1']]);
    expect(JSON.parse(result.content[0].text)).toEqual({ records: [{ roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }] });
  });

  it('create validates employeeId and baseSalary and strips unknown keys', async () => {
    await expect(handlePayrollTool('hrm.payroll.create', { data: { baseSalary: 1 } }, actor)).rejects.toThrow('employeeId is required');
    await expect(handlePayrollTool('hrm.payroll.create', { data: { employeeId: 'e1', baseSalary: -1 } }, actor)).rejects.toThrow('baseSalary must be a number >= 0');
    const ok = await handlePayrollTool('hrm.payroll.create', { data: { employeeId: 'e1', baseSalary: 10, taxId: 'T', roomId: 'room-EVIL', $where: 'x' } }, actor);
    expect(repo.calls).toEqual([['create', 'room-1', { employeeId: 'e1', baseSalary: 10, taxId: 'T' }]]);
    expect(JSON.parse(ok.content[0].text)._id).toBe('n');
  });

  it('update requires id and forwards a whitelisted partial', async () => {
    await expect(handlePayrollTool('hrm.payroll.update', { data: { baseSalary: 2 } }, actor)).rejects.toThrow('id is required');
    await handlePayrollTool('hrm.payroll.update', { id: 'x1', data: { baseSalary: 2, bankName: 'B', roomId: 'room-EVIL' } }, actor);
    expect(repo.calls).toEqual([['update', 'room-1', 'x1', { baseSalary: 2, bankName: 'B' }]]);
  });

  it('delete requires id', async () => {
    await expect(handlePayrollTool('hrm.payroll.delete', {}, actor)).rejects.toThrow('id is required');
    await handlePayrollTool('hrm.payroll.delete', { id: 'x1' }, actor);
    expect(repo.calls).toEqual([['delete', 'room-1', 'x1']]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run tests/payroll-tools.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Viết `src/payroll-tools.ts`**

```ts
/**
 * App-owned `hrm.payroll.*` tools. Authorization model:
 *   1. `actor` MUST be present — it is the SDK-verified caller (dispatch
 *      assertion or Hub-signed user token). Without it we fail closed.
 *   2. The room the repository is pointed at is ALWAYS `actor.roomId`. A
 *      caller-supplied `roomId` is accepted only when it equals it — it exists
 *      so the UI can express intent and get a loud mismatch instead of silent
 *      redirection.
 *   3. Every write payload is rebuilt from a field whitelist; `roomId`, `_id`,
 *      and any operator-looking key never reach the Hub.
 */
import type { VerifiedActor } from '@privos_ai/app-server';

import { AppDbPayrollRepository } from './services/payroll/app-db-payroll-repository';
import type { IPayrollRepository, PayrollInput } from './services/payroll/payroll-repository';

export const PAYROLL_TOOL_NAMES = ['hrm.payroll.query', 'hrm.payroll.create', 'hrm.payroll.update', 'hrm.payroll.delete'] as const;
export type PayrollToolName = (typeof PAYROLL_TOOL_NAMES)[number];

const PAYROLL_DATA_SCHEMA = {
	type: 'object',
	properties: {
		employeeId: { type: 'string' },
		baseSalary: { type: 'number' },
		taxId: { type: 'string' },
		bankAccount: { type: 'string' },
		bankName: { type: 'string' },
		contractType: { type: 'string' },
		applyProbationRate: { type: 'boolean' },
		probationRate: { type: 'number' },
	},
} as const;

export const PAYROLL_TOOL_DEFINITIONS = [
	{
		name: 'hrm.payroll.query',
		title: 'Query payroll records',
		description: 'List payroll records of the room the verified caller is in. Requires a Hub-verified actor.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' } } },
	},
	{
		name: 'hrm.payroll.create',
		title: 'Create payroll record',
		description: 'Create one payroll record in the verified caller room.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' }, data: PAYROLL_DATA_SCHEMA }, required: ['data'] },
	},
	{
		name: 'hrm.payroll.update',
		title: 'Update payroll record',
		description: 'Update one payroll record by id in the verified caller room.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' }, id: { type: 'string' }, data: PAYROLL_DATA_SCHEMA }, required: ['id', 'data'] },
	},
	{
		name: 'hrm.payroll.delete',
		title: 'Delete payroll record',
		description: 'Soft-delete one payroll record by id in the verified caller room.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' }, id: { type: 'string' } }, required: ['id'] },
	},
] as const;

export function isPayrollTool(name: unknown): name is PayrollToolName {
	return typeof name === 'string' && (PAYROLL_TOOL_NAMES as readonly string[]).includes(name);
}

let dependencies: { repository: IPayrollRepository } = { repository: new AppDbPayrollRepository() };

/** Test seam — production wiring is the default above. */
export function setPayrollToolDependencies(deps: { repository: IPayrollRepository }): void {
	dependencies = deps;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function wrap(payload: unknown): { content: [{ type: 'text'; text: string }] } {
	return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Resolve the ONLY room this call may touch: the verified actor's. */
export function resolveActorRoom(args: Record<string, unknown>, actor: VerifiedActor | undefined): string {
	if (!actor) throw new Error('This tool requires a verified caller identity (no Hub-verified actor on this request).');
	const requested = typeof args.roomId === 'string' ? args.roomId.trim() : '';
	if (requested && requested !== actor.roomId) {
		throw new Error(`roomId "${requested}" does not match the verified caller room.`);
	}
	return actor.roomId;
}

function optionalString(value: unknown, key: string, maxLength: number): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') throw new Error(`${key} must be a string`);
	if (value.length > maxLength) throw new Error(`${key} exceeds ${maxLength} characters`);
	return value;
}

function readPayrollInput(raw: unknown, partial: false): PayrollInput;
function readPayrollInput(raw: unknown, partial: true): Partial<PayrollInput>;
function readPayrollInput(raw: unknown, partial: boolean): PayrollInput | Partial<PayrollInput> {
	const data = asRecord(raw);
	const out: Record<string, unknown> = {};

	if (data.employeeId !== undefined || !partial) {
		if (typeof data.employeeId !== 'string' || !data.employeeId.trim()) throw new Error('employeeId is required');
		out.employeeId = data.employeeId.trim();
	}
	if (data.baseSalary !== undefined || !partial) {
		if (typeof data.baseSalary !== 'number' || !Number.isFinite(data.baseSalary) || data.baseSalary < 0) {
			throw new Error('baseSalary must be a number >= 0');
		}
		out.baseSalary = data.baseSalary;
	}
	for (const [key, max] of [['taxId', 32], ['bankAccount', 64], ['bankName', 128], ['contractType', 64]] as const) {
		const value = optionalString(data[key], key, max);
		if (value !== undefined) out[key] = value;
	}
	if (data.applyProbationRate !== undefined) {
		if (typeof data.applyProbationRate !== 'boolean') throw new Error('applyProbationRate must be a boolean');
		out.applyProbationRate = data.applyProbationRate;
	}
	if (data.probationRate !== undefined) {
		if (typeof data.probationRate !== 'number' || data.probationRate < 0 || data.probationRate > 100) {
			throw new Error('probationRate must be a number between 0 and 100');
		}
		out.probationRate = data.probationRate;
	}
	return out as PayrollInput;
}

function requireId(args: Record<string, unknown>): string {
	const id = typeof args.id === 'string' ? args.id.trim() : '';
	if (!id) throw new Error('id is required');
	return id;
}

export async function handlePayrollTool(name: PayrollToolName, rawArgs: unknown, actor: VerifiedActor | undefined) {
	const args = asRecord(rawArgs);
	const roomId = resolveActorRoom(args, actor);
	const { repository } = dependencies;

	switch (name) {
		case 'hrm.payroll.query': {
			await repository.initializeSchema(roomId);
			return wrap({ records: await repository.queryByRoom(roomId) });
		}
		case 'hrm.payroll.create': {
			const input = readPayrollInput(args.data, false);
			return wrap(await repository.create(roomId, input));
		}
		case 'hrm.payroll.update': {
			const id = requireId(args);
			const input = readPayrollInput(args.data, true);
			await repository.update(roomId, id, input);
			return wrap({ id, updated: true });
		}
		case 'hrm.payroll.delete': {
			const id = requireId(args);
			await repository.delete(roomId, id);
			return wrap({ id, deleted: true });
		}
	}
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/payroll-tools.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Cắm vào `src/mcp-message-handlers.ts`**

Thêm import sau dòng `import { handleAppDbStoreTool } from './app-db-demo-tool';`:
```ts
import { PAYROLL_TOOL_DEFINITIONS, handlePayrollTool, isPayrollTool } from './payroll-tools';
```
Trong `case 'tools/list'`, thay `...APP_PLATFORM_TOOL_DEFINITIONS,` bằng:
```ts
...APP_PLATFORM_TOOL_DEFINITIONS,
...PAYROLL_TOOL_DEFINITIONS,
```
Trong `case 'tools/call'`, chèn **trước** dòng `if (params?.name !== TOOL_NAME) {`:
```ts
if (isPayrollTool(params?.name)) {
	return handlePayrollTool(params.name, params?.arguments, actor);
}
```

- [ ] **Step 6: Khai tool trong `privos-app.json`**

Thêm 4 object vào cuối mảng `"tools"` (sau `hr_agent_bot_credential_check`):
```json
{
  "name": "hrm.payroll.query",
  "title": "Query payroll records",
  "description": "List payroll records of the room the verified caller is in. Requires a Hub-verified actor.",
  "inputSchema": { "type": "object", "properties": { "roomId": { "type": "string" } } }
},
{
  "name": "hrm.payroll.create",
  "title": "Create payroll record",
  "description": "Create one payroll record in the verified caller room.",
  "inputSchema": { "type": "object", "properties": { "roomId": { "type": "string" }, "data": { "type": "object" } }, "required": ["data"] }
},
{
  "name": "hrm.payroll.update",
  "title": "Update payroll record",
  "description": "Update one payroll record by id in the verified caller room.",
  "inputSchema": { "type": "object", "properties": { "roomId": { "type": "string" }, "id": { "type": "string" }, "data": { "type": "object" } }, "required": ["id", "data"] }
},
{
  "name": "hrm.payroll.delete",
  "title": "Delete payroll record",
  "description": "Soft-delete one payroll record by id in the verified caller room.",
  "inputSchema": { "type": "object", "properties": { "roomId": { "type": "string" }, "id": { "type": "string" } }, "required": ["id"] }
}
```

- [ ] **Step 7: Thêm assertion vào `tests/mcp.spec.ts`**

Trong test `'initializes and lists tools'`, thêm sau dòng `expect(...).toContain('hr_app_db_store');`:
```ts
expect(listed.tools.map((tool: any) => tool.name)).toContain('hrm.payroll.query');
```
Thêm test mới ngay sau test đó:
```ts
it('fails closed on hrm.payroll.* without a verified actor', async () => {
  const rejected = await handleMcpMessage('tools/call', 30, { name: 'hrm.payroll.query', arguments: { roomId: 'room-1' } }).catch((e: Error) => e);
  expect(rejected).toBeInstanceOf(Error);
  expect((rejected as Error).message).toContain('verified caller identity');
});
```

- [ ] **Step 8: Chạy toàn bộ test + lint manifest**

Run: `npx vitest run && npm run manifest:lint && npm run typecheck:strict-unused`
Expected: tất cả PASS; lint `"valid": true`.

- [ ] **Step 9: Commit (người dùng thực hiện)**

```bash
git add src/payroll-tools.ts src/mcp-message-handlers.ts privos-app.json tests/payroll-tools.spec.ts tests/mcp.spec.ts
git commit -m "feat(payroll): hrm.payroll.* tools pinned to the verified actor room"
```

---

### Task 5: Port email-history model + repository (server)

**Files:**
- Create: `src/services/mail/email-history-model.ts` (copy nguyên văn từ `hr-miniapp/src/email-history/email-history-model.ts`)
- Create: `src/services/mail/email-history-repository.ts` (port có sửa)
- Test: `tests/email-history-model.spec.ts`, `tests/email-history-repository.spec.ts`

**Interfaces:**
- Consumes: `HubToolCaller` (Task 2).
- Produces (giữ nguyên tên từ nguồn): `EMAIL_HISTORY_LIST_NAME`, `EMAIL_HISTORY_STAGES`, `EMAIL_HISTORY_FIELD_IDS`, `EmailHistoryRecord`, `StoredEmailPayload`, `EmailSource`, `parseEmailHistoryItem`, `filterEmailHistory`, `canRetryEmail`, `canDeleteEmail`; `class EmailHistoryRepository { constructor(callTool: HubToolCaller, deps?: { now?: () => string; createRecordId?: () => string }); ensureStore(roomId); createResult(roomId, payload, status, error?, requestedBy?); markSent(roomId, itemId); markFailed(roomId, itemId, error); prepareRetry(roomId, itemId); getRecord(roomId, itemId) }`.

- [ ] **Step 1: Copy model**

```bash
mkdir -p src/services/mail
cp ../hr-miniapp/src/email-history/email-history-model.ts src/services/mail/email-history-model.ts
```
Không sửa gì — file là pure TypeScript, không import.

- [ ] **Step 2: Viết test model (thất bại vì chưa có file test → pass ngay sau khi viết; mục đích: khoá hành vi trước khi UI dùng)**

`tests/email-history-model.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { filterEmailHistory, parseEmailHistoryItem, type EmailHistoryRecord } from '../src/services/mail/email-history-model';

const stages = { interviewSent: 's1', interviewFailed: 's2', employeeSent: 's3', employeeFailed: 's4' };
const item = (overrides: Record<string, unknown> = {}) => ({
  _id: 'i1', listId: 'l1', stageId: 's1',
  customFields: [
    { fieldId: 'source', value: 'cv_scored' }, { fieldId: 'recipient_name', value: 'A' },
    { fieldId: 'recipient_email', value: 'a@x.vn' }, { fieldId: 'subject', value: 'Hi' },
    { fieldId: 'html_content', value: '<p>x</p>' }, { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' },
    { fieldId: 'updated_at', value: '2026-09-02T00:00:00Z' }, { fieldId: 'attempt_count', value: 2 },
  ],
  ...overrides,
});

describe('parseEmailHistoryItem', () => {
  it('maps stage → status/source and custom fields → record', () => {
    const record = parseEmailHistoryItem(item(), stages)!;
    expect(record).toMatchObject({ id: 'i1', status: 'sent', source: 'cv_scored', recipientEmail: 'a@x.vn', attemptCount: 2 });
  });
  it('returns null when source field disagrees with the stage', () => {
    expect(parseEmailHistoryItem(item({ stageId: 's3' }), stages)).toBeNull();
  });
  it('returns null on unknown stage or missing required field', () => {
    expect(parseEmailHistoryItem(item({ stageId: 'zzz' }), stages)).toBeNull();
    expect(parseEmailHistoryItem(item({ customFields: [] }), stages)).toBeNull();
  });
});

describe('filterEmailHistory', () => {
  const rec = (o: Partial<EmailHistoryRecord>): EmailHistoryRecord => ({
    id: 'x', listId: 'l', stageId: 's', status: 'sent', source: 'cv_scored', recipientName: 'Nguyễn Văn Á', recipientEmail: 'a@x.vn',
    subject: 'Mời phỏng vấn', htmlContent: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', attemptCount: 1, ...o,
  });
  it('matches Vietnamese text without diacritics', () => {
    expect(filterEmailHistory([rec({})], 'all', 'nguyen van a')).toHaveLength(1);
  });
  it('filters by status, source and date range', () => {
    const rows = [rec({ id: '1', status: 'failed' }), rec({ id: '2', source: 'lifecycle' })];
    expect(filterEmailHistory(rows, 'failed', '').map((r) => r.id)).toEqual(['1']);
    expect(filterEmailHistory(rows, 'all', '', { from: '', to: '' }, 'lifecycle').map((r) => r.id)).toEqual(['2']);
    expect(filterEmailHistory(rows, 'all', '', { from: '2026-09-03', to: '' })).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Chạy test model**

Run: `npx vitest run tests/email-history-model.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Viết test repository (thất bại)**

`tests/email-history-repository.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { EmailHistoryRepository } from '../src/services/mail/email-history-repository';
import { EMAIL_HISTORY_LIST_NAME, EMAIL_HISTORY_STAGES } from '../src/services/mail/email-history-model';

const stageList = Object.values(EMAIL_HISTORY_STAGES).map((name, i) => ({ _id: `st${i}`, name }));
const payload = { source: 'cv_scored' as const, recipientName: 'A', recipientEmail: 'a@x.vn', subject: 'Hi', htmlContent: '<p>x</p>' };

function fakeHub(existingList: boolean) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    calls.push([name, args]);
    switch (name) {
      case 'mcpapp.lists.getAll': return existingList ? [{ _id: 'L1', name: EMAIL_HISTORY_LIST_NAME, stages: stageList }] : [];
      case 'mcpapp.lists.create': return { list: { _id: 'L1', stages: stageList } };
      case 'mcpapp.lists.createItem': return { item: { _id: 'I1' } };
      case 'mcpapp.lists.getItem': return {
        _id: 'I1', listId: 'L1', stageId: 'st1',
        customFields: [
          { fieldId: 'email_record_id', value: 'rec-1' }, { fieldId: 'source', value: 'cv_scored' }, { fieldId: 'recipient_name', value: 'A' },
          { fieldId: 'recipient_email', value: 'a@x.vn' }, { fieldId: 'subject', value: 'Hi' }, { fieldId: 'html_content', value: '<p>x</p>' },
          { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' }, { fieldId: 'updated_at', value: '2026-09-01T00:00:00Z' }, { fieldId: 'attempt_count', value: 1 },
        ],
      };
      default: return {};
    }
  };
  return { call, calls };
}

describe('EmailHistoryRepository', () => {
  it('creates the list on first use, then creates the item in the sent stage', async () => {
    const hub = fakeHub(false);
    const repo = new EmailHistoryRepository(hub.call, { now: () => '2026-09-08T00:00:00Z', createRecordId: () => 'rec-1' });
    const record = await repo.createResult('room-1', payload, 'sent', undefined, 'u1');
    expect(record.id).toBe('I1');
    expect(record.stageId).toBe('st0');
    expect(hub.calls.map(([n]) => n)).toEqual(['mcpapp.lists.getAll', 'mcpapp.lists.create', 'mcpapp.lists.createItem']);
    expect(hub.calls[2][1]).toMatchObject({ listId: 'L1', stageId: 'st0', title: 'Hi' });
  });

  it('reuses an existing list and caches the store per room', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call);
    await repo.ensureStore('room-1');
    await repo.ensureStore('room-1');
    expect(hub.calls.filter(([n]) => n === 'mcpapp.lists.getAll')).toHaveLength(1);
  });

  it('getRecord fetches ONE item by id instead of scanning the list', async () => {
    const hub = fakeHub(true);
    const record = await new EmailHistoryRepository(hub.call).getRecord('room-1', 'I1');
    expect(record.status).toBe('failed');
    expect(hub.calls.some(([n]) => n === 'mcpapp.lists.getItems')).toBe(false);
    expect(hub.calls.find(([n]) => n === 'mcpapp.lists.getItem')![1]).toEqual({ itemId: 'I1' });
  });

  it('prepareRetry refuses a record that is not failed', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call);
    // stageId st1 = interviewFailed in fakeHub → allowed
    await expect(repo.prepareRetry('room-1', 'I1')).resolves.toMatchObject({ payload: { recipientEmail: 'a@x.vn' } });
  });

  it('markSent moves stage and bumps attemptCount', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call, { now: () => '2026-09-09T00:00:00Z' });
    const updated = await repo.markSent('room-1', 'I1');
    expect(updated.status).toBe('sent');
    expect(updated.attemptCount).toBe(2);
    expect(hub.calls.map(([n]) => n)).toContain('mcpapp.lists.moveItemToStage');
    expect(hub.calls.map(([n]) => n)).toContain('mcpapp.lists.updateItem');
  });
});
```

- [ ] **Step 5: Chạy test repository, xác nhận thất bại**

Run: `npx vitest run tests/email-history-repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Port repository**

```bash
cp ../hr-miniapp/src/services/EmailHistoryRepository.ts src/services/mail/email-history-repository.ts
```
Rồi sửa trong `src/services/mail/email-history-repository.ts`:

1. Import đầu file: `'../email-history/email-history-model'` → `'./email-history-model'`.
2. Thay dòng `export type HubToolCaller = (name: string, args?: unknown) => Promise<unknown>;` bằng:
   ```ts
   import type { HubToolCaller } from '../hub-tool-caller';
   ```
3. Đổi mọi `'privos.` → `'mcpapp.` (6 chỗ: `lists.createItem`, `lists.moveItemToStage` ×2, `lists.getItems` ×2, `lists.getAll`, `stages.getByList`, `lists.create`, `lists.updateItem`).
4. Trong `createResult`, **xoá** khối gọi `moveItemToStage` thừa ngay sau `createItem` (item đã được tạo với `stageId` đúng):
   ```ts
   await this.callTool('privos.lists.moveItemToStage', { itemId, stageId });
   ```
5. Thay toàn bộ thân `getRecord` bằng:
   ```ts
   async getRecord(roomId: string, itemId: string): Promise<EmailHistoryRecord> {
   	const store = await this.ensureStore(roomId);
   	const item = await this.getRawRecordItem(store.listId, itemId);
   	const record = parseEmailHistoryItem({ ...item, listId: store.listId }, store.stageIds);
   	if (!record) throw new Error('Dữ liệu lịch sử email không hợp lệ.');
   	return record;
   }
   ```
6. Thay toàn bộ thân `getRawRecordItem` bằng:
   ```ts
   private async getRawRecordItem(listId: string, itemId: string): Promise<any> {
   	const response = parseToolResponse(await this.callTool('mcpapp.lists.getItem', { itemId }));
   	const item = response?.item || response;
   	const id = item?._id || item?.id;
   	if (!id || (item.listId && item.listId !== listId)) throw new Error('Không tìm thấy email trong Room hiện tại.');
   	return item;
   }
   ```
7. `callTool` giờ có kiểu `HubToolCaller` nhận `Record<string, unknown>`; các lời gọi hiện tại đều truyền object literal nên không cần đổi.

- [ ] **Step 7: Chạy test, xác nhận pass**

Run: `npx vitest run tests/email-history-repository.spec.ts tests/email-history-model.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 8: Commit (người dùng thực hiện)**

```bash
git add src/services/mail/email-history-model.ts src/services/mail/email-history-repository.ts tests/email-history-model.spec.ts tests/email-history-repository.spec.ts
git commit -m "feat(mail): port email history model + repository onto mcpapp.lists.* with single-item reads"
```

---

### Task 6: `MailRelayService` (EmailJS server-side) + `TrackedMailService` + sanitizer

**Files:**
- Create: `src/services/mail/task-queue.ts` (copy nguyên văn `hr-miniapp/src/utils/TaskQueue.ts`)
- Create: `src/services/mail/mail-relay-service.ts`
- Create: `src/services/mail/html-sanitizer.ts`
- Create: `src/services/mail/tracked-mail-service.ts` (port)
- Test: `tests/mail-relay-service.spec.ts`, `tests/html-sanitizer.spec.ts`, `tests/tracked-mail-service.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // mail-relay-service.ts
  export interface SendMailParams { toName: string; toEmail: string; subject: string; htmlContent: string }
  export interface MailRelayEnv { serviceId?: string; templateId?: string; publicKey?: string; privateKey?: string }
  export function readMailRelayEnv(env?: NodeJS.ProcessEnv): MailRelayEnv;
  export class MailRelayService { constructor(opts?: { env?: MailRelayEnv; fetchImpl?: typeof fetch; delayMs?: number }); queueMail(params: SendMailParams): Promise<void> }
  // html-sanitizer.ts
  export function sanitizeEmailHtml(html: string): string;
  // tracked-mail-service.ts — giữ nguyên tên từ nguồn
  export interface EmailHistoryGateway {...}; export interface MailDeliveryGateway { queueMail(params: SendMailParams): Promise<void> }
  export class TrackedMailService { constructor(history: EmailHistoryGateway, delivery: MailDeliveryGateway); send(req): Promise<EmailHistoryRecord>; retry(roomId, itemId): Promise<EmailHistoryRecord> }
  ```

- [ ] **Step 1: Copy TaskQueue**

```bash
cp ../hr-miniapp/src/utils/TaskQueue.ts src/services/mail/task-queue.ts
```
Không sửa.

- [ ] **Step 2: Viết test sanitizer (thất bại)**

`tests/html-sanitizer.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../src/services/mail/html-sanitizer';

describe('sanitizeEmailHtml', () => {
  it('strips script/style/iframe/object blocks and event handlers', () => {
    const dirty = '<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="a"></iframe><style>*{}</style>';
    expect(sanitizeEmailHtml(dirty)).toBe('<p>Hi</p>');
  });
  it('neutralises javascript: and data: URLs in href/src', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeEmailHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img src="#">');
  });
  it('keeps ordinary formatting untouched', () => {
    const clean = '<p>Xin chào <b>Nguyễn</b>,<br/>Mời bạn <a href="https://x.vn">tại đây</a>.</p>';
    expect(sanitizeEmailHtml(clean)).toBe(clean);
  });
});
```

- [ ] **Step 3: Viết sanitizer**

`src/services/mail/html-sanitizer.ts`:
```ts
/**
 * Minimal allow-nothing-dangerous sanitizer for outbound email HTML. The
 * content is authored inside the app (templates + user text turned into
 * <br/>), so the goal is to strip active content, not to validate markup.
 */
const BLOCK_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form'];

export function sanitizeEmailHtml(html: string): string {
	let out = html;
	for (const tag of BLOCK_TAGS) {
		out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
		out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
	}
	// on*="..." / on*='...' / on*=bare
	out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
	// javascript: / data: / vbscript: in href/src
	out = out.replace(/\b(href|src)\s*=\s*(["']?)\s*(javascript|data|vbscript):[^"'\s>]*\2/gi, '$1=$2#$2');
	return out;
}
```

- [ ] **Step 4: Chạy test sanitizer**

Run: `npx vitest run tests/html-sanitizer.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Viết test MailRelayService (thất bại)**

`tests/mail-relay-service.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { MailRelayService, readMailRelayEnv } from '../src/services/mail/mail-relay-service';

const fullEnv = { serviceId: 'svc', templateId: 'tpl', publicKey: 'pub', privateKey: 'priv' };
const params = { toName: 'A', toEmail: 'a@x.vn', subject: 'Hi', htmlContent: '<p>x</p>' };

describe('readMailRelayEnv', () => {
  it('reads the four EMAILJS_* variables', () => {
    expect(readMailRelayEnv({ EMAILJS_SERVICE_ID: 'a', EMAILJS_TEMPLATE_ID: 'b', EMAILJS_PUBLIC_KEY: 'c', EMAILJS_PRIVATE_KEY: 'd' } as NodeJS.ProcessEnv))
      .toEqual({ serviceId: 'a', templateId: 'b', publicKey: 'c', privateKey: 'd' });
  });
});

describe('MailRelayService', () => {
  it('fails before any network call when a variable is missing', async () => {
    const fetchImpl = vi.fn();
    const svc = new MailRelayService({ env: { ...fullEnv, privateKey: undefined }, fetchImpl: fetchImpl as any, delayMs: 0 });
    await expect(svc.queueMail(params)).rejects.toThrow('EMAILJS_PRIVATE_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the EmailJS payload with accessToken and never logs the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => 'OK' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as any, delayMs: 0 });
    await svc.queueMail(params);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.emailjs.com/api/v1.0/email/send');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      service_id: 'svc', template_id: 'tpl', user_id: 'pub', accessToken: 'priv',
      template_params: { name: 'A', to_name: 'A', to_email: 'a@x.vn', subject: 'Hi', message: '<p>x</p>' },
    });
  });

  it('surfaces a non-OK response as an error without the response body verbatim', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'accessToken=priv is invalid' });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as any, delayMs: 0 });
    await expect(svc.queueMail(params)).rejects.toThrow('EmailJS rejected the message (403)');
  });

  it('sends sequentially through the queue', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => { order.push(JSON.parse(init.body as string).template_params.subject); return { ok: true, text: async () => '' }; });
    const svc = new MailRelayService({ env: fullEnv, fetchImpl: fetchImpl as any, delayMs: 0 });
    await Promise.all([svc.queueMail({ ...params, subject: '1' }), svc.queueMail({ ...params, subject: '2' })]);
    expect(order).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 6: Viết MailRelayService**

`src/services/mail/mail-relay-service.ts`:
```ts
/**
 * Server-side EmailJS relay. EmailJS's REST API only accepts non-browser
 * callers that present the account's private key as `accessToken`, so all
 * four variables are mandatory. Values come from the app's declared secret
 * env (`privos-app.json` → `env`), never from the UI.
 */
import { TaskQueue } from './task-queue';

export interface SendMailParams {
	toName: string;
	toEmail: string;
	subject: string;
	htmlContent: string;
}

export interface MailRelayEnv {
	serviceId?: string;
	templateId?: string;
	publicKey?: string;
	privateKey?: string;
}

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

export function readMailRelayEnv(env: NodeJS.ProcessEnv = process.env): MailRelayEnv {
	return {
		serviceId: env.EMAILJS_SERVICE_ID,
		templateId: env.EMAILJS_TEMPLATE_ID,
		publicKey: env.EMAILJS_PUBLIC_KEY,
		privateKey: env.EMAILJS_PRIVATE_KEY,
	};
}

function requireEnv(env: MailRelayEnv): Required<MailRelayEnv> {
	const missing = (
		[
			['serviceId', 'EMAILJS_SERVICE_ID'],
			['templateId', 'EMAILJS_TEMPLATE_ID'],
			['publicKey', 'EMAILJS_PUBLIC_KEY'],
			['privateKey', 'EMAILJS_PRIVATE_KEY'],
		] as const
	).filter(([key]) => !env[key]).map(([, name]) => name);
	if (missing.length) throw new Error(`Mail relay is not configured: missing ${missing.join(', ')}`);
	return env as Required<MailRelayEnv>;
}

export class MailRelayService {
	private readonly queue: TaskQueue;
	private readonly env: MailRelayEnv;
	private readonly fetchImpl: typeof fetch;

	constructor(opts: { env?: MailRelayEnv; fetchImpl?: typeof fetch; delayMs?: number } = {}) {
		this.env = opts.env ?? readMailRelayEnv();
		this.fetchImpl = opts.fetchImpl ?? fetch;
		// 1.5s between sends keeps the account under EmailJS's rate limit.
		this.queue = new TaskQueue({ delayMs: opts.delayMs ?? 1500 });
	}

	queueMail(params: SendMailParams): Promise<void> {
		return this.queue.enqueue(() => this.send(params));
	}

	private async send(params: SendMailParams): Promise<void> {
		const env = requireEnv(this.env);
		const response = await this.fetchImpl(EMAILJS_SEND_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				service_id: env.serviceId,
				template_id: env.templateId,
				user_id: env.publicKey,
				accessToken: env.privateKey,
				template_params: {
					name: params.toName,
					to_name: params.toName,
					to_email: params.toEmail,
					subject: params.subject,
					message: params.htmlContent,
				},
			}),
		});
		if (!response.ok) {
			// The body may echo request fields (incl. accessToken) — keep it out of the error.
			await response.text().catch(() => '');
			throw new Error(`EmailJS rejected the message (${response.status})`);
		}
	}
}
```

- [ ] **Step 7: Chạy test relay**

Run: `npx vitest run tests/mail-relay-service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Port TrackedMailService + viết test**

```bash
cp ../hr-miniapp/src/services/TrackedMailService.ts src/services/mail/tracked-mail-service.ts
```
Sửa 2 import đầu file:
```ts
import type { EmailHistoryRecord, StoredEmailPayload } from './email-history-model';
import type { SendMailParams } from './mail-relay-service';
```
Không sửa gì khác.

`tests/tracked-mail-service.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { TrackedMailService } from '../src/services/mail/tracked-mail-service';

const payload = { source: 'lifecycle' as const, recipientName: 'A', recipientEmail: 'a@x.vn', subject: 'S', htmlContent: '<p>x</p>' };
const record = { id: 'I1', listId: 'L', stageId: 's', status: 'failed' as const, createdAt: '', updatedAt: '', attemptCount: 1, ...payload };

function history() {
  return {
    createResult: vi.fn(async (_r, _p, status) => ({ ...record, status })),
    markSent: vi.fn(async () => ({ ...record, status: 'sent' as const })),
    markFailed: vi.fn(async () => record),
    prepareRetry: vi.fn(async () => ({ record, payload })),
  };
}

describe('TrackedMailService', () => {
  it('records a failed attempt when delivery throws, then rethrows', async () => {
    const h = history();
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockRejectedValue(new Error('smtp down')) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).rejects.toThrow('smtp down');
    expect(h.createResult).toHaveBeenCalledWith('r', payload, 'failed', expect.any(Error), 'u1');
  });

  it('records a sent result on success', async () => {
    const h = history();
    const svc = new TrackedMailService(h, { queueMail: vi.fn().mockResolvedValue(undefined) });
    await expect(svc.send({ roomId: 'r', requestedBy: 'u1', ...payload })).resolves.toMatchObject({ status: 'sent' });
  });

  it('retry: blocks a concurrent retry of the same item', async () => {
    const h = history();
    let release!: () => void;
    const delivery = { queueMail: vi.fn(() => new Promise<void>((res) => { release = res; })) };
    const svc = new TrackedMailService(h, delivery);
    const first = svc.retry('r', 'I1');
    await expect(svc.retry('r', 'I1')).rejects.toThrow('đang được gửi lại');
    release();
    await expect(first).resolves.toMatchObject({ status: 'sent' });
  });
});
```

- [ ] **Step 9: Chạy test tracked**

Run: `npx vitest run tests/tracked-mail-service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit (người dùng thực hiện)**

```bash
git add src/services/mail tests/mail-relay-service.spec.ts tests/html-sanitizer.spec.ts tests/tracked-mail-service.spec.ts
git commit -m "feat(mail): server-side EmailJS relay, sanitizer, tracked mail service"
```

---

### Task 7: Tool `hrm.mail.send` / `hrm.mail.retry` với actor guard

**Files:**
- Create: `src/mail-tools.ts`
- Modify: `src/mcp-message-handlers.ts`
- Modify: `privos-app.json` (`tools`, `env`)
- Test: `tests/mail-tools.spec.ts`

**Interfaces:**
- Consumes: `resolveActorRoom(args, actor)` (Task 4, export từ `src/payroll-tools.ts`), `TrackedMailService`, `EmailHistoryRepository`, `MailRelayService`, `createRoomHubToolCaller`, `sanitizeEmailHtml`.
- Produces:
  ```ts
  export const MAIL_TOOL_NAMES = ['hrm.mail.send', 'hrm.mail.retry'] as const;
  export const MAIL_TOOL_DEFINITIONS: readonly ToolDefinition[];
  export function isMailTool(name: unknown): name is MailToolName;
  export function handleMailTool(name: MailToolName, args: unknown, actor: VerifiedActor | undefined): Promise<{ content: [{ type: 'text'; text: string }] }>;
  export function setMailToolDependencies(deps: { createTrackedMail: (roomId: string) => Pick<TrackedMailService, 'send' | 'retry'> }): void;
  ```

- [ ] **Step 1: Viết test thất bại**

`tests/mail-tools.spec.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedActor } from '@privos_ai/app-server';
import { handleMailTool, setMailToolDependencies } from '../src/mail-tools';

const actor: VerifiedActor = Object.freeze({ userId: 'u1', username: 'alice', roomId: 'room-1', claims: Object.freeze({}), provenance: 'user-token' });
const base = { toName: 'A', toEmail: 'a@x.vn', subject: 'Hi', htmlContent: '<p>x</p><script>1</script>', source: 'cv_scored', roomId: 'room-1', cvItemId: 'c1', cvListId: 'l1' };

describe('hrm.mail.* tools', () => {
  let send: ReturnType<typeof vi.fn>;
  let retry: ReturnType<typeof vi.fn>;
  let seenRoom: string | undefined;
  beforeEach(() => {
    send = vi.fn(async () => ({ id: 'I1', status: 'sent' }));
    retry = vi.fn(async () => ({ id: 'I1', status: 'sent' }));
    seenRoom = undefined;
    setMailToolDependencies({ createTrackedMail: (roomId) => { seenRoom = roomId; return { send, retry } as any; } });
  });

  it('fails closed without a verified actor', async () => {
    await expect(handleMailTool('hrm.mail.send', base, undefined)).rejects.toThrow('verified caller identity');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a mismatched roomId', async () => {
    await expect(handleMailTool('hrm.mail.send', { ...base, roomId: 'room-2' }, actor)).rejects.toThrow('does not match');
  });

  it('validates recipient, subject, source and size', async () => {
    await expect(handleMailTool('hrm.mail.send', { ...base, toEmail: 'nope' }, actor)).rejects.toThrow('Recipient email is invalid');
    await expect(handleMailTool('hrm.mail.send', { ...base, subject: '' }, actor)).rejects.toThrow('subject is required');
    await expect(handleMailTool('hrm.mail.send', { ...base, source: 'other' }, actor)).rejects.toThrow('source must be');
    await expect(handleMailTool('hrm.mail.send', { ...base, htmlContent: 'x'.repeat(200_001) }, actor)).rejects.toThrow('htmlContent exceeds');
  });

  it('sends with sanitized html, actor room, and requestedBy = actor.userId (caller value ignored)', async () => {
    const result = await handleMailTool('hrm.mail.send', { ...base, requestedBy: 'spoofed' }, actor);
    expect(seenRoom).toBe('room-1');
    expect(send).toHaveBeenCalledWith({
      roomId: 'room-1', source: 'cv_scored', recipientName: 'A', recipientEmail: 'a@x.vn', subject: 'Hi',
      htmlContent: '<p>x</p>', cvItemId: 'c1', cvListId: 'l1', jdName: undefined, requestedBy: 'u1',
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ itemId: 'I1', status: 'sent' });
  });

  it('retry requires itemId and uses the actor room', async () => {
    await expect(handleMailTool('hrm.mail.retry', {}, actor)).rejects.toThrow('itemId is required');
    await handleMailTool('hrm.mail.retry', { itemId: 'I1', roomId: 'room-1' }, actor);
    expect(retry).toHaveBeenCalledWith('room-1', 'I1');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `npx vitest run tests/mail-tools.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Viết `src/mail-tools.ts`**

```ts
/**
 * App-owned `hrm.mail.*` tools. Same authorization posture as payroll-tools:
 * verified actor required, room pinned to `actor.roomId`, `requestedBy` is
 * the verified user id (a caller-supplied value is discarded), HTML is
 * sanitized before it reaches the relay or the history list.
 */
import type { VerifiedActor } from '@privos_ai/app-server';

import { resolveActorRoom } from './payroll-tools';
import { createRoomHubToolCaller } from './services/hub-tool-caller';
import { EmailHistoryRepository } from './services/mail/email-history-repository';
import { sanitizeEmailHtml } from './services/mail/html-sanitizer';
import { MailRelayService } from './services/mail/mail-relay-service';
import { TrackedMailService } from './services/mail/tracked-mail-service';

export const MAIL_TOOL_NAMES = ['hrm.mail.send', 'hrm.mail.retry'] as const;
export type MailToolName = (typeof MAIL_TOOL_NAMES)[number];

export const MAIL_TOOL_DEFINITIONS = [
	{
		name: 'hrm.mail.send',
		title: 'Send HR email',
		description: 'Send one email through the HR relay and record it in the room email history. Requires a Hub-verified actor.',
		inputSchema: {
			type: 'object',
			properties: {
				roomId: { type: 'string' },
				source: { type: 'string', enum: ['cv_scored', 'lifecycle'] },
				toName: { type: 'string' },
				toEmail: { type: 'string' },
				subject: { type: 'string' },
				htmlContent: { type: 'string' },
				cvItemId: { type: 'string' },
				cvListId: { type: 'string' },
				jdName: { type: 'string' },
			},
			required: ['source', 'toName', 'toEmail', 'subject', 'htmlContent'],
		},
	},
	{
		name: 'hrm.mail.retry',
		title: 'Retry a failed HR email',
		description: 'Re-send a failed email from the room history using its stored recipient and content.',
		inputSchema: { type: 'object', properties: { roomId: { type: 'string' }, itemId: { type: 'string' } }, required: ['itemId'] },
	},
] as const;

export function isMailTool(name: unknown): name is MailToolName {
	return typeof name === 'string' && (MAIL_TOOL_NAMES as readonly string[]).includes(name);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 500;
const MAX_HTML = 200_000;

// One relay (one queue) per process — the rate limit is per EmailJS account, not per room.
const relay = new MailRelayService();
const history = new EmailHistoryRepository(async () => {
	throw new Error('EmailHistoryRepository must be created per room');
});
void history;

type TrackedMail = Pick<TrackedMailService, 'send' | 'retry'>;
let dependencies: { createTrackedMail: (roomId: string) => TrackedMail } = {
	createTrackedMail: (roomId) => new TrackedMailService(new EmailHistoryRepository(createRoomHubToolCaller(roomId)), relay),
};

/** Test seam. */
export function setMailToolDependencies(deps: { createTrackedMail: (roomId: string) => TrackedMail }): void {
	dependencies = deps;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requireString(args: Record<string, unknown>, key: string, max: number): string {
	const value = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
	if (!value) throw new Error(`${key} is required`);
	if (value.length > max) throw new Error(`${key} exceeds ${max} characters`);
	return value;
}

function optionalString(args: Record<string, unknown>, key: string, max = 256): string | undefined {
	const value = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
	if (!value) return undefined;
	if (value.length > max) throw new Error(`${key} exceeds ${max} characters`);
	return value;
}

export async function handleMailTool(name: MailToolName, rawArgs: unknown, actor: VerifiedActor | undefined) {
	const args = asRecord(rawArgs);
	const roomId = resolveActorRoom(args, actor);
	const tracked = dependencies.createTrackedMail(roomId);

	if (name === 'hrm.mail.retry') {
		const itemId = requireString(args, 'itemId', 128);
		const record = await tracked.retry(roomId, itemId);
		return { content: [{ type: 'text' as const, text: JSON.stringify({ itemId: record.id, status: record.status }) }] };
	}

	const source = args.source;
	if (source !== 'cv_scored' && source !== 'lifecycle') throw new Error("source must be 'cv_scored' or 'lifecycle'");
	const toEmail = requireString(args, 'toEmail', 320);
	if (!EMAIL_REGEX.test(toEmail)) throw new Error('Recipient email is invalid');
	const rawHtml = typeof args.htmlContent === 'string' ? args.htmlContent : '';
	if (!rawHtml.trim()) throw new Error('htmlContent is required');
	if (rawHtml.length > MAX_HTML) throw new Error(`htmlContent exceeds ${MAX_HTML} characters`);

	const record = await tracked.send({
		roomId,
		source,
		recipientName: requireString(args, 'toName', 256),
		recipientEmail: toEmail,
		subject: requireString(args, 'subject', MAX_SUBJECT),
		htmlContent: sanitizeEmailHtml(rawHtml),
		cvItemId: optionalString(args, 'cvItemId'),
		cvListId: optionalString(args, 'cvListId'),
		jdName: optionalString(args, 'jdName'),
		requestedBy: actor!.userId,
	});
	return { content: [{ type: 'text' as const, text: JSON.stringify({ itemId: record.id, status: record.status }) }] };
}
```
Sau khi test pass, **xoá** 4 dòng `const history = ...` / `void history;` (đó là nháp; giữ file sạch).

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/mail-tools.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Cắm vào `src/mcp-message-handlers.ts`**

Thêm import:
```ts
import { MAIL_TOOL_DEFINITIONS, handleMailTool, isMailTool } from './mail-tools';
```
`tools/list`: sau `...PAYROLL_TOOL_DEFINITIONS,` thêm `...MAIL_TOOL_DEFINITIONS,`.
`tools/call`: ngay sau khối `isPayrollTool` thêm:
```ts
if (isMailTool(params?.name)) {
	return handleMailTool(params.name, params?.arguments, actor);
}
```

- [ ] **Step 6: Khai tool + env trong `privos-app.json`**

Thêm vào mảng `"tools"`:
```json
{
  "name": "hrm.mail.send",
  "title": "Send HR email",
  "description": "Send one email through the HR relay and record it in the room email history. Requires a Hub-verified actor.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "roomId": { "type": "string" }, "source": { "type": "string", "enum": ["cv_scored", "lifecycle"] },
      "toName": { "type": "string" }, "toEmail": { "type": "string" }, "subject": { "type": "string" }, "htmlContent": { "type": "string" },
      "cvItemId": { "type": "string" }, "cvListId": { "type": "string" }, "jdName": { "type": "string" }
    },
    "required": ["source", "toName", "toEmail", "subject", "htmlContent"]
  }
},
{
  "name": "hrm.mail.retry",
  "title": "Retry a failed HR email",
  "description": "Re-send a failed email from the room history using its stored recipient and content.",
  "inputSchema": { "type": "object", "properties": { "roomId": { "type": "string" }, "itemId": { "type": "string" } }, "required": ["itemId"] }
}
```
Thêm vào mảng `"env"` (sau `PRIVOS_AGENT_BOT_USER_ID`):
```json
{ "key": "EMAILJS_SERVICE_ID", "description": "EmailJS service id used by the server-side HR mail relay.", "required": true, "secret": true },
{ "key": "EMAILJS_TEMPLATE_ID", "description": "EmailJS template id; the template must expose name, to_name, to_email, subject, message.", "required": true, "secret": true },
{ "key": "EMAILJS_PUBLIC_KEY", "description": "EmailJS public key (user_id) for the relay account.", "required": true, "secret": true },
{ "key": "EMAILJS_PRIVATE_KEY", "description": "EmailJS private key sent as accessToken; required for non-browser API calls.", "required": true, "secret": true }
```

- [ ] **Step 7: Thêm assertion vào `tests/mcp.spec.ts`**

Trong `'initializes and lists tools'` thêm:
```ts
expect(listed.tools.map((tool: any) => tool.name)).toContain('hrm.mail.send');
```

- [ ] **Step 8: Chạy toàn bộ test + lint + typecheck**

Run: `npx vitest run && npm run manifest:lint && npm run typecheck:strict-unused`
Expected: tất cả PASS; lint valid.

- [ ] **Step 9: Commit (người dùng thực hiện)**

```bash
git add src/mail-tools.ts src/mcp-message-handlers.ts privos-app.json tests/mail-tools.spec.ts tests/mcp.spec.ts
git commit -m "feat(mail): hrm.mail.send/retry tools with verified-actor room pinning"
```

---

### Task 8: Hạ tầng UI dùng chung — data, CSS, polling hook, REST helper

**Files:**
- Create: `src/ui/data/**` (copy), `src/ui/hooks/usePolling.ts`, `src/ui/hr-premium-styles.css`, `src/ui/bot-drafting.css`
- Modify (ghi đè): `src/ui/contact-form-styles.css`
- Modify: `src/ui/privos-rest.ts` (nối thêm), `src/ui/index.html` (title)

**Interfaces:**
- Produces trong `src/ui/privos-rest.ts` (giữ nguyên chữ ký từ nguồn):
  ```ts
  export async function getFileContent(app: McpApp, path: string): Promise<string>;
  export async function ensureFolderPath(app: McpApp, channelId: string, folderNames: string[]): Promise<string | undefined>;
  export async function createOrUpdateFile(app: McpApp, path: string, content: string): Promise<any>;
  ```

- [ ] **Step 1: Copy data + CSS + hook**

```bash
cp -r ../hr-miniapp/src/ui/data src/ui/data
mkdir -p src/ui/hooks && cp ../hr-miniapp/src/ui/hooks/usePolling.ts src/ui/hooks/usePolling.ts
cp ../hr-miniapp/src/ui/hr-premium-styles.css src/ui/hr-premium-styles.css
cp ../hr-miniapp/src/ui/bot-drafting.css src/ui/bot-drafting.css
cp ../hr-miniapp/src/ui/contact-form-styles.css src/ui/contact-form-styles.css
```
Trong `src/ui/data/` xoá 4 file legacy không được import: `legacy_cv-evaluator-skill.md`, `legacy_cv_md_template.md`, `legacy_cv_processing_guidelines.md`, `legacy_sang_loc_cv.md`.

- [ ] **Step 2: Nối 3 hàm vào `src/ui/privos-rest.ts`**

Copy nguyên khối 3 hàm `getFileContent`, `ensureFolderPath`, `createOrUpdateFile` từ `hr-miniapp/src/ui/privos-rest.ts` (dòng 32–146) dán vào **cuối** `src/ui/privos-rest.ts` của target, rồi áp R2: `'privos.folders.getByChannel'` → `'mcpapp.folders.getByChannel'`, `'privos.folders.create'` → `'mcpapp.folders.create'`. Trong `getFileContent`, `path: 'api/files/content'` giữ nguyên (đường REST này `hr-miniapp` đã chạy được với cùng Hub; xem "Runtime verify" Task 17).

- [ ] **Step 3: Đổi title `src/ui/index.html`**

`<title>Contact Collector</title>` → `<title>HR Mini App</title>`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (3 hàm mới chưa được gọi nhưng type hợp lệ).

- [ ] **Step 5: Commit (người dùng thực hiện)**

```bash
git add src/ui/data src/ui/hooks src/ui/hr-premium-styles.css src/ui/bot-drafting.css src/ui/contact-form-styles.css src/ui/privos-rest.ts src/ui/index.html
git commit -m "feat(ui): shared HR data, styles, polling hook, file helpers"
```

---

### Task 9: Port Company Home, Recruitment, JD Chatbot

**Files:**
- Create (copy): `src/ui/company-home.tsx`, `src/ui/recruitment-panel.tsx`, `src/ui/jd-chatbot-functional.tsx`, `src/ui/jd-chatbot-header.tsx`, `src/ui/jd-chatbot-interaction-controls.tsx`, `src/ui/jd-chat-history.ts`

- [ ] **Step 1: Copy**

```bash
for f in company-home.tsx recruitment-panel.tsx jd-chatbot-functional.tsx jd-chatbot-header.tsx jd-chatbot-interaction-controls.tsx jd-chat-history.ts; do cp "../hr-miniapp/src/ui/$f" "src/ui/$f"; done
```

- [ ] **Step 2: Áp R1, R2 hàng loạt** (lệnh trong mục "Quy tắc port cơ học").

Kiểm tra kết quả: `grep -n "mcpapp\.\|@privos_ai" src/ui/recruitment-panel.tsx` phải thấy `mcpapp.files.getContent` (dòng ~129).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. Nếu báo `TS7006 implicit any` ở file nào, thêm kiểu `unknown`/`any` có chú thích tại đúng dòng đó (target bật strict; nguồn đã strict nên thường không phát sinh).

- [ ] **Step 4: Commit (người dùng thực hiện)**

```bash
git add src/ui/company-home.tsx src/ui/recruitment-panel.tsx src/ui/jd-chatbot-*.tsx src/ui/jd-chat-history.ts
git commit -m "feat(ui): port Company Home, Recruitment, JD chatbot"
```

---

### Task 10: Port CV Pipeline (dashboard + service + policy)

**Files:**
- Create (copy): `src/ui/pipeline-dashboard.tsx`, `src/ui/pipeline-service.ts`, `src/ui/cv-context-builder.ts`, `src/ui/cv-pipeline-display-reason.ts`, `src/ui/cv-scoring-policy.ts`, `src/ui/pipeline-candidate-name.ts`, `src/ui/screening-strategy.ts`, `src/ui/docx-export-service.ts`

- [ ] **Step 1: Copy**

```bash
for f in pipeline-dashboard.tsx pipeline-service.ts cv-context-builder.ts cv-pipeline-display-reason.ts cv-scoring-policy.ts pipeline-candidate-name.ts screening-strategy.ts docx-export-service.ts; do cp "../hr-miniapp/src/ui/$f" "src/ui/$f"; done
```

- [ ] **Step 2: Áp R1, R2 hàng loạt.**

Xác nhận `pipeline-service.ts` giờ có `mcpapp.files.getByChannel`, `mcpapp.messages.send`, `mcpapp.messages.getRecent`, `mcpapp.lists.getAll`, `mcpapp.lists.searchItems`, `mcpapp.lists.addField` (×3), `mcpapp.lists.create`, `mcpapp.lists.batchCreateItems`, `mcpapp.lists.createItem`, `mcpapp.lists.moveItemToStage`; `pipeline-dashboard.tsx` có `mcpapp.files.get`, `mcpapp.files.search`.

- [ ] **Step 3: Áp R3/R4 trong `pipeline-service.ts`**

Thay thân `deleteFile` (dòng ~378-391):
```ts
async deleteFile(fileId: string): Promise<boolean> {
  try {
    await this.app.callServerTool({ name: 'mcpapp.files.delete', arguments: { fileId } });
    return true;
  } catch (err) {
    console.error('Failed to delete file', err);
    return false;
  }
}
```
Thay thân `renameFile` (dòng ~393-406):
```ts
async renameFile(fileId: string, newName: string): Promise<boolean> {
  try {
    await this.app.callServerTool({ name: 'mcpapp.files.update', arguments: { fileId, name: newName } });
    return true;
  } catch (err) {
    console.error('Failed to rename file', err);
    return false;
  }
}
```

- [ ] **Step 4: Bỏ `alert()` khỏi service `pipeline-service.ts` (3 chỗ)**

Trong `ensureTemplatesExistGlobal`:
- Dòng ~100 `alert(\`Lỗi upload file hướng dẫn: ${err.message}\`);` → `throw new Error(\`Lỗi upload file hướng dẫn ${path}: ${err.message}\`);`
- Dòng ~138 `if (forceReset) alert('Đã khôi phục/tạo mới file hướng dẫn thành công!');` → xoá dòng.
- Dòng ~140 `alert(\`Lỗi tổng khi ensureTemplatesExist: ${err.message}\`);` → `throw err;`

Sau khi sửa, `grep -n "alert(" src/ui/pipeline-service.ts` phải trả về rỗng.

- [ ] **Step 5: Sửa polling trong `pipeline-dashboard.tsx` (R5)**

Thêm prop: đổi chữ ký component thành `export default function PipelineDashboard({ active }: { active: boolean })`. Tại `usePolling(reconcileSelectedFiles, {...})` (dòng ~748):
```ts
usePolling(reconcileSelectedFiles, {
  enabled: active && !processing && (selectedIds.size > 0 || Boolean(jdName)),
  interval: 3000,
  immediate: false,
});
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit (người dùng thực hiện)**

```bash
git add src/ui/pipeline-dashboard.tsx src/ui/pipeline-service.ts src/ui/cv-*.ts src/ui/pipeline-candidate-name.ts src/ui/screening-strategy.ts src/ui/docx-export-service.ts
git commit -m "feat(ui): port CV pipeline; drop service alerts; gate polling on active tab"
```

---

### Task 11: Port CV Scored (kanban)

**Files:**
- Create (copy): `src/ui/cv-scored/**` (10 file)

- [ ] **Step 1: Copy + R1/R2**

```bash
cp -r ../hr-miniapp/src/ui/cv-scored src/ui/cv-scored
```
Áp lệnh R1/R2. Xác nhận `CVScoredTab.tsx` có `mcpapp.lists.moveItemToStage` (×2), `mcpapp.lists.getAll`, `mcpapp.lists.get`, `mcpapp.lists.searchItems`, `mcpapp.lists.addField`, `mcpapp.lists.getItems` (×2). Tool `hrm.mail.send` ở dòng ~429 giữ nguyên tên.

- [ ] **Step 2: Polling (R5)**

Đổi chữ ký `export default function CVScoredTab({ active }: { active: boolean })`. Tại `usePolling(pollStageMoves, {...})` (dòng ~817):
```ts
usePolling(pollStageMoves, {
  enabled: active && Boolean(app && roomId),
  interval: 3000,
  immediate: false,
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 4: Commit (người dùng thực hiện)**

```bash
git add src/ui/cv-scored
git commit -m "feat(ui): port scored-CV kanban with active-gated polling"
```

---

### Task 12: Port Lifecycle (Hồ sơ nhân sự)

**Files:**
- Create (copy): `src/ui/lifecycle/**` (16 file)

- [ ] **Step 1: Copy + R1/R2**

```bash
cp -r ../hr-miniapp/src/ui/lifecycle src/ui/lifecycle
```
Áp R1/R2. Xác nhận `PrivOSLifecycleService.ts` có 10 tool `mcpapp.lists.*`/`mcpapp.stages.getByList`; `lifecycleService.ts` có 3.

- [ ] **Step 2: Sửa lỗi type có sẵn**

`src/ui/lifecycle/services/PrivOSLifecycleService.ts:413` — `catch (err)` → `catch (err: unknown)` và dùng `err instanceof Error ? err.message : String(err)` nếu dòng đó đọc `.message`.

- [ ] **Step 3: Polling (R5) trong `LifecycleDashboard.tsx`**

Đổi chữ ký `export default function LifecycleDashboard({ active }: { active: boolean })`. Hai `usePolling` (dòng ~104, ~110):
```ts
{ enabled: active && Boolean(roomId), interval: 3000, immediate: false }
{ enabled: active && isCreating && Boolean(roomId), interval: 3000, immediate: false }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit (người dùng thực hiện)**

```bash
git add src/ui/lifecycle
git commit -m "feat(ui): port employee lifecycle dashboard"
```

---

### Task 13: Port Payroll UI lên tool `hrm.payroll.*` mới

**Files:**
- Create (copy): `src/ui/payroll/**` (12 file)
- Modify sau copy: `src/ui/payroll/services/PayrollService.ts`, `src/ui/payroll/access/usePayrollAccessPolling.ts`, `src/ui/payroll/components/PayrollDashboard.tsx`, `src/ui/payroll/types.ts`

**Interfaces:**
- Consumes: tool `hrm.payroll.query` trả `{ records: PayrollDocument[] }`; `create` trả document; `update` trả `{ id, updated }`; `delete` trả `{ id, deleted }` (Task 4). `parseToolResult` từ `@privos_ai/app-react`.

- [ ] **Step 1: Copy + R1/R2**

```bash
cp -r ../hr-miniapp/src/ui/payroll src/ui/payroll
```
Áp R1/R2. `usePayrollAccessPolling.ts` giờ gọi `mcpapp.context.get`.

- [ ] **Step 2: Mở rộng `PayrollRecord` trong `src/ui/payroll/types.ts`**

Giữ nguyên interface, chỉ thêm 2 field readonly-optional để khớp document server:
```ts
export interface PayrollRecord {
  _id?: string;
  employeeId: string;
  baseSalary: number;
  taxId: string;
  bankAccount: string;
  bankName?: string;
  contractType?: string;
  applyProbationRate?: boolean;
  probationRate?: number;
  roomId?: string;
  _createdAt?: string;
  _updatedAt?: string;
}
```

- [ ] **Step 3: Viết lại `src/ui/payroll/services/PayrollService.ts`**

```ts
import { parseToolResult, type McpApp } from '@privos_ai/app-react';
import type { IPayrollService, PayrollRecord } from '../types';

/**
 * Talks ONLY to this app's own `hrm.payroll.*` tools. The server re-derives
 * the room from the Hub-verified actor; `roomId` is sent so a mismatch is a
 * loud error instead of a silent redirect. Schema registration happens
 * server-side on the first `query`, so `initializeSchema` is a no-op kept for
 * the `IPayrollService` contract.
 */
export class PayrollService implements IPayrollService {
  constructor(private readonly app: McpApp, private readonly roomId: string) {
    if (!app) throw new Error('PayrollService requires a valid McpApp instance.');
    if (!roomId) throw new Error('PayrollService requires a roomId.');
  }

  async initializeSchema(): Promise<void> {
    return;
  }

  async getRecords(): Promise<PayrollRecord[]> {
    const result = parseToolResult(await this.app.callServerTool({ name: 'hrm.payroll.query', arguments: { roomId: this.roomId } }));
    return Array.isArray(result.records) ? (result.records as PayrollRecord[]) : [];
  }

  async saveRecord(record: PayrollRecord): Promise<void> {
    const { _id, _createdAt, _updatedAt, roomId: _room, ...data } = record;
    if (_id) {
      await this.app.callServerTool({ name: 'hrm.payroll.update', arguments: { roomId: this.roomId, id: _id, data } });
    } else {
      await this.app.callServerTool({ name: 'hrm.payroll.create', arguments: { roomId: this.roomId, data } });
    }
  }

  async deleteRecord(id: string): Promise<void> {
    await this.app.callServerTool({ name: 'hrm.payroll.delete', arguments: { roomId: this.roomId, id } });
  }
}
```

- [ ] **Step 4: Polling quyền (R5/R6) trong `src/ui/payroll/access/usePayrollAccessPolling.ts`**

Thay khối `usePolling(refreshAccess, {...})`:
```ts
usePolling(refreshAccess, {
  enabled: app !== null,
  interval: 5000,
  immediate: true,
});
```
(bỏ `pauseOnTabHidden: false`). Hook này chạy ở `App.tsx` toàn cục — vì nó quyết định ẩn/hiện tab Payroll nên không gate theo tab.

- [ ] **Step 5: Polling dashboard trong `PayrollDashboard.tsx` (R5)**

Thêm prop `active: boolean` vào `PayrollDashboardProps` và vào `usePolling` (dòng ~232):
```ts
{ enabled: active && Boolean(roomId) && editingId === null, interval: 3000, immediate: false }
```
Trong `PayrollTab.tsx`: thêm `active: boolean` vào `PayrollTabProps` và truyền `active={active}` xuống `<PayrollDashboard ... />`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 7: Commit (người dùng thực hiện)**

```bash
git add src/ui/payroll
git commit -m "feat(ui): payroll on server-authorized hrm.payroll.* tools"
```

---

### Task 14: Port Bot soạn thảo (drafting)

**Files:**
- Create (copy): `src/ui/bot-drafting-tab.tsx`, `src/ui/drafting/**`, `src/ui/drafting-templates.ts`

- [ ] **Step 1: Copy + R1/R2**

```bash
cp ../hr-miniapp/src/ui/bot-drafting-tab.tsx src/ui/bot-drafting-tab.tsx
cp ../hr-miniapp/src/ui/drafting-templates.ts src/ui/drafting-templates.ts
cp -r ../hr-miniapp/src/ui/drafting src/ui/drafting
```
Áp R1/R2. Xác nhận `drafting/services/CompanyContextProvider.ts` có `mcpapp.files.getByChannel`, `mcpapp.folders.getByChannel`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 3: Commit (người dùng thực hiện)**

```bash
git add src/ui/bot-drafting-tab.tsx src/ui/drafting-templates.ts src/ui/drafting
git commit -m "feat(ui): port drafting bot and ND30/HR/internal templates"
```

---

### Task 15: Port Email tab + Interview email templates (UI)

**Files:**
- Create (copy): `src/ui/email-history/**`, `src/ui/email-templates/**`
- Modify sau copy: `src/ui/email-history/email-history-service.ts`, `src/ui/email-history/EmailTab.tsx`, `src/ui/email-templates/interview-email-template-repository.ts`, `src/ui/email-templates/InterviewEmailTemplatePanel.tsx`

- [ ] **Step 1: Copy + R1/R2/R7**

```bash
cp -r ../hr-miniapp/src/ui/email-history src/ui/email-history
cp -r ../hr-miniapp/src/ui/email-templates src/ui/email-templates
```
Áp R1/R2. Rồi R7:
```bash
grep -rl "email-history/email-history-model" src/ui | xargs sed -i "s#'\.\./\.\./email-history/email-history-model'#'../../services/mail/email-history-model'#g"
```
Xác nhận: `grep -rn "email-history-model" src/ui` chỉ còn đường dẫn `services/mail/email-history-model`.

- [ ] **Step 2: R3 trong `interview-email-template-repository.ts`**

Thay thân `delete` (dòng ~324-328):
```ts
async delete(fileId: string): Promise<void> {
  await this.app.callServerTool({ name: 'mcpapp.files.delete', arguments: { fileId } });
}
```

- [ ] **Step 3: Polling (R5)**

`EmailTab.tsx` đã nhận prop `active` và đã gate `enabled: active && ...` — chỉ đổi `interval: 1000` → `interval: 3000`.
`InterviewEmailTemplatePanel.tsx` dòng ~139: đổi `interval: 1000` → `interval: 3000`; nếu chưa có gate theo `active`, thêm prop `active: boolean` và `enabled: active && <điều kiện cũ>`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit (người dùng thực hiện)**

```bash
git add src/ui/email-history src/ui/email-templates
git commit -m "feat(ui): port email history tab and interview templates"
```

---

### Task 16: `App.tsx` mới, gỡ demo, manifest permissions, `SCOPES.md`

Đây là task duy nhất có thể làm `scope-audit.spec.ts` chuyển màu — vì vậy gộp manifest + App + xoá demo vào một task.

**Files:**
- Modify (viết lại): `src/ui/App.tsx`, `src/ui/main.tsx`
- Delete: xem Step 1
- Modify: `src/mcp-message-handlers.ts`, `privos-app.json` (`permissions`, `description`, `tools[0]`), `SCOPES.md`, `README.md` (mục tính năng), `tests/mcp.spec.ts`

- [ ] **Step 1: Xoá demo UI + demo tool + test tương ứng**

```bash
# UI panels
rm src/ui/agent-bot-panel.tsx src/ui/ai-chat-bot-selection.ts src/ui/ai-chat-executor-select.tsx src/ui/ai-poem-panel.tsx \
   src/ui/app-db-panel.tsx src/ui/app-objects-demo-helpers.ts src/ui/app-objects-panel.tsx src/ui/app-owned-chat-panel.tsx \
   src/ui/assignee-demo-helpers.ts src/ui/assignee-demo-panel.tsx src/ui/attempt-evidence-panel.tsx src/ui/attempt-lifecycle-panel.tsx \
   src/ui/attempt-observation-section.tsx src/ui/bot-workload-attempt-section.tsx src/ui/bot-workload-credential-check.tsx \
   src/ui/bot-workload-helpers.ts src/ui/botkey-autopush-controller.ts src/ui/contact-collector-form.tsx \
   src/ui/custom-permissions-helpers.ts src/ui/custom-permissions-panel.tsx src/ui/file-upload-panel.tsx src/ui/info-panel.tsx \
   src/ui/license-panel.tsx src/ui/list-items-table.tsx src/ui/notification-panel-model.ts src/ui/notification-panel.tsx \
   src/ui/sandbox-connect-panel.tsx src/ui/skills-panel.tsx src/ui/theme-inheritance-panel.tsx src/ui/whoami-panel.tsx \
   src/ui/sample-agent-set.tar.gz
rm -r src/ui/panels
# demo tools
rm src/app-objects-demo-tool.ts src/app-db-demo-tool.ts src/app-platform-demo-tool-defs.ts
# tests of removed code
rm tests/ai-chat-bot-selection.spec.ts tests/app-objects-demo-helpers.spec.ts tests/assignee-demo-helpers.spec.ts \
   tests/bot-workload-helpers.spec.ts tests/botkey-autopush-controller.spec.ts tests/custom-permissions-helpers.spec.ts \
   tests/notification-panel.spec.ts
```

- [ ] **Step 2: Gỡ tham chiếu demo tool trong `src/mcp-message-handlers.ts`**

Xoá 3 import: `APP_OBJECT_STORE_TOOL, APP_DB_STORE_TOOL, APP_PLATFORM_TOOL_DEFINITIONS`, `handleAppObjectStoreTool`, `handleAppDbStoreTool`. Trong `tools/list` xoá `...APP_PLATFORM_TOOL_DEFINITIONS,`. Trong `tools/call` xoá hai khối `if (params?.name === APP_OBJECT_STORE_TOOL)` và `if (params?.name === APP_DB_STORE_TOOL)`.

- [ ] **Step 3: Cập nhật `tests/mcp.spec.ts`**

Xoá 2 dòng `toContain('hr_app_object_store')` / `toContain('hr_app_db_store')` và xoá 2 test `'validates hr_app_object_store arguments…'`, `'validates hr_app_db_store arguments…'`.

- [ ] **Step 4: Viết lại `src/ui/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { PrivosAppProvider, usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider, ThemeToggle } from './theme-provider';
import CompanyHome from './company-home';
import RecruitmentPanel from './recruitment-panel';
import PipelineDashboard from './pipeline-dashboard';
import LifecycleDashboard from './lifecycle/LifecycleDashboard';
import PayrollTab from './payroll/PayrollTab';
import BotDraftingTab from './bot-drafting-tab';
import CVScoredTab from './cv-scored/CVScoredTab';
import JDChatbotTab from './jd-chatbot-functional';
import EmailTab from './email-history/EmailTab';
import { createInterviewEmailTemplateRepository } from './email-templates/interview-email-template-default';
import { ensureTemplatesExistGlobal } from './pipeline-service';
import { usePayrollAccessPolling } from './payroll/access/usePayrollAccessPolling';
import {
  canSelectPayrollTab,
  filterPayrollTab,
  removePayrollFromVisited,
  resolveTabAfterPayrollRevocation,
} from './payroll/access/payroll-navigation-policy';

declare global {
  interface Window {
    /** Set once React has committed the first render — the shell watchdog's success signal. */
    __privosUiBooted?: boolean;
  }
}

type Tab = 'home' | 'email' | 'recruitment' | 'pipeline' | 'cvScored' | 'chatbotJD' | 'lifecycle' | 'payroll' | 'botDrafting';
type SectionId = 'hr' | 'admin';

/**
 * Scope annotations per tab — read by tests/scope-audit.spec.ts, which requires every
 * permission declared in privos-app.json to name a call site under src/ui. The scope
 * strings here are the documentation of WHY each permission exists:
 *   basic:information      → room/user context for every tab (usePrivosContext)
 *   lists:read / lists:write → candidate, employee, email-history lists (mcpapp.lists.*)
 *   files:read / files:write → JD, CV, template, export files (mcpapp.files.*, uploadFile)
 *   db:read / db:write / db:schema:read / db:schema:write → payroll (hrm.payroll.* → mcpapp.db.*)
 *   sandbox:ai-chat / sandbox:ai-chat:write → CV scoring + company summary (ai-messages.*)
 */
type TabDef = { id: Tab; label: string; scopes: readonly string[] };

const TAB_SECTIONS: { id: SectionId; label: string; tabs: TabDef[] }[] = [
  {
    id: 'hr',
    label: 'HR',
    tabs: [
      { id: 'recruitment', label: 'Tuyển dụng', scopes: ['files:read'] },
      { id: 'pipeline', label: 'CV Pipeline', scopes: ['files:read', 'files:write', 'lists:write', 'sandbox:ai-chat', 'sandbox:ai-chat:write'] },
      { id: 'cvScored', label: 'CV đã chấm', scopes: ['lists:read', 'lists:write'] },
      { id: 'chatbotJD', label: 'Chỉnh sửa JD', scopes: ['files:read', 'files:write'] },
    ],
  },
  {
    id: 'admin',
    label: 'Hành chính',
    tabs: [
      { id: 'lifecycle', label: 'Hồ sơ NS', scopes: ['lists:read', 'lists:write', 'files:write'] },
      { id: 'payroll', label: 'Quản lý Lương', scopes: ['db:read', 'db:write', 'db:schema:read', 'db:schema:write'] },
      { id: 'botDrafting', label: 'Bot soạn thảo', scopes: ['files:read'] },
    ],
  },
];

const HOME_SCOPES = ['basic:information', 'sandbox:ai-chat', 'sandbox:ai-chat:write'] as const;
const EMAIL_SCOPES = ['lists:read', 'lists:write', 'files:read', 'files:write'] as const;
void HOME_SCOPES;
void EMAIL_SCOPES;

function ThemedApp() {
  const app = usePrivosApp();
  const { theme, roomId, userRoles } = usePrivosContext();
  const [tab, setTab] = useState<Tab>('home');
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['home']));
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const canAccessPayroll = usePayrollAccessPolling(app, userRoles);
  const payrollAccessRoles = canAccessPayroll ? ['owner'] : [];
  const visibleTabSections = TAB_SECTIONS.map((section) => ({ ...section, tabs: filterPayrollTab(section.tabs, payrollAccessRoles) }));

  useEffect(() => {
    if (app && roomId) {
      ensureTemplatesExistGlobal(app, roomId, false).catch((error) => console.error('[Templates] ensure failed', error));
    }
  }, [app, roomId]);

  useEffect(() => {
    if (!app || !roomId) return;
    createInterviewEmailTemplateRepository(app, roomId).ensureInitialized().catch((error) => {
      console.error('[InterviewEmailTemplates] Initialization failed', error);
    });
  }, [app, roomId]);

  useEffect(() => {
    if (canAccessPayroll) return;
    setTab((previous) => resolveTabAfterPayrollRevocation(previous));
    setVisitedTabs((previous) => (previous.has('payroll') ? removePayrollFromVisited(previous) : previous));
  }, [canAccessPayroll]);

  const handleSelectTab = (selected: Tab) => {
    if (!canSelectPayrollTab(selected, payrollAccessRoles)) return;
    setTab(selected);
    setVisitedTabs((prev) => (prev.has(selected) ? prev : new Set(prev).add(selected)));
    setOpenSection(null);
  };

  const panel = (id: Tab, node: React.ReactNode) =>
    visitedTabs.has(id) ? (
      <div className={tab === id ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== id}>{node}</div>
    ) : null;

  return (
    <ThemeProvider hostTheme={theme}>
      <div className="app-header">
        <nav className="app-tabs" aria-label="Dashboard navigation" onMouseLeave={() => setOpenSection(null)}>
          <button type="button" className={`nav-primary-btn${tab === 'home' ? ' nav-primary-active' : ''}`} onClick={() => handleSelectTab('home')}>Company</button>
          <button type="button" className={`nav-primary-btn${tab === 'email' ? ' nav-primary-active' : ''}`} onClick={() => handleSelectTab('email')}>Email</button>
          {visibleTabSections.map((section) => {
            if (section.tabs.length === 0) return null;
            const isOpen = openSection === section.id;
            const isActive = section.tabs.some((t) => t.id === tab);
            return (
              <div className={`app-nav-section${isOpen ? ' app-nav-section-open' : ''}`} key={section.id}>
                <button
                  type="button"
                  className={`nav-primary-btn${isOpen ? ' nav-primary-open' : ''}${isActive ? ' nav-primary-active' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                >
                  <span>{section.label}</span>
                  <span className="nav-primary-chevron" aria-hidden="true">{'\u203a'}</span>
                </button>
                <div className={`app-subnav${isOpen ? ' app-subnav-open' : ''}`} aria-hidden={!isOpen}>
                  {section.tabs.map((t) => (
                    <button key={t.id} type="button" className={`tab-btn${tab === t.id ? ' tab-active' : ''}`} tabIndex={isOpen ? 0 : -1} onClick={() => handleSelectTab(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>

      <div className={tab === 'home' ? 'app-tab-panel active' : 'app-tab-panel'} aria-hidden={tab !== 'home'}><CompanyHome /></div>
      {panel('email', <EmailTab active={tab === 'email'} />)}
      {panel('recruitment', <RecruitmentPanel />)}
      {panel('pipeline', <PipelineDashboard active={tab === 'pipeline'} />)}
      {panel('cvScored', <CVScoredTab active={tab === 'cvScored'} />)}
      {panel('chatbotJD', <JDChatbotTab />)}
      {panel('lifecycle', <LifecycleDashboard active={tab === 'lifecycle'} />)}
      {canAccessPayroll && panel('payroll', <PayrollTab key={roomId} roomId={roomId} userRoles={payrollAccessRoles} active={tab === 'payroll'} />)}
      {panel('botDrafting', <BotDraftingTab />)}
    </ThemeProvider>
  );
}

export default function App() {
  useEffect(() => {
    window.__privosUiBooted = true;
  }, []);
  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
```
(`void HOME_SCOPES; void EMAIL_SCOPES;` tồn tại để `--noUnusedLocals` không đỏ; mảng `scopes` trong `TabDef` là call-site annotation cho `scope-audit.spec.ts`.)

- [ ] **Step 5: `src/ui/main.tsx` — import CSS**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './contact-form-styles.css';
import './hr-premium-styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```
(`bot-drafting.css`, `email-tab.css`, `interview-email-template.css`, `lifecycle-styles.css` đã được import trong chính component của chúng ở nguồn — giữ nguyên.)

- [ ] **Step 6: Viết lại `permissions` trong `privos-app.json`**

Thay toàn bộ mảng `"permissions"` bằng:
```json
"permissions": [
  { "scope": "basic:information", "requirement": "required", "context": "room", "executionContext": "both", "feature": "core.context", "reason": "Identify the approved installation and room so every HR tab loads the right room's data." },
  { "scope": "lists:read", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.records.read", "reason": "Read candidate, employee and email-history lists of this room (mcpapp.lists.getAll/getItems/get/searchItems)." },
  { "scope": "lists:write", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.records.manage", "reason": "Create lists, fields and items for scored CVs, employee profiles and email history; move kanban cards between stages." },
  { "scope": "files:read", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.files.read", "reason": "Read JD, CV, template and company files stored in the room (mcpapp.files.getByChannel/get/search/getContent, mcpapp.folders.*)." },
  { "scope": "files:write", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.files.manage", "reason": "Upload scoring skills, JDs, generated documents and payroll exports; rename and delete processed CVs (app.uploadFile, mcpapp.files.update/delete)." },
  { "scope": "db:read", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.payroll.read", "reason": "Read payroll records of this room through the app's hrm.payroll.query tool (mcpapp.db.query with the installation-bot credential, pinned to the verified caller room)." },
  { "scope": "db:write", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.payroll.manage", "reason": "Create, update and soft-delete payroll records through hrm.payroll.create/update/delete (mcpapp.db.create/update/delete)." },
  { "scope": "db:schema:read", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.payroll.schema.read", "reason": "Read the payroll collection schema (mcpapp.db.getSchema) when diagnosing a room." },
  { "scope": "db:schema:write", "requirement": "required", "context": "room", "executionContext": "user", "feature": "hr.payroll.schema.manage", "reason": "Register the room-scoped payroll collection once per room (mcpapp.db.registerCollection)." },
  { "scope": "sandbox:ai-chat", "requirement": "optional", "context": "room", "executionContext": "user", "feature": "sandbox.chat.read", "reason": "Poll AI generation results for CV scoring and the company summary (ai-messages.list).", "degradedBehavior": "CV scoring and the Company home summary cannot read AI results; manual scoring remains available." },
  { "scope": "sandbox:ai-chat:write", "requirement": "optional", "context": "room", "executionContext": "user", "feature": "sandbox.chat.manage", "reason": "Start AI generation for CV scoring and the company summary (ai-messages.send / ai-messages.startGeneration).", "degradedBehavior": "AI scoring and the AI company summary are disabled; every other tab keeps working." }
]
```
Đồng thời:
- `"description"` (dòng 7): `"HR Mini App for PrivOS: recruitment pipeline with AI CV scoring, scored-CV kanban, JD editor, employee lifecycle, payroll, drafting bot and email history."`
- `tools[0].description`: `"Open the HR Mini App dashboard."`
- `tools[0].title`: giữ `"PrivOS Demo MCP App Can Run"` (khớp `package.json.title`, test `manifest.spec.ts` chốt).
- Trong `package.json`, `"description"` đổi giống trên.

- [ ] **Step 7: Viết lại `SCOPES.md`**

```markdown
# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | `usePrivosContext()` in `App.tsx` supplies `roomId`/`userRoles` to every tab. | Installation is cancelled if rejected. |
| `lists:read` | Required | Room; user | `cv-scored/CVScoredTab.tsx`, `lifecycle/services/PrivOSLifecycleService.ts`, `email-history/email-history-service.ts` via `mcpapp.lists.getAll/getItems/get/searchItems`; server `services/mail/email-history-repository.ts` via `mcpapp.lists.getItem`. | Installation is cancelled if rejected. |
| `lists:write` | Required | Room; user | `pipeline-service.ts`, `PrivOSLifecycleService.ts`, `CVScoredTab.tsx` via `mcpapp.lists.create/addField/createItem/batchCreateItems/moveItemToStage`; server email history via `mcpapp.lists.create/createItem/updateItem/moveItemToStage`. | Installation is cancelled if rejected. |
| `files:read` | Required | Room; user | `recruitment-panel.tsx` (`mcpapp.files.getContent`), `pipeline-dashboard.tsx` (`mcpapp.files.get/search`), `drafting/services/CompanyContextProvider.ts`, `email-templates/interview-email-template-repository.ts`, `privos-rest.ts` (`mcpapp.folders.*`). | Installation is cancelled if rejected. |
| `files:write` | Required | Room; user | `privos-rest.ts createOrUpdateFile` (`app.uploadFile`), `pipeline-service.ts` (`mcpapp.files.update/delete`), `payroll/services/PayrollExportService.ts`, `email-templates/interview-email-template-repository.ts` (`mcpapp.files.delete`). | Installation is cancelled if rejected. |
| `db:read` | Required | Room; user | `payroll/services/PayrollService.ts` → `hrm.payroll.query` → server `services/payroll/app-db-payroll-repository.ts` (`mcpapp.db.query`). Installation-bot credential, room pinned to the verified actor. | Installation is cancelled if rejected. |
| `db:write` | Required | Room; user | `hrm.payroll.create/update/delete` → `mcpapp.db.create/update/delete` (same path). | Installation is cancelled if rejected. |
| `db:schema:read` | Required | Room; user | Reserved for `mcpapp.db.getSchema` diagnostics on the payroll collection (`hub-tool-caller.ts` allowlist). | Installation is cancelled if rejected. |
| `db:schema:write` | Required | Room; user | `hrm.payroll.query` registers `hr_payroll_records` once per room via `mcpapp.db.registerCollection`. | Installation is cancelled if rejected. |
| `sandbox:ai-chat` | Optional | Room; user | `company-home.tsx`, `pipeline-service.ts` poll `ai-messages.list`. | AI results cannot be read; scoring falls back to manual. |
| `sandbox:ai-chat:write` | Optional | Room; user | `company-home.tsx`, `pipeline-service.ts` call `ai-messages.send` + `ai-messages.startGeneration`. | AI scoring and AI company summary are disabled. |

`hrm.payroll.*` and `hrm.mail.*` are the two app-owned tool families that reach the Hub with the
installation-bot credential (`POST /api/v1/mcp-apps.tool-call`, `app-platform-tool-call.ts`) instead
of the current user's session. Both refuse any call without a Hub-verified actor and pin every Hub
request to `actor.roomId` (`payroll-tools.ts resolveActorRoom`). The Hub still enforces installation
status, receipt, epoch, target room, exact grant, and bot membership on every mediated operation.

The app-owned `hr_bulk_export` tool does not request a workspace permission. It processes caller
input and is gated by the Pro license feature.
```

- [ ] **Step 8: Cập nhật `README.md`**

Thay mục mô tả tab demo bằng danh sách 9 tab HR (Company, Email, Tuyển dụng, CV Pipeline, CV đã chấm, Chỉnh sửa JD, Hồ sơ NS, Quản lý Lương, Bot soạn thảo) và mục "Tiền đề vận hành" (4 điểm ở đầu plan). Không đổi các mục về runtime mode/pairing.

- [ ] **Step 9: Chạy toàn bộ cổng**

Run: `npm run typecheck:strict-unused && npx vitest run && npm run manifest:lint && npm run preflight`
Expected: typecheck 0 lỗi; vitest tất cả PASS (đặc biệt `scope-audit.spec.ts`, `permission-catalog.spec.ts`, `manifest.spec.ts`, `mcp.spec.ts`, `ui-shell.spec.ts`); lint valid; preflight không `failed`.

Nếu `scope-audit` báo `<scope> call-site annotation`: scope đó chưa xuất hiện dưới `src/ui` — thêm vào mảng `scopes` của tab tương ứng trong `App.tsx`. Nếu báo `<scope> justification`: thiếu dòng trong `SCOPES.md`.

- [ ] **Step 10: Commit (người dùng thực hiện)**

```bash
git add -A src/ui src/mcp-message-handlers.ts privos-app.json package.json SCOPES.md README.md tests
git commit -m "feat: HR Mini App shell replaces platform demo; narrowed permissions"
```

---

### Task 17: Build, gói, nghiệm thu runtime

**Files:** không sửa code trừ khi nghiệm thu lộ lỗi.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `vite build` exit 0; **mọi** asset trong `dist/ui/assets/` < 2 MiB (`ls -la dist/ui/assets`); `dist/manifest.json` sinh ra; `manifest:lint` valid. Nếu chunk `xlsx-*.js` hoặc `docx-*.js` > 2 MiB → chuyển import trong `PayrollExportService.ts` / `docx-export-service.ts` sang `await import('xlsx')` bên trong hàm export để tách chunk theo lazy.

- [ ] **Step 2: Cổng đầy đủ**

Run: `npm run verify:fast-pr`
Expected: exit 0.

- [ ] **Step 3: Chạy app (chế độ dev relay để có pairing + HMR)**

Người dùng chạy trong PowerShell tại `privos-mcp-app-demo`:
```powershell
npm run dev
```
Lần đầu: dán pairing URL từ Privos Admin → Apps → Register Relay App. Sau đó `.env` có `PRIVOS_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `MCP_APP_ID`. Đặt thêm vào `.env`: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `PRIVOS_AGENT_BOT_CREDENTIAL`, `PRIVOS_AGENT_BOT_USER_ID`.

- [ ] **Step 4: Nghiệm thu bằng `npm start`** (lệnh spec yêu cầu)

```powershell
npm start
```
Expected trong log: `[serveApp] · serveApp.listening`, không có `relay.connect_failed`. Mở app trong hub → shell load (không watchdog "App assets unavailable").

- [ ] **Step 5: Runtime verify — danh sách phải tick hết**

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Mở app | Nav: Company · Email · HR ▸ · Hành chính ▸. **Không** có popup `alert`. |
| 2 | Tab **Tuyển dụng** | Danh sách JD từ `hr-miniapp/jds` hiển thị (xác nhận `api/files/list` + `mcpapp.files.getContent` còn hoạt động; nếu 404 → đổi `getFileContent` sang `mcpapp.files.getContent` qua `callServerTool` và `api/files/list` sang `GET file-management.files.channel/${roomId}`). |
| 3 | Tab **CV Pipeline** → upload 1 CV, chọn JD, chấm | Có tiến trình AI (cần `sandbox:ai-chat:write`); file MD kết quả vào `outputs-cv/`. Nếu `mcpapp.messages.send` trả 403 → thay bằng `restCall(app,'POST','chat.sendMessage',{ body:{ roomId, text } })`. |
| 4 | Tab **CV đã chấm** | Kanban load; kéo thẻ đổi stage; **DevTools Network**: poll `mcpapp.lists.getItems` mỗi ~3s chỉ khi tab active; chuyển tab khác → dừng. |
| 5 | Tab **Hồ sơ NS** → tạo hồ sơ | Item xuất hiện; polling như #4. |
| 6 | Tab **Quản lý Lương** (user owner) → thêm bản ghi | Thành công; log server có `hrm.payroll.create`. Sửa `roomId` trong DevTools thành room khác → server trả `does not match the verified caller room`. |
| 7 | Với user **không** owner | Tab Lương ẩn; gọi tay `hrm.payroll.query` vẫn trả `{records:[...]}` **của đúng room** (chỉ room mình) — đúng thiết kế: server cắt theo room, không theo role. Ghi nhận nếu cần role-gate thêm ở server (ngoài spec). |
| 8 | **CV đã chấm** → gửi mail mời phỏng vấn | Mail tới; tab **Email** có bản ghi trạng thái "Đã gửi", `requested_by` = userId thật (không phải giá trị client gửi). |
| 9 | Tắt `EMAILJS_PRIVATE_KEY`, gửi lại | Bản ghi "Gửi lỗi", `last_error` không chứa key; nút **Gửi lại** hoạt động sau khi bật key. |
| 10 | Tab **Bot soạn thảo** → chọn mẫu ND30 → xuất DOCX | File tải về mở được. |
| 11 | Reload app 3 lần | Không có upload lại 6 file skill (`ensureTemplatesExistGlobal(..., false)`); Network không có `uploadFile` khi file đã tồn tại. |

- [ ] **Step 6: Đóng gói (tuỳ chọn, để chắc marketplace ZIP sạch)**

Run: `npm run package`
Expected: `Created dist-source/ai.privos.mcp-app-demo-can-run-3.0.0.zip`; không có `privos-standalone-identity.json`, `.env*` trong listing (`unzip -Z1 dist-source/*.zip | grep -i "identity\|\.env"` rỗng).

- [ ] **Step 7: Commit cuối (người dùng thực hiện)**

```bash
git add -A
git commit -m "chore: 3.0.0 — HR Mini App migration verified end-to-end"
```

---

## Self-review

**Spec coverage**
- Bước 1 (deps, bỏ emailjs/pdfjs, xin xác nhận install) → Task 1 Step 4, Step 8. ✅
- Bước 2 (manifest permissions + env secret) → Task 7 Step 6 (env), Task 16 Step 6 (permissions). Sai lệch `lists:query`, `sandbox:skills:use`, thêm `sandbox:ai-chat:write` — ghi ở mục "Sai lệch có chủ ý". ✅
- Bước 3.1 (IPayrollRepository, AppDbPayrollRepository, index, hrm.payroll.*, actor/roomId guard) → Task 3, Task 4. ✅
- Bước 3.2 (TrackedMailService, EmailHistoryRepository port, MailRelayService fetch, validate/sanitize, requestedBy=actor.userId, hrm.mail.*) → Task 5, 6, 7. ✅
- Bước 4.1 (copy data) → Task 8. 4.2 (9 module) → Task 9–15. 4.3 (import rename, 57 call site, bỏ alert service, forceReset=false, polling) → quy tắc R1–R8 + Task 10 Step 4–5, Task 11–15, Task 16 Step 4 (`false`). Không port onboarding/PrivosApi → Global Constraints. ✅
- Bước 4.4 (App.tsx nav 2 nhóm + Company + Email; giữ serveBuiltUi) → Task 16 Step 4; Task 1 Step 6 không thêm singlefile. ✅
- Bước 5 (typecheck, build, `npm start`) → Task 17. ✅

**Placeholder scan** — không còn "TBD/TODO/similar to". Các bước copy đều có lệnh và danh sách sửa cụ thể theo dòng.

**Type consistency** — `HubToolCaller(name, args?: Record<string, unknown>)` dùng thống nhất ở Task 2/3/5/7; `resolveActorRoom` định nghĩa Task 4, dùng Task 7; `PayrollInput` Task 3 ↔ `readPayrollInput` Task 4; `SendMailParams` Task 6 ↔ `TrackedMailService` import Task 6 Step 8; `active` prop được thêm ở Task 10/11/12/13/15 và truyền từ `App.tsx` Task 16 cho đúng 5 component (`EmailTab`, `PipelineDashboard`, `CVScoredTab`, `LifecycleDashboard`, `PayrollTab`).
