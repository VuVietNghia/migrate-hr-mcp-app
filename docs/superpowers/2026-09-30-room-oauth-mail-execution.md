Plan: docs/superpowers/plans/2026-09-30-room-oauth-mail.md

# Room OAuth Mail execution ledger

## Rulings

- Execute in the current `fix/security-payroll` workspace without a worktree or commits. The user-provided `AGENTS.md` forbids every Git mutation and worktree operation. Cost if wrong: implementation shares a dirty working tree, so unrelated edits must remain untouched.
- Store this ledger under `docs/superpowers` because the managed workspace denies creating a new task directory under `.superpowers/sdd`.
- Maintain this ledger directly instead of using the superpowers ledger scripts because those scripts invoke Git mutations forbidden by `AGENTS.md`.
- The local App Database contract documents schema fields, unique indexes, room scoping, and server-side enforcement. It does not expose a query projection argument. Repository reads therefore request `limit: 1` and parse a strict whitelist from the returned record; the missing projection capability is recorded as a platform limitation.

## Interface preflight

| Producer | Consumer | Contract | Status |
| --- | --- | --- | --- |
| Task 1 | Tasks 2-8 | Strict mail/domain types, parsers, public errors | complete |
| Tasks 1-3 | Task 4 | Repository and broker contracts | complete |
| Tasks 2-4 | Task 5 | Active binding, provider adapters, lifecycle lock | complete |
| Task 5 | Task 6 | Typed `MailReceipt` and send outcomes | complete |
| Tasks 4 and 6 | Task 7 | Safe connection tools and UI result shapes | complete |
| Tasks 3-7 | Task 8 | Secret path, tool manifest, Compose wiring | complete |

## Progress

- Task 1: complete
- Task 2: complete
- Task 3: complete
- Task 4: complete
- Task 5: complete
- Task 6: complete
- Task 7: complete
- Task 8: complete; live deployment gates pending

## Verification evidence

- Git baseline: branch `fix/security-payroll`; pre-existing modified files and untracked `compose.yaml` preserved.
- Platform source: `../privos-dev-docs/mcp-app-platform/apis/tools-database.md` documents room-scoped physical collections, registered field validation, unique indexes, and query arguments. Query projection is absent from the contract.
- Task 1: 7 contract tests passed; strict TypeScript passed.
- Task 2: 14 repository/contract tests passed; strict TypeScript passed.
- Task 3: 13 secret, Nango gateway, and provider adapter tests passed; strict TypeScript passed.
- Task 4: 15 service/tool/dispatcher tests passed; strict TypeScript passed.
- Task 5: 20 queue, delivery, runtime, tracked-mail, and mail-tool tests passed; strict TypeScript passed.
- Task 6: 52 history/result/UI-mail tests passed serially; strict TypeScript passed.
- Task 7: 7 connection client/controller tests passed; Connect UI opens before async session resolution and receives its token in RAM through `setSessionToken`.
- Task 8 targeted run: 17/18 tests passed before correcting the pre-existing package/manifest name mismatch; manifest precheck returned `OK`; strict-unused TypeScript passed.
- Final whole-change review found no Critical issue. Important findings covering CSP, foreign-connection cleanup, legacy history migration, global deadlines, ambiguous delivery history, bounded cleanup registries, public response data, Connect UI races, cleanup reservation accounting, and raw mail error logs were fixed with regression coverage.
- Final full suite: 81 files and 595 tests passed serially.
- Final strict verification: `npm run typecheck:strict-unused` passed.
- Final production build and manifest lint passed; manifest hash `sha256:c740a8cf70a580471031328969da22be7a5b65e4891a0db277ef3a19005602d5`.
- Final manifest precheck returned `OK`; `docker compose config --quiet` exited 0; `git diff --check` reported no whitespace errors (only existing LF-to-CRLF notices).

## Final rulings

- Ruling: Keep all implementation changes in the current working tree without commits, merge, push, or worktree cleanup. The project `AGENTS.md` permits Git inspection only. Cost if wrong: integration remains a manual repository-owner action.
- Ruling: Existing `Quản lí Email` lists must receive the two `Chưa rõ kết quả` stages before release. The mediated Hub contract exposes no stage-create operation, so runtime blocks history operations until migration is complete. Cost if wrong: mail history remains unavailable for a Room whose legacy list was not migrated.

## Blockers and live gates

- Hub source proving the exact generated MongoDB `$jsonSchema` is not present in this workspace. Local platform docs state registered schemas are enforced server-side and `updateSchema` uses MongoDB `validationLevel: moderate`; live validator inspection remains a release gate.
- Nango account, Google/Microsoft OAuth applications, Hub grants, iframe popup behavior, and Ubuntu deployment require external environments and remain live gates.
- No Ubuntu server credentials or provider test mailbox were available in this workspace, so image recreation, `/health`, `/ready`, consent, sender, Sent Items, revoke/reconnect, and two-Room delivery were not run.
