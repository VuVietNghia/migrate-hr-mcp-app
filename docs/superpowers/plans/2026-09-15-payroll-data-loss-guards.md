# Payroll Data-Loss Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the two code paths that permanently destroy real salary data — a truncated employee roster and a self-deleting employee list — and make every payroll deletion recoverable.

**Architecture:** Three isolated changes behind existing seams. (1) `PrivOSLifecycleService` stops deleting the employee list when its Kanban config is unreadable, and reads the roster to completion instead of silently stopping at 100 items. (2) Payroll deletion becomes a `deletedAt` tombstone written through `mcpapp.db.update`; both repositories filter tombstoned rows out in memory, and a create for an employee that already has a tombstoned row revives it rather than colliding with the unique index. (3) `PayrollDashboard`'s garbage collector refuses to run against an empty roster and no longer lets one failed deletion abort the whole load. No `dropCollection`, no index change.

**Tech Stack:** TypeScript (strict), React 18, Vite 5, Vitest 2, `@privos_ai/app-server` 0.10, `@privos_ai/app-react` 0.6, PrivOS App Database (`mcpapp.db.*`) and Lists (`mcpapp.lists.*`) mediated tools.

**Spec:** No separate spec file. This was a *bounded* task under `superpowers:brainstorming`; the approved design lives in the conversation and is reproduced in full by the task sections below. The three defects it addresses are recorded in "Defects Addressed".

## Global Constraints

- **Do not run any git write command.** `CLAUDE.md` in this repo says "không commit code và không tự động đẩy code lên github", and the operator's standing rule permits git only in read-only mode (`status`, `diff`, `log`, `show`, `blame`, `rev-parse`). Every "Commit" step below is an instruction for the **human operator** to run, not for the agent. The agent stages nothing and commits nothing.
- **Baseline test state is 3 failing tests, 180 passing.** `tests/manifest.spec.ts` (×2) and `tests/ui-shell.spec.ts` (×1) fail because `privos-app.json` declares `name: ai.privos.mcp-app-demo-can-run` but `ui.resourceUri: ui://ai.privos.mcp-app-demo-hr-hrm/form.html`, and `privos-app.json.title` ("PrivOS HR MCP App") differs from `package.json.title` ("PrivOS Demo MCP App Can Run"). **These are pre-existing and out of scope.** Do not "fix" them here and do not mistake them for a regression you caused.
- **Indentation is per-directory.** `src/services/` and `src/payroll-tools.ts` use **tabs**. `src/ui/` uses **2 spaces**. `tests/` uses **2 spaces**. Match the file you are editing.
- **Type gate:** `npm run typecheck:strict-unused` (= `tsc --noEmit --noUnusedLocals --noUnusedParameters`). An unused import or destructured variable is an **error**, not a warning.
- **Never call `mcpapp.db.dropCollection`.** `hr_payroll_records` holds live salary data and its unique index `{ roomId: 1, employeeId: 1 }` is fixed at `registerCollection` time. `mcpapp.db.updateSchema` accepts `fields` only — adding a field is safe, changing the index is not possible without destroying data.
- **Never send a caller-supplied `roomId` into a Hub filter.** Server-side the room always comes from `actor.roomId` (`src/payroll-tools.ts:resolveActorRoom`). UI-side it always comes from `PayrollService`'s constructor argument.
- **Hub limits** (`tools-database.md` — Limits): query result cap 1,000 docs per call, count cap 10,000, 20 collections per app.
- **Out of scope:** payroll authorization. The operator's decision is that PrivOS supports room-role permissions only and the existing owner gating is final. Do not add server-side owner checks, do not remove `hasPayrollOwnerRole`, do not reroute `PayrollService` through `hrm.payroll.*`.
- **Out of scope:** every P1/P2/P3 finding from the audit (undeclared `debug_log` / `mcpapp.messages.*` calls, the `create_item` typo, the scope-audit reverse check, swallowed errors elsewhere, `dangerouslySetInnerHTML`, the sanitizer bypass, bundle size, file sizes, `any` counts). Stay inside the six tasks below.

## Defects Addressed

| # | Defect | Task |
|---|--------|------|
| 1 | `enrichListWithStagesOrDelete` deletes the entire employee list when `JSON.parse` of the Kanban config fails or stages are empty; the roster then reads empty and the payroll GC deletes every salary row in the room | 1 |
| 2 | `fetchListItems` sends a bare `count: 100` with no paging, so the roster silently truncates; the payroll GC then hard-deletes the salary row of every employee past #100 | 2 |
| 3 | Payroll deletion is a hard `mcpapp.db.delete` with no recovery path, in both the server repository and the UI service; `hrm.payroll.delete`'s own description already claims "Soft-delete" and is wrong | 3, 4 |
| 4 | A revived employee can never get a payroll row back once tombstoned, because the unique `{ roomId, employeeId }` index still counts the tombstone | 5 |
| 5 | The GC treats an empty roster as ground truth, and `Promise.all` lets one failed deletion abort the entire load | 6 |

---

### Task 1: Stop deleting the employee list when its Kanban config is unreadable

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:182-197` (`ensureValidList`), `:219-238` (`enrichListWithStagesOrDelete`), `:258-263` (`deleteList` — delete the method)
- Test: `tests/lifecycle-load-profiles.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PrivOSLifecycleService.ensureValidList(roomId: string): Promise<any>` — return type narrows from `Promise<any | null>` to `Promise<any>`; it now either resolves a usable list or throws. `enrichListWithStagesOrDelete` is renamed to `enrichListWithStages(list: any): Promise<any>`. The private method `deleteList` ceases to exist, which removes the only call site of `mcpapp.lists.deleteMany` in the codebase.

- [ ] **Step 1: Write the failing tests**

Append these two tests inside the existing `describe('PrivOSLifecycleService.loadProfiles', ...)` block in `tests/lifecycle-load-profiles.spec.ts`. The helpers `createAppStub`, `HR_LIST` and `CONFIG_ITEM` are already defined at the top of that file — do not redefine them.

```ts
  it('never deletes the employee list when the Kanban config JSON is corrupt', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '{not json' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/cấu hình kanban/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });

  it('never deletes the employee list when the config item holds an empty stage array', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [{ ...CONFIG_ITEM, description: '[]' }],
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/stage/i);
    expect(calls.some(c => c.name === 'mcpapp.lists.deleteMany')).toBe(false);
    expect(calls.some(c => c.name === 'mcpapp.lists.create')).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "never deletes"`

Expected: FAIL. `createAppStub` throws `unexpected tool call: mcpapp.lists.deleteMany` because the current code reaches `deleteList` on both paths — which is precisely the defect.

- [ ] **Step 3: Replace the delete branch with a thrown error**

In `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, replace the whole of `ensureValidList` (lines 182-197) and `enrichListWithStagesOrDelete` (lines 219-238) with the following, and **delete the `deleteList` method** at lines 258-263 entirely. Two-space indentation.

```ts
  private async ensureValidList(roomId: string): Promise<any> {
    const existing = await this.findExistingList(roomId);
    if (existing) return this.enrichListWithStages(existing);
    return this.createNewList(roomId);
  }

  /**
   * Attach the Kanban stage config stored on the list's system config item.
   *
   * This NEVER deletes the list. It used to: a failed `JSON.parse` of the config item's
   * description, or an empty stage array, dropped the entire employee roster and provisioned a
   * fresh empty one. `PayrollDashboard` then reconciled every payroll row against that empty
   * roster and deleted all of them. A corrupt stage config is a config problem; it is not a
   * reason to destroy employee records or the salary rows that hang off them.
   */
  private async enrichListWithStages(list: any): Promise<any> {
    const listId = list._id || list.id;
    const configItem = await this.fetchSystemConfigItem(listId);

    if (configItem?.description) {
      try {
        list.stages = JSON.parse(configItem.description);
      } catch (error) {
        throw new Error(
          `Cấu hình Kanban của danh sách hồ sơ nhân sự (${listId}) không đọc được: ${(error as Error).message}. `
          + 'Sửa lại item "[Hệ thống] Không xoá - Cấu hình Kanban" trong Room. Danh sách hồ sơ được giữ nguyên.'
        );
      }
    }

    if (!this.isValidStagesArray(list.stages)) {
      throw new Error(
        `Danh sách hồ sơ nhân sự (${listId}) không có stage nào. `
        + 'Khôi phục item "[Hệ thống] Không xoá - Cấu hình Kanban" trong Room. Danh sách hồ sơ được giữ nguyên.'
      );
    }

    return list;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`

Expected: PASS, all tests in the file including the five that already existed.

- [ ] **Step 5: Verify nothing else called the removed method**

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0. Then confirm the delete path is gone from the whole codebase:

Run: `npx rg -n "deleteList|lists\.deleteMany" src/`

Expected: no output.

- [ ] **Step 6: Commit (human operator runs this — the agent does not)**

```bash
git add src/ui/lifecycle/services/PrivOSLifecycleService.ts tests/lifecycle-load-profiles.spec.ts
git commit -m "fix(lifecycle): never delete the employee list on a corrupt Kanban config"
```

---

### Task 2: Read the employee roster to completion instead of truncating at 100

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:322-330` (`fetchListItems`)
- Test: `tests/lifecycle-load-profiles.spec.ts`

**Interfaces:**
- Consumes: `enrichListWithStages` from Task 1 (the list must already carry `stages` before `loadProfiles` maps items).
- Produces: `PrivOSLifecycleService.fetchListItems(listId: string): Promise<any[]>` — same signature, now pages and throws rather than truncating. Two new private static constants: `ITEMS_PAGE_SIZE = 100`, `ITEMS_MAX_PAGES = 100`.

**Why this shape:** `mcpapp.lists.getItems` is **not** documented anywhere in this repo as supporting `offset` — every existing call site (`CVScoredTab.tsx:643`, `:763`, `email-history-service.ts:73`, `lifecycleService.ts:55`) passes `count` only, and `offset` paging appears only on `mcpapp.db.query` and `api/files/list`. Assuming `offset` works and being wrong would return the same first page forever. So each page is checked for progress: a page that yields no ids we have not already seen means the Hub ignored `offset`, and that throws. A partial roster is the input that causes the data loss, so refusing to return one is the whole point.

- [ ] **Step 1: Write the failing tests**

Add this helper immediately after the existing `EMPLOYEE_ITEM` constant in `tests/lifecycle-load-profiles.spec.ts`:

```ts
/** `n` employee items with ids starting at `offset`, so a paging read can be asserted. */
function itemPage(offset: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    _id: `emp-${offset + i}`,
    name: `NV ${offset + i}`,
    stageId: 'stage-1',
    customFields: [],
  }));
}
```

Then add this new top-level `describe` block at the end of the file, after the existing `describe('PrivOSLifecycleService.loadProfiles', ...)` block closes:

```ts
describe('PrivOSLifecycleService roster paging', () => {
  it('reads past the first page instead of truncating the roster at 100', async () => {
    const { app, calls } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      'mcpapp.lists.getItems': (args) => (Number(args.offset ?? 0) === 0 ? itemPage(0, 100) : itemPage(100, 7)),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toHaveLength(107);
    const itemCalls = calls.filter(c => c.name === 'mcpapp.lists.getItems');
    expect(itemCalls.map(c => c.arguments!.offset)).toEqual([0, 100]);
  });

  it('throws instead of returning a partial roster when the hub ignores offset', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [HR_LIST],
      'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
      // The same full page every time — what a hub that silently drops `offset` produces.
      'mcpapp.lists.getItems': () => itemPage(0, 100),
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow(/offset/i);
  });

  it('stops on a short first page without asking for a second', async () => {
    const { app, calls } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await service.loadProfiles('room-1');
    expect(calls.filter(c => c.name === 'mcpapp.lists.getItems')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts -t "roster paging"`

Expected: FAIL on the first two tests. The first resolves to 100 profiles instead of 107 and records a single `getItems` call with no `offset`; the second resolves instead of rejecting. The third already passes — it is the regression guard that the new loop does not add a wasted second call on small rooms.

- [ ] **Step 3: Implement paging with progress detection**

Replace `fetchListItems` (lines 322-330) in `src/ui/lifecycle/services/PrivOSLifecycleService.ts` with the following. Add the two constants alongside the existing private statics at the top of the class (next to `DEFAULT_STAGE`). Two-space indentation.

```ts
  /** One `mcpapp.lists.getItems` page. 100 is the value this call has used since the migration. */
  private static readonly ITEMS_PAGE_SIZE = 100;

  /** 100 × 100 = 10,000 items — the same ceiling `PAYROLL_MAX_PAGES` gives the payroll read. */
  private static readonly ITEMS_MAX_PAGES = 100;
```

```ts
  /**
   * Read EVERY item of a list.
   *
   * This used to send a bare `count: 100` and return whatever came back. `PayrollDashboard`
   * treats any employee missing from this roster as an orphan and deletes their payroll row, so
   * a silently truncated read at employee 101 destroyed real salary data.
   *
   * `mcpapp.lists.getItems` is not documented in this repo as supporting `offset`, so rather than
   * assume it does, every page is checked for progress: a page that yields no unseen id means the
   * hub ignored `offset`, and that throws. Returning a partial roster is the failure mode this
   * method exists to prevent, so it is never the fallback.
   */
  private async fetchListItems(listId: string): Promise<any[]> {
    const pageSize = PrivOSLifecycleService.ITEMS_PAGE_SIZE;
    const collected: any[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < PrivOSLifecycleService.ITEMS_MAX_PAGES; page += 1) {
      const res: any = await this.app.callServerTool({
        name: 'mcpapp.lists.getItems',
        arguments: { listId, count: pageSize, offset: page * pageSize }
      });

      const parsed: any = parseToolResult(res);
      const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);

      let fresh = 0;
      for (const item of items) {
        const id = typeof item?._id === 'string' ? item._id : (typeof item?.id === 'string' ? item.id : '');
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        collected.push(item);
        fresh += 1;
      }

      if (items.length > 0 && fresh === 0) {
        throw new Error(
          `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
          + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về roster thiếu.'
        );
      }

      if (items.length < pageSize) return collected;
    }

    throw new Error(
      `Danh sách ${listId} vượt quá ${PrivOSLifecycleService.ITEMS_MAX_PAGES * pageSize} item. `
      + 'Dừng để không trả về roster thiếu.'
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`

Expected: PASS, every test in the file.

- [ ] **Step 5: Run the type gate**

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0.

- [ ] **Step 6: Commit (human operator runs this — the agent does not)**

```bash
git add src/ui/lifecycle/services/PrivOSLifecycleService.ts tests/lifecycle-load-profiles.spec.ts
git commit -m "fix(lifecycle): page the roster read and refuse to return a partial roster"
```

---

### Task 3: Register the `deletedAt` field and migrate already-registered rooms

**Files:**
- Modify: `src/services/payroll/payroll-schema.ts` (`PAYROLL_FIELDS`, new `isLivePayrollRecord`)
- Modify: `src/services/payroll/payroll-repository.ts` (`PayrollDocument`, `PayrollInput`)
- Modify: `src/ui/payroll/types.ts` (`PayrollRecord`)
- Modify: `src/services/hub-tool-caller.ts:16-34` (`SCOPE_BY_TOOL`)
- Modify: `src/services/payroll/app-db-payroll-repository.ts:27-38` (`initializeSchema`)
- Modify: `src/ui/payroll/services/PayrollService.ts:41-52` (`initializeSchema`)
- Modify: `SCOPES.md` (the `db:schema:write` row)
- Test: `tests/hub-tool-caller.spec.ts`, `tests/app-db-payroll-repository.spec.ts`, `tests/payroll-service.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces:
  - `PAYROLL_FIELDS` gains `{ name: 'deletedAt', type: 'string', maxLength: 32 }` as its last entry.
  - `export function isLivePayrollRecord(record: { deletedAt?: string }): boolean` in `src/services/payroll/payroll-schema.ts` — Tasks 4 and 5 both import it.
  - `PayrollDocument` gains `readonly deletedAt?: string`. `PayrollInput` becomes `Omit<PayrollDocument, '_id' | 'roomId' | '_createdAt' | '_updatedAt' | 'deletedAt'>` so no tool caller can set a tombstone through `hrm.payroll.create/update`.
  - `PayrollRecord` (UI) gains `readonly deletedAt?: string`.
  - `resolveRequiredScope('mcpapp.db.updateSchema')` returns `'db:schema:write'`.
  - Both `initializeSchema` implementations now issue **two** Hub calls: `registerCollection`, then `updateSchema`.

**Why `updateSchema` and why it may throw:** rooms registered before this change still enforce the old field list, and the Hub rejects a write carrying an unregistered field — so a soft delete would fail there. `mcpapp.db.updateSchema` accepts `fields` only (recorded in `docs/superpowers/plans/2026-09-10-payroll-db-conformance-fixes.md:414`), which is exactly what is needed and cannot touch the unique index. The earlier plan's blanket "do not call `updateSchema`" was scoped to that plan, where the goal was an index change that `updateSchema` genuinely cannot do. **This tool has never been exercised by this app.** The call is deliberately left to throw rather than be swallowed: if `updateSchema` is unreachable, soft delete is impossible in that room, and the correct outcome is a loud failure at init, not a silent one at delete time. Step 6 is the go/no-go check.

- [ ] **Step 1: Write the failing tests**

In `tests/hub-tool-caller.spec.ts`, add this test inside the existing top-level `describe`:

```ts
  it('allows mcpapp.db.updateSchema under db:schema:write', () => {
    expect(resolveRequiredScope('mcpapp.db.updateSchema')).toBe('db:schema:write');
  });
```

In `tests/app-db-payroll-repository.spec.ts`, **replace** the existing test `'registers a room-scoped collection with the unique (roomId, employeeId) index'` (it asserts `expect(calls).toHaveLength(1)`, which the second call now breaks) with these two:

```ts
  it('registers a room-scoped collection with the unique (roomId, employeeId) index', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).initializeSchema('room-1');
    const register = calls.find((call) => call.name === 'mcpapp.db.registerCollection')!;
    expect(register.roomId).toBe('room-1');
    expect(register.args.collection).toBe(PAYROLL_COLLECTION);
    expect(register.args.scope).toBe('room');
    expect(register.args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
    const fields = register.args.fields as Array<{ name: string; required?: boolean }>;
    expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
    expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
    expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
  });

  it('migrates an already-registered room by adding the new field list', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.registerCollection': new Error('Collection already registered'),
    });
    await new AppDbPayrollRepository(factory).initializeSchema('room-1');
    const update = calls.find((call) => call.name === 'mcpapp.db.updateSchema')!;
    expect(update).toBeDefined();
    expect(update.args.collection).toBe(PAYROLL_COLLECTION);
    const fields = update.args.fields as Array<{ name: string }>;
    expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    expect(update.args).not.toHaveProperty('indexes');
  });

  it('propagates an updateSchema failure instead of pretending the room can soft-delete', async () => {
    const { factory } = fakeCaller({ 'mcpapp.db.updateSchema': new Error('Unknown tool') });
    await expect(new AppDbPayrollRepository(factory).initializeSchema('room-1')).rejects.toThrow(/unknown tool/i);
  });
```

In `tests/payroll-service.spec.ts`, **replace** the test `'registers the room-scoped collection with the unique (roomId, employeeId) index'` (same `toHaveLength(1)` problem) with:

```ts
    it('registers the room-scoped collection with the unique (roomId, employeeId) index', async () => {
      const { svc, calls } = service({
        'mcpapp.db.registerCollection': () => ({ ok: true }),
        'mcpapp.db.updateSchema': () => ({ ok: true }),
      });
      await svc.initializeSchema();

      const register = calls.find((call) => call.name === 'mcpapp.db.registerCollection')!;
      const args = register.arguments!;
      expect(args.collection).toBe(PAYROLL_COLLECTION);
      expect(args.scope).toBe('room');
      expect(args.indexes).toEqual([{ fields: { roomId: 1, employeeId: 1 }, unique: true }]);
      const fields = args.fields as Array<{ name: string; required?: boolean }>;
      expect(fields.find((f) => f.name === 'roomId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'employeeId')?.required).toBe(true);
      expect(fields.find((f) => f.name === 'baseSalary')?.required).toBe(true);
      expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    });

    it('migrates an already-registered room by adding the new field list', async () => {
      const { svc, calls } = service({
        'mcpapp.db.registerCollection': () => toolError('Collection already registered'),
        'mcpapp.db.updateSchema': () => ({ ok: true }),
      });
      await svc.initializeSchema();

      const update = calls.find((call) => call.name === 'mcpapp.db.updateSchema')!;
      expect(update).toBeDefined();
      const fields = update.arguments!.fields as Array<{ name: string }>;
      expect(fields.some((f) => f.name === 'deletedAt')).toBe(true);
    });
```

Also update the two surviving `initializeSchema` tests in that file so their handler maps include `'mcpapp.db.updateSchema': () => ({ ok: true })` — `createAppStub` throws `unexpected tool call` for any name it has no handler for. The test `'propagates any other registration failure'` needs no handler added, because it rejects before `updateSchema` is reached.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hub-tool-caller.spec.ts tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts`

Expected: FAIL. `resolveRequiredScope` throws `Hub tool "mcpapp.db.updateSchema" is not allowed from the server`; the `deletedAt` field assertions fail because the field does not exist; the migration tests find no `mcpapp.db.updateSchema` call.

- [ ] **Step 3: Add the field, the live-row predicate, and the types**

In `src/services/payroll/payroll-schema.ts`, append to `PAYROLL_FIELDS` (tabs):

```ts
	/**
	 * Soft-delete tombstone: an ISO-8601 timestamp when the row is deleted, absent or empty
	 * otherwise. Payroll rows are never removed from the collection. `PayrollDashboard`'s garbage
	 * collector used to hard-delete any row whose employee it could not match against the roster,
	 * so one truncated or failed roster read was unrecoverable.
	 */
	{ name: 'deletedAt', type: 'string', maxLength: 32 },
```

And append this exported function to the same file (it has no imports by design — the UI bundle pulls this module in):

```ts
/**
 * A row is live until it carries a `deletedAt` tombstone.
 *
 * Reads filter on this in memory rather than in a `where` clause: rows written before `deletedAt`
 * was registered have no such field at all, and a `where deletedAt == null` clause is not
 * guaranteed to match a document that is missing the field entirely. Reviving a row clears the
 * tombstone by writing `''`, which is falsy here — the schema types the field as a string, so
 * there is no null to write.
 */
export function isLivePayrollRecord(record: { deletedAt?: string }): boolean {
	return !record.deletedAt;
}
```

In `src/services/payroll/payroll-repository.ts`, add to `PayrollDocument` after `_updatedAt` (tabs):

```ts
	/** Soft-delete tombstone — see `isLivePayrollRecord` in `payroll-schema.ts`. Server-owned. */
	readonly deletedAt?: string;
```

and change `PayrollInput` so no tool caller can set a tombstone:

```ts
export type PayrollInput = Omit<PayrollDocument, '_id' | 'roomId' | '_createdAt' | '_updatedAt' | 'deletedAt'>;
```

In `src/ui/payroll/types.ts`, add to `PayrollRecord` after `_updatedAt` (2 spaces):

```ts
  /** Soft-delete tombstone — see `isLivePayrollRecord` in `services/payroll/payroll-schema.ts`. */
  readonly deletedAt?: string;
```

- [ ] **Step 4: Allow the tool and issue the migration call**

In `src/services/hub-tool-caller.ts`, add to `SCOPE_BY_TOOL` directly under the `getSchema` entry (tabs):

```ts
	'mcpapp.db.updateSchema': 'db:schema:write',
```

Replace `initializeSchema` in `src/services/payroll/app-db-payroll-repository.ts` (tabs):

```ts
	async initializeSchema(roomId: string): Promise<void> {
		const call = this.callerFactory(roomId);
		try {
			await call('mcpapp.db.registerCollection', {
				collection: PAYROLL_COLLECTION,
				scope: 'room',
				fields: PAYROLL_FIELDS,
				indexes: PAYROLL_INDEXES,
			});
		} catch (error) {
			if (!isAlreadyRegisteredError(error)) throw error;
		}
		// Rooms registered before `deletedAt` existed still enforce the old field list, and the hub
		// rejects a write carrying an unregistered field — a soft delete there would fail. This adds
		// the field. `updateSchema` takes `fields` only and cannot touch the unique index, so it is
		// safe to run on every load and is a no-op once the room is current. It is deliberately NOT
		// swallowed: a room that cannot take the field cannot soft-delete, and that must be loud.
		await call('mcpapp.db.updateSchema', { collection: PAYROLL_COLLECTION, fields: PAYROLL_FIELDS });
	}
```

Replace `initializeSchema` in `src/ui/payroll/services/PayrollService.ts` (2 spaces):

```ts
  async initializeSchema(): Promise<void> {
    try {
      await this.call('mcpapp.db.registerCollection', {
        collection: PAYROLL_COLLECTION,
        scope: 'room',
        fields: PAYROLL_FIELDS,
        indexes: PAYROLL_INDEXES,
      });
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) throw error;
    }
    // See the same call in `app-db-payroll-repository.ts` — this is the user-session mirror of it.
    await this.call('mcpapp.db.updateSchema', { collection: PAYROLL_COLLECTION, fields: PAYROLL_FIELDS });
  }
```

In `SCOPES.md`, replace the `db:schema:write` row's "Why / call site" cell with:

```
`PayrollService.initializeSchema` registers `hr_payroll_records` once per room via `mcpapp.db.registerCollection`, then calls `mcpapp.db.updateSchema` so a room registered before the `deletedAt` tombstone field existed accepts it (shared shape in `services/payroll/payroll-schema.ts`); `AppDbPayrollRepository.initializeSchema` mirrors both on the server path; `AppDbActiveTemplateStore` registers `hr_email_template_settings` on its first write.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/hub-tool-caller.spec.ts tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts tests/scope-audit.spec.ts tests/permission-catalog.spec.ts`

Expected: PASS. Then the type gate:

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0.

- [ ] **Step 6: GO / NO-GO — prove `mcpapp.db.updateSchema` actually works**

This is the one unverified assumption in the plan. Start the app against a real paired room and open the Payroll tab:

Run: `npm start`

Expected: the tab loads past "Đang khởi tạo hệ thống Lương…". If the browser console shows `Failed to init Payroll schema` with an error naming `mcpapp.db.updateSchema` (unknown tool, not allowed, insufficient scope), **STOP HERE**. Do not continue to Task 4 — soft delete is not achievable through this path and the design needs revisiting. Report the exact error text.

- [ ] **Step 7: Commit (human operator runs this — the agent does not)**

```bash
git add src/services/payroll/payroll-schema.ts src/services/payroll/payroll-repository.ts src/services/payroll/app-db-payroll-repository.ts src/services/hub-tool-caller.ts src/ui/payroll/types.ts src/ui/payroll/services/PayrollService.ts SCOPES.md tests/hub-tool-caller.spec.ts tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts
git commit -m "feat(payroll): register the deletedAt tombstone field and migrate existing rooms"
```

---

### Task 4: Make payroll deletion a tombstone, and hide tombstoned rows from reads

**Files:**
- Modify: `src/services/payroll/app-db-payroll-repository.ts:40-64` (`queryByRoom`), `:84-86` (`delete`)
- Modify: `src/ui/payroll/services/PayrollService.ts:54-76` (`getRecords`), `:91-93` (`deleteRecord`)
- Test: `tests/app-db-payroll-repository.spec.ts`, `tests/payroll-service.spec.ts`

**Interfaces:**
- Consumes: `isLivePayrollRecord` from Task 3 (`src/services/payroll/payroll-schema.ts`); the registered `deletedAt` field.
- Produces: `IPayrollRepository.delete` and `IPayrollService.deleteRecord` keep their signatures (`Promise<void>`) but now write `mcpapp.db.update`. `mcpapp.db.delete` has no remaining call site for payroll. This also makes the `hrm.payroll.delete` tool description ("Soft-delete one payroll record by id") true — it is currently wrong.

- [ ] **Step 1: Write the failing tests**

In `tests/app-db-payroll-repository.spec.ts`, **replace** the existing test `'update and delete forward id and pin roomId in data'` (it asserts `calls[1]` is `mcpapp.db.delete`) with:

```ts
  it('update forwards id and pins roomId in data', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).update('room-1', 'id-1', { baseSalary: 9 });
    expect(calls[0]).toEqual({
      roomId: 'room-1',
      name: 'mcpapp.db.update',
      args: { collection: PAYROLL_COLLECTION, id: 'id-1', data: { baseSalary: 9, roomId: 'room-1' } },
    });
  });

  it('delete writes a deletedAt tombstone and never calls mcpapp.db.delete', async () => {
    const { factory, calls } = fakeCaller();
    await new AppDbPayrollRepository(factory).delete('room-1', 'id-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('mcpapp.db.update');
    expect(calls[0].args.id).toBe('id-1');
    const data = calls[0].args.data as Record<string, unknown>;
    expect(data.roomId).toBe('room-1');
    expect(Number.isNaN(Date.parse(data.deletedAt as string))).toBe(false);
  });

  it('hides tombstoned rows from queryByRoom', async () => {
    const { factory } = pagingCaller([
      [
        { _id: 'live', roomId: 'room-1', employeeId: 'a', baseSalary: 1 },
        { _id: 'dead', roomId: 'room-1', employeeId: 'b', baseSalary: 1, deletedAt: '2026-09-15T00:00:00.000Z' },
        { _id: 'revived', roomId: 'room-1', employeeId: 'c', baseSalary: 1, deletedAt: '' },
      ],
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows.map((row) => row._id).sort()).toEqual(['live', 'revived']);
  });

  it('counts tombstoned rows toward the page size so paging is not cut short', async () => {
    const tombstoned = fullPage(PAYROLL_PAGE_SIZE, 'p0').map((row) => ({ ...row, deletedAt: '2026-09-15T00:00:00.000Z' }));
    const { factory, calls } = pagingCaller([tombstoned, fullPage(2, 'p1')]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(calls).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });
```

In `tests/payroll-service.spec.ts`, **replace** the whole `describe('deleteRecord', ...)` block with:

```ts
  describe('deleteRecord', () => {
    it('writes a deletedAt tombstone and never calls mcpapp.db.delete', async () => {
      const { svc, calls } = service({ 'mcpapp.db.update': () => ({ ok: true }) });
      await svc.deleteRecord('id-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('mcpapp.db.update');
      expect(calls[0].arguments!.collection).toBe(PAYROLL_COLLECTION);
      expect(calls[0].arguments!.id).toBe('id-1');
      const data = calls[0].arguments!.data as Record<string, unknown>;
      expect(data.roomId).toBe('room-1');
      expect(Number.isNaN(Date.parse(data.deletedAt as string))).toBe(false);
    });

    it('rejects a tool-level delete failure', async () => {
      const { svc } = service({ 'mcpapp.db.update': () => toolError('Not found') });
      await expect(svc.deleteRecord('id-1')).rejects.toThrow(/not found/i);
    });
  });
```

and add this test inside the existing `describe('getRecords', ...)` block:

```ts
    it('hides tombstoned rows', async () => {
      const { svc } = service(
        pagingHandlers([
          [
            { _id: 'live', roomId: 'room-1', employeeId: 'a', baseSalary: 1 },
            { _id: 'dead', roomId: 'room-1', employeeId: 'b', baseSalary: 1, deletedAt: '2026-09-15T00:00:00.000Z' },
          ],
        ]),
      );

      expect((await svc.getRecords()).map((row) => row._id)).toEqual(['live']);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts`

Expected: FAIL. `delete`/`deleteRecord` still issue `mcpapp.db.delete`, so the handler map has no entry and the stub throws; the tombstone filter tests return both rows.

- [ ] **Step 3: Write the tombstone on delete and filter it on read**

In `src/services/payroll/app-db-payroll-repository.ts` (tabs), add `isLivePayrollRecord` to the existing import from `./payroll-schema`, replace the `return` at the end of `queryByRoom`:

```ts
		// Tombstoned rows are filtered here, not in the `where` clause: rows written before
		// `deletedAt` was registered have no such field, and a `where deletedAt == null` is not
		// guaranteed to match a missing field. Paging above still counts the raw page length, so a
		// page made entirely of tombstones does not end the read early. The query itself is
		// unchanged and still uses the { roomId: 1, employeeId: 1 } index via its roomId prefix.
		return collected.filter(isLivePayrollRecord).sort(byCreatedAtDesc);
```

and replace `delete`:

```ts
	async delete(roomId: string, id: string): Promise<void> {
		// Soft delete. The row stays so a mistaken garbage-collection pass is recoverable, and so the
		// unique (roomId, employeeId) index still records that this employee has a row — `create`
		// revives it rather than colliding with it.
		await this.callerFactory(roomId)('mcpapp.db.update', {
			collection: PAYROLL_COLLECTION,
			id,
			data: { roomId, deletedAt: new Date().toISOString() },
		});
	}
```

In `src/ui/payroll/services/PayrollService.ts` (2 spaces), add `isLivePayrollRecord` to the existing import from `'../../../services/payroll/payroll-schema'`, replace the `return` at the end of `getRecords`:

```ts
    // See `AppDbPayrollRepository.queryByRoom` — the same in-memory tombstone filter, for the same
    // reason: legacy rows have no `deletedAt` field for a `where` clause to match against.
    return collected.filter(isLivePayrollRecord).sort(byCreatedAtDesc);
```

and replace `deleteRecord`:

```ts
  async deleteRecord(id: string): Promise<void> {
    // Soft delete — the user-session mirror of `AppDbPayrollRepository.delete`.
    await this.call('mcpapp.db.update', {
      collection: PAYROLL_COLLECTION,
      id,
      data: { roomId: this.roomId, deletedAt: new Date().toISOString() },
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts tests/payroll-tools.spec.ts`

Expected: PASS. `tests/payroll-tools.spec.ts` is unaffected — it stubs `IPayrollRepository` and only asserts that `delete` was called with `('room-1', 'x1')`.

- [ ] **Step 5: Confirm no payroll path still hard-deletes**

Run: `npx rg -n "mcpapp\.db\.delete" src/`

Expected: no output.

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0.

- [ ] **Step 6: Commit (human operator runs this — the agent does not)**

```bash
git add src/services/payroll/app-db-payroll-repository.ts src/ui/payroll/services/PayrollService.ts tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts
git commit -m "feat(payroll): soft-delete rows with a deletedAt tombstone instead of removing them"
```

---

### Task 5: Revive a tombstoned row instead of colliding with the unique index

**Files:**
- Modify: `src/services/payroll/app-db-payroll-repository.ts:66-73` (`create`, plus a new private `findAnyByEmployee`)
- Modify: `src/ui/payroll/services/PayrollService.ts:78-89` (`saveRecord`, plus a new private `findAnyByEmployee`)
- Test: `tests/app-db-payroll-repository.spec.ts`, `tests/payroll-service.spec.ts`

**Interfaces:**
- Consumes: the `deletedAt` field from Task 3; the tombstone-writing `delete` from Task 4.
- Produces: `create` / `saveRecord` keep their signatures. Each gains one private helper:
  - `AppDbPayrollRepository.findAnyByEmployee(call: HubToolCaller, roomId: string, employeeId: string): Promise<PayrollDocument | undefined>`
  - `PayrollService.findAnyByEmployee(employeeId: string): Promise<PayrollRecord | undefined>`

  Both query with **both** index keys in the filter, so the read uses the full unique `{ roomId: 1, employeeId: 1 }` index rather than only its prefix.

**Why:** the unique index counts tombstoned rows. Without this, once an employee's payroll row is tombstoned, every later attempt to enter their salary is rejected by the index forever — the recovery path the whole tombstone design exists to provide would not work.

- [ ] **Step 1: Write the failing tests**

In `tests/app-db-payroll-repository.spec.ts`, **replace** the existing test `'create stamps roomId from the argument, never from data'` (with a lookup preceding the create, `calls[0]` is now the query) with these three:

```ts
  it('create stamps roomId from the argument, never from data', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': { records: [] },
      'mcpapp.db.create': { _id: 'new', roomId: 'room-1', employeeId: 'e1', baseSalary: 5 },
    });
    const created = await new AppDbPayrollRepository(factory).create('room-1', {
      employeeId: 'e1',
      baseSalary: 5,
      ...({ roomId: 'room-EVIL' } as object),
    } as never);

    expect(created._id).toBe('new');
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
    expect((calls[1].args.data as Record<string, unknown>).roomId).toBe('room-1');
  });

  it('looks the employee up on both index keys before creating', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': { records: [] },
      'mcpapp.db.create': { _id: 'new' },
    });
    await new AppDbPayrollRepository(factory).create('room-1', { employeeId: 'e1', baseSalary: 5 } as never);

    expect(calls[0].args.where).toEqual([
      { field: 'roomId', op: '==', value: 'room-1' },
      { field: 'employeeId', op: '==', value: 'e1' },
    ]);
    expect(calls[0].args.limit).toBe(1);
  });

  it('revives a tombstoned row instead of creating a duplicate the unique index would reject', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{
          _id: 'tomb-1',
          roomId: 'room-1',
          employeeId: 'e1',
          baseSalary: 1,
          deletedAt: '2026-09-01T00:00:00.000Z',
        }],
      },
    });
    const revived = await new AppDbPayrollRepository(factory).create('room-1', {
      employeeId: 'e1',
      baseSalary: 7,
    } as never);

    expect(calls.some((call) => call.name === 'mcpapp.db.create')).toBe(false);
    const update = calls.find((call) => call.name === 'mcpapp.db.update')!;
    expect(update.args.id).toBe('tomb-1');
    const data = update.args.data as Record<string, unknown>;
    expect(data.baseSalary).toBe(7);
    expect(data.roomId).toBe('room-1');
    expect(data.deletedAt).toBe('');
    expect(revived._id).toBe('tomb-1');
    expect(revived.deletedAt).toBeUndefined();
  });
```

In `tests/payroll-service.spec.ts`, **replace** the two create-path tests `'creates with roomId stamped from the service, never from the record'` and `'never sends hub-assigned timestamps back on a write'` with:

```ts
    it('creates with roomId stamped from the service, never from the record', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({ records: [] }),
        'mcpapp.db.create': () => ({ _id: 'new' }),
      });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: 't',
        bankAccount: 'b',
        ...({ roomId: 'room-EVIL' } as object),
      } as PayrollRecord);

      expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query', 'mcpapp.db.create']);
      expect(calls[1].arguments).toEqual({
        collection: PAYROLL_COLLECTION,
        data: { employeeId: 'e1', baseSalary: 5, taxId: 't', bankAccount: 'b', roomId: 'room-1' },
      });
    });

    it('never sends hub-assigned timestamps or a tombstone back on a write', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({ records: [] }),
        'mcpapp.db.create': () => ({ _id: 'new' }),
      });
      await svc.saveRecord({
        employeeId: 'e1',
        baseSalary: 5,
        taxId: '',
        bankAccount: '',
        _createdAt: '2026-01-01T00:00:00.000Z',
        _updatedAt: '2026-01-02T00:00:00.000Z',
        deletedAt: '2026-01-03T00:00:00.000Z',
      });

      const data = calls[1].arguments!.data as Record<string, unknown>;
      expect(data).not.toHaveProperty('_createdAt');
      expect(data).not.toHaveProperty('_updatedAt');
      expect(data).not.toHaveProperty('_id');
      expect(data).not.toHaveProperty('deletedAt');
    });

    it('revives a tombstoned row instead of creating a duplicate the unique index would reject', async () => {
      const { svc, calls } = service({
        'mcpapp.db.query': () => ({
          records: [{ _id: 'tomb-1', roomId: 'room-1', employeeId: 'e1', baseSalary: 1, deletedAt: '2026-09-01T00:00:00.000Z' }],
        }),
        'mcpapp.db.update': () => ({ ok: true }),
      });
      await svc.saveRecord({ employeeId: 'e1', baseSalary: 7, taxId: '', bankAccount: '' });

      expect(calls.some((call) => call.name === 'mcpapp.db.create')).toBe(false);
      const update = calls.find((call) => call.name === 'mcpapp.db.update')!;
      expect(update.arguments!.id).toBe('tomb-1');
      const data = update.arguments!.data as Record<string, unknown>;
      expect(data.baseSalary).toBe(7);
      expect(data.deletedAt).toBe('');
    });
```

The test `'rejects a tool-level write failure instead of reporting success'` also needs `'mcpapp.db.query': () => ({ records: [] })` added to its handler map, because the lookup now runs first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts`

Expected: FAIL. `create`/`saveRecord` issue no lookup, so `calls` starts with the create; the revive tests see an `mcpapp.db.create` that should not exist.

- [ ] **Step 3: Implement the lookup-then-revive path**

In `src/services/payroll/app-db-payroll-repository.ts` (tabs), replace `create` and add the helper directly below it:

```ts
	async create(roomId: string, data: PayrollInput): Promise<PayrollDocument> {
		const { roomId: _ignored, ...safe } = data as PayrollInput & { roomId?: string };
		const call = this.callerFactory(roomId);

		// The unique (roomId, employeeId) index counts tombstoned rows too, so a plain create for an
		// employee whose row was soft-deleted would be rejected for good. Revive that row instead —
		// without this, the tombstone is not recoverable and Task 4 buys nothing.
		const existing = await this.findAnyByEmployee(call, roomId, safe.employeeId);
		if (existing?._id) {
			await call('mcpapp.db.update', {
				collection: PAYROLL_COLLECTION,
				id: existing._id,
				// `''` rather than null: the field is registered as a string, and `isLivePayrollRecord`
				// treats any falsy value as live.
				data: { ...safe, roomId, deletedAt: '' },
			});
			return { ...existing, ...safe, roomId, deletedAt: undefined } as PayrollDocument;
		}

		const created = await call('mcpapp.db.create', {
			collection: PAYROLL_COLLECTION,
			data: { ...safe, roomId },
		});
		return asRecord(created) as unknown as PayrollDocument;
	}

	/**
	 * The row for one employee in this room, tombstoned or not. Both keys of the unique
	 * { roomId: 1, employeeId: 1 } index are in the filter, so this uses the whole index.
	 */
	private async findAnyByEmployee(
		call: HubToolCaller,
		roomId: string,
		employeeId: string,
	): Promise<PayrollDocument | undefined> {
		const response = asRecord(
			await call('mcpapp.db.query', {
				collection: PAYROLL_COLLECTION,
				where: [
					{ field: 'roomId', op: '==', value: roomId },
					{ field: 'employeeId', op: '==', value: employeeId },
				],
				limit: 1,
				offset: 0,
			}),
		);
		const records = Array.isArray(response.records) ? (response.records as PayrollDocument[]) : [];
		return records[0];
	}
```

In `src/ui/payroll/services/PayrollService.ts` (2 spaces), replace `saveRecord` and add the helper below it:

```ts
  async saveRecord(record: PayrollRecord): Promise<void> {
    // `_id`/`_createdAt`/`_updatedAt` are hub-assigned, `roomId` is service-owned and `deletedAt` is
    // written only by `deleteRecord` and cleared only by a revive: none of them belong in a write
    // payload built from UI state.
    const { _id, _createdAt: _c, _updatedAt: _u, roomId: _room, deletedAt: _d, ...fields } = record;
    const data = { ...fields, roomId: this.roomId };

    if (_id) {
      await this.call('mcpapp.db.update', { collection: PAYROLL_COLLECTION, id: _id, data });
      return;
    }

    // The unique (roomId, employeeId) index counts tombstoned rows, so creating a second row for an
    // employee whose row was soft-deleted would be rejected. Revive that row instead — this is the
    // user-session mirror of `AppDbPayrollRepository.create`.
    const existing = await this.findAnyByEmployee(record.employeeId);
    if (existing?._id) {
      await this.call('mcpapp.db.update', {
        collection: PAYROLL_COLLECTION,
        id: existing._id,
        data: { ...data, deletedAt: '' },
      });
      return;
    }

    await this.call('mcpapp.db.create', { collection: PAYROLL_COLLECTION, data });
  }

  /**
   * The row for one employee in this room, tombstoned or not. Both keys of the unique
   * { roomId: 1, employeeId: 1 } index are in the filter, so this uses the whole index.
   */
  private async findAnyByEmployee(employeeId: string): Promise<PayrollRecord | undefined> {
    const response = await this.call('mcpapp.db.query', {
      collection: PAYROLL_COLLECTION,
      where: [
        { field: 'roomId', op: '==', value: this.roomId },
        { field: 'employeeId', op: '==', value: employeeId },
      ],
      limit: 1,
      offset: 0,
    });
    const records = Array.isArray(response.records) ? (response.records as PayrollRecord[]) : [];
    return records[0];
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts`

Expected: PASS.

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0. If `HubToolCaller` is not yet imported as a type in `app-db-payroll-repository.ts`, it already is on line 1 (`import { createRoomHubToolCaller, type HubToolCaller } from '../hub-tool-caller';`) — do not add a duplicate import.

- [ ] **Step 5: Commit (human operator runs this — the agent does not)**

```bash
git add src/services/payroll/app-db-payroll-repository.ts src/ui/payroll/services/PayrollService.ts tests/app-db-payroll-repository.spec.ts tests/payroll-service.spec.ts
git commit -m "fix(payroll): revive a tombstoned row instead of colliding with the unique index"
```

---

### Task 6: Refuse to garbage-collect against an empty roster, and survive a failed deletion

**Files:**
- Modify: `src/ui/payroll/payroll-selectors.ts` (new `selectOrphanedPayrolls` export)
- Modify: `src/ui/payroll/components/PayrollDashboard.tsx:196-211`
- Test: `tests/payroll-selectors.spec.ts`

**Interfaces:**
- Consumes: the tombstoning `deleteRecord` from Task 4 — the GC's deletions are now recoverable, which is what makes it safe to keep the GC at all.
- Produces: `export function selectOrphanedPayrolls(employees: readonly EmployeeProfile[], payrolls: readonly PayrollRecord[]): PayrollRecord[]` in `src/ui/payroll/payroll-selectors.ts`.

**Why a pure function:** `PayrollDashboard.tsx` is 885 lines and has no test file. Extracting the one decision that destroys data into `payroll-selectors.ts` — which already holds every other payroll decision and already has a spec file — makes it testable without rendering a component.

- [ ] **Step 1: Write the failing tests**

Append to `tests/payroll-selectors.spec.ts`. Add `selectOrphanedPayrolls` to the existing import from `'../src/ui/payroll/payroll-selectors'`. The type imports `EmployeeProfile` and `PayrollRecord` are already at lines 2-3 of that file — do not add them again.

```ts
describe('selectOrphanedPayrolls', () => {
  const employee = (id: string) => ({ _id: id, name: id, status: 'Chính thức' }) as EmployeeProfile;
  const payroll = (id: string, employeeId: string): PayrollRecord =>
    ({ _id: id, employeeId, baseSalary: 1, taxId: '', bankAccount: '' });

  it('returns nothing when the roster is empty, however many payroll rows exist', () => {
    expect(selectOrphanedPayrolls([], [payroll('p1', 'e1'), payroll('p2', 'e2')])).toEqual([]);
  });

  it('returns only the rows whose employee is absent from a non-empty roster', () => {
    const result = selectOrphanedPayrolls([employee('e1')], [payroll('p1', 'e1'), payroll('p2', 'gone')]);
    expect(result.map((row) => row._id)).toEqual(['p2']);
  });

  it('skips rows with no id, which cannot be addressed for deletion', () => {
    const noId = { employeeId: 'gone', baseSalary: 1, taxId: '', bankAccount: '' } as PayrollRecord;
    expect(selectOrphanedPayrolls([employee('e1')], [noId])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/payroll-selectors.spec.ts -t "selectOrphanedPayrolls"`

Expected: FAIL to collect — `selectOrphanedPayrolls` is not exported from `payroll-selectors.ts`.

- [ ] **Step 3: Add the pure selector**

Append to `src/ui/payroll/payroll-selectors.ts` (2 spaces). `EmployeeProfile` and `PayrollRecord` are already imported at lines 1-2 of that file — do not add duplicate imports.

```ts
/**
 * The payroll rows whose employee is no longer on the roster — the garbage-collection candidates.
 *
 * Returns nothing when the roster is empty. An empty roster means the lifecycle read failed or the
 * room was just provisioned, never that every employee left at once, and treating it as ground
 * truth is what let a single bad read wipe an entire room's salary data. Rows with no `_id` are
 * skipped because there is nothing to address a deletion to.
 */
export function selectOrphanedPayrolls(
  employees: readonly EmployeeProfile[],
  payrolls: readonly PayrollRecord[],
): PayrollRecord[] {
  if (employees.length === 0) return [];

  const knownEmployeeIds = new Set(employees.map((employee) => employee._id));
  return payrolls.filter((payroll) => Boolean(payroll._id) && !knownEmployeeIds.has(payroll.employeeId));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/payroll-selectors.spec.ts`

Expected: PASS, including every test that was already in the file.

- [ ] **Step 5: Use it from the dashboard and stop letting one failure abort the load**

In `src/ui/payroll/components/PayrollDashboard.tsx`, add `selectOrphanedPayrolls` to the existing import from `'../payroll-selectors'`, then replace lines 196-211 (from the `// DỌN RÁC` comment through the `setPayrolls(...)` call) with (2 spaces):

```ts
      // DỌN RÁC: đánh dấu xoá bản ghi lương của nhân viên không còn trên roster. Từ Task 4 đây là
      // soft-delete nên có thể khôi phục; `selectOrphanedPayrolls` từ chối chạy khi roster rỗng vì
      // roster rỗng nghĩa là đọc lỗi, không phải mọi người đã nghỉ.
      const knownEmployeeIds = new Set(empData.map(e => e._id));
      const orphanedPayrolls = selectOrphanedPayrolls(empData, payData);

      if (!isSilent && orphanedPayrolls.length > 0) {
        console.log(`Tiến hành dọn rác: đánh dấu xoá ${orphanedPayrolls.length} bản ghi lương mồ côi.`);
        const outcomes = await Promise.allSettled(
          orphanedPayrolls.map(p => payrollService.deleteRecord(p._id!))
        );
        for (const outcome of outcomes) {
          // Một lần đánh dấu thất bại không được làm hỏng cả lượt tải — phần dữ liệu còn lại vẫn đúng.
          if (outcome.status === 'rejected') {
            console.error('Dọn rác bản ghi lương thất bại:', outcome.reason);
          }
        }
      }

      const linkedPayrolls = payData.filter(p => knownEmployeeIds.has(p.employeeId));
      setEmployees((previous) => (areEmployeeProfilesEqual(previous, empData) ? previous : empData));
      setPayrolls((previous) => (arePayrollRecordsEqual(previous, linkedPayrolls) ? previous : linkedPayrolls));
```

- [ ] **Step 6: Run the type gate and the full suite**

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`

Expected: exit 0.

Run: `npm test`

Expected: **3 failed, 183+ passed.** The only failures must be the three pre-existing identity-drift failures listed in Global Constraints (`tests/manifest.spec.ts` ×2, `tests/ui-shell.spec.ts` ×1). Any other failure is a regression from this plan.

- [ ] **Step 7: Commit (human operator runs this — the agent does not)**

```bash
git add src/ui/payroll/payroll-selectors.ts src/ui/payroll/components/PayrollDashboard.tsx tests/payroll-selectors.spec.ts
git commit -m "fix(payroll): never garbage-collect against an empty roster"
```

---

## Final Verification

- [ ] **Step 1: Full gate**

Run: `npm run typecheck:strict-unused && npm test && npm run build && npm run preflight`

Expected: typecheck exit 0; tests 3 failed / 183+ passed with only the pre-existing identity-drift failures; build succeeds through `manifest:lint` reporting `"valid": true`; preflight passes.

- [ ] **Step 2: Prove it runs, not just that it builds**

Run: `npm start`

Expected: the server starts and the Payroll tab loads in a real room. A passing test suite and a clean build do **not** establish that the app runs; only this does.

- [ ] **Step 3: Manual acceptance against a real room**

| # | Scenario | Expected |
|---|---|---|
| 1 | Open the Payroll tab in a room with >100 employees | Every employee appears; DevTools Network shows more than one `mcpapp.lists.getItems` call with increasing `offset`; no payroll row disappears |
| 2 | Corrupt the `[Hệ thống] Không xoá - Cấu hình Kanban` item's description to non-JSON, reload | An error naming the Kanban config is shown; the employee list still exists in the room; no `mcpapp.lists.deleteMany` in the Network tab |
| 3 | Delete a payroll row from the UI | The row disappears from the table; in the App Database the document still exists carrying a `deletedAt` timestamp; no `mcpapp.db.delete` in the Network tab |
| 4 | Re-enter a salary for the employee from scenario 3 | The save succeeds (no unique-index error) and the row reappears with the new value |
| 5 | Delete an employee from the Lifecycle Kanban, then reload the Payroll tab | Their payroll row is tombstoned, not erased; it is still recoverable from the App Database |

## Out of Scope — Do Not Do These Here

- Payroll authorization of any kind (operator decision: PrivOS supports room-role permissions only; the existing UI gating is final).
- The `privos-app.json` / `package.json` identity drift and its 3 failing tests.
- The undeclared `debug_log`, `mcpapp.messages.send`, `mcpapp.messages.getRecent` calls and the `mcpapp.lists.create_item` typo.
- A reverse scope-audit test (every `callServerTool` maps to a declared scope).
- `createProfile`'s fake-success fallback, `loadPassedCandidates`' empty-array catch, or any other swallowed error outside `enrichListWithStages`.
- `dangerouslySetInnerHTML` in `bot-drafting-tab.tsx`, the `sanitizeEmailHtml` `<svg/onload=>` bypass, or the loose email regex.
- Bundle size, file size, `any` counts, PII in `console.log`, polling intervals.
