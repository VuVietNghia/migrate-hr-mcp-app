# Studio UI Redesign — Design

Ngày: 2026-10-05. Không commit theo quy ước của repository.

## 0. Trạng thái bàn giao

Cập nhật gần nhất: 2026-10-08. Phần dưới đây là trạng thái triển khai thực tế để phiên làm việc tiếp theo tiếp tục từ đúng điểm dừng; các mục thiết kế còn lại trong tài liệu vẫn giữ nguyên hiệu lực.

### 0.1. Đã hoàn thành và đã được người dùng nghiệm thu

#### Studio Shell dùng chung

- Đã bọc workspace hiện tại trong **StudioShell**, dùng context thật của PrivOS cho Room, người dùng và quyền.
- Đã triển khai sidebar theo nhóm chức năng, topbar, breadcrumb, mobile navigation và vùng nội dung responsive trong iframe.
- Sidebar vẫn cuộn được nhưng không hiển thị thanh scrollbar.
- Navigation đã hiển thị tab **Lương & thanh toán** theo quyền hiện có.
- Nhãn điều hướng **CV đã chấm** đã đổi thành **Ứng viên**. Đây mới là thay đổi nhãn/route; phần thiết kế nghiệp vụ một Kanban theo đợt ở mục 5 chưa hoàn tất.
- Không đưa thanh PROTOTYPE, persona, dữ liệu Aster Studio hoặc dữ liệu giả của preview vào production.

Các file nền tảng chính:

- src/ui/studio/StudioShell.tsx
- src/ui/studio/studio-navigation.ts
- src/ui/studio/studio-theme.ts
- src/ui/theme-provider.tsx
- src/ui/studio/studio.css

#### Theme và font

- Đã triển khai **ThemeMode = auto | light | dark | brand**.
- Auto bám theme host; Light, Dark và Brand dùng semantic token của Studio và không remount feature screen khi đổi theme.
- Lựa chọn theme được lưu cục bộ; chọn Auto xóa override và quay lại theme host.
- Đã nhúng trực tiếp bộ font Montserrat của ui-ux-preview với các weight 400, 500 và 600 tại src/ui/studio/privos-fonts.css; không phụ thuộc CDN.
- Studio Shell và các control bên trong dùng Montserrat với fallback "Segoe UI", Arial, sans-serif, giúp chữ tiếng Việt khớp bản redesign.

#### Primitive/component dùng chung

Đã có các component dùng chung trong src/ui/studio/StudioPrimitives.tsx:

- StudioPage
- StudioPageHeader
- StudioCard
- StudioInlineState
- StudioToast
- StudioDialog
- StudioPrefixInput
- StudioSearchInput

StudioPrefixInput và StudioSearchInput giữ các props native của input để feature screen tái sử dụng mà không thay đổi state hoặc handler nghiệp vụ. Style focus/hover nằm ở lớp Studio chung, không nằm riêng trong trang Công ty.

#### Trang Dữ liệu công ty

Trang này đã hoàn tất, được kiểm tra trực tiếp trên PrivOS và được người dùng xác nhận **ok**.

- Đã chuyển sang layout Studio với context Room thật, hero, hai source card và thư viện tài liệu.
- Luồng đọc website giữ API/handler cũ; UI dùng tiền tố cố định **https://**, tự loại bỏ protocol nếu người dùng dán URL đầy đủ và lưu kết quả Markdown vào đúng thư mục Room.
- Tiền tố **https://** không đổi màu, nền, border, shadow hoặc vị trí khi hover.
- Focus website bao quanh toàn bộ prefix + input nhưng không đổi màu border gốc.
- Thanh **Tìm tài liệu** không có hover/focus decoration ngoài ý muốn.
- Upload hỗ trợ chọn nhiều tệp và kéo thả; danh sách tệp chờ tải không còn làm giãn chữ/tên tệp.
- Thư viện nhận dạng và trình bày định dạng:
  - Markdown màu xanh dương nhạt;
  - DOCX/Word màu xanh dương đậm;
  - PDF màu cam;
  - định dạng không xác định dùng nhãn trung tính rõ ràng.
- Xem và tải xuống dùng authenticated PrivOS content route thay vì URL tệp không hợp lệ.
- DOCX được xem trực tiếp trong popup bằng docx-preview.
- PDF được render trong app bằng pdfjs-dist, fit theo chiều rộng popup và chỉ render các trang gần viewport.
- Markdown được render bằng react-markdown + remark-gfm, có typography cho heading, list, bảng, blockquote, code và link an toàn.
- Popup DOCX/PDF/Markdown chỉ cuộn vùng nội dung bên trong; không còn hai scrollbar cạnh nhau.
- Có guard request generation để kết quả preview cũ không ghi đè tài liệu vừa chọn.

Các module chính của trang:

- src/ui/company-home.tsx
- src/ui/company/company-documents.ts
- src/ui/company/company-preview-state.ts
- src/ui/company/CompanyDocxPreview.tsx
- src/ui/company/CompanyPdfPreview.tsx
- src/ui/company/CompanyMarkdownPreview.tsx

#### Trang Vị trí tuyển dụng

Trang này đã hoàn tất redesign theo `ui-ux-preview`, đã được triển khai lên container và được người dùng kiểm tra, xác nhận **ok** qua nhiều vòng tinh chỉnh.

- Đã thay giao diện cũ bằng layout Studio gồm header, ba metric, sidebar phòng ban, ô tìm kiếm, danh sách JD và các dialog dùng chung.
- Sidebar hiển thị `Tất cả vị trí` và từng phòng ban với số lượng thẳng hàng; phần nội dung sidebar không bị kéo giãn theo chiều cao danh sách JD. CTA `Cần một JD mới?` dùng icon bóng đèn màu vàng.
- Phòng ban không có JD hiển thị CTA tạo JD thay vì thông báo `Không có kết quả phù hợp`. Trạng thái không có JD và trạng thái tìm kiếm không có kết quả được phân biệt rõ.
- Nút header đã đổi thành **Tạo JD thủ công**. Modal tạo JD luôn có dropdown phòng ban bắt buộc; khi mở từ `Tất cả vị trí` hoặc từ header, giá trị ban đầu là `Chọn phòng ban`. Khi mở trong một phòng ban cụ thể, phòng ban đó được chọn sẵn nhưng vẫn có thể đổi.
- Form JD thủ công giữ đầy đủ field nghiệp vụ cũ và bổ sung các lựa chọn điền nhanh bằng `datalist` cho chức danh, hình thức, lương, địa điểm, kinh nghiệm và học vấn.
- Modal tạo/đổi tên phòng ban dùng `StudioDialog`; trường `Tên hiện tại` có cách trình bày nhất quán với label/input `Tên mới`.
- Card JD hiển thị metadata bằng icon nhỏ và màu semantic phù hợp cho phòng ban, địa điểm, hình thức và lương.
- Modal **Xem chi tiết JD** hiển thị đầy đủ metadata, tổng quan, mô tả công việc, yêu cầu, quyền lợi, email nhận CV và tiêu đề email như preview.
- Nút **Tải JD** dùng authenticated PrivOS file read và tải file thật; có trạng thái đang tải và lỗi inline.
- Nút **Chỉnh với AI** mở tab `Trợ lý JD`; nút **Dùng để sàng lọc CV** mở tab `Sàng lọc CV`. Cả hai truyền `fileId`/`fileName` qua navigation intent và chọn sẵn đúng JD.
- Modal **Xem chi tiết JD** tự đóng khi rời tab `Vị trí tuyển dụng`; dữ liệu của trang vẫn được giữ vì tab không bị unmount.
- Danh sách JD dùng phân trang thay cho vùng cuộn: tối đa 6 card/trang trên desktop, 3 card/trang trên mobile; cụm mũi tên và `Trang x / y` nằm giữa cuối danh sách.
- Dòng tổng số `x vị trí` đã tăng kích thước để dễ đọc. Phân trang tự về trang đầu khi đổi phòng ban, từ khóa, dữ liệu hoặc breakpoint màn hình.
- `Vị trí tuyển dụng`, `Sàng lọc CV` và `Trợ lý JD` được mount ngay khi mở app để tải dữ liệu nền. Chỉ tab hiện tại được hiển thị; polling của Pipeline và các tác vụ AI vẫn tuân theo trạng thái active, không tự chạy nghiệp vụ chỉ vì preload.

Các module chính của trang và điều hướng liên quan:

- src/ui/recruitment-panel.tsx
- src/ui/recruitment/recruitment-jobs.ts
- src/ui/recruitment/RecruitmentJobDialogs.tsx
- src/ui/recruitment/recruitment-job-download.ts
- src/ui/recruitment/recruitment-metrics.ts
- src/ui/recruitment-departments.ts
- src/ui/recruitment-department-form.tsx
- src/ui/studio/studio-navigation-intent.ts
- src/ui/App.tsx
- src/ui/pipeline-dashboard.tsx
- src/ui/jd-chatbot-functional.tsx
- src/ui/studio/studio.css

### 0.2. Kiểm thử và triển khai gần nhất

Kết quả xác minh gần nhất ngày 2026-10-08:

- Các suite liên quan Recruitment, dialog và navigation đều đạt; lần chạy hồi quy theo trang đạt 25/25 test, lần xác minh cuối đạt 14/14 test.
- `npm run typecheck:strict-unused`: đạt.
- `npm run build`: đạt; Vite build và manifest lint hợp lệ.
- Đã build lại image `privos-mcp-app-demo:local`, recreate riêng service `hr-app` và xác minh container chạy đúng image `sha256:442c5db01c97c78a1a5e1633d56cf683b1fab31126001557749da8ad0bab6bcc`.
- Endpoint `/health` trả HTTP 200 với trạng thái `alive` ở mode `standalone-production`.
- Người dùng đã kiểm tra trực tiếp các vòng sửa của trang `Vị trí tuyển dụng`, preload tab, chọn sẵn JD và hành vi đóng modal khi chuyển tab, sau đó xác nhận **ok**.

Full `npm test` hiện còn đúng 4 lỗi nền, không phát sinh từ Studio Shell, trang Công ty hoặc trang Vị trí tuyển dụng:

1. Hai lỗi tests/manifest.spec.ts do identity/package sau lần pull chưa đồng bộ.
2. Hai lỗi tests/packaging.spec.ts vì môi trường Windows hiện tại không có /bin/bash.

Container phục vụ MCP/giao diện và `/health` bình thường, nhưng `/ready` vẫn trả 503 với mã `MANIFEST_DRIFT`: digest local `sha256:337c71435646ae44f226f9e23a9c6c0d488923f22a2c1dd3d71c3c31eae2cf4e` khác digest đã pin lúc pairing `sha256:8137b34d064862d3b89307f0b155febeecec0df06bee98ef538effd668052c23`. Chưa thay đổi readiness trong phạm vi redesign; coi đây là vấn đề hạ tầng/runtime riêng nếu người dùng yêu cầu xử lý.

Các test liên quan đã được bổ sung:

- tests/app-studio-shell.spec.ts
- tests/studio-navigation.spec.ts
- tests/studio-shell-layout.spec.ts
- tests/studio-theme.spec.ts
- tests/studio-primitives.spec.ts
- tests/company-documents.spec.ts
- tests/company-home-studio.spec.ts
- tests/company-markdown-preview.spec.ts
- tests/company-pdf-preview.spec.ts
- tests/recruitment-jobs.spec.ts
- tests/recruitment-metrics.spec.ts
- tests/recruitment-departments.spec.ts
- tests/recruitment-department-form.spec.ts
- tests/recruitment-job-dialogs.spec.ts
- tests/recruitment-job-download.spec.ts
- tests/recruitment-studio.spec.ts
- tests/recruitment-navigation.spec.ts
- tests/studio-navigation-intent.spec.ts

### 0.3. Chưa hoàn thành

- Chưa redesign các feature screen theo thứ tự còn lại: Pipeline, Ứng viên, Trợ lý JD, Nhân sự/Vòng đời nhân sự, Bảng lương, Email và Soạn thảo.
- Pipeline và Trợ lý JD mới chỉ được preload dữ liệu khi mở app và nhận navigation intent để chọn đúng JD; chưa được coi là đã hoàn thành redesign giao diện của mục 6.3 và 6.5.
- Trang **Ứng viên** chưa thực hiện selector đợt tuyển dụng, newest-by-creation-time, chỉ tải/poll một list đang chọn và chỉ hiển thị một Kanban. Không được coi việc đổi nhãn navigation là hoàn thành mục 5 hoặc 6.4.
- src/ui/cv-scored/cv-list-presence.ts vẫn ưu tiên updatedAt/updated_at; logic này chưa đáp ứng quy tắc creation time trong mục 5.1 và phải được sửa khi bắt đầu trang Ứng viên.
- Navigation intent cho JD từ `Vị trí tuyển dụng` sang Pipeline/Trợ lý JD đã hoạt động; intent cho `listId`, `candidateId` và luồng sang Ứng viên/Nhân sự chưa được triển khai đầy đủ.
- Full verification gate chưa xanh vì bốn lỗi môi trường/cấu hình đã ghi tại mục 0.2.

### 0.4. Điểm bắt đầu cho phiên tiếp theo

1. Giữ nguyên toàn bộ worktree đang có; không reset hoặc ghi đè các thay đổi chưa commit.
2. Không commit/push nếu người dùng chưa yêu cầu.
3. Trang **Vị trí tuyển dụng** đã hoàn tất và đã nghiệm thu. Theo thứ tự tại mục 8, màn hình tiếp theo là **Pipeline / Sàng lọc CV**, trừ khi người dùng chỉ định màn hình khác.
4. Đọc lại ui-ux-preview và tài liệu privos-dev-docs cho feature chuẩn bị sửa; giữ nguyên service/repository và luồng nghiệp vụ đang chạy.
5. Tái sử dụng Studio Shell, token, primitive, navigation intent và cơ chế preload hiện có; không làm mất contract chọn sẵn JD từ trang Vị trí tuyển dụng.
6. Sau khi hoàn tất một trang, chạy test/typecheck/build phù hợp, triển khai để người dùng kiểm tra và dừng chờ xác nhận trước khi sang trang tiếp theo.

## 1. Mục tiêu

Chuyển giao diện hiện tại sang ngôn ngữ thiết kế A · Studio trong `ui-ux-preview`, đồng thời giữ nguyên các luồng nghiệp vụ đang hoạt động của CV Matcher. Bản production dùng dữ liệu và API thật của PrivOS; không đưa dữ liệu giả hoặc công cụ điều khiển prototype vào ứng dụng.

Thành công được xác định khi:

- Toàn bộ màn hình dùng chung Studio Shell và hệ thống component nhất quán.
- Các chức năng hiện tại vẫn hoạt động với dữ liệu thật, quyền thật và luồng cũ.
- Các chức năng hữu ích trong preview được bổ sung khi có API hoặc có thể triển khai đúng trên mô hình hiện tại.
- Tab `CV đã chấm` được đổi thành `Ứng viên` và chỉ hiển thị một Kanban theo đợt tuyển dụng đang chọn.
- Ứng dụng hỗ trợ Light, Dark và Brand theme.
- Mỗi trang được triển khai, kiểm thử và giao người dùng nghiệm thu trước khi bắt đầu trang tiếp theo.

## 2. Ràng buộc và ngoài phạm vi

### Ràng buộc

- Ứng dụng tiếp tục chạy trong iframe PrivOS và lấy `roomName`, `username`, `userRoles`, theme và các token từ context thật.
- Các repository/service hiện có cho lists, items, files, email, payroll và lifecycle được giữ lại. Chỉ thêm adapter hoặc tách module khi giao diện mới thực sự cần.
- Quyền truy cập tiếp tục được PrivOS/backend thực thi. UI không tự coi việc ẩn nút là cơ chế bảo mật.
- Không thay đổi `privos-app.json`, schema dữ liệu hay permission nếu một trang chỉ cần thay đổi giao diện.
- Thay đổi manifest hoặc permission chỉ được thực hiện khi một chức năng đã duyệt thật sự cần, có call site thật và có cập nhật `SCOPES.md`.

### Ngoài phạm vi

- Thanh PROTOTYPE, bộ chọn A/B/C, persona, scenario, guide và reset của preview.
- Dữ liệu Aster Studio, tên người dùng, ngày tháng hoặc số liệu hard-code trong preview.
- Nút hoặc chức năng giả không có API và không có hành vi production hợp lệ.
- Viết lại toàn bộ service nghiệp vụ hoặc chuyển wholesale sang API khác khi API hiện tại vẫn đáp ứng đúng.
- Hoàn thiện Microsoft Email; trong đợt này nó vẫn ở trạng thái “sắp ra mắt”.

## 3. Phương án kiến trúc

Chọn phương án **Studio Shell dùng chung + cải tiến từng màn hình**.

### 3.1. Studio Shell

Studio Shell chịu trách nhiệm cho:

- Sidebar điều hướng theo nhóm chức năng.
- Topbar hiển thị context thật của phòng và người dùng.
- Vùng nội dung responsive trong iframe.
- Theme controller và semantic design tokens.
- Các primitive dùng chung: page header, card, metric, badge, button, form control, table/list, modal/drawer, empty state, skeleton, toast và inline error.

Feature screen không tự dựng lại shell, không dùng palette riêng và không đọc trực tiếp dữ liệu prototype.

### 3.2. Feature screens

Mỗi tab hiện tại trở thành một feature screen độc lập nằm trong Studio Shell. Screen giữ quyền sở hữu state và thao tác nghiệp vụ của chính nó, nhưng sử dụng component chung cho phần trình bày.

Các file đang quá lớn chỉ được tách theo ranh giới có ý nghĩa, ví dụ controller/data hook, presentational view và dialog. Không thực hiện refactor không liên quan.

### 3.3. Điều hướng liên màn hình

Ứng dụng có một navigation state dùng chung thay cho việc để feature gọi trực tiếp lẫn nhau. Một navigation intent gồm màn hình đích và các định danh tùy chọn như `listId`, `candidateId` hoặc `jdId`.

Ví dụ:

- Tuyển dụng/Pipeline mở trang Ứng viên với đúng `listId`.
- Chi tiết ứng viên mở luồng tạo hồ sơ nhân sự với `candidateId` và dữ liệu nguồn cần thiết.
- Tuyển dụng mở Trợ lý JD với `jdId` tương ứng.

Nếu định danh không còn tồn tại hoặc người dùng không có quyền, màn hình đích hiển thị lỗi có thể xử lý và quay về trạng thái hợp lệ gần nhất.

Trạng thái triển khai ngày 2026-10-08: `StudioNavigationIntent` đã có `sequence`, `target` và định danh JD `{ fileId, fileName }`. Luồng từ `Vị trí tuyển dụng` sang `Sàng lọc CV` và `Trợ lý JD` đã resolve theo file id trước, chọn sẵn đúng JD và tránh xử lý lặp cùng một intent. Các định danh `listId`/`candidateId` trong thiết kế tổng thể vẫn là phần việc của các màn hình sau.

Không thêm URL router chỉ để phục vụ việc đổi tab trong iframe. Có thể cân nhắc router sau nếu xuất hiện yêu cầu deep-link độc lập.

### 3.4. Lớp dữ liệu

- Component chỉ gọi qua service/repository hiện có hoặc adapter có interface rõ ràng.
- UI mapping không được trộn vào gateway gọi PrivOS.
- Danh sách và item tiếp tục là đơn vị dữ liệu room-scoped theo mô hình PrivOS.
- Mỗi list `SCREENING` là một đơn vị tuyển dụng độc lập; không gộp item giữa các list.
- Việc đọc có phân trang tiếp tục gom đủ trang theo quy tắc hiện có. Cursor không được tái sử dụng sau mutation.

## 4. Theme và design tokens

### 4.1. Các chế độ

Ứng dụng hỗ trợ ba lựa chọn trực tiếp:

- **Light:** semantic tokens được dẫn xuất từ token sáng của PrivOS.
- **Dark:** semantic tokens được dẫn xuất từ token tối của PrivOS.
- **Brand:** palette A · Studio áp dụng đồng bộ cho shell, surface, control, badge, Kanban, editor, chart và trạng thái tương tác.

`ThemeMode` gồm `auto | light | dark | brand`. Khi người dùng chưa chọn thủ công, `auto` resolve theo theme do host PrivOS cung cấp. Khi người dùng chọn Light, Dark hoặc Brand, lựa chọn được lưu cục bộ và được ưu tiên ở những lần mở sau. Lựa chọn Auto xóa override để quay lại theme của host; Auto không phải một visual theme thứ tư.

Studio ThemeProvider đặt `data-studio-theme` trên root của Studio Shell thay vì tranh quyền sở hữu `data-theme` trên `<html>` với `PrivosAppProvider`. Giá trị resolve là `light | dark | brand`; việc đổi giá trị không remount feature screen.

### 4.2. Token contract

Component chỉ dùng semantic token, tối thiểu gồm:

- page background, elevated surface và inset surface;
- primary/secondary/muted text;
- border/divider/focus ring;
- primary action và foreground;
- success, warning, danger và info;
- overlay, shadow và drag/drop highlight.

Ở Auto, Light/Dark lấy các outer-surface token từ `--base-*` mà `PrivosAppProvider` cung cấp, có fallback an toàn. Khi người dùng ép Light hoặc Dark, Studio Shell dùng bộ semantic token cục bộ tương ứng để kết quả không phụ thuộc host đang ở mode nào. Brand dùng bộ semantic token A · Studio riêng. Cả ba bộ override tại root theme; feature screen không hard-code palette riêng.

Tất cả text/control phải có độ tương phản đọc được; focus state không chỉ dựa vào màu. Theme switch không làm mất state nghiệp vụ hoặc reload dữ liệu.

## 5. Thiết kế trang Ứng viên

### 5.1. Mô hình đợt tuyển dụng

- Mỗi list có type `SCREENING` tương ứng một đợt tuyển dụng.
- Selector chỉ liệt kê các list người dùng có quyền đọc.
- Thứ tự là thời điểm tạo giảm dần, dùng `createdAt` trước rồi `created_at`.
- Không dùng `updatedAt`/`updated_at` làm fallback hay tie-breaker.
- List không có thời điểm tạo hợp lệ nằm cuối.
- Khi hai list có cùng timestamp, dùng `_id` làm tie-breaker ổn định; điều này chỉ bảo đảm thứ tự không nhảy và không thay đổi ý nghĩa “mới nhất theo thời điểm tạo”.

### 5.2. Quy tắc chọn đợt

- Lần đầu mở trang trong một phiên app: chọn list mới nhất.
- Khi chuyển sang tab khác rồi quay lại: giữ `selectedListId` hiện tại.
- Navigation intent có `listId` hợp lệ được ưu tiên và mở đúng đợt đó.
- Khi phát hiện list mới: cập nhật selector nhưng không tự đổi đợt người dùng đang xem.
- Khi list đang chọn bị xóa hoặc mất quyền: chọn list mới nhất còn hợp lệ.
- Khi không còn list: hiển thị empty state và không chạy polling item.

### 5.3. Tải và polling

- Truy vấn metadata list được dùng để dựng selector và phát hiện list mới/bị xóa.
- Chỉ list đang chọn được tải đầy đủ stages, custom fields và items.
- Polling đầy đủ chỉ chạy cho list đang chọn, theo cadence hiện tại trừ khi kiểm thử hiệu năng cho thấy cần thay đổi.
- Khi đổi đợt, kết quả request/poll cũ phải bị hủy hoặc bỏ qua bằng request generation/list identity guard.
- Polling nền không bật lại global loading và không ghi đè mutation mới hơn đang chờ xác nhận.
- Mutation thành công phải làm mất hiệu lực snapshot/cursor cũ trước lần đọc tiếp theo.

### 5.4. Hiển thị và thao tác

- Mỗi thời điểm chỉ có một Kanban hoặc list view của đợt đang chọn.
- Các cột lấy từ stage của đúng list đó.
- Metrics, tìm kiếm, lọc và tổng số chỉ tính trên item của list đang chọn.
- Kéo thả cập nhật `stageId` trên đúng list/item; UI cập nhật lạc quan, rollback nếu server từ chối.
- Chi tiết ứng viên giữ các hành động hiện tại như gửi thư mời và tạo hồ sơ nhân sự, nhưng luôn dùng item/list identity thật.
- Không merge card, stage hoặc metric từ nhiều list.

## 6. Phạm vi từng trang

### 6.1. Studio Shell + Công ty

- Xây shell, navigation, context header và theme controller.
- Trình bày thư viện tài liệu của phòng theo Studio.
- Giữ/tích hợp tìm kiếm, xem, tải xuống và tải lên bằng file API hiện có.
- Hỗ trợ loading, empty, permission error và upload error.

### 6.2. Tuyển dụng

**Trạng thái:** giao diện và các luồng hiện có của trang đã hoàn thành redesign, được người dùng nghiệm thu ngày 2026-10-08; xem chi tiết triển khai tại mục 0.1. Context sang Ứng viên vẫn đi cùng giai đoạn triển khai màn hình Ứng viên.

- Metrics tổng quan, tìm kiếm và lọc theo phòng ban.
- Danh sách vị trí/JD; tạo và chỉnh sửa theo luồng hiện có.
- Điều hướng có JD context sang Pipeline và Trợ lý JD đã hoàn thành; context sang Ứng viên sẽ bổ sung cùng màn hình Ứng viên.

### 6.3. Pipeline

- Giữ nguyên luồng ingest/phân tích/chấm điểm hiện tại.
- Trình bày lại tiến độ, bước đang chạy, kết quả và lỗi.
- “Dừng sau tác vụ hiện tại” đặt cờ dừng và chỉ dừng tại ranh giới tác vụ an toàn; không hủy giữa một write đang thực hiện và không để trạng thái nửa chừng.

### 6.4. Ứng viên

- Đổi nhãn `CV đã chấm` thành `Ứng viên` trên navigation, header và text liên quan.
- Thực hiện toàn bộ thiết kế tại mục 5.
- Bổ sung list view, search/filter, metrics và detail layout từ preview bằng dữ liệu thật.

### 6.5. Trợ lý JD

- Giữ chat và thư viện JD hiện có.
- Dùng bố cục hai vùng thư viện/nội dung.
- Hỗ trợ xem trước, chỉnh sửa và tải xuống Markdown theo dữ liệu thật.

### 6.6. Nhân sự / Vòng đời nhân sự

- Giữ board/list, tạo nhân sự từ ứng viên, chỉnh sửa hồ sơ, gửi email và tải nguồn.
- Bổ sung metrics và Studio layout.
- Không làm yếu các guard dữ liệu hiện có quanh hồ sơ nghỉ việc hoặc lifecycle.

### 6.7. Bảng lương

- Giữ nguyên công thức, nguồn dữ liệu và logic loại trừ hiện có.
- Giữ hành vi ẩn/unmount đối với người dùng không có role phù hợp.
- Chỉ đổi bố cục, control và cách trình bày kết quả.

### 6.8. Email

- Giữ Google OAuth, room-scoped connection, template, lịch sử và gửi mail thật.
- Giữ Gmail Profile fallback vừa được bổ sung cho trường hợp UserInfo trả 401/403.
- Microsoft hiển thị “sắp ra mắt”, không dựng luồng gửi giả.
- Lỗi kết nối, hết phiên và lỗi gửi phải giữ nội dung form để người dùng thử lại.

### 6.9. Soạn thảo

- Giữ luồng tạo nội dung, chỉnh sửa và xuất dữ liệu.
- Dùng editor toolbar, preview và action của Studio Shell.
- Không thay đổi format đầu ra nếu người dùng không yêu cầu.

## 7. Loading, error và mutation behavior

- Tải lần đầu dùng skeleton hoặc loading cục bộ; không khóa toàn app.
- Empty state mô tả nguyên nhân và chỉ đưa ra action thật sự dùng được.
- Lỗi đọc hiển thị inline tại khu vực lỗi, có retry.
- Thành công/thất bại của mutation dùng toast nhất quán; không dùng browser alert.
- Khi submit, disable action trùng lặp nhưng giữ dữ liệu người dùng nếu request lỗi.
- Tạo/sửa/xóa/gửi mail chỉ được coi là thành công sau xác nhận server.
- Kanban drag/drop được phép optimistic vì có vị trí cũ rõ ràng để rollback.
- Permission error phải phân biệt với empty state và lỗi mạng.
- Background polling không gây nhấp nháy loading và không ghi đè dữ liệu mới hơn.

## 8. Trình tự triển khai và cổng nghiệm thu

Thứ tự triển khai:

Trạng thái ngày 2026-10-08: bước 1 và 2 đã hoàn thành, đã triển khai và được người dùng nghiệm thu; bước 3 là điểm tiếp tục mặc định.

1. Studio Shell + Công ty.
2. Tuyển dụng.
3. Pipeline.
4. Ứng viên.
5. Trợ lý JD.
6. Nhân sự / Vòng đời nhân sự.
7. Bảng lương.
8. Email.
9. Soạn thảo.

Sau mỗi trang:

1. Hoàn thiện code và test trong phạm vi trang đó.
2. Chạy kiểm tra tự động và smoke test phù hợp.
3. Kiểm tra Light, Dark và Brand ở kích thước iframe rộng/hẹp.
4. Kiểm tra hồi quy các trang đã duyệt nếu component chung thay đổi.
5. Báo người dùng danh sách thay đổi, kết quả kiểm thử, giới hạn API và các bước kiểm tra thủ công.
6. Dừng lại chờ người dùng xác nhận.
7. Chỉ bắt đầu trang tiếp theo sau khi có xác nhận.

Nếu thay đổi component chung ở giai đoạn sau làm thay đổi thấy được một trang đã duyệt, trang đó phải được nêu rõ trong báo cáo hồi quy và yêu cầu kiểm tra lại khi cần.

## 9. Chiến lược kiểm thử

### 9.1. Test theo lớp

- Unit test cho token/theme resolution, selector state, sort, mapping và diff thuần.
- Component/behavior test cho navigation intent, loading/error/empty và mutation feedback.
- Service/repository test giữ nguyên contract PrivOS, paging, email và payroll hiện có.
- Regression test cho các luồng đã có trước redesign.

### 9.2. Test bắt buộc cho Ứng viên

- Sort giảm dần bằng creation time; thay đổi update time không đổi thứ tự.
- Timestamp thiếu/không hợp lệ nằm cuối; tie-break ổn định.
- First open chọn newest; tab round-trip giữ selection.
- Navigation intent mở đúng list.
- List mới không cướp selection.
- List đang chọn bị xóa dẫn tới fallback hợp lệ.
- Chỉ selected list được tải đầy đủ và polling.
- Metrics/search/filter không nhìn thấy item của list khác.
- Kết quả poll cũ bị bỏ qua sau khi đổi list.
- Optimistic stage move rollback khi update lỗi.
- Poll không ghi đè state mutation mới hơn.

### 9.3. Gate tự động và thủ công

Trước mỗi lần bàn giao trang, chạy các test liên quan và các gate phù hợp của repository, tối thiểu gồm typecheck/test/build/preflight khi phạm vi thay đổi yêu cầu full verification. Trước khi coi toàn bộ redesign hoàn tất, chạy full gate:

```text
npm run typecheck:strict-unused
npm test
npm run build
npm run preflight
```

Kiểm tra thủ công trên PrivOS/Hub là bắt buộc cho các luồng phụ thuộc context, role, file, OAuth, email, drag/drop và polling mà test local không thể chứng minh đầy đủ.

## 10. Tiêu chí hoàn thành toàn bộ

- Tất cả trang đã được người dùng nghiệm thu theo đúng thứ tự và cổng dừng.
- Light, Dark và Brand hoạt động nhất quán trên mọi trang.
- `Ứng viên` chỉ hiển thị một đợt, newest được xác định bằng creation time.
- Không có prototype control hoặc mock data trong production UI.
- Các luồng hiện tại, phân quyền và degraded behavior vẫn hoạt động.
- Full verification gate đạt và các giới hạn còn lại được ghi rõ trong bàn giao cuối.
