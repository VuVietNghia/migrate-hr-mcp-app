# JD Assistant Response And Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated JD completion replies and require every AI-created JD to be saved in a user-selected recruitment department.

**Architecture:** Keep chat display deterministic once a valid `<jd_content>` payload exists, while preserving the AI's own question when no JD was produced. Reuse the recruitment department store and canonical Markdown metadata, then parse `JD_AI_*.md` as a structured recruitment job.

**Tech Stack:** React 18, TypeScript, Vitest, PrivOS Room Files and App Database.

**Spec:** `docs/superpowers/specs/2026-10-09-recruitment-jd-upload-design.md`

## Global Constraints

- Creating a JD requires a selected department before the first AI request can be sent.
- Editing an existing JD preserves its current department and does not show the new-JD department selector.
- Missing-information replies never change the preview and never display a completion message.
- Existing JD creation, editing, Room File persistence and recruitment filtering flows remain functional.
- Do not add Markdown download functionality.

## Review Focus

- AI returns repeated prose around a valid `<jd_content>` block: show one deterministic confirmation.
- AI returns `<jd_content>NULL</jd_content>`: preserve its clarification question and leave the document unchanged.
- A custom department from App Database is selected: persist both its stable key and current label.
- AI Markdown contains a conflicting department: the selected department wins.
- `JD_AI_*.md` is loaded in “Vị trí tuyển dụng”: treat it as a structured JD, not an uploaded attachment.

---

### Task 1: Deterministic AI response presentation

**Files:**
- Modify: `tests/jd-chatbot-response.spec.ts`
- Modify: `src/ui/jd-chatbot-view-model.ts`
- Modify: `src/ui/jd-chatbot-prompt.ts`

**Interfaces:**
- Produces: `interpretJDAIResponse(text, hasSelectedJD)` with one canonical completion message for valid JD content.

- [ ] Add failing tests for duplicated creation text, update text, and missing-information replies.
- [ ] Run the focused response tests and confirm the new assertions fail for duplicated output.
- [ ] Implement deterministic completion copy and tighten the prompt output contract.
- [ ] Run the focused response tests and confirm they pass.

### Task 2: Required department selection and canonical JD metadata

**Files:**
- Create: `src/ui/jd-chatbot-department.ts`
- Create: `tests/jd-chatbot-department.spec.ts`
- Modify: `src/ui/jd-chatbot-functional.tsx`
- Modify: `src/ui/jd-chatbot-interaction-controls.tsx`
- Modify: `src/ui/jd-chatbot-prompt.ts`
- Modify: `src/ui/studio/studio.css`

**Interfaces:**
- Produces: a pure Markdown normalizer that replaces conflicting department metadata and exposes a required selector for new-JD mode.
- Consumes: `AppDbRecruitmentDepartmentStore`, `mergeRecruitmentDepartments`, and selected `{ key, label }`.

- [ ] Add failing unit tests for inserting and replacing canonical department metadata.
- [ ] Run the focused department tests and confirm they fail because the helper does not exist.
- [ ] Implement the normalizer, required selector, department loading, prompt context, and save-time normalization.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Recruitment tab integration

**Files:**
- Modify: `tests/recruitment-jobs.spec.ts`
- Modify: `src/ui/recruitment/recruitment-jobs.ts`
- Modify: `src/ui/recruitment-panel.tsx`

**Interfaces:**
- Consumes: `JD_AI_*.md` containing canonical department metadata.
- Produces: a structured recruitment job visible under the selected department.

- [ ] Add a failing parser test for `JD_AI_*.md` using the AI template.
- [ ] Run the focused recruitment test and confirm it fails because AI files are excluded.
- [ ] Accept AI JD filenames and parse their list-based metadata/sections without weakening unrelated-file filtering.
- [ ] Run the focused recruitment tests and confirm they pass.

### Task 4: Verification and Docker deployment

**Files:**
- Verify all modified source and test files.

- [ ] Run focused JD and recruitment tests.
- [ ] Run strict TypeScript checking and the full test suite, recording any pre-existing failures separately.
- [ ] Build the Docker image, recreate only the HR app service, and verify `/ready` plus the running image identity.
- [ ] Inspect the final diff for scope, accidental regressions, and uncommitted user changes.
