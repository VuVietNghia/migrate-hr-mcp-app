# Recruitment JD Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a department-required JD upload flow to `Vị trí tuyển dụng`, render uploaded `.md`/`.docx`/`.pdf` files faithfully, and replace Pipeline's direct upload with a compact navigation action.

**Architecture:** Keep original files in `Room Files/hr-miniapp/jds` and persist their department association in the room-scoped `hr_recruitment_job_files` App Database collection. Model structured and uploaded JDs as a discriminated union, extract the existing multi-format preview into a shared component, and let `RecruitmentPanel` orchestrate I/O while dialogs remain controlled UI.

**Tech Stack:** TypeScript, React 18, Vitest 2, happy-dom, PrivOS `@privos_ai/app-react`, room files, App Database, existing DOCX/PDF/Markdown preview components, Studio CSS.

**Spec:** `docs/superpowers/specs/2026-10-09-recruitment-jd-upload-design.md`

## Global Constraints

- Accept exactly one `.md`, `.docx`, or `.pdf` file; matching is case-insensitive.
- A department is mandatory and is stored by stable `departmentKey`; never infer it from file name or contents.
- Store the source file only in `Room Files/hr-miniapp/jds`; do not rewrite binary contents or create metadata sidecars.
- Store uploaded-file metadata only through room-scoped `mcpapp.db.*` calls to `hr_recruitment_job_files`.
- Preserve manual-JD creation, filtering, pagination, download, AI navigation, Pipeline selection, and CV upload behavior.
- Read and download files through authenticated PrivOS APIs; do not use MinIO URLs as the source of truth.
- Do not add deletion or migration of legacy unmapped uploads.
- Do not commit or push unless the user explicitly asks; each task ends with a local diff checkpoint instead.
- Follow strict TDD: write and observe the relevant failure before production edits.

## Review Focus

- A user-uploaded Markdown file named `JD_*.md` must appear once as `uploaded`, not again as parsed `structured`; Task 1 pins precedence.
- An upload response without a usable id must resolve the file after refresh or stop before metadata is written; Task 3 pins both branches.
- A metadata-write failure must retain the uploaded file reference, and retry must not upload the file again; Task 3 pins call counts and outcome.
- A Room/app switch during upload or reload must not apply the old Room's result; Task 6 pins the operation guard.
- Renaming a custom department must immediately change an uploaded JD's displayed label because metadata stores only the stable key; Task 1 pins current-label resolution.

---

### Task 1: Uploaded-JD domain model, validation, merge, search and pagination

**Files:**
- Create: `src/ui/recruitment/recruitment-uploaded-jobs.ts`
- Modify: `src/ui/recruitment/recruitment-jobs.ts`
- Modify: `tests/recruitment-jobs.spec.ts`
- Create: `tests/recruitment-uploaded-jobs.spec.ts`

**Interfaces:**
- Consumes: `CVFile`, `RecruitmentDepartment`, existing structured JD parser/filter/pager.
- Produces:
  - `StructuredRecruitmentJob` with `kind: 'structured'`.
  - `UploadedRecruitmentJob` with `kind: 'uploaded'`, file identity, department identity and `format`.
  - `RecruitmentJob = StructuredRecruitmentJob | UploadedRecruitmentJob`.
  - `RecruitmentJobFileMetadata` containing `fileId`, `fileName`, `departmentKey`, `source: 'uploaded'`, `createdAt`.
  - `validateRecruitmentJobFiles(files: readonly File[]): string | null`.
  - `getRecruitmentJobFormat(fileName: string): 'markdown' | 'word' | 'pdf' | null`.
  - `mergeRecruitmentJobs(files, structuredJobs, metadata, departments): RecruitmentJob[]`.

- [ ] **Step 1: Write failing domain tests**

Add assertions that a one-element list containing `.md`, uppercase `.DOCX`, or `.pdf` validates; empty lists, zero-byte files, unsupported extensions and lists with more than one file reject; metadata resolves the current department label; stale metadata is ignored; and an uploaded `JD_BACKEND.md` wins over the structured parse for the same `fileId`.

```ts
expect(mergeRecruitmentJobs(files, [structured], [metadata], renamedDepartments)).toEqual([
  expect.objectContaining({ kind: 'uploaded', fileId: 'file-1', departmentLabel: 'Kỹ thuật' }),
]);
```

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `npm test -- tests/recruitment-jobs.spec.ts tests/recruitment-uploaded-jobs.spec.ts`

Expected: FAIL because the union, validator and merge functions do not exist.

- [ ] **Step 3: Implement the minimal domain model**

Add the exact interfaces/functions above. Update `parseRecruitmentJob` to return `StructuredRecruitmentJob` with `kind: 'structured'`. Make filter/search branch by `kind`: structured searches current fields; uploaded searches file name and resolved department label. Keep the existing page sizes of six desktop and three mobile.

- [ ] **Step 4: Run domain tests**

Run: `npm test -- tests/recruitment-jobs.spec.ts tests/recruitment-uploaded-jobs.spec.ts`

Expected: PASS.

- [ ] **Step 5: Local review checkpoint**

Run: `git diff --check -- src/ui/recruitment/recruitment-jobs.ts src/ui/recruitment/recruitment-uploaded-jobs.ts tests/recruitment-jobs.spec.ts tests/recruitment-uploaded-jobs.spec.ts`

Expected: no whitespace errors; do not commit.

### Task 2: Room-scoped App Database repository

**Files:**
- Create: `src/ui/recruitment/recruitment-job-file-repository.ts`
- Create: `tests/recruitment-job-file-repository.spec.ts`

**Interfaces:**
- Consumes: `RecruitmentJobFileMetadata` from Task 1, `McpApp`, existing `isAlreadyRegisteredError` and `parseToolResult` conventions.
- Produces:
  - `RECRUITMENT_JOB_FILES_COLLECTION = 'hr_recruitment_job_files'`.
  - `AppDbRecruitmentJobFileRepository(app, roomId)`.
  - `list(): Promise<RecruitmentJobFileMetadata[]>`.
  - `upsert(metadata: RecruitmentJobFileMetadata): Promise<RecruitmentJobFileMetadata>`.

- [ ] **Step 1: Write failing repository tests with a stateful App Database fake**

Cover missing collection on read, first-write registration, exact room-scoped schema/index, create, update by `(roomId,fileId)`, duplicate/racing writes, strict row parsing, and isolation between two Room ids.

```ts
expect(registration.arguments).toMatchObject({
  collection: 'hr_recruitment_job_files',
  scope: 'room',
  indexes: [{ fields: { roomId: 1, fileId: 1 }, unique: true }],
});
```

- [ ] **Step 2: Run the repository test and observe failure**

Run: `npm test -- tests/recruitment-job-file-repository.spec.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement strict list/upsert behavior**

Register fields `roomId`, `fileId`, `fileName`, `departmentKey`, `source`, `createdAt`. `list()` returns `[]` for a missing collection without registering. `upsert()` queries the stable identity, updates an existing row, otherwise creates; on missing collection register and retry; on a duplicate/race re-query then update. Reject metadata whose `source` is not `uploaded` or whose ids/names are empty.

- [ ] **Step 4: Run repository and department-store regression tests**

Run: `npm test -- tests/recruitment-job-file-repository.spec.ts tests/recruitment-departments.spec.ts`

Expected: PASS.

- [ ] **Step 5: Local review checkpoint**

Run: `git diff --check -- src/ui/recruitment/recruitment-job-file-repository.ts tests/recruitment-job-file-repository.spec.ts`

Expected: no whitespace errors; do not commit.

### Task 3: Upload orchestration and retry-safe metadata persistence

**Files:**
- Create: `src/ui/recruitment/recruitment-job-upload.ts`
- Create: `tests/recruitment-job-upload.spec.ts`
- Modify: `src/ui/pipeline-service.ts`

**Interfaces:**
- Consumes: `PipelineService.uploadJD(file)`, repository `upsert`, `CVFile`, `RecruitmentJobFileMetadata`.
- Produces:
  - `UploadedRecruitmentFileRef = { fileId: string; fileName: string; downloadUrl?: string }`.
  - `RecruitmentJobUploadInput = { file: File; departmentKey: string; createdAt: string; uploadedFile?: UploadedRecruitmentFileRef }`.
  - `RecruitmentJobUploadDependencies = { upload(file: File): Promise<CVFile>; listFiles(): Promise<CVFile[]>; upsert(metadata: RecruitmentJobFileMetadata): Promise<RecruitmentJobFileMetadata> }`.
  - `submitRecruitmentJobUpload(input, dependencies): Promise<{ file: UploadedRecruitmentFileRef; metadata: RecruitmentJobFileMetadata }>`.
  - `RecruitmentJobMetadataSaveError` exposing the already-uploaded `file` and attempted `metadata`.
  - `PipelineService.uploadJD(file): Promise<CVFile>` with a resolved `_id` or a clear error.

- [ ] **Step 1: Write failing orchestration tests**

Cover successful upload+upsert, retry with `uploadedFile` skipping upload, metadata failure carrying the file ref, upload response missing id resolved by a refreshed list/name, and unresolved id preventing `upsert`.

```ts
await submitRecruitmentJobUpload({ ...input, uploadedFile }, deps);
expect(deps.upload).not.toHaveBeenCalled();
expect(deps.upsert).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the orchestration test and observe failure**

Run: `npm test -- tests/recruitment-job-upload.spec.ts`

Expected: FAIL because the orchestration API does not exist or `uploadJD` does not guarantee an id.

- [ ] **Step 3: Tighten `PipelineService.uploadJD`**

Return `Promise<CVFile>`. Preserve collision suffix behavior, then resolve a missing id by refreshing `fetchAvailableJDs()` and matching the final name. Throw `Không lấy được mã file JD sau khi tải lên.` if still unresolved.

- [ ] **Step 4: Implement retry-safe orchestration**

Validate stable inputs, upload only when `uploadedFile` is absent, build metadata once with the supplied `createdAt`, call `upsert`, and wrap only metadata failures in `RecruitmentJobMetadataSaveError`.

- [ ] **Step 5: Run upload tests and existing Pipeline service tests**

Run: `npm test -- tests/recruitment-job-upload.spec.ts tests/pipeline-file-list-errors.spec.ts tests/pipeline-studio-sections.spec.ts`

Expected: PASS.

- [ ] **Step 6: Local review checkpoint**

Run: `git diff --check -- src/ui/recruitment/recruitment-job-upload.ts src/ui/pipeline-service.ts tests/recruitment-job-upload.spec.ts`

Expected: no whitespace errors; do not commit.

### Task 4: Shared JD preview and uploaded-JD detail dialog

**Files:**
- Create: `src/ui/jd-document/JDDocumentPreview.tsx`
- Create: `src/ui/recruitment/RecruitmentUploadedJobDialog.tsx`
- Modify: `src/ui/pipeline/PipelineStudioSections.tsx`
- Modify: `src/ui/pipeline-dashboard.tsx`
- Create: `tests/jd-document-preview.spec.tsx`
- Create: `tests/recruitment-uploaded-job-dialog.spec.ts`

**Interfaces:**
- Consumes: `UploadedRecruitmentJob`, existing `CompanyMarkdownPreview`, `CompanyDocxPreview`, `CompanyPdfPreview`, `StudioDialog` and `StudioInlineState`.
- Produces:
  - `JDDocumentPreview({ fileName, text, blob, loading, error })`.
  - `RecruitmentUploadedJobDialog` with controlled preview state and callbacks `onDownload`, `onEditWithAI`, `onUseInPipeline`, `onClose`.

- [ ] **Step 1: Write failing renderer and action-visibility tests**

Assert `.md` renders Markdown text, `.docx` selects Word preview, `.pdf` selects PDF preview, and error/loading short-circuit the renderer. Assert the uploaded dialog always includes download/Pipeline actions, includes AI only for Markdown, and never prints structured fields such as salary or location.

- [ ] **Step 2: Run the new preview tests and observe failure**

Run: `npm test -- tests/jd-document-preview.spec.tsx tests/recruitment-uploaded-job-dialog.spec.ts`

Expected: FAIL because the shared preview and uploaded dialog do not exist.

- [ ] **Step 3: Extract the existing Pipeline renderer**

Move the behavior of `PipelineJDPreview` into `JDDocumentPreview`; import and use it from Pipeline without changing current loading/error/edit behavior.

- [ ] **Step 4: Implement the controlled uploaded-JD dialog**

Show file name, department and format. Keep I/O outside the component. Render exact actions from the spec and guard `Chỉnh với AI` with `job.format === 'markdown'`.

- [ ] **Step 5: Run preview, dialog and Pipeline interaction tests**

Run: `npm test -- tests/jd-document-preview.spec.tsx tests/recruitment-uploaded-job-dialog.spec.ts tests/pipeline-jd-select-interaction.spec.ts`

Expected: PASS.

- [ ] **Step 6: Local review checkpoint**

Run: `git diff --check -- src/ui/jd-document/JDDocumentPreview.tsx src/ui/recruitment/RecruitmentUploadedJobDialog.tsx src/ui/pipeline/PipelineStudioSections.tsx src/ui/pipeline-dashboard.tsx tests/jd-document-preview.spec.tsx tests/recruitment-uploaded-job-dialog.spec.ts`

Expected: no whitespace errors; do not commit.

### Task 5: Department-required drag/drop upload dialog

**Files:**
- Create: `src/ui/recruitment/RecruitmentJobUploadDialog.tsx`
- Create: `tests/recruitment-job-upload-dialog.spec.tsx`
- Modify: `src/ui/studio/studio.css`

**Interfaces:**
- Consumes: departments, `validateRecruitmentJobFiles`, `UploadedRecruitmentFileRef`.
- Produces: a controlled dialog receiving `open`, `file`, `departmentKey`, `error`, `isSaving`, `uploadedFile`, and callbacks for file/department change, submit, close and retry.

- [ ] **Step 1: Write failing happy-dom interaction tests**

Exercise picker change and drop events into the same `onFileChange`, invalid extension display, selected filename/format, required department, submit disabled states, and the post-upload retry copy/action when `uploadedFile` exists.

- [ ] **Step 2: Run the dialog test and observe failure**

Run: `npm test -- tests/recruitment-job-upload-dialog.spec.tsx`

Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement the controlled dialog**

Use `StudioDialog`, a hidden single-file input with `accept=".md,.docx,.pdf"`, an accessible drop zone, the existing department options, and no I/O. Prevent close while saving. Use `Tải JD lên` normally and `Thử lưu phòng ban lại` after a partial success.

- [ ] **Step 4: Add scoped Studio CSS**

Add only recruitment upload dialog/drop-zone styles and compact header-action styles. Keep focus-visible, disabled and mobile wrapping states. Do not shrink global `.studio-button` defaults.

- [ ] **Step 5: Run dialog and existing recruitment dialog tests**

Run: `npm test -- tests/recruitment-job-upload-dialog.spec.tsx tests/recruitment-job-dialogs.spec.ts`

Expected: PASS.

- [ ] **Step 6: Local review checkpoint**

Run: `git diff --check -- src/ui/recruitment/RecruitmentJobUploadDialog.tsx src/ui/studio/studio.css tests/recruitment-job-upload-dialog.spec.tsx`

Expected: no whitespace errors; do not commit.

### Task 6: Integrate uploaded JDs into RecruitmentPanel

**Files:**
- Modify: `src/ui/recruitment-panel.tsx`
- Modify: `src/ui/recruitment/RecruitmentJobDialogs.tsx`
- Modify: `src/ui/studio/studio.css`
- Modify: `tests/recruitment-job-dialogs.spec.ts`
- Modify: `tests/recruitment-navigation.spec.ts`
- Create: `tests/recruitment-upload-integration.spec.tsx`

**Interfaces:**
- Consumes: Tasks 1–5, `CompanyDocumentRepository`, `readRoomFileText`, existing room-operation guard and navigation context.
- Produces: header actions, upload state/orchestration, merged cards, uploaded preview loading and format-specific actions.

- [ ] **Step 1: Write failing integration tests**

Assert header action order/copy, uploaded card content, structured card regression, filter/search/pagination with mixed jobs, metadata retry preserving the uploaded ref, and stale async results ignored after a Room/app switch.

- [ ] **Step 2: Run focused recruitment tests and observe failure**

Run: `npm test -- tests/recruitment-upload-integration.spec.tsx tests/recruitment-job-dialogs.spec.ts tests/recruitment-navigation.spec.ts`

Expected: FAIL because the panel does not load metadata or render/upload the new kind.

- [ ] **Step 3: Load and merge Room data**

Instantiate `AppDbRecruitmentJobFileRepository` per Room. Fetch files, departments and uploaded metadata together. Parse structured JDs only when their `fileId` is not tagged uploaded; resolve the merged departments and jobs only while the room operation remains current.

- [ ] **Step 4: Integrate upload orchestration**

Add controlled modal state. On first submit call `submitRecruitmentJobUpload` without `uploadedFile`; on `RecruitmentJobMetadataSaveError`, retain the file ref; on retry pass it back so no upload repeats. Close/reset only after full success or explicit cancel.

- [ ] **Step 5: Render both card/detail variants**

Branch on `job.kind`. Preserve the structured card/dialog. Uploaded cards show only department, file name, format and `Xem chi tiết`. Load Markdown text or binary Blob through authenticated repositories before rendering `RecruitmentUploadedJobDialog`; revoke any created object URLs used by download.

- [ ] **Step 6: Wire actions and compact header styling**

Order compact actions `Phòng ban`, `Tải JD`, `Tạo JD thủ công`. Use the existing `{ fileId, fileName }` navigation context for Pipeline and Markdown AI navigation. Keep AI absent for DOCX/PDF.

- [ ] **Step 7: Run recruitment regression tests**

Run: `npm test -- tests/recruitment-upload-integration.spec.tsx tests/recruitment-jobs.spec.ts tests/recruitment-uploaded-jobs.spec.ts tests/recruitment-job-file-repository.spec.ts tests/recruitment-job-upload.spec.ts tests/recruitment-job-upload-dialog.spec.tsx tests/recruitment-job-dialogs.spec.ts tests/recruitment-navigation.spec.ts tests/recruitment-departments.spec.ts`

Expected: PASS.

- [ ] **Step 8: Local review checkpoint**

Run: `git diff --check -- src/ui/recruitment-panel.tsx src/ui/recruitment src/ui/studio/studio.css tests/recruitment-*`

Expected: no whitespace errors; do not commit.

### Task 7: Replace Pipeline direct upload with compact `Thêm JD` navigation

**Files:**
- Modify: `src/ui/pipeline/PipelineStudioSections.tsx`
- Modify: `src/ui/pipeline-dashboard.tsx`
- Modify: `src/ui/studio/studio.css`
- Modify: `tests/pipeline-jd-select-interaction.spec.ts`
- Modify: `tests/pipeline-studio-wiring.spec.ts`

**Interfaces:**
- Consumes: App's existing `handleNavigate` and `AppTab` value `recruitment`.
- Produces: `PipelineJDPanel.onAddJD: () => void`; `PipelineDashboardProps.onNavigate` accepts both `recruitment` and the existing candidate navigation.

- [ ] **Step 1: Write failing navigation/UI tests**

Assert the panel renders `Thêm JD`, clicking calls `onAddJD`, no JD file input or `onUpload` remains, App still provides the shared callback, and Dashboard calls `onNavigate?.('recruitment')`.

- [ ] **Step 2: Run Pipeline tests and observe failure**

Run: `npm test -- tests/pipeline-jd-select-interaction.spec.ts tests/pipeline-studio-wiring.spec.ts`

Expected: FAIL because Pipeline still exposes direct upload.

- [ ] **Step 3: Remove direct JD upload wiring**

Delete `jdInputRef`, `handleUploadJD`, `fileInputRef` and `onUpload` from the JD panel path only. Do not change CV upload. Replace them with `onAddJD={() => onNavigate?.('recruitment')}`.

- [ ] **Step 4: Add a component-scoped micro button style**

Apply a Pipeline-only class with smaller text, height, padding and icon gap than current compact buttons. Preserve focus-visible and disabled behavior.

- [ ] **Step 5: Run Pipeline regression tests**

Run: `npm test -- tests/pipeline-jd-select-interaction.spec.ts tests/pipeline-studio-wiring.spec.ts tests/pipeline-studio-sections.spec.ts tests/studio-navigation-intent.spec.ts`

Expected: PASS.

- [ ] **Step 6: Local review checkpoint**

Run: `git diff --check -- src/ui/pipeline-dashboard.tsx src/ui/pipeline/PipelineStudioSections.tsx src/ui/studio/studio.css tests/pipeline-jd-select-interaction.spec.ts tests/pipeline-studio-wiring.spec.ts`

Expected: no whitespace errors; do not commit.

### Task 8: End-to-end verification, documentation and Docker deployment

**Files:**
- Modify if behavior summary changes: `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md`
- Verify: all files changed in Tasks 1–7

**Interfaces:**
- Consumes: complete implementation.
- Produces: verified local build and healthy `hr-app` container using the new image.

- [ ] **Step 1: Run all focused tests**

Run: `npm test -- tests/recruitment-jobs.spec.ts tests/recruitment-uploaded-jobs.spec.ts tests/recruitment-job-file-repository.spec.ts tests/recruitment-job-upload.spec.ts tests/recruitment-job-upload-dialog.spec.tsx tests/recruitment-uploaded-job-dialog.spec.ts tests/recruitment-upload-integration.spec.tsx tests/recruitment-job-dialogs.spec.ts tests/recruitment-navigation.spec.ts tests/recruitment-departments.spec.ts tests/jd-document-preview.spec.tsx tests/pipeline-jd-select-interaction.spec.ts tests/pipeline-studio-wiring.spec.ts`

Expected: PASS with zero failures.

- [ ] **Step 2: Run strict type checking**

Run: `npm run typecheck:strict-unused`

Expected: exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: no new failures. If the four documented baseline failures remain, report them by exact test name: two `manifest.spec.ts` identity/package mismatches and two `packaging.spec.ts` `/bin/bash` environment failures.

- [ ] **Step 4: Build production assets**

Run: `npm run build`

Expected: Vite build succeeds and `privos-app lint` reports a valid manifest.

- [ ] **Step 5: Update the redesign handoff document**

Record the new upload/App Database/preview/navigation behavior and fresh verification evidence in `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md`. Do not overwrite unrelated history.

- [ ] **Step 6: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only intended new/modified files plus the user's pre-existing worktree changes. Do not commit.

- [ ] **Step 7: Rebuild and deploy Docker**

Build `privos-mcp-app-demo:local` with canonical `PRIVOS_MCP_MANIFEST_JSON` and `PRIVOS_MCP_MANIFEST_DIGEST`, then run `docker compose up -d --no-deps --force-recreate hr-app`. Do not use `--remove-orphans`.

- [ ] **Step 8: Verify the running service**

Confirm `GET http://localhost:3000/health` returns 200, Docker reports `healthy`, and the container image id equals `docker image inspect privos-mcp-app-demo:local`.

- [ ] **Step 9: User smoke-test handoff**

Ask the user to verify: compact header buttons; required department; drag/drop and picker for all three formats; uploaded card; Markdown/DOCX/PDF preview; metadata retry if reproducible; Pipeline `Thêm JD`; and selection of the uploaded JD after `Dùng để sàng lọc CV`.
