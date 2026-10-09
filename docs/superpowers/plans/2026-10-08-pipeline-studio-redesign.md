# Pipeline / Sàng lọc CV Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign tab `Sàng lọc CV` theo `ui-ux-preview/screenshots/pipeline.png` trong khi giữ nguyên luồng PrivOS đang chạy, đồng thời bổ sung ba thao tác đã được duyệt: chọn tất cả CV, dừng an toàn sau CV hiện tại và mở tab Ứng viên sau khi kết quả đã được lưu.

**Architecture:** Giữ `PipelineService` và toàn bộ gateway PrivOS làm nguồn nghiệp vụ hiện tại; `PipelineDashboard` tiếp tục là controller sở hữu effect, polling, upload và batch scoring. Tách các phép tính UI thuần và các section trình bày Studio khỏi file controller, dùng Studio primitives/tokens hiện có, và triển khai stop request bằng cờ in-memory chỉ được đọc tại ranh giới giữa hai lần `processCV`.

**Tech Stack:** TypeScript strict, React 18, Vitest 2, `@privos_ai/app-react` 0.8, Ant Design icons, Vite 5, PrivOS Room Files/Lists/AI bridge.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md` mục 3, 6.3, 7, 8 và 9; giao diện tham chiếu `../ui-ux-preview/screenshots/pipeline.png` cùng `../ui-ux-preview/screenshots/mobile-pipeline.png`.

## Global Constraints

- Chỉ redesign tab `Sàng lọc CV`; không bắt đầu redesign tab `Ứng viên` hoặc `Trợ lý JD` trong plan này.
- Giữ nguyên `src/ui/pipeline-service.ts`, các đường dẫn Room Files, prompt, parser, cách chấm điểm, cách tạo list/Kanban và các MCP tool hiện có.
- Không thay đổi `privos-app.json`, `SCOPES.md`, schema dữ liệu hoặc permission; UI tiếp tục gọi PrivOS bằng user session và để Hub thực thi quyền.
- Không đưa dữ liệu mẫu, tên Aster Studio, prototype controls hoặc số liệu hard-code từ preview vào production.
- Không thêm nút hoặc copy `Chỉnh với AI` trong Pipeline.
- Loại bỏ toàn bộ chức năng tạo JD bằng form khỏi Pipeline: nút/modal/form state/prompt/handler AI và `IPipelineService.askAI?` chỉ phục vụ luồng này; việc tạo JD thuộc tab Vị trí tuyển dụng hoặc Trợ lý JD.
- Không render nút riêng `Xem JD`; vùng tóm tắt/tên JD đã chọn phải là control bấm được để mở nội dung JD hiện có.
- Bổ sung `Chọn tất cả`, `Dừng sau CV hiện tại` và `Xem bảng ứng viên` theo xác nhận của người dùng ngày 2026-10-08.
- Stop request không được abort `processCV`, AI polling, upload, file write hoặc list write đang chạy; chỉ dừng trước CV kế tiếp và vẫn lưu các kết quả đã hoàn tất.
- CV chưa chạy sau khi dừng vẫn giữ trạng thái được chọn để người dùng có thể tiếp tục ở lần chạy sau.
- `Xem bảng ứng viên` chỉ đổi sang tab `cvScored`; không giả lập `listId` và không tự chọn đợt vì service hiện trả `Promise<void>` và màn hình Ứng viên chưa nhận intent đợt tuyển dụng.
- Giữ cơ chế preload/mount tab hiện có; polling file/JD chỉ chạy khi `active && !processing` và navigation intent JD tiếp tục resolve theo `fileId` trước.
- Dùng đúng Montserrat đã nhúng tại `src/ui/studio/privos-fonts.css` với fallback hiện có của app và semantic token `--studio-*`; không tải font/CDN mới, không khai báo DM Sans/Inter riêng cho Pipeline và không đặt palette riêng trong JSX.
- Responsive phải bám ảnh desktop/mobile: hai cột ở desktop, một cột trên iframe hẹp, không gây horizontal overflow.
- Không commit hoặc push; mỗi task kết thúc bằng checkpoint `git diff --check` và status để người dùng kiểm soát worktree.
- App production preview chạy bằng Docker Compose service `hr-app`; trước bàn giao phải build thành công image `privos-mcp-app-demo:local`, force-recreate service và xác minh `http://localhost:3000/health` trả HTTP 200.

## Review Focus

- Người dùng yêu cầu dừng trong lúc một CV đang ở bước AI hoặc write: CV hiện tại hoàn tất, kết quả đã xong được lưu, CV kế tiếp không khởi chạy.
- CV/JD bị xóa hoặc mất quyền trong lúc batch chạy: giữ guard hiện có, không báo hoàn tất giả và không biến lỗi quyền thành empty state.
- Danh sách file đổi do polling khi có selection: `Chọn tất cả` chỉ thao tác trên file hiện có, không giữ id ma và không xóa lựa chọn hợp lệ khi read lỗi.
- Kết quả đã chấm nhưng tạo list/Kanban thất bại: không hiển thị `Xem bảng ứng viên` như thể dữ liệu đã được lưu thành công.
- Đổi JD nhanh hoặc nhận navigation intent trong lúc request cũ còn chạy: request-generation guard hiện có tiếp tục ngăn nội dung JD cũ ghi đè lựa chọn mới.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/ui/pipeline/pipeline-view-model.ts` (mới) | Các phép tính thuần cho selection, batch progress và trạng thái kết thúc; không gọi React/DOM/PrivOS. |
| `src/ui/pipeline/PipelineStudioSections.tsx` (mới) | Các section trình bày: flow strip, JD panel, CV queue, progress và results; chỉ nhận dữ liệu/callback từ controller. |
| `src/ui/pipeline-dashboard.tsx` | Controller hiện có: PrivOS context/service, polling, upload, JD dialogs, batch loop và navigation callback. |
| `src/ui/App.tsx` | Truyền `handleNavigate` vào Pipeline để mở tab Ứng viên. |
| `src/ui/studio/studio.css` | Style Pipeline bằng semantic token, gồm desktop/mobile/theme/focus states; loại nhu cầu inline stylesheet cũ. |
| `tests/pipeline-view-model.spec.ts` (mới) | Unit test selection/progress/outcome thuần. |
| `tests/pipeline-studio-sections.spec.ts` (mới) | SSR/source/CSS contract cho hierarchy, accessibility, copy và hành vi được duyệt. |
| `tests/pipeline-studio-wiring.spec.ts` (mới) | Contract controller cho safe-stop boundary, upload triggers, navigation và các guard không được mất. |

### Task 1: Khóa mô hình selection, progress và batch outcome bằng hàm thuần

**Files:**
- Create: `src/ui/pipeline/pipeline-view-model.ts`
- Create: `tests/pipeline-view-model.spec.ts`
- Modify: `src/ui/pipeline-dashboard.tsx` (chỉ chuyển `BatchProgress`/`getBatchProgress` sang module mới sau khi test xanh)

**Interfaces:**
- Consumes: `CVFile`, `ProcessingStatus` từ `src/ui/pipeline-service.ts`.
- Produces: `PipelineBatchProgress = { total; processed; completed; failed; active? }`.
- Produces: `PipelineRunOutcome = 'idle' | 'running' | 'stop-requested' | 'stopped' | 'completed' | 'completed-with-errors' | 'interrupted' | 'save-error'`.
- Produces: `getPipelineBatchProgress(batchFileIds: readonly string[], statuses: Readonly<Record<string, ProcessingStatus>>): PipelineBatchProgress`.
- Produces: `getQueueSelectionState(files: readonly CVFile[], selectedIds: ReadonlySet<string>): { selectedCount: number; allSelected: boolean; partiallySelected: boolean; visibleIds: string[] }`.
- Produces: `toggleAllQueueFiles(files: readonly CVFile[], selectedIds: ReadonlySet<string>, selectAll: boolean): Set<string>`; khi bỏ chọn chỉ bỏ id thuộc danh sách file hiện tại và không làm rơi id ngoài tập visible một cách âm thầm.
- Produces: `canOpenSavedCandidateBoard(outcome: PipelineRunOutcome, savedResultCount: number): boolean`; chỉ `completed`, `completed-with-errors` hoặc `stopped` với ít nhất một kết quả đã lưu mới trả `true`.

- [ ] **Step 1: Viết failing tests cho selection và progress**

  Trong `tests/pipeline-view-model.spec.ts`, assert:

  - empty queue không được coi là `allSelected`;
  - selection một phần trả `partiallySelected: true`;
  - select all thêm toàn bộ id visible và deselect all chỉ bỏ các id visible;
  - `completed` và `error` đều tăng `processed`, nhưng chỉ `completed` tăng `completed`;
  - status `renaming`/`scoring` được nhận là `active`;
  - id batch chưa có status không bị tính là đã xử lý;
  - candidate board CTA bị khóa cho `idle`, `running`, `stop-requested`, `interrupted`, `save-error` hoặc zero saved results.

- [ ] **Step 2: Chạy test để xác nhận fail vì module chưa tồn tại**

  Run: `npm test -- tests/pipeline-view-model.spec.ts`

  Expected: FAIL vì không resolve được `pipeline-view-model`.

- [ ] **Step 3: Implement các type và hàm thuần**

  Không đọc DOM, không mutation `Set` đầu vào và không gọi service. `getPipelineBatchProgress` phải giữ đúng ý nghĩa progress hiện tại: lỗi là một CV đã xử lý, còn pending không phải active.

- [ ] **Step 4: Thay helper progress nội bộ trong dashboard bằng module mới**

  Xóa `BatchProgress` và `getBatchProgress` cục bộ, import `getPipelineBatchProgress`. Chưa thay JSX hoặc batch loop ở task này.

- [ ] **Step 5: Chạy unit test và regression progress hiện có**

  Run: `npm test -- tests/pipeline-view-model.spec.ts tests/pipeline-file-list-errors.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

- [ ] **Step 6: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; `pipeline-service.ts` chưa thay đổi.

### Task 2: Xây các section Studio theo ảnh desktop/mobile

**Files:**
- Create: `src/ui/pipeline/PipelineStudioSections.tsx`
- Create: `tests/pipeline-studio-sections.spec.ts`
- Modify: `src/ui/studio/studio.css` (thêm section `.pipeline-studio-*`)

**Interfaces:**
- Consumes: `CVFile`, `ProcessingStatus`, `PipelineBatchProgress`, `PipelineRunOutcome` và các callback do dashboard cung cấp.
- Produces: `PipelineFlowStrip({ jdReady, selectedCount, completedCount })`.
- Produces: `PipelineJDPanel({ selectedJD, defaultJDs, aiGeneratedJDs, loadStatus, loadError, dropdownOpen, disabled, onToggleDropdown, onSelectJD, onOpenSelectedJD, onRetryJD, onOpenUpload })`.
- Produces: `PipelineCVQueue({ files, selectedIds, selection, loading, processing, deletingId, pendingDeleteId, onToggleOne, onToggleAll, onDelete, onOpenUpload, onStart })`.
- Produces: `PipelineProgressPanel({ progress, outcome, processing, stopRequested, canOpenCandidates, onRequestStop, onOpenCandidates })`.
- Produces: `PipelineResultsPanel({ statuses, jdName })`; chỉ hiển thị dữ liệu thật có trong `ProcessingStatus`, không dựng candidate id, vị trí hoặc metadata giả.

- [ ] **Step 1: Viết failing SSR/source contract tests cho hierarchy và copy**

  `tests/pipeline-studio-sections.spec.ts` phải render các section bằng `react-dom/server` và assert:

  - header/flow có `Sàng lọc CV`, ba bước `Chọn mô tả công việc`, `Chọn CV`, `Đánh giá & kết quả`;
  - JD panel có `Mô tả công việc`, grouped dropdown, status load/error/retry và control tóm tắt JD là `<button>` có accessible label `Mở nội dung JD ...`;
  - output không chứa button/copy `Chỉnh với AI`, `Tạo bằng form` hoặc button `Xem JD`;
  - `Tải JD` là secondary action cùng hàng với nhãn `Chọn JD có sẵn`, gọi `onOpenUpload` và xuống dòng an toàn ở mobile;
  - queue có checkbox `Chọn tất cả`, selected count, delete action, upload action và CTA đánh giá dùng cùng disabled contract;
  - progress đang chạy có `Dừng sau CV hiện tại`; sau khi request hiển thị `Sẽ dừng sau CV hiện tại` và disable click lặp;
  - `Xem bảng ứng viên` chỉ xuất hiện khi `canOpenCandidates` là `true`;
  - result empty/loading/error/completed đều có live semantics phù hợp và không chứa mock candidate/job data.

- [ ] **Step 2: Viết failing CSS contract test trong cùng suite**

  Đọc `src/ui/studio/studio.css` và assert có:

  - `.pipeline-studio-page`, `.pipeline-studio-flow`, `.pipeline-studio-grid`, `.pipeline-studio-jd-summary`, `.pipeline-studio-queue`, `.pipeline-studio-progress`, `.pipeline-studio-results`;
  - desktop grid có tỷ lệ gần ảnh preview (`minmax(0, .85fr) minmax(0, 1.15fr)` hoặc giá trị tương đương);
  - breakpoint hẹp chuyển grid thành một cột và action/header wrap;
  - focus-visible cho JD summary, dropdown, queue row action và stop button;
  - chỉ dùng semantic Studio variables cho surface/text/border/status chủ đạo, không thêm `@import` font và Pipeline kế thừa Montserrat từ `.studio-root`.

- [ ] **Step 3: Chạy test để xác nhận fail**

  Run: `npm test -- tests/pipeline-studio-sections.spec.ts`

  Expected: FAIL vì component/class Pipeline Studio chưa tồn tại.

- [ ] **Step 4: Implement presentational sections**

  Dùng `StudioPageHeader`, `StudioCard`, `StudioInlineState` và class dùng chung `studio-button`. Header có hai action `Tải CV` và `Đánh giá CV`; chúng chỉ gọi callback, không tự truy cập DOM/service. Flow strip dùng số liệu thật; trạng thái active phải dựa trên JD đã load, số CV được chọn và số status đã xử lý.

- [ ] **Step 5: Implement JD panel đúng quyết định của người dùng**

  Vùng summary hiển thị icon/file type, tên file và helper `Bấm để xem nội dung`; cả vùng là một button và mở viewer qua `onOpenSelectedJD`. Không render nút `Xem JD`, `Chỉnh với AI` hoặc `Tạo bằng form`. Đặt `Tải JD` ở hàng label của dropdown để người dùng thấy đây là cách bổ sung nguồn JD, nhưng không cạnh tranh với vùng xem JD đã chọn.

- [ ] **Step 6: Implement queue, progress và results**

  Queue giữ confirm-delete hai lần, trạng thái uploading/loading và disabled trong processing. Progress hiển thị tỷ lệ processed/total, số completed/error, CV active, trạng thái stop-requested/stopped/save-error; results trình bày score/category/reason/error hiện có theo layout responsive.

- [ ] **Step 7: Thêm CSS Pipeline vào semantic layer**

  Bám spacing/radius/typography của ảnh nhưng dùng `--studio-*`. Desktop giữ flow ngang và hai panel; mobile xếp dọc, các action đủ vùng chạm, queue/result không tràn ngang. Light/Dark/Brand không có selector hard-code theo feature.

- [ ] **Step 8: Chạy component/CSS tests và typecheck**

  Run: `npm test -- tests/pipeline-studio-sections.spec.ts tests/studio-primitives.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; chưa thay đổi service/API.

### Task 3: Nối controller hiện tại vào Studio view và triển khai safe stop

**Files:**
- Modify: `src/ui/pipeline-dashboard.tsx`
- Create: `tests/pipeline-studio-wiring.spec.ts`
- Test: `tests/pipeline-file-list-errors.spec.ts`

**Interfaces:**
- Consumes: helpers Task 1 và section props Task 2.
- Produces: `PipelineDashboardProps.onNavigate?: (target: AppTab) => void` (Task 4 sẽ nối từ App).
- Produces: controller state `stopRequested`, `batchOutcome`, `savedResultCount`; ref `stopAfterCurrentRef` là nguồn đọc đồng bộ bên trong vòng lặp async.
- Preserves: phần scoring/upload/delete của `IPipelineService`, `loadJdContent` request generation, `active` polling gate, navigation intent JD, double-click delete, upload handlers, JD view/download/edit state và `createKanbanBatchViaAI` contract.
- Removes from Pipeline UI/controller: `JDFormState`, `emptyJDForm`, `hasJDFormValue`, `buildJDPromptFromForm`, các state `jdPrompt`/`jdFormOpen`/`jdForm`/`useCompanyInfo`/`isGeneratingJD`, `handleGenerateJD`, `renderJDFormField`, modal tạo JD và optional `IPipelineService.askAI?` không còn consumer.

- [ ] **Step 1: Viết failing wiring/source tests**

  `tests/pipeline-studio-wiring.spec.ts` phải assert:

  - dashboard import/render `StudioPage`, `StudioPageHeader` và các Pipeline section; inline `<style>` cùng Google Fonts `@import` bị loại bỏ;
  - source không còn `Tạo bằng form`, `JDFormState`, `handleGenerateJD`, `jdFormOpen` hoặc lời gọi `serviceRef.current.askAI` của luồng tạo JD;
  - header và queue upload dùng cùng `cvUploadInputRef`, không dùng `document.getElementById`;
  - select-all gọi `toggleAllQueueFiles` và bị disable khi processing;
  - stop handler chỉ set state/ref, không tạo `AbortController` và không gọi service cancel;
  - trong `startPipeline`, `await service.processCV(...)` và việc ghi nhận kết quả CV hiện tại đứng trước check `stopAfterCurrentRef.current`/`break`;
  - unprocessed ids không bị xóa khỏi `selectedIds` khi stop;
  - kết quả completed trước stop vẫn đi qua `createKanbanBatchViaAI`;
  - `processing`/stop state được cleanup bằng `finally` kể cả lỗi bất ngờ;
  - các marker mà `tests/pipeline-file-list-errors.spec.ts` đang dùng vẫn còn hoặc test cũ được chuyển sang assertion hành vi tương đương.

- [ ] **Step 2: Chạy test để xác nhận fail trên controller cũ**

  Run: `npm test -- tests/pipeline-studio-wiring.spec.ts tests/pipeline-file-list-errors.spec.ts`

  Expected: suite mới FAIL; suite regression cũ vẫn PASS trước khi sửa.

- [ ] **Step 3: Thay page markup cũ bằng Studio composition**

  Giữ hooks/handlers hiện có trong controller, truyền dữ liệu/callback vào section Task 2. Dùng `StudioPage` + `StudioPageHeader` với eyebrow `Tuyển dụng`, title `Sàng lọc CV`, description `Chọn JD, tải CV và theo dõi kết quả đánh giá.`. Header actions và panel actions phải gọi cùng handler/ref để không sinh hai luồng upload/score khác nhau.

- [ ] **Step 4: Nối select-all và file input refs**

  Tạo `cvUploadInputRef` và `jdUploadInputRef`; cả action header lẫn panel kích hoạt đúng hidden input. `handleToggleAll` dùng helper Task 1; selection cá nhân và confirm-delete giữ hành vi hiện tại.

- [ ] **Step 5: Implement stop request ở ranh giới an toàn**

  Khi start: reset stop ref, outcome `running`, saved count `0`. Khi bấm stop: set ref ngay và outcome `stop-requested`. Sau `processCV`, guard CV/JD sau xử lý, cập nhật status/result/selection của CV hiện tại, mới kiểm tra ref; nếu có request thì đặt `stopped` và break trước CV kế tiếp. Không truyền abort signal vào `processCV` và không can thiệp write đang chạy.

- [ ] **Step 6: Giữ việc lưu partial results và phản hồi đúng**

  Sau loop, nếu `resultsForKanban.length > 0`, tiếp tục gọi `createKanbanBatchViaAI` một lần như hiện tại kể cả batch dừng. Chỉ tăng `savedResultCount` sau khi call này resolve. Phân biệt toast `đã dừng và lưu N kết quả`, `hoàn thành`, `hoàn thành có CV lỗi`, `nguồn bị xóa/mất quyền`, và `chấm xong nhưng lưu list lỗi`; không dùng `alert`.

- [ ] **Step 7: Giữ JD viewer, loại bỏ form tạo JD và chuyển lỗi browser alert sang Studio feedback**

  Vùng summary Task 2 gọi `handleOpenJdModal`. Xóa toàn bộ helper/state/handler/modal tạo JD bằng form cùng optional interface method `askAI?` chỉ dùng cho luồng đó; không sửa `PipelineService.askAI` vì scoring và các tab khác vẫn có thể dùng implementation này. Upload JD, viewer Markdown, download và request-generation guard giữ nguyên. Hai `alert` còn lại trong upload/start được thay bằng `showToast(..., 'error')` để phù hợp spec nhưng không đổi điều kiện nghiệp vụ.

- [ ] **Step 8: Chạy wiring, selection, polling và service regressions**

  Run: `npm test -- tests/pipeline-view-model.spec.ts tests/pipeline-studio-sections.spec.ts tests/pipeline-studio-wiring.spec.ts tests/pipeline-file-list-errors.spec.ts tests/pipeline-ai-polling.spec.ts tests/pipeline-kanban-stage-move.spec.ts`

  Expected: PASS; test giả lập move bị Hub từ chối có thể ghi expected stderr nhưng suite phải xanh.

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; `git diff -- src/ui/pipeline-service.ts` rỗng.

### Task 4: Nối “Xem bảng ứng viên” vào navigation hiện có

**Files:**
- Modify: `src/ui/App.tsx:170`
- Modify: `src/ui/pipeline-dashboard.tsx` (prop/callback only)
- Modify: `tests/pipeline-studio-wiring.spec.ts`
- Test: `tests/app-studio-shell.spec.ts`
- Test: `tests/studio-navigation-intent.spec.ts`

**Interfaces:**
- Consumes: `AppTab`, `handleNavigate(target, context?)` trong `App.tsx`.
- Produces: `PipelineDashboard` nhận `onNavigate` và gọi `onNavigate('cvScored')` từ CTA đã được Task 1 cho phép.
- Preserves: `visitedTabs`, mounted-tab preload, Payroll guard và JD navigation intent hiện có.

- [ ] **Step 1: Bổ sung failing navigation contract test**

  Assert `App.tsx` truyền `onNavigate={handleNavigate}` cho Pipeline, Pipeline gọi đúng `'cvScored'`, và không tạo `listId`/`candidateId` giả. Assert CTA không gọi `setTab` trực tiếp từ feature.

- [ ] **Step 2: Chạy test để xác nhận fail**

  Run: `npm test -- tests/pipeline-studio-wiring.spec.ts tests/app-studio-shell.spec.ts`

  Expected: FAIL vì Pipeline chưa nhận callback navigation.

- [ ] **Step 3: Nối callback qua App**

  Truyền `handleNavigate` từ `App.tsx`; trong Pipeline dùng callback cho `Xem bảng ứng viên`. Không mở tab tự động sau batch và không ghi navigation intent mới nếu người dùng chưa bấm CTA.

- [ ] **Step 4: Chạy navigation regressions**

  Run: `npm test -- tests/pipeline-studio-wiring.spec.ts tests/app-studio-shell.spec.ts tests/studio-navigation-intent.spec.ts tests/recruitment-navigation.spec.ts`

  Expected: PASS; luồng từ Vị trí tuyển dụng chọn sẵn JD cho Pipeline vẫn xanh.

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

- [ ] **Step 5: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; App chỉ thay wiring Pipeline cần thiết.

### Task 5: Verification đầy đủ và bàn giao để nghiệm thu Pipeline

**Files:**
- Verify only; chỉ sửa file thuộc Task 1-4 nếu verification phát hiện regression.

**Interfaces:**
- Consumes: toàn bộ deliverable Task 1-4.
- Produces: một tab Pipeline có thể triển khai để người dùng kiểm tra; không bắt đầu code tab Ứng viên.

- [ ] **Step 1: Chạy targeted Pipeline gate**

  Run: `npm test -- tests/pipeline-view-model.spec.ts tests/pipeline-studio-sections.spec.ts tests/pipeline-studio-wiring.spec.ts tests/pipeline-file-list-errors.spec.ts tests/pipeline-ai-polling.spec.ts tests/pipeline-candidate-name.spec.ts tests/pipeline-kanban-stage-move.spec.ts tests/recruitment-navigation.spec.ts tests/studio-navigation-intent.spec.ts tests/studio-primitives.spec.ts tests/app-studio-shell.spec.ts`

  Expected: PASS. Baseline trước triển khai cho 5 suite Pipeline/navigation hiện có là 36/36 tests pass ngày 2026-10-08.

- [ ] **Step 2: Chạy static/build gate**

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

  Run: `npm run build`

  Expected: PASS, gồm Vite bundle và manifest lint.

  Run: `npm run preflight`

  Expected: PASS hoặc ghi rõ lỗi hạ tầng/manifest baseline nếu trạng thái pairing hiện tại vẫn còn drift; không sửa manifest trong task UI.

- [ ] **Step 3: Chạy full test để phát hiện hồi quy ngoài trang**

  Run: `npm test`

  Expected: không có lỗi mới. Đối chiếu bốn lỗi baseline đã ghi trong spec (hai manifest identity và hai packaging `/bin/bash`) nếu chúng vẫn còn; không tính chúng là regression Pipeline nhưng phải báo cụ thể.

- [ ] **Step 4: Kiểm tra repository hygiene**

  Run: `git diff --check`

  Expected: PASS.

  Run: `git status --short`

  Expected: chỉ có plan doc và các file Task 1-4; không có generated asset, secret, manifest/schema/scope hoặc thay đổi `pipeline-service.ts`.

- [ ] **Step 5: Manual smoke test trong PrivOS ở Light/Dark/Brand**

  Trước smoke test, triển khai đúng image vào Docker Compose đang chạy:

  Run: `docker build --tag privos-mcp-app-demo:local .`

  Expected: build hoàn tất với exit code 0; stage UI chạy `npm run build` thành công trong image.

  Run: `docker compose up -d --no-deps --force-recreate hr-app`

  Expected: service `hr-app` được recreate từ image vừa build và ở trạng thái running.

  Run: `Invoke-RestMethod http://localhost:3000/health | ConvertTo-Json -Depth 5`

  Expected: HTTP 200 với trạng thái `alive`. `/ready` có thể vẫn 503 `MANIFEST_DRIFT` theo baseline spec; ghi rõ nhưng không sửa manifest trong task UI.

  Kiểm tra trên iframe rộng và hẹp:

  - header, flow strip, hai card, progress và results khớp hierarchy của `pipeline.png`/`mobile-pipeline.png`, không overflow;
  - preload không tự chạy scoring; polling chỉ chạy khi tab active;
  - navigation từ Vị trí tuyển dụng mở Pipeline và chọn đúng JD theo file id;
  - bấm vùng tên JD mở viewer; không có nút `Xem JD`, `Chỉnh với AI` hoặc `Tạo bằng form`;
  - `Tải JD` nằm cùng hàng với `Chọn JD có sẵn`, dùng đúng Montserrat và wrap hợp lý trên mobile;
  - upload JD/CV, retry lỗi JD, xóa CV hai lần, chọn một/chọn tất cả;
  - bắt đầu batch, lỗi một CV, JD/CV bị xóa giữa batch và list save error đều có feedback đúng;
  - bấm `Dừng sau CV hiện tại` khi AI đang chạy: CV hiện tại hoàn tất, không bắt đầu CV kế tiếp, CV chưa chạy vẫn selected và partial result được lưu;
  - `Xem bảng ứng viên` chỉ xuất hiện khi có kết quả đã lưu và mở tab Ứng viên khi bấm;
  - đổi theme hoặc chuyển tab/quay lại không mất JD/selection/result session hiện tại.

- [ ] **Step 6: Bàn giao và dừng ở cổng nghiệm thu**

  Báo file thay đổi, kết quả từng command, mọi baseline failure/giới hạn API và checklist smoke test. Nếu cần deploy container để người dùng kiểm tra, thực hiện theo yêu cầu riêng; sau đó dừng chờ người dùng xác nhận Pipeline đạt trước khi lập plan/code tab Ứng viên.
