# JD Assistant Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign tab “Trợ lý JD” theo `ui-ux-preview/screenshots/jd.png` và `mobile-jd.png`, với ba chế độ tài liệu theo đúng thứ tự `Xem trước` → `Xem thay đổi` → `Chỉnh sửa thủ công`, trong khi giữ nguyên các luồng PrivOS, AI, thư viện và lưu JD hiện có.

**Architecture:** Giữ `JDChatbotFunctional` làm controller sở hữu Room context, tải file, AI request, navigation intent và mutation lưu file. Tách diff/view-model thuần và phần trình bày Studio khỏi controller để ba chế độ tài liệu, thư viện và responsive layout có thể kiểm thử độc lập; mọi đọc/ghi vẫn đi qua `PipelineService`, `readRoomFileText` và `createOrUpdateFile` hiện có.

**Tech Stack:** React 18, TypeScript, `@privos_ai/app-react`, PrivOS Room Files/AI Messages, Ant Design icons, Studio primitives/semantic CSS, Vitest + React DOM SSR/happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md` mục 6.5, với ràng buộc tương thích dữ liệu từ `docs/superpowers/specs/2026-10-09-recruitment-jd-upload-design.md`.

## Global Constraints

- Chỉ redesign tab `Trợ lý JD`; không bắt đầu tab Nhân sự, Bảng lương, Email hoặc Soạn thảo.
- Không thêm chức năng tải `.md`; production không render nút/copy/action `Tải .md` hoặc `jd-download`, dù prototype có chức năng này.
- Cụm chế độ tài liệu dùng đúng thứ tự và nhãn: `Xem trước`, `Xem thay đổi`, `Chỉnh sửa thủ công`.
- Chuyển chế độ chỉ đổi cách hiển thị cùng một `draft`; không tự lưu, không tự khôi phục và không gọi PrivOS.
- `Xem thay đổi` hiển thị thông báo `Các dòng được thêm hoặc thay đổi có nền xanh.` và đánh dấu các dòng mới/thay đổi bằng semantic success color; khi không có thay đổi phải báo nội dung khớp bản đã lưu.
- Giữ nguyên luồng AI: hỏi đến khi đủ dữ liệu; JD mới do AI tạo vẫn tự lưu với tên `JD_AI_*.md`; AI chỉnh JD đang chọn chỉ cập nhật draft và chờ người dùng bấm lưu.
- Giữ nguyên prompt, lịch sử chat đã rút gọn, cách parse `<jd_content>`, `<position_name>`, `<saved_file>` và quy tắc thêm thông tin công ty.
- Checkbox thông tin công ty tiếp tục mặc định tắt khi mở tab, chọn JD hoặc tạo mới; không lấy trạng thái checked của prototype làm dữ liệu production.
- Thư viện chỉ liệt kê `.md` có thể round-trip an toàn. JD `.pdf`/`.docx` đã upload vẫn dùng được ở Tuyển dụng/Pipeline nhưng không được mở hoặc ghi đè trong Trợ lý JD.
- Giữ navigation intent `{ fileId, fileName }`: ưu tiên stable file id, chỉ fallback theo tên, không tự chọn file khác khi target bị xóa, không còn quyền hoặc không phải Markdown.
- Giữ request-generation guard khi chọn nhanh nhiều JD để response cũ không ghi đè file mới.
- Cả nút lưu ở page header và footer tài liệu gọi cùng một save handler, cùng disabled/loading guard; double click không tạo hai mutation.
- Giữ `Khôi phục chỉnh sửa` làm thao tác bỏ draft về nội dung đã lưu. Việc bỏ nút “Thoát” cũ chỉ loại bỏ interaction không còn phù hợp với segmented modes, không loại bỏ khả năng khôi phục.
- Không thêm suggestion chip mẫu, dữ liệu Aster Studio, mock JD, prototype toolbar/persona hoặc API mới.
- Không sửa `privos-app.json`, `SCOPES.md`, schema dữ liệu, permission hoặc service backend; giao diện tiếp tục chạy trong sandboxed PrivOS iframe và dùng semantic Studio tokens cho Light/Dark/Brand.
- Không commit hoặc push. Mỗi task kết thúc bằng test và checkpoint diff.

## Review Focus

- Navigation intent hoặc thao tác chọn JD cũ hoàn tất sau lựa chọn mới phải bị bỏ qua; file `.pdf`/`.docx` không được lọt vào editor Markdown.
- JD mới do AI tạo phải tiếp tục tự lưu, còn AI/manual edit trên JD có sẵn phải giữ trạng thái chưa lưu cho tới khi người dùng bấm một trong hai nút lưu.
- Chuyển giữa `Xem trước`, `Xem thay đổi` và `Chỉnh sửa thủ công` phải giữ nguyên draft; `Xem thay đổi` phải cập nhật cả với thay đổi AI lẫn gõ tay.
- Lỗi đọc, AI hoặc lưu không được xóa draft/chat hiện tại; save retry phải dùng đúng filename và nội dung đang thấy.
- Layout phải giữ chat/editor scroll độc lập, không tràn iframe ở desktop/mobile và không mất state khi đổi Light/Dark/Brand hoặc chuyển tab rồi quay lại.

---

### Task 1: Tách document mode và line-diff thành view-model thuần

**Files:**
- Create: `src/ui/jd-chatbot-view-model.ts`
- Create: `tests/jd-chatbot-view-model.spec.ts`

**Interfaces:**
- Produces: `type JDDocumentMode = 'preview' | 'changes' | 'manual'`.
- Produces: `JD_DOCUMENT_MODES`, một readonly array theo thứ tự `{ id: 'preview', label: 'Xem trước' }`, `{ id: 'changes', label: 'Xem thay đổi' }`, `{ id: 'manual', label: 'Chỉnh sửa thủ công' }`.
- Produces: `getChangedJDLineIndexes(saved: string, draft: string): Set<number>` dùng LCS để đánh dấu index dòng có trong draft nhưng không còn khớp bản đã lưu.
- Produces: `buildJDChangeRows(saved: string, draft: string): Array<{ index: number; text: string; changed: boolean }>` cho change view.

- [ ] **Step 1: Viết failing tests cho mode contract**

Assert ba mode có đúng id, đúng nhãn, đúng thứ tự; không có label `Thay đổi` hoặc `Chỉnh nội dung` cũ.

- [ ] **Step 2: Viết failing tests cho line diff**

Test nội dung giống nhau trả `Set` rỗng; thêm dòng, sửa dòng, nhiều dòng trùng nhau, dòng rỗng và Unicode tiếng Việt đều trả index ổn định của draft. `buildJDChangeRows` phải giữ nguyên thứ tự/nội dung để renderer không tự chuẩn hóa Markdown.

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm test -- tests/jd-chatbot-view-model.spec.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 4: Implement view-model tối thiểu**

Di chuyển thuật toán `getChangedJDLineIndexes` hiện có ra module mới, export mode metadata và change rows. Không thêm diff library/dependency và không dựng deleted-line placeholder ngoài yêu cầu ảnh.

- [ ] **Step 5: Chạy Task 1 tests**

Run: `npm test -- tests/jd-chatbot-view-model.spec.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint không commit**

Run: `git diff --check -- src/ui/jd-chatbot-view-model.ts tests/jd-chatbot-view-model.spec.ts`

Expected: không có whitespace error; không commit/push.

### Task 2: Xây document panel và thư viện JD theo Studio UI

**Files:**
- Create: `src/ui/jd-chatbot/JDChatbotDocumentPanel.tsx`
- Create: `src/ui/jd-chatbot/JDChatbotLibraryDialog.tsx`
- Modify: `src/ui/jd-chatbot-header.tsx`
- Modify: `src/ui/jd-chatbot-interaction-controls.tsx`
- Modify: `src/ui/studio/studio.css`
- Create: `tests/jd-chatbot-studio-view.spec.ts`
- Test: `tests/studio-theme.spec.ts`

**Interfaces:**
- Produces: `JDChatbotDocumentPanel` nhận `mode`, `onModeChange`, `fileName`, `draft`, `saved`, `loading`, `loadError`, `isSaving`, `saveMessage`, `onDraftChange`, `onOpenLibrary`, `onRestore`, `onSave`.
- Produces: `JDChatbotLibraryDialog` nhận danh sách Markdown thật, selected id, search value và callbacks close/search/refresh/select; component không tự gọi PrivOS.
- Extends: `JDChatbotHeader` nhận `canSave`, `isSaving`, `onSave` bên cạnh callbacks thư viện/tạo mới.
- Preserves: `JDChatbotCompanyOption` và `JDChatbotComposer` là controlled components, không gọi AI/service trực tiếp.

- [ ] **Step 1: Viết failing structural tests theo ảnh**

SSR assert page copy `TUYỂN DỤNG`, `Trợ lý JD`, `Soạn và chỉnh sửa mô tả công việc cùng AI.`; header actions `Thư viện JD`, `Tạo mới`, `Lưu thay đổi`; assistant heading `Trợ lý tuyển dụng`; document toolbar có `MD`, filename/status; không chứa `Tải .md`, `jd-download`, `PROTOTYPE` hoặc dữ liệu mẫu.

- [ ] **Step 2: Viết failing tests cho ba chế độ**

Assert segmented control có đúng thứ tự `Xem trước` → `Xem thay đổi` → `Chỉnh sửa thủ công`; active state dùng `aria-pressed` hoặc tab semantics; preview render Markdown; changes render notice chính xác và class green cho changed rows; manual render controlled textarea. Empty state có `JD tiếp theo bắt đầu từ đây.` và action mở thư viện.

- [ ] **Step 3: Viết failing tests cho library và composer**

Library dùng `StudioDialog`, search controlled, render đúng tên file thật/selected state/empty state và giữ action `Làm mới`. Composer dùng textarea responsive; Enter gửi một lần, Shift+Enter cho phép xuống dòng, button disable khi busy hoặc input chỉ có whitespace; checkbox vẫn controlled và không tự checked.

- [ ] **Step 4: Chạy component tests để xác nhận fail**

Run: `npm test -- tests/jd-chatbot-studio-view.spec.ts tests/studio-theme.spec.ts`

Expected: FAIL vì Studio JD components và CSS contract chưa tồn tại.

- [ ] **Step 5: Implement document panel**

Toolbar hiển thị filename hoặc `Bản mô tả công việc mới`, trạng thái thật (`Đang tải`, `Đã lưu`, `Có thay đổi chưa lưu`, `Bản nháp`) và số ký tự draft. Segmented controls chỉ gọi `onModeChange`. Loading/error/empty/content cùng dùng một body có scroll; header/footer cố định. `Xem thay đổi` lấy rows từ Task 1, không trộn highlight vào preview thường.

- [ ] **Step 6: Implement header, assistant controls và library dialog**

Dùng Studio button/dialog và icon đang có trong dependency. Header save gọi callback chung; không thêm download. Giữ search, refresh, close và select hiện có của drawer nhưng trình bày thành thư viện modal theo Studio; không truy vấn metadata phòng ban hoặc file binary mới.

- [ ] **Step 7: Thêm Studio CSS responsive**

Thêm nhóm `.jd-studio-*` vào `src/ui/studio/studio.css`: desktop grid khoảng `350px minmax(0, 1fr)`, card 16px radius, assistant/document internal scroll, segmented controls, green diff rows, editor monospace và focus-visible. Ở `<=1000px` chuyển một cột; ở `<=720px` header actions wrap, chat cao hữu hạn, document toolbar/tabs/footer wrap và không tạo horizontal overflow. Chỉ dùng `--studio-*` semantic tokens và hỗ trợ reduced motion.

- [ ] **Step 8: Chạy Task 2 tests**

Run: `npm test -- tests/jd-chatbot-studio-view.spec.ts tests/studio-theme.spec.ts tests/studio-primitives.spec.ts`

Expected: PASS.

- [ ] **Step 9: Checkpoint không commit**

Run: `git diff --check -- src/ui/jd-chatbot src/ui/jd-chatbot-header.tsx src/ui/jd-chatbot-interaction-controls.tsx src/ui/studio/studio.css tests/jd-chatbot-studio-view.spec.ts tests/studio-theme.spec.ts`

Expected: không có whitespace error; không có action tải Markdown.

### Task 3: Nối Studio view vào controller và giữ nguyên luồng PrivOS/AI

**Files:**
- Modify: `src/ui/jd-chatbot-functional.tsx`
- Modify: `src/ui/contact-form-styles.css`
- Modify: `src/ui/App.tsx`
- Create: `tests/jd-chatbot-functional.spec.ts`
- Create: `tests/jd-chat-history.spec.ts`
- Test: `tests/studio-navigation-intent.spec.ts`
- Test: `tests/app-studio-shell.spec.ts`

**Interfaces:**
- Consumes: `JDDocumentMode`, `getChangedJDLineIndexes`, `JDChatbotDocumentPanel`, `JDChatbotLibraryDialog`.
- Preserves: `JDChatbotFunctional({ navigationIntent })`, `PipelineService.fetchAvailableJDs()`, `PipelineService.askAI(...)`, `readRoomFileText(app, file)` và `createOrUpdateFile(app, path, content)`.
- Produces: một `saveDraft()` handler dùng chung cho header/footer; `selectDocumentMode(mode)` chỉ đổi local presentation state.

- [ ] **Step 1: Viết failing controller tests cho file load/navigation**

Mock app/service để assert preload vẫn fetch danh sách, chỉ `.md` xuất hiện trong thư viện, chọn file đọc bằng id thật, request cũ bị bỏ, intent `chatbotJD` ưu tiên file id và cùng sequence không xử lý hai lần. Intent tới PDF/DOCX/missing file hiển thị lỗi chọn lại và không fallback sang file đầu tiên.

- [ ] **Step 2: Viết failing controller tests cho AI/save contract**

Assert prompt không đổi các chỉ dẫn nghiệp vụ; checkbox mặc định false sinh `Không thêm thông tin công ty`; bật checkbox sinh chỉ dẫn read-only company context. Với JD mới, AI response hợp lệ gọi save một lần vào `${roomId}/hr-miniapp/jds/JD_AI_<Ten>.md`; với JD đã chọn, response chỉ đổi draft/mode sang `changes` và chưa ghi file. Header/footer save cùng disable khi draft trống/đã lưu/loading/saving.

- [ ] **Step 3: Viết failing tests cho mode/manual/restore behavior**

Gõ trong `Chỉnh sửa thủ công`, chuyển sang `Xem trước`, rồi `Xem thay đổi` phải giữ draft và không gọi save. Diff phải recompute từ `saved` + `draft`, không giữ `Set` stale từ phản hồi AI. `Khôi phục chỉnh sửa` trả draft về saved, reset chat theo behavior hiện có và đưa mode về preview.

- [ ] **Step 4: Chạy controller tests để xác nhận fail**

Run: `npm test -- tests/jd-chatbot-functional.spec.ts tests/jd-chat-history.spec.ts tests/studio-navigation-intent.spec.ts`

Expected: FAIL vì controller chưa dùng document mode/Studio view và chưa có regression harness riêng.

- [ ] **Step 5: Rewire controller state**

Thay `editing`/`changedJDLines` state bằng `documentMode` và diff dẫn xuất từ `saved`/`draft`. `choose`, `fresh`, navigation intent, AI result, save và restore đặt mode rõ ràng nhưng không đổi read/write path. Bỏ exit-edit modal/state cũ vì mode switch không còn là thao tác discard; giữ explicit restore action.

- [ ] **Step 6: Giữ async và mutation guards**

Không thay `jdLoadRequestRef` hoặc `handledNavigationSequenceRef`. Mọi save entry point đi qua cùng `isSaving` guard; save lỗi giữ draft/mode/chat và báo lỗi inline; save thành công refresh library, cập nhật selected/saved, về preview và giữ success feedback hiện có.

- [ ] **Step 7: Làm sạch legacy CSS và copy nội bộ**

Xóa block `.jd-chatbot-*` cũ trong `contact-form-styles.css` chỉ sau khi không còn consumer; không đụng style tab khác. Đồng bộ nhãn audit trong `TAB_SECTIONS` từ `Chỉnh sửa JD` thành `Trợ lý JD`; navigation hiển thị vẫn lấy `studio-navigation.ts` như hiện tại.

- [ ] **Step 8: Chạy Task 3 regression tests**

Run: `npm test -- tests/jd-chatbot-functional.spec.ts tests/jd-chatbot-view-model.spec.ts tests/jd-chatbot-studio-view.spec.ts tests/jd-chat-history.spec.ts tests/studio-navigation-intent.spec.ts tests/recruitment-navigation.spec.ts tests/app-studio-shell.spec.ts tests/ui-error-surfacing.spec.ts`

Expected: PASS; luồng `Chỉnh với AI` từ Vị trí tuyển dụng vẫn mở đúng Markdown JD.

- [ ] **Step 9: Chạy typecheck**

Run: `npm run typecheck:strict-unused`

Expected: PASS; không còn export/class/state JD cũ không dùng.

- [ ] **Step 10: Checkpoint không commit**

Run: `git diff --check; git status --short`

Expected: chỉ source/tests/plan của Trợ lý JD; không có manifest, schema, generated asset hoặc commit/push.

### Task 4: Verification, PrivOS smoke test và cổng nghiệm thu

**Files:**
- Verify only; chỉ sửa file Task 1-3 nếu verification phát hiện regression.

**Interfaces:**
- Produces: tab Trợ lý JD sẵn sàng để người dùng nghiệm thu; không bắt đầu tab tiếp theo.

- [ ] **Step 1: Chạy targeted JD gate**

Run: `npm test -- tests/jd-chatbot-view-model.spec.ts tests/jd-chatbot-studio-view.spec.ts tests/jd-chatbot-functional.spec.ts tests/jd-chat-history.spec.ts tests/studio-navigation-intent.spec.ts tests/recruitment-navigation.spec.ts tests/app-studio-shell.spec.ts tests/studio-theme.spec.ts tests/studio-primitives.spec.ts tests/ui-error-surfacing.spec.ts`

Expected: PASS.

- [ ] **Step 2: Chạy static/build gates**

Run: `npm run typecheck:strict-unused`

Expected: PASS.

Run: `npm run build`

Expected: PASS, gồm Vite bundle và manifest lint; manifest không thay đổi.

- [ ] **Step 3: Chạy full regression**

Run: `npm test`

Expected: không có lỗi mới. Nếu các lỗi nền identity/package hoặc Windows `/bin/bash` còn tồn tại, ghi chính xác command/output và đối chiếu baseline thay vì sửa ngoài phạm vi.

- [ ] **Step 4: Kiểm tra repository hygiene**

Run: `git diff --check; git status --short`

Expected: không có ảnh tham chiếu tạm, build artifact, secret, manifest/schema/scope change hoặc commit/push.

- [ ] **Step 5: Manual smoke test trong PrivOS — dữ liệu và luồng**

Kiểm tra bằng file Room thật:

- mở tab trực tiếp, mở `Thư viện JD`, search/refresh/chọn một `.md`; PDF/DOCX không xuất hiện;
- đi từ `Vị trí tuyển dụng` bằng `Chỉnh với AI`, xác nhận đúng file được chọn theo id;
- AI tạo JD mới vẫn tự lưu đúng filename/path; AI sửa JD cũ chưa ghi file cho tới khi bấm lưu;
- checkbox company mặc định tắt, bật lên mới đưa company context vào lượt AI;
- ba chế độ đúng thứ tự/nhãn; manual edit sống qua mode switch; `Xem thay đổi` tô xanh dòng thay đổi; preview không tô diff;
- header/footer save cùng trạng thái, không gửi trùng; restore trả về bản lưu; read/AI/save failure giữ draft để thử lại;
- không có nút hoặc menu tải `.md` ở bất kỳ trạng thái nào.

- [ ] **Step 6: Manual smoke test trong PrivOS — responsive/theme**

Kiểm tra Light/Dark/Brand ở iframe rộng và hẹp: header actions wrap đúng, mobile xếp assistant trước document, chat/document cuộn nội bộ, textarea không tràn, segmented labels không bị cắt, diff green đủ tương phản, focus/keyboard hoạt động và đổi theme/tab không làm mất draft/chat/selection.

- [ ] **Step 7: Bàn giao và dừng**

Báo file thay đổi, kết quả từng gate, các baseline failure nếu có và checklist smoke test. Nếu người dùng yêu cầu deploy container để kiểm tra, thực hiện riêng rồi dừng chờ xác nhận tab Trợ lý JD trước khi sửa tab tiếp theo.
