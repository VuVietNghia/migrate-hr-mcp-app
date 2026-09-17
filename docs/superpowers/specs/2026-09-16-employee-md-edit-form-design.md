# Form sửa hồ sơ nhân sự từ file Markdown — Design

Ngày: 2026-09-16
Trạng thái: đã duyệt, sẵn sàng viết plan

## Mục tiêu

Ở tab Hồ sơ nhân sự (Lifecycle), thêm một form đọc dữ liệu từ file Markdown đã được
link với item trong list, cho người dùng sửa, rồi ghi ngược lại file đó và đồng bộ
lại thẻ trên bảng Kanban.

## Bối cảnh — luồng đang có

`CreateDetailedProfileForm.tsx:214-248` render `src/ui/data/employee_template.md`
bằng 21 lệnh `String.replace` rồi ghi file qua `createOrUpdateFile` vào
`hr-miniapp/employees/<safeDept>/<safeName>/<YYYY-MM-DD>_PROFILE_<safeName>.md`.
File object trả về được gắn vào item theo hai đường song song:

- custom field kiểu `DOCUMENT` (`PrivOSLifecycleService.ts:96-102`)
- chuỗi `[fileId:...]` hoặc `[fileUrl:...]` trong `description` (`:114-118`)

Đường đọc ngược đã có sẵn: `mapItemToProfile` bóc `attachedFileObj` từ custom field
(`:497-499`) và `attachedFileId` / `attachedFileUrl` từ description (`:410-418`).

Nên phần "tìm file từ item" **không cần code mới**.

## Ba quyết định của người dùng

1. **Phạm vi ghi:** ghi đè file MD **và** đồng bộ ngược vào item
   (`mcpapp.lists.updateItem`), để thẻ Kanban và MD không lệch nhau.
2. **Nội dung lạ trong MD:** render lại **toàn bộ** từ template. Mọi nội dung người
   dùng tự thêm tay vào file sẽ mất khi bấm lưu. Đây là lựa chọn có ý thức, đổi lấy
   code ngắn và đảm bảo form tạo với form sửa luôn sinh ra cùng một định dạng.
3. **Trường sửa được:** toàn bộ các trường của template.

## Mô hình dữ liệu

`EmployeeMdDocument` — 23 khoá, tương ứng 23 placeholder trong template:

| Nhóm | Khoá |
|---|---|
| Chỉ đọc, giữ nguyên từ file gốc | `localId`, `createDate` |
| Sửa được (20) | `fullName`, `position`, `department`, `startDate`, `phone`, `email`, `telegram`, `emergency`, `dob`, `idNumber`, `idDate`, `idPlace`, `permAddress`, `curAddress`, `bankAccount`, `bankName`, `taxCode`, `socialInsurance`, `vehicleType`, `vehiclePlate` |
| Mang theo nguyên văn, không hiện trên form | `imageLink` |

`momoWallet` trong form tạo **không** có trong template nên không có trong model và
không lên form sửa — nó là trường chết sẵn có, không thuộc phạm vi thay đổi này.

## Luồng

```
ProfileCard / ProfileListView  ─[nút Sửa]→  EditProfileModal
                                                │
  resolveEmployeeMdFileRef(profile) ────────────┤ 1. item → tham chiếu file
  readEmployeeMdText(app, ref) ─────────────────┤ 2. đọc text
  parseEmployeeMd(text) ────────────────────────┤ 3. text → doc + nhãn thiếu
                                                │ 4. người dùng sửa
  renderEmployeeMd(doc, template) ──────────────┤ 5. doc → text
  saveEmployeeMd({ ... }) ──────────────────────┘ 6. ghi file, rồi đồng bộ item
```

Bước 6 xong thì polling 3 giây của `LifecycleDashboard` tự kéo giá trị mới về.
**Không sửa `LifecycleDashboard.tsx`** — file đó nằm trong danh sách tránh đụng vì
đang có thành viên khác làm.

## Đường ghi file

Chính: `POST file-management.files/:fileId/update-content` với body JSON
`{ content }` (`privos-dev-docs/file-management/file-management-api.md:370-394`).
Endpoint này sinh ra đúng cho "text file content (markdown, code files)", nhận
fileId nên không phải giải quyết thư mục, không phải encode base64, không phải xử
lý xung đột trùng tên, và giữ `_id` theo thiết kế.

Dự phòng: `app.uploadFile` + `duplicateAction: 'replace'`. Từ 2026-05-13 `replace`
là upsert tại chỗ theo khoá `(channel_id, file_path)` và **giữ nguyên `_id`**
(`privos-dev-docs/file-management/stable-file-id-and-replace-semantics.md:18-38`);
chỉ `DELETE` tường minh mới đổi `_id`.

Lý do cần dự phòng: allowlist REST mô tả `files:write` map tới
`POST file-management.files.*` (`auth-and-rest-integration.md:45-46`), khớp theo
path-prefix, mà path `update-content` dùng gạch chéo chứ không phải dấu chấm. Code
hiện tại đã gọi được `GET file-management.files/${fileId}/content`
(`privos-rest.ts:108`) nên dạng gạch chéo qua được bridge, nhưng đó là `files:read`.
Chưa xác nhận được `files:write`, nên thử đường chính trước, hỏng thì tụt về.

**Điều kiện bắt buộc của nhánh dự phòng:** chỉ chạy khi biết cả `folderId` lẫn
`fileName` gốc. Thiếu `folderId` thì `replace` khớp sai khoá và đẻ ra file thứ hai
ở thư mục gốc thay vì ghi đè — thà báo lỗi.

File Object của Hub dùng **`folder_id`** snake_case, không phải `folderId`
(`file-management-api.md:37`). Đọc `folder_id` trước, `folderId` sau.

## Đường đồng bộ item

`mcpapp.lists.updateItem` (`tools_lists.md:421-442`).

- `customFields`: tài liệu chỉ ghi "New custom field values"
  (`privos-dev-docs/room-scoped-apis/items.md:213`), không nói merge hay replace.
  Luôn gửi **mảng đầy đủ** dựng từ toàn bộ `fieldDefinitions` — an toàn với cả hai
  ngữ nghĩa, khỏi phải đoán.
- `description` bị thay nguyên khối, nên phải dựng lại đủ `[sourceCandidateId:...]`
  và `[fileId:...]`.
- **Cấm** dùng `PUT /api/v1/internal/rooms/:roomId/items/:itemId/customFields` —
  route internal service-key bỏ qua ACL theo từng người dùng
  (`APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:76-77`, `:171-172`).

## Thứ tự ghi và thất bại từng phần

Bắt buộc **file trước, item sau**. Hỏng ở bước item thì thứ người dùng vừa gõ đã
an toàn trong file, chỉ thẻ Kanban là cũ — báo đúng "đã lưu file, chưa cập nhật
được thẻ", không báo lỗi chung chung. Ngược thứ tự thì tệ hơn nhiều.

## Danh mục lỗi

### Mở modal, xác định file

| Mã | Tình huống | Xử lý |
|---|---|---|
| E1 | Hồ sơ không có file đính kèm | Nút "Sửa" bị khoá, không mở form trống |
| E2 | `_id` lưu trong item thật ra là id của folder | Hub trả `{success:false, error:"File not found", hint:"id matches a folder, not a file"}` (`stable-file-id-and-replace-semantics.md:90-102`). **Nhưng `restCall` chỉ lấy `body.error` và bỏ `hint`**, mà `privos-rest.ts` là file cấm đụng — nên qua `app.rest` không tách được E2 khỏi E3. Gộp hai nguyên nhân vào một câu thay vì đoán bừa |
| E3 | File đã bị xoá khỏi Room | `error-file-not-found` (`file-management-api.md:1038`); gộp cùng E2, báo file đã mất hoặc id trỏ nhầm thư mục, không tự tạo lại |

### Đọc nội dung

| Mã | Tình huống | Xử lý |
|---|---|---|
| E4 | 403 khi đọc | `restCall` biến MỌI 403 thành `OptionalFeatureUnavailableError` ("quyền tuỳ chọn chưa được cấp"). Nhưng `files:read` trong manifest là `required` (`privos-app.json:42-47`), nên 403 ở đây là từ chối ACL phòng, không phải thiếu scope. Bắt buộc dùng `describeFeatureError`, **không** dùng `safeFeatureError` (bẫy này được ghi ngay trong docstring `privos-rest.ts:43-50`) |
| E5 | Bridge postMessage hết giờ | `app.rest()` mặc định 10 giây (`react-sdk-reference.md:89`); `getFileTextById` đã truyền 15000 nên override đúng, giữ nguyên |
| E6 | `downloadUrl` trỏ host MinIO không tới được | `readRoomFileText` đã chặn ở 8 giây, không cần thêm |

### Parse

| Mã | Tình huống | Xử lý |
|---|---|---|
| E7 | File không có H1 `# HỒ SƠ NHÂN SỰ` | **Từ chối mở form.** Vì render lại toàn bộ, mở form trống rồi lưu là xoá sạch file |
| E8 | Có H1 nhưng thiếu một số nhãn | Mở form, hiện banner liệt kê đúng tên những trường không đọc được, vì lưu sẽ ghi rỗng vào đó |

### Ghi file

| Mã | Tình huống | Xử lý |
|---|---|---|
| E9 | `update-content` hỏng (403 allowlist hoặc ACL) | Tụt về `uploadFile` + `replace`; chỉ báo hỏng khi cả hai cùng hỏng |
| E10 | Nhánh dự phòng không biết `folderId` / `fileName` | **Không upload**, ném lỗi |
| E11 | `error-quota-exceeded` | Bảng tra mã lỗi Hub → câu tiếng Việt trong `describeFileError`; người dùng phải dọn file |
| E12 | `error-rate-limited` | Cùng bảng tra đó, câu riêng, cho bấm lưu lại |
| E13 | Agent AI trong phòng push đè lên file | `sync-deletion-recovery.md:18-35`. Không sửa được từ phía app — ghi nhận là trần của hệ thống |

### Đồng bộ item

| Mã | Tình huống | Xử lý |
|---|---|---|
| E14 | Ngữ nghĩa `customFields` không rõ | Gửi mảng đầy đủ |
| E15 | `description` bị thay nguyên khối | Dựng lại đủ marker |
| E16 | File ghi xong, `updateItem` hỏng | Trả trạng thái riêng `saved-item-stale`, không coi là thất bại |

## Chi tiết parse

Template dùng **CRLF**, nên tách dòng bằng `/\r?\n/`.

Trường đơn: tìm `**<Nhãn>:**` trong dòng, lấy phần còn lại, bỏ đúng **một** khoảng
trắng đầu, rồi `trim()`.

Ba dòng ghép cần xử lý riêng:

- `**Số CMND/CCCD:** X (Cấp ngày: Y tại Z)` — regex
  `/^(.*?)\s*\(Cấp ngày:\s*(.*?)\s*tại\s*(.*)\)$/`. Nhóm cuối tham lam để `Z` chứa
  được dấu `)`.
- `**Phương tiện đi lại:** X (Biển số: Y)` — regex
  `/^(.*?)\s*\(Biển số:\s*(.*)\)$/`.
- `**Số tài khoản NH:** X - Y` — tách ở ` - ` **đầu tiên** bằng `indexOf`, trên
  chuỗi đã bỏ đúng một khoảng trắng đầu nhưng **chưa** `trim()`. `trim()` trước sẽ
  làm hỏng trường hợp cả hai đều rỗng (` - ` thành `-`, mất dấu tách). Tách ở lần
  xuất hiện đầu là đúng vì số tài khoản không chứa gạch, còn tên ngân hàng thì có
  ("Techcombank - Chi nhánh Q1").

`[IMAGE_LINK]` nằm ở dòng ngay sau `*Ảnh chụp giấy tờ/Chân dung (nếu có):*`.

## Chi tiết render

Thay placeholder bằng **replacer function** (`text.replace(token, () => value)`),
không truyền chuỗi trực tiếp. `String.replace` với chuỗi thay thế sẽ diễn giải
`$&`, `$1`... thành pattern — một địa chỉ hay tên chứa `$` sẽ bị biến dạng. Lỗi
này đang tồn tại sẵn ở form tạo và được sửa luôn khi form tạo chuyển sang dùng
renderer chung.

## Kiểm thử

Repo **không có** React Testing Library trong `devDependencies`, nên không viết
được test cho component. Vì vậy mọi logic có thể sai đều được đẩy xuống module
thuần hoặc module service để test được:

- `employee-md-document.ts`: round-trip, thiếu H1, thiếu nhãn, dòng ghép, giá trị
  chứa `$&`, giá trị rỗng.
- `employee-md-file.ts`: phân giải tham chiếu, `folder_id` snake_case, đường ghi
  chính, tụt về dự phòng, chặn khi thiếu `folderId`.
- `employee-md-save.ts`: thứ tự ghi, trạng thái `saved-item-stale`.
- `PrivOSLifecycleService.updateProfileFields`: mảng customFields đầy đủ,
  description dựng lại đủ marker.

`EditProfileModal.tsx` chỉ còn phần ráp UI, được typecheck bảo vệ.

## Ngoài phạm vi

- Hai người sửa cùng lúc: last-write-wins, không phát hiện xung đột.
- Đổi tên hoặc phòng ban không di chuyển file MD sang thư mục mới; file ở lại chỗ
  cũ, item vẫn link đúng.
- Không đụng `MarkdownViewerModal.tsx` (không ai import) và `CreateProfileForm.tsx`
  (không ai import). Xoá chúng là task dọn dẹp riêng.
- Không đụng `LifecycleDashboard.tsx` và `privos-rest.ts`.

## Hai rủi ro đã phát hiện, không thuộc phạm vi này

1. **File MD đang là dữ liệu công khai trong phòng.**
   `PrivOSLifecycleService.createNewList` (`:310-319`) tạo list không có
   `isolatedList: true`, và file nằm trong thư mục channel-public. Nội dung gồm số
   CCCD, ngày cấp, địa chỉ thường trú, số tài khoản ngân hàng, mã số thuế, số BHXH.
   Hiện mọi thành viên phòng đã đọc được; thêm nút Sửa thì mọi thành viên phòng
   cũng ghi được. Cơ chế của nền tảng cho bài toán này là isolated list +
   `additionalEditors` (`APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:30-50`).

2. **Quả mìn cho phần Tier 2 vừa fix.**
   Trên isolated list, `getItems` trả tập đã lọc theo ACL của người đọc — "a shorter
   list is correct, not an error" (`APP_AUTHORIZATION_WITH_ISOLATED_LISTS.md:140-142`).
   `fetchAllListItems` đang đối chiếu số item đọc được với `total` của Hub rồi đọc
   lại 3 lượt và ném lỗi khi lệch. Hôm nay không nổ vì các list đều không isolated,
   nhưng nếu bật `isolatedList: true` theo đề xuất ở điểm 1 thì nổ ngay.
