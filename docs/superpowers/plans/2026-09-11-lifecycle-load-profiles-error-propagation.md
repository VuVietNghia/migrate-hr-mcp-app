# Fix A — Lifecycle `loadProfiles` Error Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `PrivOSLifecycleService.loadProfiles` from reporting a failed load as an empty employee roster, because the payroll dashboard reads an empty roster as "every employee was deleted" and permanently deletes the matching payroll rows.

**Architecture:** `loadProfiles` currently has two paths that return `[]` without any failure signal: an outer `try/catch` that swallows every thrown error, and `if (!list) return []`, which is reached when `createNewList` swallows its own error and returns `null`. Both are removed so a genuine failure propagates to the caller. The only remaining `[]` result becomes the truthful one: the HR list was loaded and holds no employee items. No caller needs to change — both call sites already wrap the call in `try/catch`.

**Tech Stack:** TypeScript 5 (strict), Vitest 2.1.9 (`environment: 'node'`, `tests/**/*.spec.ts`), PrivOS MCP App SDK (`@privos_ai/app-react` for the UI-side `McpApp`).

**Spec:** No spec file — this came from the bounded brainstorming path, where the design is approved in chat rather than written to `docs/superpowers/specs/`. The approved design is reproduced under "Background" below so this plan is self-contained.

## Background — why this change exists

`src/ui/payroll/components/PayrollDashboard.tsx:197-211` loads two unrelated
backends in parallel and then reconciles them:

```ts
const [empData, payData] = await Promise.all([
  lifecycleService.loadProfiles(roomId),   // mcpapp.lists.*  (Kanban)
  payrollService.getRecords()              // mcpapp.db.*     (hr_payroll_records)
]);
const activeEmpIds = new Set(empData.map(e => e._id));
const orphanedPayrolls = payData.filter(p => !activeEmpIds.has(p.employeeId));
await Promise.all(orphanedPayrolls.map(p => payrollService.deleteRecord(p._id)));
```

The two stores have no referential integrity between them (`mcpapp.db`'s
`refCollection`/`onDelete` cannot point at a `mcpapp.lists` item), so this
client-side reconciliation is the only link. When `loadProfiles` answers a
transient Hub failure with `[]`, `activeEmpIds` is empty, every payroll row
looks orphaned, and real salary data is hard-deleted from `mcpapp.db`.

After this change the `Promise.all` rejects on a lifecycle failure, so
execution jumps to the existing `catch` at `PayrollDashboard.tsx:216` and the
deletion block is never reached.

**Deferred, NOT in this plan:**
- *Fix B* — guarding the orphan-GC on `empData.length > 0` in `PayrollDashboard.tsx`.
- *Fix C* — `enrichListWithStagesOrDelete` deleting and recreating the whole Kanban list, which churns every `employee._id`.

## Global Constraints

- **Git is read-only in this project.** The user's `CLAUDE.md` forbids every write git operation with zero exceptions. Do **not** run `git add`, `git commit`, or anything else that alters repo state. No task in this plan ends in a commit; the user commits manually when they choose.
- **Strict task adherence.** Change only what a step names. Do not fix, refactor, or comment on unrelated code encountered along the way.
- `src/payroll-tools.ts` contains a deliberate temporary diagnostic `console.error` block. Leave it exactly as it is.
- Tests live flat in `tests/<name>.spec.ts` and run under `environment: 'node'`. There is no jsdom or React Testing Library in this project — do not add one, and do not write a test that renders a React component.
- TypeScript strict mode. The verification command is `npm run typecheck:strict-unused`, which also fails on unused locals and parameters.
- Comments explain *why*, never *what*. Do not add a comment that restates the code.

---

### Task 1: Make a failed profile load fail loudly

**Files:**
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:12-28` (`loadProfiles`)
- Modify: `src/ui/lifecycle/services/PrivOSLifecycleService.ts:272-297` (`createNewList`)
- Create: `tests/lifecycle-load-profiles.spec.ts`

**Interfaces:**
- Consumes: nothing from an earlier task — this is the first task.
- Produces: `PrivOSLifecycleService.loadProfiles(roomId: string): Promise<EmployeeProfile[]>` keeps its signature. Its *contract* changes: it now rejects when the HR list cannot be read or created, and resolves to `[]` only when the list genuinely holds no employee items. `createNewList(roomId: string): Promise<any>` no longer returns `null` on failure — it rejects.

- [ ] **Step 1: Write the failing test**

Create `tests/lifecycle-load-profiles.spec.ts` with exactly this content:

```ts
import { describe, expect, it } from 'vitest';
import { PrivOSLifecycleService } from '../src/ui/lifecycle/services/PrivOSLifecycleService';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

/**
 * The service only ever touches `app.callServerTool`, so a name→payload map is a
 * complete stand-in for `McpApp`. The real SDK wraps every payload as JSON inside
 * `content[0].text`; the stub reproduces that shape because the service parses it.
 */
function createAppStub(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const handler = handlers[call.name];
      if (!handler) throw new Error(`unexpected tool call: ${call.name}`);
      return { content: [{ type: 'text', text: JSON.stringify(handler(call.arguments ?? {})) }] };
    },
  };
  return { app, calls };
}

const STAGES = [{ _id: 'stage-1', name: 'Mới nhận việc' }];

const HR_LIST = {
  _id: 'list-1',
  name: '[HR-MCP-App] Hồ sơ nhân sự',
  fieldDefinitions: [{ _id: 'fd-1', name: 'Email', type: 'TEXT' }],
};

const CONFIG_ITEM = {
  _id: 'cfg-1',
  name: '[Hệ thống] Không xoá - Cấu hình Kanban',
  description: JSON.stringify(STAGES),
};

const EMPLOYEE_ITEM = {
  _id: 'emp-1',
  name: 'Nguyen Van A',
  stageId: 'stage-1',
  customFields: [{ fieldId: 'fd-1', value: 'a@example.com' }],
};

function healthyRoom(items: unknown[]) {
  return {
    'mcpapp.lists.getAll': () => [HR_LIST],
    'mcpapp.lists.searchItems': () => [CONFIG_ITEM],
    'mcpapp.lists.getItems': () => items,
  };
}

describe('PrivOSLifecycleService.loadProfiles', () => {
  it('propagates a Hub failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => {
        throw new Error('mcp-apps.rest-call 403');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('mcp-apps.rest-call 403');
  });

  it('propagates a list-creation failure instead of reporting an empty roster', async () => {
    const { app } = createAppStub({
      'mcpapp.lists.getAll': () => [],
      'mcpapp.lists.create': () => {
        throw new Error('lists.create denied');
      },
    });
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).rejects.toThrow('lists.create denied');
  });

  it('returns an empty roster when the list loaded fine but holds no employee items', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([]);
  });

  it('maps employee items to profiles on the happy path', async () => {
    const { app } = createAppStub(healthyRoom([CONFIG_ITEM, EMPLOYEE_ITEM]));
    const service = new PrivOSLifecycleService(app as never);

    await expect(service.loadProfiles('room-1')).resolves.toEqual([
      { _id: 'emp-1', name: 'Nguyen Van A', status: 'Mới nhận việc', email: 'a@example.com' },
    ]);
  });
});
```

Note on expectations: the first two tests encode the behaviour change and MUST
fail before Step 3. The last two are regression guards that already pass — they
exist so Step 3 cannot "fix" the first two by making every load throw.

- [ ] **Step 2: Run the test to verify the first two fail**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`

Expected: 2 failed, 2 passed.
- `propagates a Hub failure…` fails with `promise resolved "[]" instead of rejecting`
- `propagates a list-creation failure…` fails the same way
- both regression guards pass

If any *other* test fails, or if the two propagation tests pass already, stop
and report — the starting state is not what this plan assumes.

- [ ] **Step 3: Remove both silent-empty paths**

In `src/ui/lifecycle/services/PrivOSLifecycleService.ts`, replace the whole
`loadProfiles` method (lines 12-28) with:

```ts
  async loadProfiles(roomId: string): Promise<EmployeeProfile[]> {
    // Never answer a failure with `[]`. PayrollDashboard reconciles payroll rows
    // against this roster and hard-deletes the ones it cannot match, so a masked
    // failure here destroys real salary data.
    const list = await this.ensureValidList(roomId);
    if (!list) {
      throw new Error(`Không lấy được danh sách hồ sơ nhân sự của room ${roomId}.`);
    }

    const items = await this.fetchListItems(list._id || list.id);
    const fieldDefMap = this.createFieldDefinitionMap(list.fieldDefinitions);

    return items
      .filter(item => !this.isSystemConfigItem(item))
      .map(item => this.mapItemToProfile(item, list, fieldDefMap));
  }
```

Then replace the whole `createNewList` method (lines 272-297) with:

```ts
  private async createNewList(roomId: string): Promise<any | null> {
    const res: any = await this.app.callServerTool({
      name: 'mcpapp.lists.create',
      arguments: {
        roomId,
        name: `${PrivOSLifecycleService.SYSTEM_PREFIX} Hồ sơ nhân sự`,
        fieldDefinitions: this.getInitialFieldDefinitions(),
        stages: this.getInitialStages()
      }
    });

    const parsed = JSON.parse(res?.content?.[0]?.text || '{}');
    const newList = parsed.list || parsed || null;

    if (newList && parsed.stages) {
      await this.createSystemConfigItem(newList._id || newList.id, parsed.stages);
      newList.stages = parsed.stages;
    }

    return newList;
  }
```

The `try/catch` and its `console.error` are gone; everything else is byte-for-byte
the original body. The return type stays `Promise<any | null>` because the
`parsed.list || parsed || null` expression can still legitimately produce `null`
from a well-formed but empty response — `loadProfiles` now turns that into a throw.

- [ ] **Step 4: Run the test to verify all four pass**

Run: `npx vitest run tests/lifecycle-load-profiles.spec.ts`

Expected: 4 passed.

- [ ] **Step 5: Verify no other caller regressed**

Run: `npx vitest run`

Expected: no test that passed before Step 3 now fails. Two pre-existing failures
are known and unrelated to this change — an app-identity mismatch between
`privos-app.json` and the UI `resourceUri` host, and a Windows file-permission
error in `preflight`. Everything else must pass. If a *different* test fails,
stop and report it rather than adjusting the test.

- [ ] **Step 6: Verify types**

Run: `npm run typecheck:strict-unused`

Expected: exit code 0, no output. In particular there must be no
`'err' is declared but its value is never read` — the removed `catch` bindings
are gone entirely, not left behind as unused names.

- [ ] **Step 7: Confirm the two call sites still behave**

No code change in this step — read and confirm, then report findings:

1. `src/ui/payroll/components/PayrollDashboard.tsx:191-226` — a rejected
   `loadProfiles` must reject the `Promise.all` on line 197, so the orphan-GC
   block on lines 202-211 is unreachable and the `catch` on line 216 shows the
   real error text in the status banner.
2. `src/ui/lifecycle/LifecycleDashboard.tsx:81-98` — already wraps the call in
   `try/catch`; a rejection now surfaces the existing
   `'Không thể tải danh sách hồ sơ nhân sự.'` banner where the board previously
   rendered as silently empty. This is the intended behaviour change.

Report anything that contradicts the above instead of editing these files —
changing them is out of this plan's scope.

- [ ] **Step 8: Hand back for commit**

Do NOT commit. Git write operations are forbidden in this project. Report the
changed files (`src/ui/lifecycle/services/PrivOSLifecycleService.ts`,
`tests/lifecycle-load-profiles.spec.ts`) and the verification results, and leave
the working tree for the user to commit.
