# Room Mail Auto Bot Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing **Kết nối Google** action join the installation agent bot to the current Room before starting Nango OAuth when the initial mailbox read cannot run.

**Architecture:** Declare the platform's interactive `bot:room:join` permission and expose one client method for `mcpapp.bot.joinCurrentRoom`. The controller keeps the synchronous popup-open guarantee, performs the idempotent Room join only when no connection view could be loaded, reloads the Room mailbox view, and then starts the existing OAuth lifecycle.

**Tech Stack:** TypeScript strict, React 18, PrivOS app-react, Nango frontend SDK, Vitest 2, PrivOS manifest v3.

**Spec:** [2026-09-30-room-oauth-mail-design.md](../specs/2026-09-30-room-oauth-mail-design.md), plus the user-approved 2026-10-01 recovery requirement: clicking **Kết nối Google** automatically joins the app bot to the current Room before OAuth.

## Global Constraints

- Keep Nango OAuth opening synchronously from the user click so browsers do not block the popup.
- Join only the current Room through `mcpapp.bot.joinCurrentRoom`; do not accept a caller-provided Room selector.
- Do not expose credentials, Nango tokens, connection IDs, or raw provider errors.
- Preserve existing user changes and do not create a Git commit.
- Require Hub Admin Refresh/Approve after the manifest permission changes.

## Review Focus

- Initial `get()` failed and controller has no view: the first connect click must join, reload, and begin OAuth.
- Existing valid view: connect must not issue an unnecessary join call.
- Popup blocker: launcher opens before the first awaited operation in both paths.
- Join or reload failure: popup closes and the UI keeps a safe error state.
- Room switch/unmount during recovery: stale async work must not begin or update the new Room.

---

### Task 1: Declare and call the Room bot join capability

**Files:**
- Modify: `privos-app.json`
- Modify: `src/ui/mail-connection/mail-connection-client.ts`
- Test: `tests/manifest.spec.ts`
- Test: `tests/mail-connection-client.spec.ts`

**Interfaces:**
- Produces: `MailConnectionClient.joinCurrentRoom(): Promise<void>`.
- Produces: required Room permission `bot:room:join` with `executionContext: "user"`.

- [ ] **Step 1: Write failing tests** asserting the manifest permission tuple and exact no-argument `mcpapp.bot.joinCurrentRoom` tool call.
- [ ] **Step 2: Run targeted tests** and verify they fail because the permission/method is absent.
- [ ] **Step 3: Implement the manifest entry and `joinCurrentRoom()`** using the existing safe MCP-result parser.
- [ ] **Step 4: Run targeted tests** and verify they pass.

### Task 2: Recover the Connect action when the bot is not yet in the Room

**Files:**
- Modify: `src/ui/mail-connection/mail-connection-controller.ts`
- Test: `tests/mail-connection-controller.spec.ts`

**Interfaces:**
- Consumes: `MailConnectionClientApi.joinCurrentRoom(): Promise<void>` from Task 1.
- Preserves: `connect(provider: MailProvider): Promise<void>` and synchronous `MailConnectLauncher.open(...)`.

- [ ] **Step 1: Write failing controller tests** for join/reload/begin from an error-without-view state, no join with an existing view, safe failure, and stale recovery after dispose.
- [ ] **Step 2: Run the controller tests** and verify the new cases fail for the missing recovery behavior.
- [ ] **Step 3: Implement minimal recovery**: open launcher, set a safe empty view, join and reload only when no prior view exists, apply generation guards, then call `begin`.
- [ ] **Step 4: Run controller/client/manifest tests** and verify the new behavior passes.
- [ ] **Step 5: Run `npm run typecheck`, `npm run manifest:lint`, and `npm run build`**; report any pre-existing failures separately.
- [ ] **Step 6: Rebuild/restart Docker, approve the refreshed manifest, and validate the live button in Chrome** without sending a test email.
