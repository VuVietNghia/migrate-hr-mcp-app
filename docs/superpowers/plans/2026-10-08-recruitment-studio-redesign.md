ều# Recruitment Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign tab “Vị trí tuyển dụng” theo giao diện A · Studio trong `ui-ux-preview/screenshots/recruitment.png`, dùng dữ liệu Room thật, giữ nguyên luồng tạo/phân loại JD hiện có và bổ sung các tương tác đã được duyệt.

**Architecture:** Giữ `RecruitmentPanel` làm controller cho Room state và mutation, nhưng tách parsing/serialization JD, metric ứng viên và dialog trình bày thành module có thể test độc lập. Dùng một navigation intent dùng chung ở `App` để chuyển đúng file JD sang Pipeline hoặc Trợ lý JD mà không thêm URL router; các màn hình đích vẫn sở hữu state và service hiện tại.

**Tech Stack:** React 18, TypeScript, `@privos_ai/app-react`, PrivOS Room Files/Lists tools, Vitest, PostCSS, Studio primitives/CSS hiện có.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md`

## Global Constraints

- Giữ nguyên service/repository, schema dữ liệu, permission và luồng nghiệp vụ đang chạy; không thay `privos-app.json` hoặc `SCOPES.md` trong hạng mục này.
- Production chỉ dùng Room context, Room Files, App Database và Lists thật; không đưa Aster Studio, persona, scenario hoặc dữ liệu mẫu của preview vào app.
- Metric “Ứng viên đã đánh giá” phải đọc cùng nguồn các list `SCREENING` của tab “CV đã chấm”/“Ứng viên”, chỉ đếm item người dùng hiện tại đọc được và không đếm item cấu hình hệ thống.
- Metric ứng viên đếm số thẻ đánh giá trong các list, không tự gộp theo tên/email vì cùng một người có thể xuất hiện hợp lệ trong nhiều đợt tuyển dụng.
- Tạo JD tiếp tục ghi Markdown vào `${roomId}/hr-miniapp/jds`; đổi tên phòng ban tiếp tục giữ stable department key trong App Database.
- Chỉnh sửa JD dùng Trợ lý JD hiện có; sàng lọc dùng Pipeline hiện có. Không tạo một editor, scoring flow hoặc API mới trong tab Tuyển dụng.
- Không thêm điều hướng sang một đợt Ứng viên cụ thể trong phase này vì file JD hiện chưa có liên kết ổn định tới `listId`; chức năng đó được xử lý khi redesign tab Ứng viên.
- Giao diện phải dùng semantic Studio tokens, hoạt động ở Light/Dark/Brand và responsive trong iframe rộng/hẹp.
- Không commit hoặc push nếu người dùng chưa yêu cầu; các checkpoint chỉ chạy test và kiểm tra diff.
- Hoàn tất riêng trang Tuyển dụng, bàn giao để người dùng nghiệm thu, rồi dừng trước khi sửa trang kế tiếp.

## Review Focus

- Hai file JD có cùng tiêu đề không được gộp hoặc điều hướng nhầm; identity phải dựa vào `_id`/tên file, không dựa vào title.
- Kết quả load cũ sau khi đổi Room hoặc retry không được ghi đè state của Room mới.
- Một list `SCREENING` lỗi hoặc bị từ chối quyền không được tạo ra tổng ứng viên thấp giả; metric phải chuyển sang trạng thái không khả dụng trong khi danh sách JD vẫn dùng được.
- Search tiếng Việt phải ổn định với khoảng trắng, hoa/thường và dấu; đổi phòng ban phải xóa selection chi tiết không còn hợp lệ.
- Navigation intent trỏ tới JD đã bị xóa/không còn quyền đọc phải báo lỗi có thể xử lý và không tự chọn một JD khác.

---

### Task 1: Tách model, parser và nguồn metric tuyển dụng

**Files:**
- Create: `src/ui/recruitment/recruitment-jobs.ts`
- Create: `src/ui/recruitment/recruitment-metrics.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/recruitment-panel.tsx`
- Test: `tests/recruitment-jobs.spec.ts`
- Test: `tests/recruitment-metrics.spec.ts`

**Interfaces:**
- Consumes: `CVFile` từ `src/ui/pipeline-service.ts`, `fetchScreeningListItems` và `readScreeningLists` từ `src/ui/cv-scored`.
- Produces: `parseRecruitmentJob(file: CVFile, content: string): RecruitmentJob | null`; `buildRecruitmentJobDocument(draft: RecruitmentJobDraft, department: { key: string; label: string }, isoDate: string): { fileName: string; content: string; job: RecruitmentJobDraft }`; `filterRecruitmentJobs(jobs: readonly RecruitmentJob[], departmentKey: string, query: string): RecruitmentJob[]`; `loadEvaluatedCandidateCount(app: ListItemPagingApp, roomId: string): Promise<number>`.

- [ ] **Step 1: Viết test fail cho parser, serializer và filtering JD**

```ts
it('keeps file identity while parsing the canonical JD format', () => {
  const job = parseRecruitmentJob(
    { _id: 'file-1', name: 'JD_Backend.md', downloadUrl: '/files/1' },
    canonicalJD,
  );
  expect(job).toMatchObject({
    fileId: 'file-1',
    fileName: 'JD_Backend.md',
    title: 'BACKEND DEVELOPER',
    departmentKey: 'it',
    departmentLabel: 'IT',
  });
});

it('builds the existing Room Files markdown contract', () => {
  const result = buildRecruitmentJobDocument(draft, { key: 'it', label: 'IT' }, '2026-10-08');
  expect(result.fileName).toBe('JD_Backend_Developer.md');
  expect(result.content).toContain('<!-- DEPARTMENT_ID: it -->');
  expect(result.content).toContain('| **Phòng ban**');
  expect(result.content).toContain('<!-- SUMMARY: Xây dựng dịch vụ tuyển dụng -->');
});

it('filters all departments with normalized Vietnamese search', () => {
  expect(filterRecruitmentJobs(jobs, 'all', '  lap TRINH  ').map(job => job.fileId))
    .toEqual(['file-frontend']);
});
```

- [ ] **Step 2: Chạy test parser để xác nhận đang fail**

Run: `npm test -- tests/recruitment-jobs.spec.ts`

Expected: FAIL vì module/functions chưa tồn tại.

- [ ] **Step 3: Cài model và hàm thuần trong `recruitment-jobs.ts`**

`RecruitmentJob` phải giữ `fileId`, `fileName`, `downloadUrl`, `departmentKey`, `departmentLabel` và toàn bộ trường đang hiển thị/lưu. `parseRecruitmentJob` hỗ trợ cả Markdown canonical hiện tại và format legacy đang được controller đọc; file không có title hợp lệ trả `null`. `buildRecruitmentJobDocument` giữ nguyên path/file naming và nội dung Markdown hiện có. `filterRecruitmentJobs` dùng normalize NFD, bỏ dấu tiếng Việt, trim và lowercase, nhưng không sửa dữ liệu gốc.

- [ ] **Step 4: Viết test fail cho metric Ứng viên từ list `SCREENING`**

```ts
it('counts visible candidate items across SCREENING lists only', async () => {
  const app = createListsStub({
    lists: [screeningA, unrelatedList, screeningB],
    items: {
      'screening-a': [candidateA, systemConfigItem],
      'screening-b': [candidateB, candidateC],
    },
  });
  await expect(loadEvaluatedCandidateCount(app, 'room-1')).resolves.toBe(3);
});

it('rejects instead of presenting a partial total when one SCREENING list fails', async () => {
  const app = createListsStub({ lists: [screeningA, screeningB], failListId: 'screening-b' });
  await expect(loadEvaluatedCandidateCount(app, 'room-1')).rejects.toThrow();
});
```

- [ ] **Step 5: Chạy test metric để xác nhận đang fail**

Run: `npm test -- tests/recruitment-metrics.spec.ts`

Expected: FAIL vì loader chưa tồn tại.

- [ ] **Step 6: Cài `loadEvaluatedCandidateCount(app, roomId)`**

Gọi `mcpapp.lists.getAll`, lọc bằng `readScreeningLists`, đọc từng list qua `fetchScreeningListItems`, rồi cộng độ dài. Dùng `Promise.all` để mọi list đều phải thành công; không dùng `itemCount` vì giá trị đó có thể gồm item cấu hình và không chứng minh tập item người dùng đang được phép đọc.

Cập nhật metadata `TAB_SECTIONS` của Recruitment trong `App.tsx` từ `['files:read']` thành `['files:read', 'lists:read']`; đây là mô tả đúng call site mới, không thêm permission vào manifest.

- [ ] **Step 7: Thay logic parse/serialize nội tuyến trong `RecruitmentPanel` bằng module mới**

Giữ async room-operation guard hiện tại. Không thay mutation create/rename; chỉ thay dữ liệu trung gian sang `RecruitmentJob` có file identity và load metric song song với JD/department.

- [ ] **Step 8: Chạy test Task 1**

Run: `npm test -- tests/recruitment-jobs.spec.ts tests/recruitment-metrics.spec.ts tests/recruitment-departments.spec.ts`

Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: chỉ có các file Task 1; không commit/push.

### Task 2: Thêm navigation intent chọn đúng JD cho Pipeline và Trợ lý JD

**Files:**
- Create: `src/ui/studio/studio-navigation-intent.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/recruitment-panel.tsx`
- Modify: `src/ui/pipeline-dashboard.tsx`
- Modify: `src/ui/jd-chatbot-functional.tsx`
- Test: `tests/studio-navigation-intent.spec.ts`
- Test: `tests/recruitment-navigation.spec.ts`

**Interfaces:**
- Consumes: `AppTab` và JD file identity `{ fileId: string; fileName: string }` từ `RecruitmentJob`.
- Produces: `StudioNavigationIntent = { sequence: number; target: AppTab; jd?: { fileId: string; fileName: string } }`; `nextStudioNavigationIntent(previous: StudioNavigationIntent | null, target: AppTab, context?: Pick<StudioNavigationIntent, 'jd'>): StudioNavigationIntent`; `resolveIntentJD<T extends { _id: string; name: string }>(intent: StudioNavigationIntent | null, target: AppTab, files: readonly T[]): T | undefined`.

- [ ] **Step 1: Viết test fail cho navigation intent và JD resolution**

```ts
it('creates a fresh sequence even when navigating to the same JD twice', () => {
  const first = nextStudioNavigationIntent(null, 'pipeline', { jd: ref });
  const second = nextStudioNavigationIntent(first, 'pipeline', { jd: ref });
  expect(second.sequence).toBe(first.sequence + 1);
});

it('matches by stable file id before file name and ignores another target', () => {
  expect(resolveIntentJD(intentForPipeline, 'pipeline', files)?._id).toBe('file-2');
  expect(resolveIntentJD(intentForPipeline, 'chatbotJD', files)).toBeUndefined();
});
```

- [ ] **Step 2: Chạy test intent để xác nhận đang fail**

Run: `npm test -- tests/studio-navigation-intent.spec.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài navigation intent thuần và state ở `App.tsx`**

`ThemedApp` sở hữu intent; handler duy nhất vừa kiểm tra quyền tab, tăng `sequence`, vừa chọn tab. Truyền callback sang `RecruitmentPanel`, truyền intent sang `PipelineDashboard` và `JDChatbotFunctional`. Giữ visited-tab mounting hiện tại để đổi theme/tab không làm mất state.

- [ ] **Step 4: Viết test fail cho contract giữa ba màn hình**

```ts
it('routes the selected recruitment JD to pipeline and assistant', () => {
  const source = readFileSync(resolve('src/ui/recruitment-panel.tsx'), 'utf8');
  expect(source).toContain("target: 'pipeline'");
  expect(source).toContain("target: 'chatbotJD'");
  expect(source).toContain('fileId: job.fileId');
  expect(source).toContain('fileName: job.fileName');
});
```

```ts
it('wires the shared intent through App and both destination tabs', () => {
  const app = readFileSync(resolve('src/ui/App.tsx'), 'utf8');
  const pipeline = readFileSync(resolve('src/ui/pipeline-dashboard.tsx'), 'utf8');
  const assistant = readFileSync(resolve('src/ui/jd-chatbot-functional.tsx'), 'utf8');
  expect(app).toContain('nextStudioNavigationIntent');
  expect(app).toMatch(/<PipelineDashboard[^>]*navigationIntent=/s);
  expect(app).toMatch(/<JDChatbotTab[^>]*navigationIntent=/s);
  expect(pipeline).toContain('handledNavigationSequenceRef');
  expect(pipeline).toContain('resolveIntentJD');
  expect(assistant).toContain('handledNavigationSequenceRef');
  expect(assistant).toContain('resolveIntentJD');
});
```

- [ ] **Step 5: Cài consumer intent trong Pipeline**

Mở tab bằng intent phải gọi loader JD hiện có, set `jdName`, rồi dùng `loadJdContent(file.name, file._id)`. Intent thiếu/mất file phải hiển thị toast lỗi và để người dùng chọn lại; không fallback sang JD đầu tiên. Ref `handledNavigationSequenceRef` chặn chạy lặp cùng intent.

- [ ] **Step 6: Cài consumer intent trong Trợ lý JD**

Sau `refresh()`, resolve file editable `.md` và gọi `choose(jd)` hiện có. File không còn tồn tại hoặc không editable phải đặt inline load error và không thay bằng file khác. Intent không có JD (nút “Soạn cùng AI”) chỉ mở tab với trạng thái hiện tại/tạo mới theo luồng sẵn có.

- [ ] **Step 7: Chạy test Task 2**

Run: `npm test -- tests/studio-navigation-intent.spec.ts tests/recruitment-navigation.spec.ts`

Expected: PASS.

- [ ] **Step 8: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: không có whitespace error; không commit/push.

### Task 3: Bổ sung primitive metric và dialog tuyển dụng có thể test độc lập

**Files:**
- Modify: `src/ui/studio/StudioPrimitives.tsx`
- Create: `src/ui/recruitment/RecruitmentJobDialogs.tsx`
- Modify: `src/ui/recruitment-department-form.tsx`
- Modify: `src/ui/studio/studio.css`
- Test: `tests/studio-primitives.spec.ts`
- Test: `tests/recruitment-job-dialogs.spec.ts`
- Test: `tests/recruitment-department-form.spec.ts`

**Interfaces:**
- Consumes: `RecruitmentJob`, `RecruitmentJobDraft`, `StudioDialog`, `StudioInlineState`.
- Produces: `StudioMetricCard(props: { label: ReactNode; value: ReactNode | null; description?: ReactNode; icon?: ReactNode; loading?: boolean; error?: ReactNode })`; `RecruitmentJobFormDialog(props: { open: boolean; draft: RecruitmentJobDraft; isSaving: boolean; saveError: string; onDraftChange: (draft: RecruitmentJobDraft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void })`; `RecruitmentJobDetailDialog(props: { job: RecruitmentJob | null; onClose: () => void; onEditWithAI: (job: RecruitmentJob) => void; onUseInPipeline: (job: RecruitmentJob) => void })`.

- [ ] **Step 1: Viết test fail cho `StudioMetricCard`**

```ts
it('renders value, loading and unavailable metric states accessibly', () => {
  const ready = renderToStaticMarkup(createElement(StudioMetricCard, {
    label: 'Ứng viên đã đánh giá', value: 10, description: 'Từ các đợt sàng lọc',
  }));
  expect(ready).toContain('10');
  expect(ready).toContain('Ứng viên đã đánh giá');
  const failed = renderToStaticMarkup(createElement(StudioMetricCard, {
    label: 'Ứng viên đã đánh giá', value: null, error: 'Không tải được',
  }));
  expect(failed).toContain('—');
  expect(failed).toContain('Không tải được');
});
```

- [ ] **Step 2: Chạy primitive test để xác nhận đang fail**

Run: `npm test -- tests/studio-primitives.spec.ts`

Expected: FAIL vì `StudioMetricCard` chưa tồn tại.

- [ ] **Step 3: Cài primitive metric bằng semantic Studio tokens**

Không hard-code palette. Loading dùng text/skeleton cục bộ, error dùng `—` và mô tả; primitive không tự fetch data.

- [ ] **Step 4: Viết test fail cho create/detail dialog**

```ts
it('keeps the existing create fields and exposes real downstream actions', () => {
  const html = renderJobDialogs(fixture);
  expect(html).toContain('Vị trí tuyển dụng');
  expect(html).toContain('Kỹ năng chuyên môn');
  expect(html).toContain('Email nhận CV');
  expect(html).toContain('Chỉnh với AI');
  expect(html).toContain('Dùng để sàng lọc CV');
});
```

Kiểm tra thêm form giữ giá trị khi có `saveError`, submit bị disable khi saving, dialog có label/close action, và detail không render action giả.

- [ ] **Step 5: Chạy dialog tests để xác nhận đang fail**

Run: `npm test -- tests/recruitment-job-dialogs.spec.ts tests/recruitment-department-form.spec.ts`

Expected: FAIL trước khi component mới/adaptation được cài.

- [ ] **Step 6: Cài các dialog trình bày**

Di chuyển JSX form/detail khỏi `RecruitmentPanel`, không di chuyển call Room Files/App Database vào dialog. Form nhận controlled draft và callbacks; detail nhận job và callbacks điều hướng. Chuyển create/rename department sang `StudioDialog` nhưng giữ validation, stable key, loading/error và handler hiện tại.

- [ ] **Step 7: Chạy test Task 3**

Run: `npm test -- tests/studio-primitives.spec.ts tests/recruitment-job-dialogs.spec.ts tests/recruitment-department-form.spec.ts`

Expected: PASS.

- [ ] **Step 8: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: chỉ có primitive/dialog/style liên quan; không commit/push.

### Task 4: Dựng lại Recruitment screen theo ảnh và nối các handler thật

**Files:**
- Modify: `src/ui/recruitment-panel.tsx`
- Modify: `src/ui/studio/studio.css`
- Modify: `src/ui/contact-form-styles.css`
- Test: `tests/recruitment-studio.spec.ts`

**Interfaces:**
- Consumes: modules Task 1, navigation callback Task 2, primitive/dialog Task 3, department store hiện có.
- Produces: `RecruitmentPanel({ onNavigate }: { onNavigate: (target: AppTab, context?: Pick<StudioNavigationIntent, 'jd'>) => void })`; Recruitment Studio screen hoàn chỉnh với metrics, department sidebar, search, job cards, dialog và trạng thái tải/lỗi/trống.

- [ ] **Step 1: Viết component/CSS test fail cho bố cục mục tiêu**

```ts
it('renders the Studio recruitment hierarchy without preview data', () => {
  const html = renderToStaticMarkup(createElement(RecruitmentPanel, { onNavigate: vi.fn() }));
  expect(html).toContain('Vị trí tuyển dụng');
  expect(html).toContain('Tổ chức phòng ban và quản lý mô tả công việc');
  expect(html).toContain('Phòng ban');
  expect(html).toContain('Tạo JD');
  expect(html).toContain('Tìm vị trí tuyển dụng');
  expect(html).not.toContain('Aster Studio');
  expect(html).not.toContain('PROTOTYPE');
});

it('uses the desktop sidebar/two-column grid and collapses safely', () => {
  const css = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');
  expect(css).toMatch(/\.recruitment-studio-layout\s*\{[^}]*grid-template-columns:\s*200px minmax\(0, 1fr\)/s);
  expect(css).toMatch(/\.recruitment-studio-job-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  expect(css).toMatch(/@media[^}]*max-width:\s*1000px[\s\S]*\.recruitment-studio-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
```

- [ ] **Step 2: Chạy screen test để xác nhận đang fail**

Run: `npm test -- tests/recruitment-studio.spec.ts`

Expected: FAIL vì layout/class/copy mới chưa tồn tại.

- [ ] **Step 3: Thay hero/tab cũ bằng cấu trúc Studio từ ảnh**

Dùng `StudioPage` và `StudioPageHeader` với eyebrow “TUYỂN DỤNG”, title “Vị trí tuyển dụng”, mô tả đúng production và hai action “Phòng ban”/“Tạo JD”. Dưới header là ba metric card: tổng JD Room, tổng phòng ban, tổng ứng viên từ Task 1.

- [ ] **Step 4: Cài sidebar phòng ban và search**

Mặc định `department = 'all'`. Sidebar có “Tất cả vị trí”, count từng phòng ban, nút thêm, nút đổi tên chỉ cho department được phép và CTA “Soạn cùng AI”. Mobile chuyển department list thành control ngang/dropdown có thể dùng được, không ẩn mất chức năng lọc như prototype tĩnh.

- [ ] **Step 5: Cài lưới card và trạng thái trang**

Card hai cột dùng file identity làm key, hiển thị department, title, location, summary, work type, salary và “Xem chi tiết”. Search + department filter chạy trên toàn bộ job đã load. Initial load dùng state cục bộ; lỗi JD có retry; empty state phân biệt “Room chưa có JD” và “không có kết quả tìm kiếm”. Lỗi candidate metric không che JD list.

- [ ] **Step 6: Nối mutation/dialog/navigation thật**

Create/rename department và create JD tiếp tục gọi handler hiện có. Submit trùng bị disable; lỗi giữ nguyên draft. Detail “Chỉnh với AI” và “Dùng để sàng lọc CV” phát navigation intent kèm `fileId`/`fileName`. Thành công đóng dialog và cập nhật đúng phòng ban; không dùng `alert`, dữ liệu preview hoặc action giả.

- [ ] **Step 7: Chuyển style tuyển dụng sang `studio.css` và gỡ rule cũ**

Namespace class bằng `recruitment-studio-*`; dùng `--studio-*` token. Xóa block Recruitment/Custom job form cũ khỏi `contact-form-styles.css` sau khi xác nhận không còn selector được dùng. Match ảnh ở desktop: metrics ba cột, sidebar khoảng 200px, job grid hai cột, card radius/shadow/spacing, search compact; thêm breakpoint 1000px và 720/780px.

- [ ] **Step 8: Chạy test Task 4 và hồi quy trang Công ty**

Run: `npm test -- tests/recruitment-studio.spec.ts tests/recruitment-departments.spec.ts tests/recruitment-department-form.spec.ts tests/company-home-studio.spec.ts tests/studio-primitives.spec.ts`

Expected: PASS.

- [ ] **Step 9: Chạy strict typecheck**

Run: `npm run typecheck:strict-unused`

Expected: PASS.

- [ ] **Step 10: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: không có file ngoài phạm vi; không commit/push.

### Task 5: Verification và bàn giao nghiệm thu trang Tuyển dụng

**Files:**
- Modify only if verification finds an in-scope defect.

**Interfaces:**
- Consumes: toàn bộ implementation Tasks 1–4.
- Produces: bằng chứng test/build và checklist UAT; không bắt đầu redesign trang Pipeline/Ứng viên.

- [ ] **Step 1: Chạy toàn bộ test liên quan tuyển dụng/navigation**

Run: `npm test -- tests/recruitment-jobs.spec.ts tests/recruitment-metrics.spec.ts tests/recruitment-departments.spec.ts tests/recruitment-department-form.spec.ts tests/recruitment-job-dialogs.spec.ts tests/recruitment-studio.spec.ts tests/studio-navigation-intent.spec.ts tests/recruitment-navigation.spec.ts`

Expected: PASS.

- [ ] **Step 2: Chạy full automated gates**

Run: `npm run typecheck:strict-unused`

Expected: PASS.

Run: `npm test`

Expected: các test mới và test liên quan PASS; nếu bốn lỗi baseline `manifest.spec.ts`/`packaging.spec.ts` trong spec vẫn còn, ghi riêng đúng output và không quy chúng cho redesign.

Run: `npm run build`

Expected: PASS, bao gồm manifest lint.

Run: `npm run preflight`

Expected: PASS hoặc báo chính xác blocker môi trường đã biết, không che lỗi mới.

- [ ] **Step 3: Smoke test thủ công ở iframe/PrivOS**

Kiểm tra với dữ liệu Room thật:

- Light, Dark, Brand; desktop rộng, iframe hẹp và mobile.
- Tổng JD/phòng ban/ứng viên khớp Room và tab CV đã chấm; item cấu hình không bị đếm.
- Search tiếng Việt, “Tất cả vị trí”, từng phòng ban và empty result.
- Tạo/đổi tên phòng ban; protected department không có action đổi tên.
- Tạo JD thành công/thất bại, double-submit, draft được giữ khi lỗi.
- Xem chi tiết; mở đúng JD trong Pipeline và Trợ lý JD; file bị xóa cho lỗi có thể xử lý.
- Đổi Room trong lúc load không hiển thị dữ liệu Room cũ.
- Trang Dữ liệu công ty vẫn giữ layout/interaction đã nghiệm thu.

- [ ] **Step 4: Kiểm tra diff cuối**

Run: `git diff --check; git diff --stat; git status --short`

Expected: chỉ có code/test/plan thuộc Recruitment Studio redesign; không commit/push.

- [ ] **Step 5: Bàn giao và dừng chờ nghiệm thu**

Báo danh sách file thay đổi, test/gate đã chạy, lỗi baseline nếu còn, giới hạn chưa làm (Recruitment → một `listId` Ứng viên cụ thể) và hướng dẫn các bước UAT. Không bắt đầu tab Pipeline hoặc Ứng viên trước khi người dùng xác nhận.
