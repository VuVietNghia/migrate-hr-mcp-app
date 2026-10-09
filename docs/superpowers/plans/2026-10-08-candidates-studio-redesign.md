# Candidates Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign tab “Ứng viên” theo `ui-ux-preview/screenshots/candidates.png`, cho phép xem một đợt hoặc “Tất cả đợt tuyển dụng”, dùng dữ liệu PrivOS thật và giữ nguyên các luồng kéo thả, xem chi tiết và gửi thư mời hiện có.

**Architecture:** Tách domain/view-model và presentational components khỏi `CVScoredTab`, nhưng giữ tab này làm controller cho Room context, list selection, polling và mutation. Metadata của mọi list `SCREENING` được tải nhẹ để dựng selector; chế độ một đợt chỉ tải/poll list được chọn, còn “Tất cả đợt tuyển dụng” tải/poll từng list vào map theo `listId` rồi hợp nhất ở view-model mà vẫn giữ identity nguồn. Chi tiết ứng viên đọc file đánh giá Markdown thật theo tên file card, còn điều hướng sang Hồ sơ nhân sự chỉ gửi intent mở form tạo mới, tuyệt đối không truyền hoặc chọn sẵn ứng viên.

**Tech Stack:** React 18, TypeScript, `@privos_ai/app-react`, PrivOS Lists/Items/Stages/Files và `hrm.mail.connection.get`, Vitest, Studio primitives/CSS hiện có.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md`

## Global Constraints

- Giữ nguyên schema list `SCREENING`, service/repository, permission và business flow hiện có; không đưa dữ liệu mẫu, Aster Studio, persona hoặc prototype controls vào production.
- Selector có lựa chọn “Tất cả đợt tuyển dụng”. Chế độ này tổng hợp hồ sơ từ mọi list `SCREENING` mà người dùng có quyền đọc; cùng một người ở hai đợt là hai hồ sơ ứng tuyển riêng và mỗi card/row phải hiển thị đúng nhãn đợt nguồn.
- Thứ tự đợt dùng `createdAt`, sau đó `created_at`, giảm dần; không dùng `updatedAt`/`updated_at` làm fallback hoặc tie-breaker. Timestamp thiếu/không hợp lệ nằm cuối; `_id` là tie-breaker ổn định.
- Lần mở đầu chọn đợt mới nhất; quay lại tab giữ selection; navigation intent hợp lệ thắng selection; list mới không cướp selection; list đang chọn bị xóa/mất quyền thì fallback sang list mới nhất còn hợp lệ.
- Chế độ một đợt chỉ tải đầy đủ/poll list đang chọn; chế độ tất cả tải đầy đủ/poll mọi list `SCREENING` mỗi 3 giây khi tab active. Kết quả load/poll cũ không được ghi đè sau khi đổi Room, đổi scope hoặc mutation mới hơn; lỗi một list trong chế độ tất cả phải được báo riêng mà không xóa dữ liệu hợp lệ của list khác.
- Kéo thả và đổi trạng thái trong popup dùng cùng `moveCVToStage`, cập nhật optimistic và rollback khi Hub từ chối. Không gọi trực tiếp `mcpapp.lists.moveItemToStage` từ component.
- Search, filter, metrics, Kanban và list view chỉ đọc item trong scope đang chọn: một list hoặc hợp nhất tất cả list. Search dùng tên ứng viên, vị trí/đợt và email; filter kết quả dùng category thật.
- Điểm theo tiêu chí chỉ hiển thị khi parse được từ file đánh giá Markdown thật. Không tự chia tổng điểm, không dựng evidence hoặc số liệu thay thế.
- “Tải đánh giá .md” chỉ dùng nội dung/file thật resolve được bằng identity hiện có. Khi file không tồn tại, mơ hồ hoặc không có quyền đọc, UI báo không khả dụng và không tạo file giả từ card data.
- Nút “Tạo hồ sơ nhân sự” chỉ chuyển sang tab “Hồ sơ nhân sự” và mở form tạo hồ sơ hiện có; không truyền `candidateId`, không chọn sẵn ứng viên và không tạo form thứ hai trong tab Ứng viên.
- Form “Gửi thư mời phỏng vấn” giữ nguyên field, template, validation, copy, send/tracking, optimistic badge, stage transition và toast hiện tại. Chỉ bổ sung khối read-only “TÀI KHOẢN GỬI CHUNG CỦA ROOM”.
- Khối tài khoản gửi chung chỉ đọc `hrm.mail.connection.get`, hiển thị mailbox/provider/status hoặc trạng thái chưa kết nối/lỗi; không chứa connect/replace/disconnect và không tự thay đổi điều kiện gửi hiện tại.
- Giao diện dùng semantic Studio tokens, kế thừa Montserrat, hỗ trợ Light/Dark/Brand và iframe rộng/hẹp; không thêm palette feature riêng.
- Không commit hoặc push. Mỗi task kết thúc bằng test và checkpoint diff theo quy ước repository.
- Hoàn tất riêng tab Ứng viên, bàn giao để người dùng nghiệm thu, rồi dừng trước khi sửa tab Trợ lý JD.

## Review Focus

- Một poll của list A hoàn tất sau khi người dùng đã chọn list B phải bị bỏ qua; test request token/list identity trong Task 2.
- Khi chọn “Tất cả đợt tuyển dụng”, mọi list đọc được đều đóng góp ứng viên/metric; item giữ cặp identity `(listId, itemId)`, không bị ghi đè khi hai list có cùng item id hoặc cùng email.
- List mới xuất hiện không được cướp selection, nhưng list đang chọn biến mất phải fallback xác định; test selection reconciliation trong Task 1 và metadata polling trong Task 2.
- Mutation stage bị Hub từ chối phải rollback cả Kanban, list view và popup; poll cũ không được ghi đè optimistic state; test trong Task 2 và Task 4.
- File đánh giá thiếu, trùng tên, format cũ hoặc Markdown hỏng không được sinh điểm tiêu chí/tệp giả; test resolver/parser và degraded UI trong Task 4.
- Navigation sang Hồ sơ nhân sự phải mở form trống, không mang candidate identity; tài khoản gửi chung lỗi/chưa kết nối không được làm mất nội dung form thư mời; test trong Task 5 và Task 6.

---

### Task 1: Tách model, selection state và view-model ứng viên

**Files:**
- Create: `src/ui/cv-scored/candidate-model.ts`
- Create: `src/ui/cv-scored/candidate-selection-state.ts`
- Create: `src/ui/cv-scored/candidate-view-model.ts`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/cv-scored/cv-board-loader.ts`
- Modify: `src/ui/cv-scored/cv-item-mapper.ts`
- Modify: `src/ui/cv-scored/cv-poll-diff.ts`
- Modify: `src/ui/cv-scored/cv-list-presence.ts`
- Modify: `src/ui/cv-scored/invite-sent-outcome.ts`
- Test: `tests/candidate-selection-state.spec.ts`
- Test: `tests/candidate-view-model.spec.ts`
- Test: `tests/cv-list-presence.spec.ts`
- Test: `tests/cv-item-mapper.spec.ts`
- Test: `tests/cv-poll-diff.spec.ts`
- Test: `tests/invite-sent-outcome.spec.ts`

**Interfaces:**
- Produces: `CVProfile`, `CVBoardData`, `CandidateMetricSummary` và các type stage/list dùng chung trong `candidate-model.ts`; các helper không còn import type ngược từ `CVScoredTab.tsx`.
- Produces: `ALL_SCREENING_LISTS`, `sortScreeningListsNewestFirst(lists)`, `resolveInitialScreeningListId(lists, intentListId?)`, `reconcileScreeningListSelection(lists, currentListId)` và `ScreeningRequestGuard` trong `candidate-selection-state.ts`.
- Produces: `filterCandidates(candidates, query, resultFilter, positionLabel)`, `getCandidateMetrics(candidates)`, `formatScreeningListLabel(list)` và các mapping category/stage presentation trong `candidate-view-model.ts`.

- [ ] **Step 1: Viết failing tests cho sort và selection đúng creation time**

Test các trường hợp `createdAt` ưu tiên hơn `created_at`, thay đổi `updatedAt` không đổi thứ tự, timestamp hỏng/thiếu nằm cuối, timestamp bằng nhau dùng `_id`, intent hợp lệ thắng newest, intent hỏng fallback newest, current selection được giữ, `ALL_SCREENING_LISTS` luôn hợp lệ khi còn ít nhất một list, và selection bị xóa fallback newest.

- [ ] **Step 2: Chạy selection tests để xác nhận fail**

Run: `npm test -- tests/candidate-selection-state.spec.ts tests/cv-list-presence.spec.ts`

Expected: FAIL vì helper mới chưa tồn tại và comparator hiện tại còn dùng update time.

- [ ] **Step 3: Tách type và implement selection helpers**

Di chuyển `CVProfile`/`CVBoardData` khỏi component. `CVBoardData` giữ `listId`, `listName`, creation timestamp, `stagesMap`, `fieldsMap`, `cvs`; không giữ board của list khác. `ScreeningRequestGuard.begin(listId)` trả token `{ listId, generation }`; `select(listId)` tăng generation; `isCurrent(token, selectedListId)` chỉ true khi cả identity và generation còn khớp.

- [ ] **Step 4: Viết failing tests cho mapper, metrics, search và result filter**

Assert mapper đọc thêm `Nhóm nghề` khi có nhưng không bịa vị trí; metrics đếm tổng/đạt/chờ phỏng vấn/đã phỏng vấn trên đúng mảng đầu vào; search tiếng Việt không phân biệt dấu/hoa thường và khớp name/email/position; filter category không làm thay đổi nguồn.

- [ ] **Step 5: Chạy view-model tests để xác nhận fail**

Run: `npm test -- tests/candidate-view-model.spec.ts tests/cv-item-mapper.spec.ts tests/cv-poll-diff.spec.ts`

Expected: FAIL vì model/view-model mới chưa tồn tại hoặc mapper chưa mang đủ field.

- [ ] **Step 6: Implement view-model và cập nhật helper imports**

Giữ alias stage legacy `07_CV_Cu`/`10_CV_Cu`, invite-mail flag và custom field shapes hiện có. Search normalize NFD/bỏ dấu/trim/collapse whitespace; category filter so khớp giá trị chuẩn hóa nhưng không sửa category gốc.

- [ ] **Step 7: Chuyển invite outcome sang một selected board**

Thay helper array-global bằng `applyInviteSentToBoard(board, cvId, updatedCustomFields, stageMove)`. Test phải chứng minh chỉ item thật trong board thay đổi và object không liên quan giữ identity.

- [ ] **Step 8: Chạy Task 1 regressions**

Run: `npm test -- tests/candidate-selection-state.spec.ts tests/candidate-view-model.spec.ts tests/cv-list-presence.spec.ts tests/cv-item-mapper.spec.ts tests/cv-poll-diff.spec.ts tests/cv-board-loader.spec.ts tests/invite-sent-outcome.spec.ts`

Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: chỉ có model/helper/tests Task 1 và plan; không commit/push.

### Task 2: Chuyển data flow sang metadata nhiều list + scope một đợt hoặc tất cả

**Files:**
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/cv-scored/cv-board-loader.ts`
- Modify: `src/ui/cv-scored/polling-sync.ts`
- Modify: `src/ui/studio/studio-navigation-intent.ts`
- Test: `tests/candidate-board-flow.spec.ts`
- Test: `tests/cv-scored-full-polling.spec.ts`
- Test: `tests/cv-scored-navigation-render.spec.ts`
- Test: `tests/studio-navigation-intent.spec.ts`
- Test: `tests/cv-kanban-stage-move-regression.spec.ts`
- Test: `tests/cv-stage-move.spec.ts`

**Interfaces:**
- Consumes: selection/request helpers Task 1, `loadScreeningBoard`, `CVBoardPollingGuard`, `StudioNavigationIntent.screening` hiện có.
- Produces: controller state `screeningLists`, `selectedListId`, `boardsByListId`, metadata/board loading và error theo list; `selectScreeningList(listId | ALL_SCREENING_LISTS)` là đường đổi scope duy nhất.
- Preserves: `active` polling gate, 3-second cadence, Pipeline navigation retry cho list vừa tạo, optimistic move, invite send tracking và tab state khi round-trip.

- [ ] **Step 1: Viết failing data-flow/source tests**

Assert initial load chỉ gọi `loadScreeningBoard` cho selected id; metadata vẫn chứa mọi `SCREENING` list; chọn `ALL_SCREENING_LISTS` tải từng list và hợp nhất đủ ứng viên; hai item trùng `_id` ở hai list không ghi đè nhau; đổi selector tăng generation; navigation intent chọn đúng list; poll đọc đúng scope; stale scope/list token không apply; room không có list không poll item.

- [ ] **Step 2: Chạy data-flow tests để xác nhận fail**

Run: `npm test -- tests/candidate-board-flow.spec.ts tests/cv-scored-full-polling.spec.ts tests/cv-scored-navigation-render.spec.ts`

Expected: FAIL vì controller hiện tải và render mọi board.

- [ ] **Step 3: Tách metadata load khỏi selected-board load**

`mcpapp.lists.getAll` chỉ parse/sort metadata. Sau khi resolve selection, chế độ một đợt gọi `loadScreeningBoard` đúng list; chế độ tất cả gọi cho từng list bằng `Promise.allSettled`, lưu theo `listId` và hợp nhất ở view-model. Khi một board load lỗi, giữ selector và hiển thị lỗi gắn với đợt; không fallback sang list khác trừ khi metadata chứng minh selection một đợt không còn hợp lệ.

- [ ] **Step 4: Reconcile navigation intent và tab round-trip**

Intent `screening.listId` hợp lệ đổi selection và load đúng board. Intent cho list chưa xuất hiện được retry tối đa theo contract hiện có. Cùng intent `sequence` chỉ xử lý một lần. Chuyển tab/quay lại không reset `selectedListId`.

- [ ] **Step 5: Rework polling chỉ cho selected list**

Mỗi tick đọc metadata để phát hiện list mới/xóa/mất quyền, reconcile selection rồi chỉ fetch items cho captured selected list. Trước `setSelectedBoard`, kiểm tra request token, selected id và polling mutation guard. Background poll không bật global loading; lỗi một tick giữ snapshot hợp lệ gần nhất và báo inline có retry khi cần.

- [ ] **Step 6: Giữ optimistic move và rollback trên một board**

`handleMove` dùng stage id của selected board; cùng handler phục vụ drag/drop và Task 4 status select. Begin mutation trước optimistic update, rollback previous status khi `moveCVToStage` reject, end mutation rồi request một poll mới. Toast lỗi phải hiển thị lý do có thể hành động.

- [ ] **Step 7: Chạy Task 2 tests**

Run: `npm test -- tests/candidate-board-flow.spec.ts tests/cv-scored-full-polling.spec.ts tests/cv-scored-navigation-render.spec.ts tests/studio-navigation-intent.spec.ts tests/cv-kanban-stage-move-regression.spec.ts tests/cv-stage-move.spec.ts tests/pipeline-studio-wiring.spec.ts`

Expected: PASS; navigation từ Pipeline vẫn mở đúng list.

- [ ] **Step 8: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: không có whitespace error; không commit/push.

### Task 3: Xây Candidate Studio screen, Kanban và list view theo ảnh

**Files:**
- Create: `src/ui/cv-scored/CandidateStudioViews.tsx`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/studio/studio.css`
- Test: `tests/candidate-studio-views.spec.ts`
- Test: `tests/candidate-studio-wiring.spec.ts`
- Test: `tests/studio-theme.spec.ts`

**Interfaces:**
- Produces: `CandidateMetrics`, `CandidateToolbar`, `CandidateKanban`, `CandidateListView` và `CandidateCard`; mọi component nhận data/callback, không gọi PrivOS.
- Produces: view state `viewMode: 'kanban' | 'list'`, `searchQuery`, `resultFilter`; selector đợt nhận `selectedListId` và list metadata thật.
- Consumes: `StudioPage`, `StudioPageHeader`, `StudioMetricCard`, `StudioSearchInput`, `StudioInlineState`, semantic `--studio-*` tokens.

- [ ] **Step 1: Viết failing SSR/CSS contract tests**

Assert hierarchy có eyebrow `TUYỂN DỤNG`, title `Ứng viên`, mô tả production, 4 metrics, search placeholder `Tìm ứng viên, vị trí hoặc email...`, selector có `Tất cả đợt tuyển dụng` và các đợt thật, filter `Tất cả kết quả`, segmented `Kanban`/`Danh sách`, total count và hướng dẫn thao tác. Output không chứa `PROTOTYPE`, `Aster Studio` hoặc mock candidate.

- [ ] **Step 2: Viết failing behavior tests cho Kanban/list**

Assert cùng filtered candidates cấp cho cả hai view; card có initials, score, position, result badge, email, detail action và invite action theo helper hiện có; ở chế độ tất cả card/row có nhãn đợt; table có candidate/position-score-result-stage/detail; drag data giữ cả `listId` và item id thật.

- [ ] **Step 3: Chạy view tests để xác nhận fail**

Run: `npm test -- tests/candidate-studio-views.spec.ts tests/candidate-studio-wiring.spec.ts`

Expected: FAIL vì components/classes chưa tồn tại.

- [ ] **Step 4: Implement Studio page và toolbar**

Header chỉ giữ action `Làm mới` đang có; không thêm nút `Sàng lọc CV` mới trong phase này. Metrics tính trên toàn scope trước search/filter. Selector đặt `Tất cả đợt tuyển dụng` trước các list thật; label list được làm sạch từ `SCREENING_...` và có ngày tạo khi hợp lệ.

- [ ] **Step 5: Implement Kanban giống preview**

Render 7 canonical stage/legacy alias từ scope, column marker/count, horizontal scroll và hai nút cạnh. Ở chế độ tất cả, stage được chuẩn hóa theo canonical key giữa các list và mutation vẫn dùng stage id thuộc board nguồn của card. Mỗi column có chiều cao hiển thị tối đa khoảng 3 card rồi scroll dọc nội bộ. Empty column là drop target thật; focus/keyboard labels rõ; card không dùng inline palette cũ.

- [ ] **Step 6: Implement list view từ cùng filtered data**

Không fetch lại khi đổi view. Row click/detail action dùng item id thật; stage label lấy từ selected board; score/category thiếu hiển thị `—`/trạng thái trung tính thay vì số giả.

- [ ] **Step 7: Thêm responsive Studio CSS**

Desktop bám mật độ/radius/spacing của `candidates.png`; mobile theo `mobile-candidates.png`: header/filter wrap, segmented control đủ vùng chạm, Kanban vẫn cuộn ngang có kiểm soát và list không làm tràn iframe. Dùng `:focus-visible`, reduced-motion cho scroll/transition và semantic tokens cho Light/Dark/Brand.

- [ ] **Step 8: Chạy Task 3 tests và typecheck**

Run: `npm test -- tests/candidate-studio-views.spec.ts tests/candidate-studio-wiring.spec.ts tests/studio-primitives.spec.ts tests/studio-theme.spec.ts`

Expected: PASS.

Run: `npm run typecheck:strict-unused`

Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

Run: `git diff --check`

Expected: không có whitespace error; `hr-premium-styles.css` chỉ thay nếu cần loại rule candidate không còn consumer.

### Task 4: Dùng file đánh giá thật cho popup chi tiết, criteria và download

**Files:**
- Create: `src/ui/cv-scored/candidate-evaluation.ts`
- Create: `src/ui/cv-scored/CandidateDetailDialog.tsx`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/studio/studio.css`
- Test: `tests/candidate-evaluation.spec.ts`
- Test: `tests/candidate-detail-dialog.spec.ts`
- Test: `tests/cv-stage-move.spec.ts`

**Interfaces:**
- Produces: `CandidateEvaluationRepository.resolve(candidateName): Promise<CandidateEvaluationFile | null>` và `.read(file): Promise<CandidateEvaluationDocument>`.
- Produces: `parseCandidateEvaluationMarkdown(markdown): { criteria: CandidateCriterion[]; fullMarkdown: string }`; `CandidateCriterion = { id: string; label: string; maxPoints: number; awardedPoints: number; evidence: string[] }`.
- Produces: `CandidateDetailDialog` callbacks `onStageChange`, `onInvite`, `onOpenEmployeeCreate`, `onDownload` và trạng thái loading/error riêng.

- [ ] **Step 1: Viết failing resolver tests**

Từ card `2026-09-12_CV_Nguyen_Van_A-3f9c1a`, derive đúng filename `.md` và month `2026-09`; tìm exact basename trong `02-passed_screening`, `01-failed`, `03-deep_reviewed` bằng folder identity thật và phân trang `skip`/`limit`. Không tìm thấy trả `null`; hai match khác id phải báo mơ hồ, không chọn tùy ý.

- [ ] **Step 2: Viết failing Markdown parser tests**

Parse đúng 4 row canonical `Criterion ID | max | awarded | evidence`, `<br>` thành evidence array và label tiếng Việt từ criterion id. Row/tổng malformed hoặc template placeholder bị bỏ; không suy ra criteria từ total score/reason.

- [ ] **Step 3: Chạy repository/parser tests để xác nhận fail**

Run: `npm test -- tests/candidate-evaluation.spec.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 4: Implement resolver/read/download contract**

Dùng `findFolderPath`, `mcpapp.files.getByChannel`, `readToolList` và `readRoomFileText`; không gọi URL MinIO trực tiếp. Lưu `fileId`, `fileName`, `downloadUrl` và Markdown thật trong detail state. Download tạo Blob `text/markdown` từ nội dung vừa đọc, tên đúng file thật; nếu chưa resolve/read được thì action disabled và hiển thị lỗi.

- [ ] **Step 5: Viết failing dialog tests theo ảnh chi tiết**

Assert header hồ sơ, initials/name/position/batch/score, category+stage badges, select trạng thái thật, email/phone copy, lý do đánh giá, criteria thật, vùng nội dung đầy đủ và footer download. Khi criteria/file thiếu, dialog vẫn hiển thị card data/reason nhưng không có progress giả.

- [ ] **Step 6: Implement dialog và nối handler thật**

Store selected candidate id, derive candidate hiện tại từ selected board để poll/mutation không làm popup stale. Mở candidate tăng evaluation request generation; kết quả candidate cũ bị bỏ qua. Status select gọi `handleMove` Task 2, disable trong mutation và giữ popup mở; failure rollback + toast.

- [ ] **Step 7: Nối các action đúng scope**

`Gửi thư mời` mở nguyên form Task 6 khi stage/cờ hiện có cho phép. `Tạo hồ sơ nhân sự` chỉ hiện ở stage `05_Moi_Phong_Van`/`08_Da_Phong_Van` như nguồn candidate hiện tại của Lifecycle và gọi navigation Task 5, không truyền candidate identity.

- [ ] **Step 8: Chạy Task 4 tests**

Run: `npm test -- tests/candidate-evaluation.spec.ts tests/candidate-detail-dialog.spec.ts tests/cv-stage-move.spec.ts tests/cv-kanban-stage-move-regression.spec.ts`

Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

Run: `git diff --check`

Expected: không có whitespace error; không thay Pipeline scoring/schema.

### Task 5: Điều hướng “Tạo hồ sơ nhân sự” sang form hiện có, không preselect

**Files:**
- Modify: `src/ui/studio/studio-navigation-intent.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/lifecycle/LifecycleDashboard.tsx`
- Test: `tests/studio-navigation-intent.spec.ts`
- Test: `tests/candidate-lifecycle-navigation.spec.ts`
- Test: `tests/app-studio-shell.spec.ts`
- Test: `tests/profile-form-candidate-removed.spec.ts`

**Interfaces:**
- Produces: `StudioLifecycleIntent = { openCreateForm: true }` và optional `lifecycle` trong `StudioNavigationIntent`; type không có `candidateId`.
- Extends: `handleNavigate(target, context)` cho phép context `lifecycle` bên cạnh `jd`/`screening`.
- Extends: `LifecycleDashboard({ active, navigationIntent })`; consumer dùng `handledNavigationSequenceRef` và `setIsCreating(true)`.

- [ ] **Step 1: Viết failing navigation tests**

Assert intent target `lifecycle` tăng sequence và mang đúng `{ openCreateForm: true }`; source/type không chứa candidate id; App truyền `onNavigate` vào Candidates và `navigationIntent` vào Lifecycle.

- [ ] **Step 2: Viết failing Lifecycle consumer test**

Assert chỉ khi tab active, target là `lifecycle`, intent chưa xử lý và `openCreateForm` true thì form mở. Cùng sequence không reopen/reset; bấm lại action tạo sequence mới và mở form lại.

- [ ] **Step 3: Chạy tests để xác nhận fail**

Run: `npm test -- tests/studio-navigation-intent.spec.ts tests/candidate-lifecycle-navigation.spec.ts tests/app-studio-shell.spec.ts`

Expected: FAIL vì lifecycle intent chưa tồn tại.

- [ ] **Step 4: Implement intent/wiring qua App**

`CVScoredTab` nhận `onNavigate`; action gọi `onNavigate('lifecycle', { lifecycle: { openCreateForm: true } })`. `App` vẫn sở hữu tab/visited state và guard quyền như hiện tại; feature không gọi `setTab` trực tiếp.

- [ ] **Step 5: Mở đúng form chung trong Lifecycle**

Effect chỉ set `isCreating(true)`. Không set selected candidate, không thêm prop initial candidate vào `CreateDetailedProfileForm`, không thay logic dropdown `passedCandidates` và không sửa dữ liệu form. Form mở với state khởi tạo hiện có.

- [ ] **Step 6: Chạy Task 5 regressions**

Run: `npm test -- tests/studio-navigation-intent.spec.ts tests/candidate-lifecycle-navigation.spec.ts tests/app-studio-shell.spec.ts tests/profile-form-candidate-removed.spec.ts tests/candidate-selection.spec.ts`

Expected: PASS.

- [ ] **Step 7: Checkpoint không commit**

Run: `git diff --check`

Expected: App/Lifecycle chỉ thay wiring cần thiết; không redesign tab Hồ sơ nhân sự trong phase này.

### Task 6: Giữ nguyên form thư mời và thêm tài khoản gửi chung của Room

**Files:**
- Create: `src/ui/cv-scored/CandidateInviteDialog.tsx`
- Create: `src/ui/mail-connection/RoomMailAccountSummary.tsx`
- Modify: `src/ui/cv-scored/CVScoredTab.tsx`
- Modify: `src/ui/studio/studio.css`
- Test: `tests/candidate-invite-dialog.spec.ts`
- Test: `tests/room-mail-account-summary.spec.ts`
- Create/Test: `tests/invite-email-validation.spec.ts`
- Test: `tests/invite-sent-outcome.spec.ts`
- Test: `tests/interview-email-template-gateway.spec.ts`
- Test: `tests/ui-error-surfacing.spec.ts`

**Interfaces:**
- Produces: controlled `CandidateInviteDialog` với đúng field/state/callback form hiện tại; component không tự gửi mail.
- Produces: `loadRoomMailAccount(app, roomId): Promise<ConnectionView>` và `RoomMailAccountSummary({ app, roomId, active })` read-only.
- Preserves: `loadActiveInviteTemplate`, `renderActiveInviteTemplate`, `getInviteEmailValidationError`, `buildTrackedInviteEmailRequest`, `UserSessionTrackedMail`, `finishInviteSend`, sent-id optimistic lock, `markInviteMailSent`, stage move và toast.

- [ ] **Step 1: Viết failing form preservation tests**

SSR/source assertions phải giữ các field `Tên ứng viên`, `Email ứng viên`, `Tên vị trí`, `Tên công ty`, `Thời gian phỏng vấn`, `Tiêu đề (Cập nhật tự động)`, `Nội dung thư mời (Cập nhật tự động)` cùng actions `Tải email về`, `Gửi email`; validation/template error và disabled state giữ nguyên. Không thay form bằng layout thư mời của prototype.

- [ ] **Step 2: Viết failing account summary tests**

Assert heading chính xác `TÀI KHOẢN GỬI CHUNG CỦA ROOM`; connected hiển thị `senderEmail`, Google Workspace/Microsoft 365 và trạng thái; null hiển thị chưa kết nối; error giữ form và báo lỗi; component không render `Kết nối`, `Thay tài khoản`, `Ngắt kết nối`.

- [ ] **Step 3: Chạy tests để xác nhận fail**

Run: `npm test -- tests/candidate-invite-dialog.spec.ts tests/room-mail-account-summary.spec.ts tests/ui-error-surfacing.spec.ts`

Expected: FAIL vì dialog/summary mới chưa tồn tại.

- [ ] **Step 4: Implement read-only Room mail loader**

Khi form mở, gọi `MailConnectionClient.joinCurrentRoom()` rồi `get()` theo đúng trust/Room pinning hiện có. Dùng generation/cancel guard để response Room/candidate cũ không apply. Không mở Nango popup và không import `MailConnectionPanel` vào dialog.

- [ ] **Step 5: Tách nguyên form hiện tại thành controlled dialog**

Di chuyển JSX, không đổi tên field/copy/handler. Chèn summary thành một section độc lập trước form fields hoặc ngay sau template status; section chỉ trình bày. Đóng/mở dialog vẫn reset template state như hiện tại, không làm mất dữ liệu khi account read lỗi trong lúc dialog đang mở.

- [ ] **Step 6: Giữ send path và hậu xử lý chính xác**

Send button vẫn dựa trên template readiness + validation hiện tại; backend tiếp tục là authority cho mailbox connection. Email được queue nền, lịch sử ghi qua user session, invite flag và chuyển sang `Chưa phỏng vấn` theo contract hiện có. Không thêm lần gửi lại tự động khi account status lỗi/stale.

- [ ] **Step 7: Chạy Task 6 regressions**

Run: `npm test -- tests/candidate-invite-dialog.spec.ts tests/room-mail-account-summary.spec.ts tests/invite-email-validation.spec.ts tests/invite-sent-outcome.spec.ts tests/interview-email-template-gateway.spec.ts tests/mail-connection-client.spec.ts tests/mail-connection-controller.spec.ts tests/mail-connection-panel.spec.ts tests/ui-error-surfacing.spec.ts`

Expected: PASS; source không có `alert()`.

- [ ] **Step 8: Checkpoint không commit**

Run: `git diff --check`

Expected: không thay backend mail contract, manifest hoặc SCOPES; không commit/push.

### Task 7: Verification đầy đủ và bàn giao tab Ứng viên

**Files:**
- Verify only; chỉ sửa file Task 1-6 nếu verification phát hiện regression.

**Interfaces:**
- Produces: tab Ứng viên sẵn sàng để deploy/smoke test; không bắt đầu tab kế tiếp.

- [ ] **Step 1: Chạy targeted candidate gate**

Run: `npm test -- tests/candidate-selection-state.spec.ts tests/candidate-view-model.spec.ts tests/candidate-board-flow.spec.ts tests/candidate-studio-views.spec.ts tests/candidate-studio-wiring.spec.ts tests/candidate-evaluation.spec.ts tests/candidate-detail-dialog.spec.ts tests/candidate-lifecycle-navigation.spec.ts tests/candidate-invite-dialog.spec.ts tests/room-mail-account-summary.spec.ts tests/cv-board-loader.spec.ts tests/cv-item-mapper.spec.ts tests/cv-list-presence.spec.ts tests/cv-poll-diff.spec.ts tests/cv-scored-full-polling.spec.ts tests/cv-kanban-stage-move-regression.spec.ts tests/cv-stage-move.spec.ts tests/cv-scored-navigation-render.spec.ts tests/invite-sent-outcome.spec.ts tests/studio-navigation-intent.spec.ts tests/pipeline-studio-wiring.spec.ts tests/app-studio-shell.spec.ts tests/ui-error-surfacing.spec.ts`

Expected: PASS. Baseline trước triển khai: 10 candidate/regression files, 65/65 tests pass ngày 2026-10-08.

- [ ] **Step 2: Chạy static/build gates**

Run: `npm run typecheck:strict-unused`

Expected: PASS.

Run: `npm run build`

Expected: PASS, gồm Vite bundle và manifest lint.

Run: `npm run preflight`

Expected: PASS hoặc ghi rõ baseline infrastructure/identity failure; không sửa manifest trong task UI.

- [ ] **Step 3: Chạy full regression**

Run: `npm test`

Expected: không có lỗi mới ngoài baseline đã được xác minh; mọi failure phải được phân loại với command/output cụ thể.

- [ ] **Step 4: Kiểm tra repository hygiene**

Run: `git diff --check; git status --short`

Expected: chỉ plan, source và tests Task 1-6; không có generated artifacts, secret, manifest/schema/scope hoặc commit/push.

- [ ] **Step 5: Manual smoke test trong PrivOS ở Light/Dark/Brand**

Kiểm tra iframe rộng và hẹp:

- newest được chọn lần đầu; đổi tab/quay lại giữ selection; intent từ Pipeline mở đúng đợt;
- list mới chỉ xuất hiện trong selector, không tự đổi selection; list đang chọn bị xóa fallback đúng;
- metrics/search/result filter dùng đúng scope; chọn “Tất cả đợt tuyển dụng” phải lấy ứng viên từ mọi list đọc được, giữ riêng hồ sơ cùng người ở nhiều đợt và hiển thị nhãn đợt; Kanban/list view cho cùng kết quả;
- tối đa 3 card lộ trong mỗi column, scroll dọc/nút ngang/drag-drop hoạt động; permission rejection rollback và báo lỗi;
- popup dùng contact/category/score/reason thật; criteria/download chỉ xuất hiện khi file Markdown thật đọc được; missing/malformed file degrade an toàn;
- status select trong popup đồng bộ board/list; poll cũ không đảo lại mutation;
- “Tạo hồ sơ nhân sự” mở form chung tại tab Hồ sơ nhân sự với candidate dropdown trống, không preselect;
- form thư mời giữ nguyên tất cả field/validation/template/send behavior và chỉ có thêm section tài khoản gửi chung read-only;
- mailbox connected/disconnected/error hiển thị đúng; lỗi đọc account không xóa nội dung form; gửi thành công/thất bại/unlogged và stage transition vẫn như baseline;
- theme switch không remount screen hoặc làm mất selection/filter/detail/form state.

- [ ] **Step 6: Bàn giao và dừng ở cổng nghiệm thu**

Báo file thay đổi, kết quả từng gate, giới hạn API/file resolution và checklist manual. Nếu người dùng yêu cầu deploy container để kiểm tra, thực hiện trong bước bàn giao riêng; sau đó dừng chờ xác nhận tab Ứng viên đạt trước khi làm trang tiếp theo.
