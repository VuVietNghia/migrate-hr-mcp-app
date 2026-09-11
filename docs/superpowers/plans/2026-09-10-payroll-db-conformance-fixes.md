# Payroll ↔ App Database Conformance Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the payroll feature's App Database usage in line with the documented `mcpapp.db.*` contract — a deterministic paginated read, a debug panel that shows the request actually sent, and type comments that match the real ownership of `roomId`.

**Architecture:** Three isolated changes behind existing seams. The read path (`AppDbPayrollRepository.queryByRoom`) stops sorting on a non-schema field and starts paging with a stable, index-backed sort, then orders newest-first in memory. The debug panel's request literal moves out of the React component into `debug-format.ts` as a pure builder so it can be unit-tested against the real tool definition. Comments and a `readonly` marker record that `roomId` is server-owned. No schema change, no `dropCollection`, no data migration.

**Tech Stack:** TypeScript (ESM, strict), React 18, Vitest 2, `@privos_ai/app-server`, `@privos_ai/app-react`.

**Spec:** `privos-dev-docs/mcp-app-platform/apis/tools-database.md` — the platform contract this plan conforms the code to. The five defects it fixes were identified in the 2026-09-10 conformance review of `migrate-hr-mcp-app/src/ui/payroll/` and are restated verbatim in "Defects Addressed" below.

## Global Constraints

- **This working tree is NOT a git repository** (`git rev-parse --is-inside-work-tree` → `fatal: not a git repository`). There are no commit steps in this plan. Each task ends with a verification step instead.
- All commands run from `E:\Hoc-tap\WebStormProject\migrate-hr-miniapp-by-hung\migrate-hr-mcp-app`.
- Test runner: `npm test` (= `vitest run`). Single file: `npx vitest run tests/<file>.spec.ts`.
- Type gate: `npm run typecheck:strict-unused` (= `tsc --noEmit --noUnusedLocals --noUnusedParameters`). Unused locals and unused parameters are **errors** — do not leave a stray import or destructured variable behind.
- Source files under `src/services/` and `src/payroll-tools.ts` use **tabs** for indentation. Files under `src/ui/` use **2 spaces**. Files under `tests/` use **2 spaces**. Match the file you are editing.
- Hub limits that constrain this work (`tools-database.md` — Limits): query result cap **1,000 docs per call**, count cap **10,000**, populate depth 1, 20 collections per app.
- Do **not** call `mcpapp.db.dropCollection` or `mcpapp.db.updateSchema` anywhere in this plan. The registered collection `hr_payroll_records` holds live data and its index is fixed at registration time.
- Never send a caller-supplied `roomId` into a Hub filter. The room always comes from `actor.roomId` server-side (`src/payroll-tools.ts:resolveActorRoom`).

## Defects Addressed

| # | Defect | Task |
|---|--------|------|
| 1 | `PayrollDashboard.tsx:237-243` sends `collection: 'payroll_records'` + `where` to `hrm.payroll.query`, whose inputSchema accepts only `roomId`. Collection name is also wrong (real name is `hr_payroll_records`) and `roomId` is missing, so the debug panel displays a request that is not the one executed. | Task 2 |
| 2 | `app-db-payroll-repository.ts:53` sorts on `_createdAt`, which is hub-assigned and absent from `PAYROLL_FIELDS`. `tools-database.md` documents `Unknown field` for "query references field not in schema" and never states system fields are sortable. | Task 1 |
| 3 | `types.ts:11` comments `roomId` as "Tùy chọn, dùng để filter data theo room" — false. It is `required: true` in the registered schema and is always stamped server-side from `actor.roomId`; the UI strips it before every write. | Task 3 |
| 4 | `scope: 'room'` already isolates data physically as `app_{appId}_{roomId}_{collection}`, so the `roomId` field, the `where roomId == roomId` filter and the `roomId` index prefix are all redundant. | Task 3 (documented, not removed — see the task's rationale) |
| 5 | `queryByRoom` reads a single page at `limit: 1000` with no `offset`. Past 1,000 rows in one room, records are silently dropped. | Task 1 |

---

### Task 1: Deterministic, paginated payroll read

Fixes defects **2** and **5**. They ship together because they are coupled: paginating with `offset` requires a stable server-side sort, and the sort that is safe to send is not the one the UI wants to display in.

**Rationale for the two decisions in this task:**
- **Sort sent to the hub → `employeeId` ascending.** `employeeId` is a registered schema field (`PAYROLL_FIELDS`) and is the second key of the unique index `{ roomId: 1, employeeId: 1 }`, so it is index-backed and unique within the room — a total order, which is exactly what stable `offset` paging needs. An unsorted paginated read can repeat or skip documents between pages.
- **Display order → sorted in memory.** `_createdAt` stays the newest-first ordering the UI shows, but it is applied in JavaScript after all pages are collected, so the code no longer depends on undocumented hub behaviour for a system field.

**Files:**
- Modify: `src/services/payroll/app-db-payroll-repository.ts:47-60` (the `queryByRoom` method) and the constants block above it
- Test: `tests/app-db-payroll-repository.spec.ts` (modify one existing test, add three)

**Interfaces:**
- Consumes: `PAYROLL_COLLECTION`, `PayrollDocument`, `IPayrollRepository`, `PayrollInput` from `src/services/payroll/payroll-repository.ts`; `HubToolCaller` from `src/services/hub-tool-caller.ts`. Unchanged.
- Produces:
  - `PAYROLL_PAGE_SIZE: number` — exported const, value `1000`
  - `PAYROLL_MAX_PAGES: number` — exported const, value `10`
  - `AppDbPayrollRepository.queryByRoom(roomId: string): Promise<readonly PayrollDocument[]>` — signature unchanged; behaviour now paginated and sorted newest-first in memory

---

- [ ] **Step 1: Update the existing query test to the new request shape, and add the three new tests**

Open `tests/app-db-payroll-repository.spec.ts`.

**1a.** Extend the imports at the top of the file to pull in the two new constants:

```ts
import { describe, expect, it } from 'vitest';
import {
  AppDbPayrollRepository,
  PAYROLL_MAX_PAGES,
  PAYROLL_PAGE_SIZE,
} from '../src/services/payroll/app-db-payroll-repository';
import { PAYROLL_COLLECTION } from '../src/services/payroll/payroll-repository';
```

**1b.** Directly below the existing `fakeCaller` helper, add a second helper that can return a *different* response per call — the existing `fakeCaller` keys responses by tool name only, which cannot express pagination:

```ts
/**
 * Caller whose `mcpapp.db.query` returns `pages[n]` on the n-th call (and an empty page
 * once the list runs out). Records every call so offset/limit can be asserted.
 */
function pagingCaller(pages: Array<Array<Record<string, unknown>>>) {
  const calls: Array<{ roomId: string; name: string; args: Record<string, unknown> }> = [];
  let queryIndex = 0;
  const factory = (roomId: string) => async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ roomId, name, args });
    if (name !== 'mcpapp.db.query') return {};
    const page = pages[queryIndex] ?? [];
    queryIndex += 1;
    return { records: page, total: pages.flat().length };
  };
  return { factory, calls };
}

/** `n` distinct payroll documents, `_createdAt` ascending so a desc sort has to reverse them. */
function fullPage(n: number, prefix: string): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}-${i}`,
    roomId: 'room-1',
    employeeId: `${prefix}-emp-${i}`,
    baseSalary: 1,
    _createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}
```

**1c.** Replace the whole existing `it('queries only the given room and returns records', ...)` block with this one — the assertion on `args` changes because `orderBy` moved to `employeeId` and `offset` is now sent:

```ts
  it('queries one room with an index-backed sort and an explicit first-page offset', async () => {
    const { factory, calls } = fakeCaller({
      'mcpapp.db.query': {
        records: [{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }],
        total: 1,
      },
    });
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toEqual([{ _id: 'a', roomId: 'room-1', employeeId: 'e1', baseSalary: 1 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({
      collection: PAYROLL_COLLECTION,
      where: [{ field: 'roomId', op: '==', value: 'room-1' }],
      orderBy: [{ field: 'employeeId', direction: 'asc' }],
      limit: PAYROLL_PAGE_SIZE,
      offset: 0,
    });
  });

  it('never sends the hub-assigned _createdAt as an orderBy field', async () => {
    const { factory, calls } = fakeCaller({ 'mcpapp.db.query': { records: [], total: 0 } });
    await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    const orderBy = calls[0].args.orderBy as Array<{ field: string }>;
    expect(orderBy.some((clause) => clause.field.startsWith('_'))).toBe(false);
  });
```

**1d.** Add these three tests to the same `describe` block, after the test you just replaced:

```ts
  it('keeps paging while a full page comes back and stops on the first short page', async () => {
    const { factory, calls } = pagingCaller([
      fullPage(PAYROLL_PAGE_SIZE, 'p0'),
      fullPage(PAYROLL_PAGE_SIZE, 'p1'),
      fullPage(3, 'p2'),
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows).toHaveLength(PAYROLL_PAGE_SIZE * 2 + 3);
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.args.offset)).toEqual([0, PAYROLL_PAGE_SIZE, PAYROLL_PAGE_SIZE * 2]);
  });

  it('stops at PAYROLL_MAX_PAGES instead of paging forever', async () => {
    const pages = Array.from({ length: PAYROLL_MAX_PAGES + 5 }, (_, i) =>
      fullPage(PAYROLL_PAGE_SIZE, `p${i}`),
    );
    const { factory, calls } = pagingCaller(pages);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(calls).toHaveLength(PAYROLL_MAX_PAGES);
    expect(rows).toHaveLength(PAYROLL_PAGE_SIZE * PAYROLL_MAX_PAGES);
  });

  it('returns records newest first regardless of the order the hub sent them', async () => {
    const { factory } = pagingCaller([
      [
        { _id: 'old', roomId: 'room-1', employeeId: 'a', baseSalary: 1, _createdAt: '2026-01-01T00:00:00.000Z' },
        { _id: 'new', roomId: 'room-1', employeeId: 'b', baseSalary: 1, _createdAt: '2026-03-01T00:00:00.000Z' },
        { _id: 'mid', roomId: 'room-1', employeeId: 'c', baseSalary: 1, _createdAt: '2026-02-01T00:00:00.000Z' },
        { _id: 'none', roomId: 'room-1', employeeId: 'd', baseSalary: 1 },
      ],
    ]);
    const rows = await new AppDbPayrollRepository(factory).queryByRoom('room-1');
    expect(rows.map((row) => row._id)).toEqual(['new', 'mid', 'old', 'none']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```
npx vitest run tests/app-db-payroll-repository.spec.ts
```

Expected: FAIL. `PAYROLL_PAGE_SIZE` and `PAYROLL_MAX_PAGES` are not exported yet, so the file fails to resolve its imports; once that is fixed the paging and sorting assertions still fail because `queryByRoom` issues exactly one un-offset call and returns the hub's order untouched.

- [ ] **Step 3: Implement pagination and the in-memory sort**

In `src/services/payroll/app-db-payroll-repository.ts` (tabs, not spaces), replace lines 22-23 (the `PAYROLL_INDEXES` comment and const) and the `queryByRoom` method at lines 47-60.

First, the constants block — keep `PAYROLL_INDEXES` exactly as it is and add the two new exported constants plus the comparator directly beneath it:

```ts
/**
 * Index uses: queryByRoom (roomId prefix, then employeeId as the paging sort key); uniqueness of
 * one payroll row per employee per room. Fixed at registerCollection time — `mcpapp.db.updateSchema`
 * takes `fields` only, so changing this index would require dropping the collection and its data.
 */
const PAYROLL_INDEXES = [{ fields: { roomId: 1, employeeId: 1 }, unique: true }] as const;

/** The hub caps one `mcpapp.db.query` response at 1000 docs (tools-database.md — Limits). */
export const PAYROLL_PAGE_SIZE = 1000;

/** 10 × 1000 = the hub's 10,000 count cap. A hard stop so a misbehaving page never loops forever. */
export const PAYROLL_MAX_PAGES = 10;

/**
 * Newest first. `_createdAt` is hub-assigned and is NOT a registered schema field, so sending it to
 * `orderBy` risks the documented `Unknown field` error — the display order is applied here instead.
 * Documents without `_createdAt` sort last.
 */
function byCreatedAtDesc(a: PayrollDocument, b: PayrollDocument): number {
	return (b._createdAt ?? '').localeCompare(a._createdAt ?? '');
}
```

Then replace the whole `queryByRoom` method with:

```ts
	async queryByRoom(roomId: string): Promise<readonly PayrollDocument[]> {
		const call = this.callerFactory(roomId);
		const collected: PayrollDocument[] = [];

		for (let page = 0; page < PAYROLL_MAX_PAGES; page += 1) {
			const response = asRecord(
				await call('mcpapp.db.query', {
					collection: PAYROLL_COLLECTION,
					// Redundant with `scope: 'room'` physical isolation, kept as defence in depth; it also
					// selects the { roomId: 1, employeeId: 1 } index via its prefix.
					where: [{ field: 'roomId', op: '==', value: roomId }],
					// Sorting on the registered, unique `employeeId` gives paging a total order. Without a
					// stable sort, `offset` paging can repeat or skip documents between pages.
					orderBy: [{ field: 'employeeId', direction: 'asc' }],
					limit: PAYROLL_PAGE_SIZE,
					offset: page * PAYROLL_PAGE_SIZE,
				}),
			);
			const records = Array.isArray(response.records) ? (response.records as PayrollDocument[]) : [];
			collected.push(...records);
			if (records.length < PAYROLL_PAGE_SIZE) break;
		}

		return collected.sort(byCreatedAtDesc);
	}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run tests/app-db-payroll-repository.spec.ts
```

Expected: PASS — 9 tests (5 pre-existing minus the replaced one, plus the 4 new/rewritten ones).

- [ ] **Step 5: Verify the whole suite and the type gate are still green**

```
npm run typecheck:strict-unused
npm test
```

Expected: `tsc` exits 0 with no output; the full vitest run reports 0 failures. If `tests/payroll-tools.spec.ts` fails, you changed the `IPayrollRepository` signature — revert that, `queryByRoom`'s signature must not change.

---

### Task 2: Debug panel sends the request it displays

Fixes defect **1**.

The literal in `showRawPayrollDebug` is dead weight that lies to whoever reads the panel: `collection` and `where` are `mcpapp.db.query` arguments, not `hrm.payroll.query` arguments (`src/payroll-tools.ts` — `PAYROLL_TOOL_DEFINITIONS` declares `properties: { roomId: { type: 'string' } }` and nothing else), the collection name `payroll_records` does not exist (the real one is `hr_payroll_records`, `src/services/payroll/payroll-repository.ts:5`), and `roomId` — the one argument the tool does accept — is absent. Moving the literal into a pure builder makes it testable against the real tool-name list.

**Files:**
- Modify: `src/ui/payroll/debug-format.ts` (append the builder)
- Modify: `src/ui/payroll/components/PayrollDashboard.tsx:12` (import) and `:237-243` (the request literal)
- Create: `tests/payroll-debug-format.spec.ts`

**Interfaces:**
- Consumes: `PayrollDebugRequest` and `formatPayrollDebugOutput` from `src/ui/payroll/debug-format.ts` (both already exist and are unchanged); `PAYROLL_TOOL_NAMES` from `src/payroll-tools.ts` (already exported).
- Produces: `buildPayrollDebugRequest(roomId: string): PayrollDebugRequest` — exported from `src/ui/payroll/debug-format.ts`, returns `{ name: 'hrm.payroll.query', arguments: { roomId } }`.

---

- [ ] **Step 1: Write the failing test**

Create `tests/payroll-debug-format.spec.ts` (2-space indentation):

```ts
import { describe, expect, it } from 'vitest';
import { PAYROLL_TOOL_NAMES } from '../src/payroll-tools';
import { buildPayrollDebugRequest, formatPayrollDebugOutput } from '../src/ui/payroll/debug-format';

describe('buildPayrollDebugRequest', () => {
  it('targets a real hrm.payroll tool', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(PAYROLL_TOOL_NAMES as readonly string[]).toContain(request.name);
    expect(request.name).toBe('hrm.payroll.query');
  });

  it('sends roomId and nothing else — hrm.payroll.query accepts no other argument', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(request.arguments).toEqual({ roomId: 'room-1' });
  });

  it('does not leak mcpapp.db.query arguments into an app tool call', () => {
    const request = buildPayrollDebugRequest('room-1');
    expect(Object.keys(request.arguments)).not.toContain('collection');
    expect(Object.keys(request.arguments)).not.toContain('where');
  });
});

describe('formatPayrollDebugOutput', () => {
  it('reports success with the result and the request that produced it', () => {
    const request = buildPayrollDebugRequest('room-1');
    const parsed = JSON.parse(formatPayrollDebugOutput({ roomId: 'room-1', request, result: { records: [] } }));
    expect(parsed.status).toBe('success');
    expect(parsed.roomId).toBe('room-1');
    expect(parsed.request).toEqual({ name: 'hrm.payroll.query', arguments: { roomId: 'room-1' } });
    expect(parsed.result).toEqual({ records: [] });
    expect(parsed.error).toBeUndefined();
  });

  it('serializes an Error into a readable object instead of {}', () => {
    const request = buildPayrollDebugRequest('room-1');
    const parsed = JSON.parse(
      formatPayrollDebugOutput({ roomId: 'room-1', request, error: new Error('boom') }),
    );
    expect(parsed.status).toBe('error');
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(parsed.result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npx vitest run tests/payroll-debug-format.spec.ts
```

Expected: FAIL — `buildPayrollDebugRequest` is not exported from `src/ui/payroll/debug-format.ts`.

- [ ] **Step 3: Add the builder**

Append to the end of `src/ui/payroll/debug-format.ts` (2-space indentation):

```ts
/**
 * The exact request the payroll debug panel sends. `hrm.payroll.query` accepts only `roomId`
 * (`src/payroll-tools.ts` — PAYROLL_TOOL_DEFINITIONS); `collection` and `where` are arguments of
 * the server-side `mcpapp.db.query` call and are dropped on the floor if sent from the UI. The
 * server still re-derives the room from the verified actor — `roomId` is sent so a mismatch is a
 * loud error rather than a silent redirect.
 */
export function buildPayrollDebugRequest(roomId: string): PayrollDebugRequest {
  return { name: 'hrm.payroll.query', arguments: { roomId } };
}
```

- [ ] **Step 4: Wire it into the dashboard**

In `src/ui/payroll/components/PayrollDashboard.tsx`, change the import on line 12 from:

```tsx
import { formatPayrollDebugOutput } from '../debug-format';
```

to:

```tsx
import { buildPayrollDebugRequest, formatPayrollDebugOutput } from '../debug-format';
```

Then replace the request literal at lines 237-243. The current code is:

```tsx
  const showRawPayrollDebug = async () => {
    const request = {
      name: 'hrm.payroll.query',
      arguments: {
        collection: 'payroll_records',
        where: [{ field: 'roomId', op: '==', value: roomId }]
      }
    };
```

Replace those lines with:

```tsx
  const showRawPayrollDebug = async () => {
    const request = buildPayrollDebugRequest(roomId);
```

Leave the `try`/`catch` body that follows exactly as it is — `app.callServerTool(request)` and both `formatPayrollDebugOutput({ roomId, request, ... })` calls already take the right shape.

- [ ] **Step 5: Run the tests to verify they pass**

```
npx vitest run tests/payroll-debug-format.spec.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 6: Verify the type gate and full suite**

```
npm run typecheck:strict-unused
npm test
```

Expected: `tsc` exits 0; full vitest run reports 0 failures. `typecheck:strict-unused` is the gate that catches a leftover unused import if you edited line 12 wrong.

---

### Task 3: Make the type comments tell the truth about `roomId`

Fixes defects **3** and **4**.

**Rationale for defect 4 being documented rather than removed:** the redundancy is real — `scope: 'room'` already stores the collection as `app_{appId}_{roomId}_{collection}`, so a `roomId` field, a `roomId` filter and a `roomId` index prefix are all logically unnecessary. Removing them is not, however, a comment-sized change: the field is `required: true` in the registered schema and `mcpapp.db.updateSchema` accepts `fields` only — it cannot drop the index. Changing the index would mean `dropCollection` plus re-registration, which destroys every live payroll record in every room. The correct engineering outcome is to keep the redundancy as defence in depth and record *why* it is there, so the next reader does not either (a) mistake it for a load-bearing tenancy check or (b) "clean it up" into a data-loss migration. The `where`-clause and index comments were written in Task 1 Step 3; this task covers the two remaining files.

**Files:**
- Modify: `src/ui/payroll/types.ts:11` (the `roomId` field on `PayrollRecord`)
- Modify: `src/services/payroll/payroll-repository.ts:11` (the `roomId` field on `PayrollDocument`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PayrollRecord.roomId` becomes `readonly roomId?: string`. `PayrollDocument.roomId` keeps its `readonly roomId: string` type; only its comment changes. No runtime behaviour changes.

---

- [ ] **Step 1: Correct the UI-side type comment and mark the field readonly**

In `src/ui/payroll/types.ts` (2-space indentation), replace line 11:

```ts
  roomId?: string; // Tùy chọn, dùng để filter data theo room nếu ứng dụng hỗ trợ nhiều room
```

with:

```ts
  // Server-owned: `hrm.payroll.*` stamps it from the Hub-verified `actor.roomId` and it is
  // `required: true` in the registered schema. Present on records read back, never sent on a
  // write — PayrollService strips it before every create/update. Readonly so the UI cannot set it.
  readonly roomId?: string;
```

- [ ] **Step 2: Run the type gate to verify nothing was assigning `roomId` from the UI**

```
npm run typecheck:strict-unused
```

Expected: exits 0 with no output. A `TS2540: Cannot assign to 'roomId' because it is a read-only property` here would mean UI code writes the field — that would be defect 3 being worse than reported; report it rather than reverting the `readonly`.

- [ ] **Step 3: Record why the room redundancy stays, on the server-side type**

In `src/services/payroll/payroll-repository.ts` (tabs, not spaces), replace line 11:

```ts
	readonly roomId: string;
```

with:

```ts
	/**
	 * Redundant with `scope: 'room'` — the hub already stores this collection per room as
	 * `app_{appId}_{roomId}_{collection}`, so cross-room reads are physically impossible. Kept as
	 * defence in depth and as the first key of the unique index. It cannot be removed cheaply:
	 * `mcpapp.db.updateSchema` takes `fields` only, so dropping the index would require
	 * `dropCollection` — destroying every live payroll record. Do not "clean this up".
	 */
	readonly roomId: string;
```

- [ ] **Step 4: Verify the type gate and full suite**

```
npm run typecheck:strict-unused
npm test
```

Expected: `tsc` exits 0; full vitest run reports 0 failures.

- [ ] **Step 5: Final verification across the whole pipeline**

```
npm run verify:fast-pr
```

Expected: `typecheck:strict-unused`, `test`, `build` and `preflight` all succeed. This is the last gate — do not report the plan complete until this command exits 0, and paste its final lines as evidence.

---

## Out of Scope

Named here so an executor does not drift into them:

- Adding `offset`/pagination arguments to the `hrm.payroll.query` **tool** inputSchema. Task 1 paginates inside the repository, which is invisible to the UI contract; exposing paging to the client is a separate feature.
- Replacing the per-orphan `deleteRecord` loop in `PayrollDashboard.tsx:203-210` with a batched delete. `hrm.payroll.*` exposes no bulk delete and adding one is a new tool.
- The hardcoded `probationRate: 85` in `handleSave`, the 3000 ms polling interval, or any other payroll business-logic behaviour.
- Any change to `privos-app.json` scopes — they already match the documented `db:*` scope table exactly.
