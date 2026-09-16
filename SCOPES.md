# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | `usePrivosContext()` in `App.tsx` supplies `roomId`/`userRoles` to every tab. | Installation is cancelled if rejected. |
| `lists:read` | Required | Room; user | `cv-scored/CVScoredTab.tsx`, `lifecycle/services/PrivOSLifecycleService.ts`, `email-history/email-history-service.ts` via `mcpapp.lists.getAll/getItems/get/searchItems`; server `services/mail/email-history-repository.ts` via `mcpapp.lists.getItem`. | Installation is cancelled if rejected. |
| `lists:write` | Required | Room; user | `pipeline-service.ts`, `PrivOSLifecycleService.ts`, `CVScoredTab.tsx` via `mcpapp.lists.create/addField/createItem/batchCreateItems/moveItemToStage`; server email history via `mcpapp.lists.create/createItem/updateItem/moveItemToStage`; `email-history/user-session-tracked-mail.ts` writes the same history rows over the user session after `hrm.mail.send` with `recordHistory: false` (send + retry from the UI). | Installation is cancelled if rejected. |
| `files:read` | Required | Room; user | `recruitment-panel.tsx` (`mcpapp.files.getContent`), `pipeline-dashboard.tsx` (`mcpapp.files.get/search`), `drafting/services/CompanyContextProvider.ts`, `email-templates/interview-email-template-repository.ts`, `privos-rest.ts` (`mcpapp.folders.*`). | Installation is cancelled if rejected. |
| `files:write` | Required | Room; user | `privos-rest.ts createOrUpdateFile` (`app.uploadFile`), `pipeline-service.ts` (`mcpapp.files.update/delete`), `payroll/services/PayrollExportService.ts`, `email-templates/interview-email-template-repository.ts` (`mcpapp.files.delete`). | Installation is cancelled if rejected. |
| `db:read` | Required | Room; user | `payroll/services/PayrollService.ts` calls `mcpapp.db.query` over the user-session relay, filtered to the context room. Server `services/payroll/app-db-payroll-repository.ts` reaches the same collection for `hrm.payroll.*` (AI-chat/background) with the installation-bot credential. `email-templates/active-template-store.ts` queries `hr_email_template_settings` for the Room's active interview/employee email template. | Installation is cancelled if rejected. |
| `db:write` | Required | Room; user | `PayrollService.saveRecord` → `mcpapp.db.create/update`, and `PayrollService.deleteRecord` → `mcpapp.db.update` writing the `deletedAt` tombstone — payroll rows are never removed, so `mcpapp.db.delete` has no call site on the payroll path; `hrm.payroll.create/update/delete` on the server path; `AppDbActiveTemplateStore.write` → `mcpapp.db.create/update` when "Sử dụng mẫu" changes the active email template. | Installation is cancelled if rejected. |
| `db:schema:read` | Required | Room; user | Reserved for `mcpapp.db.getSchema` diagnostics on the payroll collection (`hub-tool-caller.ts` allowlist). | Installation is cancelled if rejected. |
| `db:schema:write` | Required | Room; user | `PayrollService.initializeSchema` registers `hr_payroll_records` once per room via `mcpapp.db.registerCollection`, then calls `mcpapp.db.updateSchema` so a room registered before the `deletedAt` tombstone field existed accepts it (shared shape in `services/payroll/payroll-schema.ts`); `AppDbPayrollRepository.initializeSchema` mirrors both on the server path; `AppDbActiveTemplateStore` registers `hr_email_template_settings` on its first write. | Installation is cancelled if rejected. |
| `sandbox:ai-chat` | Optional | Room; user | `company-home.tsx`, `pipeline-service.ts` poll `ai-messages.list`. | AI results cannot be read; scoring falls back to manual. |
| `sandbox:ai-chat:write` | Optional | Room; user | `company-home.tsx`, `pipeline-service.ts` call `ai-messages.send` + `ai-messages.startGeneration`. | AI scoring and AI company summary are disabled. |

`hrm.payroll.*` and `hrm.mail.*` are the two app-owned tool families that reach the Hub with the
installation-bot credential (`POST /api/v1/mcp-apps.tool-call`, `app-platform-tool-call.ts`) instead
of the current user's session. Both refuse any call without a Hub-verified actor and pin every Hub
request to `actor.roomId` (`payroll-tools.ts resolveActorRoom`). The Hub still enforces installation
status, receipt, epoch, target room, exact grant, and bot membership on every mediated operation.

The app-owned `hr_bulk_export` tool does not request a workspace permission. It processes caller
input and is gated by the Pro license feature.
