# Studio Shell + Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây Studio Shell dùng chung và chuyển trang Công ty sang giao diện A · Studio với dữ liệu PrivOS thật, đủ Auto/Light/Dark/Brand, rồi dừng để người dùng nghiệm thu.

**Architecture:** Giữ nguyên service và cơ chế mount tab hiện có, thêm một lớp Studio gồm theme model, semantic tokens, shell/navigation và primitives. Trang Công ty dùng repository riêng để đọc thư mục `hr-miniapp/company`, còn hai write flow hiện có (crawl website và upload) được giữ nguyên hành vi rồi bổ sung refresh thư viện, search, preview và download.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (Node environment), `@privos_ai/app-react`, `@ant-design/icons`, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-ui-redesign-design.md`

## Global Constraints

- Đây chỉ là mốc 1: Studio Shell + Công ty. Không redesign Tuyển dụng hoặc các trang tiếp theo trong plan này.
- Sau khi hoàn thành mốc này phải dừng để người dùng kiểm tra; không bắt đầu trang Tuyển dụng trước khi có xác nhận.
- Không commit hoặc push; quy ước repository thay thế bước commit bằng checkpoint `git diff --check` + báo cáo diff.
- Không sửa hoặc ghi đè thay đổi hiện có trong `privos-app.json`.
- Không thêm dependency nếu React, CSS hoặc `@ant-design/icons` đã đáp ứng được.
- Không thay đổi manifest, scope, schema hoặc business service nếu không có call site mới thực sự cần permission.
- Không đưa PROTOTYPE bar, A/B/C switch, persona, scenario, guide, reset, dữ liệu Aster Studio hoặc số liệu mock vào production.
- Context hiển thị phải lấy từ `usePrivosContext()`; file operations vẫn room-scoped và chạy bằng user session.
- Payroll phải tiếp tục bị ẩn và unmount khi người dùng mất quyền owner phù hợp.
- Theme switch không remount feature screen hoặc làm mất state nghiệp vụ.

## Review Focus

- Giá trị theme cũ/hỏng trong `localStorage` phải rơi về Auto, không tạo `data-studio-theme` sai; Task 1 có test cho input này.
- Payroll bị thu hồi quyền trong lúc đang active phải quay về Company và bị unmount; Task 4 chạy lại regression test của policy và có source-contract test cho guard mount.
- Không có thư mục công ty là empty state, nhưng lỗi/malformed listing phải là error state; Task 5 test riêng hai trường hợp.
- Preview tài liệu trả về muộn sau khi người dùng chọn file khác không được ghi đè file mới; Task 6 test request-generation guard.
- File binary không có `downloadUrl` không được render link hỏng; Task 5 test capability và Task 6 render trạng thái không khả dụng.

---

## File Structure

### Tạo mới

- `src/ui/studio/studio-theme.ts` — type, validation và resolution thuần của theme.
- `src/ui/studio/studio-navigation.ts` — khai báo nhóm/sidebar item và lọc Payroll.
- `src/ui/studio/StudioShell.tsx` — sidebar, mobile navigation, topbar, account/context và content slot.
- `src/ui/studio/StudioPrimitives.tsx` — page header, card, status, toast và dialog dùng lại.
- `src/ui/studio/studio.css` — semantic tokens, compatibility aliases, shell/primitives và responsive rules.
- `src/ui/company/company-documents.ts` — model, search/classification/capability và repository Room Files.
- `src/ui/company/company-preview-state.ts` — state machine thuần để chống stale preview result.
- `tests/studio-theme.spec.ts` — resolution/persistence contract của theme.
- `tests/studio-navigation.spec.ts` — nav groups, labels và Payroll visibility.
- `tests/studio-primitives.spec.ts` — SSR/source contract của primitives và CSS token selectors.
- `tests/studio-shell-layout.spec.ts` — SSR contract của sidebar/topbar/mobile control.
- `tests/app-studio-shell.spec.ts` — wiring contract và preservation của lazy/permission mount.
- `tests/company-documents.spec.ts` — repository, filtering, preview/download capability.
- `tests/company-home-studio.spec.ts` — Company UI/data-flow source contract và stale preview state.

### Chỉnh sửa

- `src/ui/theme-provider.tsx` — thêm Brand, validation, bỏ quyền sở hữu `data-theme` trên `<html>`.
- `src/ui/App.tsx` — dùng StudioShell nhưng giữ visited tabs và Payroll guards.
- `src/ui/company-home.tsx` — Studio Company page với library/search/preview/download/drag-drop.
- `src/ui/main.tsx` — import `studio.css` sau legacy styles.

### Không chỉnh sửa trong mốc này

- `privos-app.json`, `SCOPES.md` và backend handlers.
- Nội dung feature screens từ Tuyển dụng đến Soạn thảo; chúng chỉ được đặt bên trong shell mới và giữ nguyên markup/logic cho tới mốc của chính mình.

---

### Task 1: Theme model và provider bốn mode

**Files:**
- Create: `src/ui/studio/studio-theme.ts`
- Modify: `src/ui/theme-provider.tsx:1-86`
- Test: `tests/studio-theme.spec.ts`

**Interfaces:**
- Produces: `StudioThemeMode = 'auto' | 'light' | 'dark' | 'brand'`.
- Produces: `StudioResolvedTheme = 'light' | 'dark' | 'brand'`.
- Produces: `normalizeStudioThemeMode(value: unknown): StudioThemeMode`.
- Produces: `resolveStudioTheme(mode: StudioThemeMode, hostTheme: string): StudioResolvedTheme`.
- Produces: `useTheme(): { mode; resolved; setMode }`; later tasks read both `mode` and `resolved`.

- [ ] **Step 1: Viết test fail cho normalization và resolution**

  Trong `tests/studio-theme.spec.ts`, assert:

  - `null`, `''`, `'sepia'` và object đều normalize thành `'auto'`.
  - `'light'`, `'dark'`, `'brand'`, `'auto'` được giữ nguyên.
  - Auto + `dark` hoặc `high-contrast` resolve thành Dark; các host theme khác thành Light.
  - Brand luôn resolve Brand, không phụ thuộc host.

- [ ] **Step 2: Chạy test và xác nhận fail vì module chưa tồn tại**

  Run: `npm test -- tests/studio-theme.spec.ts`

  Expected: FAIL với lỗi không resolve được `studio-theme`.

- [ ] **Step 3: Implement pure theme model**

  Tạo đúng các type/function trong Interfaces. Không đọc DOM hoặc `localStorage` trong file thuần.

- [ ] **Step 4: Nâng cấp ThemeProvider**

  Giữ storage key hiện tại `theme-mode` để tương thích. Initializer phải đi qua `normalizeStudioThemeMode`; `setMode` lưu Light/Dark/Brand nhưng xóa key khi chọn Auto. Xóa effect ghi `document.documentElement.dataset.theme`; StudioShell ở Task 3 sẽ gắn `data-studio-theme` và `data-studio-theme-mode` trên root riêng.

  `ThemeToggle` có thể tiếp tục export để tránh import break, nhưng phải render đủ Auto/Light/Dark/Brand và dùng accessible label; vị trí hiển thị thật sẽ nằm trong sidebar.

- [ ] **Step 5: Chạy test và typecheck**

  Run: `npm test -- tests/studio-theme.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck`

  Expected: PASS.

- [ ] **Step 6: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; chỉ các file của Task 1 và thay đổi sẵn có của người dùng xuất hiện trong status.

### Task 2: Semantic tokens và Studio primitives

**Files:**
- Create: `src/ui/studio/StudioPrimitives.tsx`
- Create: `src/ui/studio/studio.css`
- Modify: `src/ui/main.tsx:1-12`
- Test: `tests/studio-primitives.spec.ts`

**Interfaces:**
- Consumes: `StudioResolvedTheme`/theme attributes từ Task 1.
- Produces: `StudioPage`, `StudioPageHeader`, `StudioCard`, `StudioInlineState`, `StudioToast`, `StudioDialog`.
- Produces: CSS semantic tokens prefix `--studio-*` và compatibility aliases cho legacy variables như `--bg`, `--bg-card`, `--text`, `--text-muted`, `--border`, `--accent`.

- [ ] **Step 1: Viết failing SSR/CSS contract tests**

  `tests/studio-primitives.spec.ts` phải:

  - Render primitives bằng `react-dom/server` và assert semantic class, heading hierarchy, `role="status"`/`role="alert"`, dialog label.
  - Đọc `studio.css` và assert có selector cho Light, Dark, Brand, Auto host surface, focus-visible và breakpoint `max-width: 720px`.
  - Assert CSS chứa compatibility aliases cần cho các feature screen cũ đang nằm trong shell.

- [ ] **Step 2: Chạy test để xác nhận fail**

  Run: `npm test -- tests/studio-primitives.spec.ts`

  Expected: FAIL vì component/CSS chưa tồn tại.

- [ ] **Step 3: Implement primitives**

  Mỗi primitive chỉ chịu trách nhiệm layout/semantics, nhận `className` và children; không chứa dữ liệu PrivOS hoặc logic feature. `StudioDialog` dùng native `<dialog>` hoặc accessible overlay nhưng phải có close action và `aria-labelledby`.

- [ ] **Step 4: Implement semantic token layers và responsive baseline**

  CSS root phải hỗ trợ:

  - Auto resolved Light/Dark dùng `--base-*` cho outer surfaces khi có.
  - Explicit Light/Dark dùng palette cục bộ ổn định.
  - Brand dùng palette A · Studio.
  - Focus ring, success/warning/danger/info, overlay, shadow và drag highlight.
  - Breakpoint mobile không gây horizontal overflow cho shell/page/card.

  Không copy review bar hoặc prototype-only selectors.

- [ ] **Step 5: Import Studio CSS sau legacy CSS**

  Sửa `src/ui/main.tsx` để `./studio/studio.css` được load cuối, cho phép aliases/token mới thắng mà chưa xóa style của các trang chưa migrate.

- [ ] **Step 6: Chạy targeted test, typecheck và build CSS bundle**

  Run: `npm test -- tests/studio-primitives.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck && npm run build`

  Expected: PASS; manifest lint cũng PASS trong build.

- [ ] **Step 7: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error.

### Task 3: Navigation model và StudioShell

**Files:**
- Create: `src/ui/studio/studio-navigation.ts`
- Create: `src/ui/studio/StudioShell.tsx`
- Test: `tests/studio-navigation.spec.ts`
- Test: `tests/studio-shell-layout.spec.ts`

**Interfaces:**
- Produces: `AppTab = 'home' | 'email' | 'recruitment' | 'pipeline' | 'cvScored' | 'chatbotJD' | 'lifecycle' | 'payroll' | 'botDrafting'`.
- Produces: `StudioNavGroup`, `StudioNavItem`, `buildStudioNavGroups(canAccessPayroll: boolean): StudioNavGroup[]`, `findStudioNavItem(tab: AppTab): StudioNavItem`.
- Produces: `StudioShellProps = { activeTab; groups; onSelectTab; roomName; username; userRoles; children }`.

- [ ] **Step 1: Viết navigation tests**

  Assert đúng thứ tự nhóm và tab theo preview, nhãn `Ứng viên` map tới id `cvScored`, Payroll vắng khi `false` và xuất hiện đúng một lần khi `true`, mọi `AppTab` đều có label/breadcrumb.

- [ ] **Step 2: Chạy navigation test để xác nhận fail**

  Run: `npm test -- tests/studio-navigation.spec.ts`

  Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Implement navigation model**

  Dữ liệu nav không chứa click handler hoặc React node. Dùng một source of truth cho sidebar label và breadcrumb. Không đưa count/status giả từ preview.

- [ ] **Step 4: Viết shell SSR tests**

  Render `StudioShell` với context giả và assert:

  - Có navigation landmark, active item, breadcrumb, room name và username thật từ props.
  - Có mobile menu button với `aria-expanded`.
  - Có theme control đủ Auto/Light/Dark/Brand.
  - Không chứa `Aster Studio`, `PROTOTYPE`, persona hoặc scenario.

- [ ] **Step 5: Chạy shell test để xác nhận fail**

  Run: `npm test -- tests/studio-shell-layout.spec.ts`

  Expected: FAIL vì `StudioShell` chưa tồn tại.

- [ ] **Step 6: Implement StudioShell**

  Shell dùng `useTheme()` và gắn `data-studio-theme={resolved}` cùng `data-studio-theme-mode={mode}` trên root. Sidebar chứa brand CV Matcher, room switch/context, grouped nav, theme select và account. Topbar chứa mobile menu, breadcrumb và ngày hiện tại format `vi-VN`. Escape đóng mobile menu; chọn nav cũng đóng menu.

- [ ] **Step 7: Chạy targeted tests và typecheck**

  Run: `npm test -- tests/studio-navigation.spec.ts tests/studio-shell-layout.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck`

  Expected: PASS.

- [ ] **Step 8: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error.

### Task 4: Wire App vào StudioShell mà không đổi lifecycle các tab

**Files:**
- Modify: `src/ui/App.tsx:1-209`
- Test: `tests/app-studio-shell.spec.ts`
- Test: `tests/payroll-access-polling.spec.ts`

**Interfaces:**
- Consumes: `AppTab`, `buildStudioNavGroups`, `StudioShell` từ Task 3.
- Preserves: visited tab panels không remount khi đổi tab; `active` props hiện có; Payroll visibility/mount policy; template initialization effects.

- [ ] **Step 1: Viết App wiring contract test**

  Source-contract assertions phải chứng minh:

  - `App.tsx` render `StudioShell` và truyền `roomName`, `username`, `userRoles` từ `usePrivosContext()`.
  - `visitedTabs`, `panel()` và mọi feature component hiện có vẫn còn.
  - Payroll vẫn nằm sau `canAccessPayroll && panel(...)`.
  - Legacy `.app-header`/hover subnav không còn được render.

- [ ] **Step 2: Chạy test để xác nhận fail**

  Run: `npm test -- tests/app-studio-shell.spec.ts`

  Expected: FAIL vì App vẫn dùng header cũ.

- [ ] **Step 3: Thay header bằng StudioShell**

  Chuyển type Tab sang `AppTab`; tạo groups từ `canAccessPayroll`; truyền context thật. `handleSelectTab`, visited tab semantics, effects và feature props giữ nguyên. Các màn hình chưa redesign vẫn render nguyên trạng bên trong content slot.

- [ ] **Step 4: Chạy wiring + Payroll regressions**

  Run: `npm test -- tests/app-studio-shell.spec.ts tests/payroll-access-polling.spec.ts`

  Expected: PASS, gồm case revoke quyền owner.

  Run: `npm run typecheck && npm run build`

  Expected: PASS.

- [ ] **Step 5: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error; `privos-app.json` không bị task này sửa.

### Task 5: Company document model và Room Files repository

**Files:**
- Create: `src/ui/company/company-documents.ts`
- Test: `tests/company-documents.spec.ts`

**Interfaces:**
- Produces: `CompanyDocument = { id; name; size?; mimeType?; downloadUrl?; createdAt?; updatedAt? }`.
- Produces: `CompanyDocumentKind = 'image' | 'pdf' | 'text' | 'other'`.
- Produces: `classifyCompanyDocument(document): CompanyDocumentKind`.
- Produces: `filterCompanyDocuments(documents, query): CompanyDocument[]` với search case/diacritic-insensitive.
- Produces: `getCompanyDocumentCapabilities(document): { canPreview: boolean; canDownload: boolean }`; text có thể preview/download bằng content route, binary cần `downloadUrl` để download.
- Produces: `CompanyDocumentRepository` với constructor `(app: McpApp, roomId: string)`, `list(): Promise<CompanyDocument[]>`, `readText(document): Promise<string>`.

- [ ] **Step 1: Viết repository/model tests**

  Dùng fake `McpApp` để assert:

  - Repository resolve đúng `hr-miniapp/company`, không tạo folder khi chỉ đọc.
  - Folder không tồn tại trả `[]`.
  - Tool error/malformed files payload reject, không trả `[]`.
  - Chỉ record có `_id` và `name` hợp lệ được map; `size` đọc cả `size`/`file_size`.
  - Search `van hoa` match `Văn hóa nội bộ.pdf`.
  - Text/PDF/image/other classification đúng.
  - Binary không có `downloadUrl` có `canDownload: false`; text không có URL vẫn preview/download được qua content route.

- [ ] **Step 2: Chạy test để xác nhận fail**

  Run: `npm test -- tests/company-documents.spec.ts`

  Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Implement model và repository**

  Dùng `findFolderPath`, `readToolList`, `readRoomFileText`; không duplicate parser response. `list()` sort ổn định theo `updatedAt ?? createdAt` giảm dần, rồi `name.localeCompare(..., 'vi')`. Lỗi đọc được propagate để UI phân biệt error với empty.

- [ ] **Step 4: Chạy tests và typecheck**

  Run: `npm test -- tests/company-documents.spec.ts tests/company-context-provider.spec.ts tests/privos-rest.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error.

### Task 6: Redesign Company page và nối thư viện thật

**Files:**
- Create: `src/ui/company/company-preview-state.ts`
- Modify: `src/ui/company-home.tsx:1-216`
- Modify: `src/ui/studio/studio.css`
- Test: `tests/company-home-studio.spec.ts`

**Interfaces:**
- Consumes: `CompanyDocumentRepository`, model helpers và Studio primitives.
- Produces: `CompanyPreviewState = { documentId: string | null; requestId: number; loading: boolean; text: string | null; error: string | null }`.
- Produces: `createCompanyPreviewState(): CompanyPreviewState`.
- Produces: `beginCompanyPreview(state, documentId): { state: CompanyPreviewState; requestId: number }`.
- Produces: `settleCompanyPreview(state, requestId, result: { text?: string; error?: string }): CompanyPreviewState`; request id cũ trả nguyên state.
- Produces: `closeCompanyPreview(state): CompanyPreviewState`; tăng generation và xóa selection để invalidate request đang chạy.
- Preserves: website crawl/save path `${roomId}/hr-miniapp/company/<host>-data.md`; upload folder `hr-miniapp/company`; `duplicateAction: 'replace'`; accepted extensions hiện có.

- [ ] **Step 1: Viết stale-preview state tests**

  Assert request A bắt đầu, request B bắt đầu sau đó, kết quả A bị bỏ qua và kết quả B được nhận. Assert close preview làm invalid request đang chạy.

- [ ] **Step 2: Viết Company source/data-flow contract tests**

  Assert source mới:

  - Dùng `roomName`, không chứa `Aster Studio` hoặc document mock.
  - Load repository khi mount, có retry, search và real document count.
  - Refresh list sau crawl/upload thành công; không clear website/files khi thao tác thất bại.
  - Có drag/drop và hidden multi-file input.
  - Preview text qua repository; PDF/image chỉ dùng URL hợp lệ; file không download được render copy giải thích thay vì anchor rỗng.
  - Status có live region; action đang chạy bị disable.

- [ ] **Step 3: Chạy tests để xác nhận fail**

  Run: `npm test -- tests/company-home-studio.spec.ts`

  Expected: FAIL vì UI/state mới chưa tồn tại.

- [ ] **Step 4: Implement Company page layout**

  Dựng đúng hierarchy đã duyệt: hero dùng tên room thật, hai card Website/Tài liệu, dropzone, thư viện có search/table và preview dialog. Số tài liệu, size, kind và timestamp lấy từ repository. Mobile giữ table scroll hoặc chuyển row layout nhưng không làm page overflow.

- [ ] **Step 5: Nối write flows và refresh**

  Giữ thuật toán crawl/poll AI và upload hiện tại. Sau mỗi success gọi lại `repository.list()`. Crawl failure giữ URL; upload failure giữ selected files; success mới clear input. Không đổi permission hoặc endpoint.

- [ ] **Step 6: Nối preview/download an toàn**

  Text preview dùng request-generation state và tạo Blob URL để tải xuống khi Hub không trả `downloadUrl`; revoke Blob URL sau khi dùng. Image/PDF chỉ embed khi có `downloadUrl`; other file chỉ có Open/Download khi capability cho phép. Dialog có loading/error/retry/close và không để stale response đổi nội dung.

- [ ] **Step 7: Chạy Company regressions và build**

  Run: `npm test -- tests/company-home-studio.spec.ts tests/company-documents.spec.ts tests/company-context-provider.spec.ts tests/privos-rest.spec.ts`

  Expected: PASS.

  Run: `npm run typecheck:strict-unused && npm run build`

  Expected: PASS.

- [ ] **Step 8: Checkpoint không commit**

  Run: `git diff --check`

  Expected: không có whitespace error.

### Task 7: Full verification và bàn giao mốc 1

**Files:**
- Verify only; chỉ sửa file trong Task 1-6 nếu verification tìm thấy lỗi.

**Interfaces:**
- Consumes: toàn bộ deliverable Task 1-6.
- Produces: một mốc Studio Shell + Công ty có thể nghiệm thu; không sản xuất code cho mốc 2.

- [ ] **Step 1: Chạy full automated gate**

  Run: `npm run typecheck:strict-unused`

  Expected: PASS.

  Run: `npm test`

  Expected: PASS.

  Run: `npm run build`

  Expected: PASS, gồm manifest lint.

  Run: `npm run preflight`

  Expected: PASS.

- [ ] **Step 2: Chạy repository hygiene checks**

  Run: `git diff --check`

  Expected: PASS.

  Run: `git status --short`

  Expected: chỉ có file thuộc mốc 1, design/plan docs và thay đổi `privos-app.json` sẵn có của người dùng; không có generated artifact ngoài phạm vi.

- [ ] **Step 3: Manual smoke test trong PrivOS/Hub**

  Kiểm tra lần lượt:

  - Sidebar desktop và mobile; đổi tab không làm mất state tab đã visit.
  - Auto, Light, Dark, Brand; refresh giữ lựa chọn; Auto theo host.
  - Context hiển thị đúng room/user; không còn Aster/mock.
  - Payroll không xuất hiện với non-owner và không còn mounted sau khi revoke.
  - Company empty, load error + retry, website crawl success/failure.
  - Click-select và drag/drop nhiều file; upload success/failure; library refresh.
  - Search không dấu; text preview; image/PDF preview; download; unavailable binary.
  - Iframe rộng và hẹp không overflow ngoài vùng chủ ý như table scroll.

- [ ] **Step 4: Bàn giao cho người dùng và dừng**

  Báo danh sách file/thay đổi, kết quả từng command, giới hạn API và checklist kiểm tra. Không bắt đầu plan hoặc code trang Tuyển dụng cho tới khi người dùng xác nhận mốc 1 đạt.
