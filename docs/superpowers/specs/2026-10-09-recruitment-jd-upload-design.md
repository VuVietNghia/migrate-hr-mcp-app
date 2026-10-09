# Thiết kế tải JD có phòng ban trong Studio Tuyển dụng

**Ngày:** 2026-10-09  
**Trạng thái:** Đã triển khai, kiểm thử và dựng lại Docker; người dùng đã smoke-test các luồng chính  
**Cập nhật gần nhất:** 2026-10-09  
**Phạm vi:** Tab `Vị trí tuyển dụng`, nút thêm JD trong tab `Sàng lọc CV` và ánh xạ phòng ban của JD tải lên sang tab `Ứng viên`

## 0. Trạng thái triển khai và handoff

### 0.1. Phần đã hoàn thành theo spec gốc

- [x] Header `Vị trí tuyển dụng` có ba action compact theo đúng thứ tự `Phòng ban`, `Tải JD`, `Tạo JD thủ công`.
- [x] Modal upload hỗ trợ kéo thả/chọn đúng một file `.md`, `.docx` hoặc `.pdf`, bắt buộc chọn phòng ban và chặn file rỗng/sai định dạng.
- [x] File được upload vào `Room Files/hr-miniapp/jds`; metadata `{ roomId, fileId, fileName, departmentKey, source, createdAt }` được lưu trong App Database collection `hr_recruitment_job_files`.
- [x] Luồng retry khi file đã upload nhưng metadata lỗi chỉ ghi lại metadata, không upload file lần hai.
- [x] Danh sách tuyển dụng ghép JD structured và uploaded bằng discriminated union, resolve nhãn phòng ban hiện tại từ `departmentKey`, bỏ qua metadata stale và không tự đoán phòng ban cho file cũ.
- [x] Thẻ JD uploaded chỉ hiển thị phòng ban, tên file, định dạng, ghi chú nguồn và action xem chi tiết; không giả lập mô tả/lương/địa điểm/hình thức.
- [x] Modal uploaded JD dùng chung preview Markdown/DOCX/PDF với Pipeline, đọc qua authenticated PrivOS APIs, có action đúng theo từng định dạng.
- [x] Nút upload trực tiếp trong `Sàng lọc CV` đã được thay bằng nút compact `Thêm JD`, điều hướng sang `Vị trí tuyển dụng`; luồng upload CV giữ nguyên.

### 0.2. Các bổ sung đã hoàn thành sau spec gốc

- [x] Thẻ JD uploaded hiển thị thêm dòng `JD được người dùng tải lên từ máy`.
- [x] Tab `Ứng viên` đọc `hr_recruitment_job_files` và `hr_recruitment_departments` để hiển thị đúng phòng ban cho kết quả sàng lọc bằng JD `.pdf`, `.docx` và `.md` do người dùng tải lên.
- [x] Tên vị trí và tên list `SCREENING_*` dùng chung một bộ chuẩn hóa tên file, nên dữ liệu sàng lọc hiện có nhận được phòng ban sau khi reload, không cần sàng lọc lại.
- [x] Modal preview JD uploaded dùng layout ba hàng cố định (header / nội dung / actions); chỉ vùng Markdown/DOCX/PDF cuộn nên tài liệu DOCX không còn tràn hoặc bị footer che.

### 0.3. Module thực tế đã triển khai

- `src/ui/recruitment/recruitment-uploaded-jobs.ts`: model, validation, merge, format và chuẩn hóa identity sàng lọc.
- `src/ui/recruitment/recruitment-job-file-repository.ts`: repository App Database cho `hr_recruitment_job_files`.
- `src/ui/recruitment/recruitment-job-upload.ts`: orchestration upload và retry metadata.
- `src/ui/recruitment/RecruitmentJobUploadDialog.tsx`: modal kéo thả/chọn file và phòng ban.
- `src/ui/recruitment/RecruitmentUploadedJobDialog.tsx`: modal chi tiết JD uploaded.
- `src/ui/jd-document/JDDocumentPreview.tsx`: preview dùng chung cho Markdown, DOCX và PDF.
- `src/ui/cv-scored/candidate-recruitment-jobs.ts`: nạp và ánh xạ phòng ban JD uploaded sang tab `Ứng viên`.

### 0.4. Bằng chứng kiểm thử gần nhất

- Các test focused cho upload/repository/card/dialog/preview/navigation, mapping phòng ban ứng viên và containment của modal đều pass.
- `npm run typecheck:strict-unused`: pass.
- `npm run build` và manifest lint: pass.
- Image `privos-mcp-app-demo:local` đã được build lại; service `hr-app` ở trạng thái `healthy`; `/health` và `/ready` trả HTTP 200.
- Full `npm test` không có lỗi mới từ phạm vi này. Còn 4 lỗi nền đã biết: 2 lỗi identity/package trong `tests/manifest.spec.ts` và 2 lỗi `tests/packaging.spec.ts` do môi trường WSL không có `/bin/bash`.

### 0.5. Handoff cho các phiên chat sau

- Không còn hạng mục implementation đang mở trong phạm vi đã duyệt của spec này.
- Không viết lại metadata vào file nhị phân, không tạo sidecar và không suy đoán phòng ban từ tên/nội dung file.
- Migration cho file upload cũ chưa có metadata, chức năng xóa JD và cleanup metadata stale vẫn nằm ngoài phạm vi; chỉ triển khai nếu người dùng duyệt yêu cầu mới.
- Worktree đang chứa nhiều thay đổi đã được người dùng duyệt từ các hạng mục Studio khác; không reset hoặc ghi đè các thay đổi không liên quan.

## 1. Mục tiêu

Bổ sung một luồng tập trung để người dùng tải JD từ máy lên Room, bắt buộc gắn JD với một phòng ban và xem đúng nội dung gốc của file. Giữ nguyên luồng tạo JD thủ công, sử dụng JD để sàng lọc CV, chỉnh JD Markdown với AI và các chức năng đã hoạt động.

Kết quả mong muốn:

- Header `Vị trí tuyển dụng` có ba nút nhỏ gọn theo thứ tự `Phòng ban`, `Tải JD`, `Tạo JD thủ công`.
- `Tải JD` nhận đúng một file `.md`, `.docx` hoặc `.pdf` và bắt buộc chọn phòng ban.
- File thật được lưu trong `Room Files/hr-miniapp/jds`.
- Quan hệ giữa file và phòng ban được lưu trong PrivOS App Database của Room.
- JD tải lên có thẻ và modal riêng, không giả lập các trường nghiệp vụ chỉ tồn tại ở JD tạo thủ công.
- Nút upload JD trong `Sàng lọc CV` được thay bằng nút nhỏ `Thêm JD`, bấm vào chuyển sang tab `Vị trí tuyển dụng`.

## 2. Ngoài phạm vi

- Không thêm chức năng xóa JD.
- Không tự suy đoán phòng ban từ tên file hoặc nội dung file.
- Không tự nhập lại metadata cho các file đã được tải lên trước khi tính năng này tồn tại.
- Không thay đổi định dạng nội dung hoặc quy trình lưu JD tạo thủ công.
- Không thêm router URL; tiếp tục dùng điều hướng tab và `StudioNavigationIntent` hiện có.
- Không cho Pipeline upload JD trực tiếp sau thay đổi này.

## 3. Hiện trạng trước khi triển khai (tham chiếu lịch sử)

Phần này mô tả trạng thái ban đầu dùng để ra quyết định thiết kế; không còn là trạng thái hiện tại của ứng dụng.

- `RecruitmentPanel` hiện chỉ đưa vào danh sách các file Markdown có tên khớp `JD_(?!AI_)`, đọc nội dung rồi dựng `RecruitmentJob` có metadata đầy đủ.
- JD tạo thủ công chứa `DEPARTMENT_ID` trong Markdown và tiếp tục dùng cơ chế này.
- `PipelineService.uploadJD` đã tải file vào `hr-miniapp/jds`, xử lý trùng tên và trả lại id/tên file.
- `Sàng lọc CV` đã có trình xem JD dùng chung các renderer Markdown, DOCX và PDF, nhưng hiện vẫn có input upload trực tiếp không yêu cầu phòng ban.
- Điều hướng từ `Vị trí tuyển dụng` sang Pipeline/Trợ lý JD đã truyền `fileId` và `fileName` ổn định.

## 4. Quyết định kiến trúc

### 4.1. Lưu file và metadata tách biệt

File gốc tiếp tục được lưu tại:

```text
Room Files/hr-miniapp/jds/<tên-file-cuối-cùng>
```

Metadata phòng ban của JD tải lên được lưu bằng các tool `mcpapp.db.*` trong App Database của chính Room. Không nhúng metadata vào file nhị phân, không đổi tên file để mã hóa phòng ban và không tạo sidecar file trong Room Files.

### 4.2. Collection App Database

Tạo collection room-scoped:

```text
hr_recruitment_job_files
```

Schema:

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `roomId` | string | Có | Room sở hữu bản ghi |
| `fileId` | string | Có | Định danh file ổn định do PrivOS trả về |
| `fileName` | string | Có | Tên cuối cùng sau khi xử lý trùng tên |
| `departmentKey` | string | Có | Khóa phòng ban ổn định |
| `source` | string | Có | Giá trị cố định `uploaded` |
| `createdAt` | string | Có | ISO timestamp của lần tải lên |

Unique index:

```text
{ roomId: 1, fileId: 1 }
```

Collection được đăng ký khi ghi metadata lần đầu. Repository phải xử lý trường hợp collection chưa tồn tại và lỗi `already registered` giống các repository App Database hiện có.

`departmentKey` là nguồn sự thật. Nhãn phòng ban được resolve từ danh sách phòng ban hiện tại, vì vậy đổi tên một phòng ban tùy chỉnh sẽ cập nhật cách hiển thị của các JD liên quan mà không phải sửa từng bản ghi.

### 4.3. Mô hình JD trong giao diện

Danh sách tuyển dụng dùng một discriminated union gồm hai loại:

- `structured`: JD tạo thủ công hiện tại, có title, summary, location, employment type, salary và nội dung đã parse.
- `uploaded`: JD tải từ máy, có file identity, file name, extension/format và department identity.

Không điền giá trị giả cho các trường nghiệp vụ không tồn tại ở `uploaded`.

### 4.4. Ghép dữ liệu khi tải trang

`Vị trí tuyển dụng` tải song song:

1. Danh sách file hợp lệ trong `hr-miniapp/jds`.
2. Danh sách phòng ban trong `hr_recruitment_departments`.
3. Metadata JD tải lên trong `hr_recruitment_job_files`.

Quy tắc ghép:

- JD structured tiếp tục được nhận diện và parse theo contract hiện tại.
- Metadata uploaded được ghép với file thật bằng `fileId`.
- Metadata không còn file thật bị bỏ qua, không sinh thẻ lỗi.
- File cũ không có metadata và không phải JD structured vẫn còn dùng được trong dropdown của Pipeline nhưng không xuất hiện trong danh sách `Vị trí tuyển dụng`.
- Không tự đoán phòng ban cho dữ liệu cũ.

## 5. Luồng tải JD

### 5.1. Mở modal

Nút `Tải JD` nằm giữa `Phòng ban` và `Tạo JD thủ công`. Ba nút dùng biến thể compact riêng cho header tuyển dụng để giảm font-size, chiều cao, padding và khoảng cách icon mà không làm nhỏ toàn bộ button trong ứng dụng.

Modal có:

- Vùng kéo thả file.
- Nút/chỉ dẫn bấm để mở file picker.
- Chỉ nhận một file `.md`, `.docx` hoặc `.pdf`.
- Dropdown phòng ban bắt buộc.
- Tên và định dạng file đã chọn.
- Thao tác chọn lại file.
- Nút hủy và nút `Tải JD lên`.

Nút xác nhận chỉ bật khi có file hợp lệ, có phòng ban và không có request đang chạy.

### 5.2. Upload và lưu metadata

1. Kiểm tra extension, file rỗng và phòng ban.
2. Dùng service upload hiện có để tìm tên không trùng và tải file vào `hr-miniapp/jds`.
3. Lấy `fileId` và `fileName` cuối cùng từ kết quả hoặc danh sách file được refresh.
4. Ghi/upsert metadata App Database theo `(roomId, fileId)`.
5. Khi cả hai bước thành công, đóng modal, làm mới danh sách và hiển thị JD mới trong phòng ban đã chọn.

Nếu upload file thất bại, không ghi metadata.

Nếu file đã upload nhưng ghi metadata thất bại:

- Giữ `fileId` và tên file đã upload trong state của modal.
- Hiển thị lỗi rõ rằng file đã có trong Room nhưng chưa lưu được phòng ban.
- Đổi action thành `Thử lưu phòng ban lại`.
- Lần retry chỉ ghi metadata, không upload file lần nữa.

Việc đổi Room/app context trong khi request đang chạy phải vô hiệu hóa kết quả cũ bằng room-operation guard hiện có.

## 6. Danh sách và thẻ JD

### 6.1. JD structured

Giữ nguyên thẻ hiện tại: phòng ban, vị trí, mô tả ngắn, địa điểm, hình thức, lương và nút xem chi tiết.

### 6.2. JD uploaded

Thẻ uploaded hiển thị:

- Badge phòng ban.
- Tên file thật làm tiêu đề.
- Dòng ghi chú `JD được người dùng tải lên từ máy`.
- Nhãn định dạng `Markdown`, `Word` hoặc `PDF`.
- Nút `Xem chi tiết`.

Thẻ không hiển thị mô tả, lương, địa điểm hoặc hình thức mặc định. Bộ lọc phòng ban và tìm kiếm áp dụng theo department label và file name. Phân trang hiện tại tiếp tục hoạt động với cả hai loại thẻ.

## 7. Modal xem chi tiết

JD structured giữ nguyên `RecruitmentJobDetailDialog` hiện tại.

JD uploaded mở modal file preview dùng chung renderer với Pipeline:

- `.md`: đọc text qua authenticated PrivOS API và render Markdown.
- `.docx`: đọc Blob qua repository hiện có và render bằng DOCX preview.
- `.pdf`: đọc Blob và render PDF nhiều trang.

Không dùng URL tải trực tiếp từ MinIO làm nguồn sự thật. Loading và lỗi đọc file hiển thị inline trong modal.

Actions:

- Mọi định dạng: `Tải JD` và `Dùng để sàng lọc CV`.
- Chỉ `.md`: thêm `Chỉnh với AI`.
- `.docx` và `.pdf`: không hiển thị `Chỉnh với AI`.

Điều hướng Pipeline/Trợ lý JD tiếp tục truyền `fileId` và `fileName`, bảo toàn contract chọn sẵn đúng JD.

Modal uploaded JD dùng layout ba hàng `header / preview / actions`. Header và actions không cuộn; vùng preview có `min-height: 0`, `overflow: auto` và chiếm phần chiều cao còn lại. Quy tắc này áp dụng cho Markdown, DOCX và PDF để nội dung không tràn khỏi modal hoặc bị footer che.

### 7.1. Ánh xạ phòng ban sang tab Ứng viên

Khi tải tab `Ứng viên`, ứng dụng tải song song file JD, metadata `hr_recruitment_job_files` và danh sách `hr_recruitment_departments`. JD uploaded được nhận diện bằng `fileId`, không bị parse nhầm thành structured Markdown. Tên file được chuẩn hóa bằng cùng helper với lúc Pipeline tạo list `SCREENING_*`, sau đó ánh xạ thành `{ title, departmentLabel }` cho Kanban và modal chi tiết ứng viên.

Luồng này áp dụng đồng nhất cho `.pdf`, `.docx` và `.md` do người dùng tải lên. JD Markdown tạo trực tiếp vẫn dùng `DEPARTMENT_ID` như trước.

## 8. Thay đổi trong Sàng lọc CV

Trong `PipelineJDPanel`:

- Loại bỏ hidden file input dành cho JD và callback upload JD trực tiếp.
- Đổi nút `Tải JD` thành `Thêm JD`.
- Dùng kích thước compact nhỏ hơn hiện tại cho text và vùng bấm.
- Bấm nút gọi `onNavigate('recruitment')`.
- Không tự mở modal upload sau khi chuyển tab; người dùng chọn `Tải JD` tại trang đích.

Input và luồng upload CV không thay đổi.

## 9. Xử lý lỗi và giới hạn

- Sai extension: giữ modal mở và báo chỉ hỗ trợ `.md`, `.docx`, `.pdf`.
- File rỗng: không upload và báo lỗi.
- Chưa chọn phòng ban: nút submit disabled và validation vẫn chặn ở handler.
- Tên file trùng: đặt hậu tố `(1)`, `(2)` trước extension như service hiện tại.
- Phòng ban bị xóa/không còn tồn tại trước khi submit: dừng và yêu cầu chọn lại.
- Không lấy được `fileId` sau upload/refresh: giữ modal và báo không thể liên kết metadata.
- Lỗi đọc preview: hiển thị inline, vẫn cho đóng modal; action tải xuống chỉ chạy khi có file identity hợp lệ.
- Metadata stale: bỏ qua khi dựng danh sách. Cleanup vật lý không thuộc phạm vi này.

## 10. Phân tách module đã triển khai

- `src/ui/recruitment/recruitment-uploaded-jobs.ts`: model, validation, ghép file với metadata và format helpers thuần.
- `src/ui/recruitment/recruitment-job-file-repository.ts`: App Database repository cho `hr_recruitment_job_files`.
- `src/ui/recruitment/RecruitmentJobUploadDialog.tsx`: modal kéo thả/chọn file/phòng ban và trạng thái retry metadata.
- `src/ui/recruitment/RecruitmentUploadedJobDialog.tsx`: modal preview uploaded JD.
- `src/ui/jd-document/JDDocumentPreview.tsx` là component preview dùng chung để Recruitment và Pipeline cùng sử dụng mà không tạo dependency ngược.
- `RecruitmentPanel` giữ orchestration Room, upload, refresh và navigation; không đưa I/O vào dialog.
- `PipelineJDPanel` nhận callback `onAddJD` thay cho input/callback upload.

Các tên file trên là cấu trúc thực tế hiện tại. Ranh giới trách nhiệm phải tiếp tục được giữ nguyên trong các thay đổi sau này.

## 11. Kiểm thử

### 11.1. Unit

- Validate đúng một file và chỉ ba extension được hỗ trợ.
- Resolve format label từ extension.
- Ghép metadata với file theo `fileId`; bỏ metadata stale.
- Search/filter/pagination hoạt động với cả structured và uploaded JD.
- Repository parse/serialize đúng field, room scope và unique identity.
- Collection missing được register rồi retry; `already registered` được xử lý an toàn.
- Upsert không tạo hai metadata cho cùng `(roomId, fileId)`.

### 11.2. Component/integration

- Modal không cho submit khi thiếu file hoặc phòng ban.
- Drag/drop và file picker cập nhật cùng một state.
- Upload thành công nhưng metadata lỗi chuyển sang retry metadata, không gọi upload lần hai.
- Card uploaded chỉ hiện department, file name, format và action xem chi tiết.
- Preview chọn đúng renderer cho `.md`, `.docx`, `.pdf`.
- Actions modal đúng theo định dạng; `Chỉnh với AI` chỉ có ở `.md`.
- `Thêm JD` trong Pipeline gọi navigation sang `recruitment` và không mở file picker.
- JD uploaded truyền đúng identity sang Pipeline và được chọn sẵn.

### 11.3. Verification

- Chạy các test recruitment, pipeline navigation/interaction và repository mới.
- Chạy `npm run typecheck:strict-unused`.
- Chạy full `npm test`, báo riêng các lỗi nền không liên quan nếu còn tồn tại.
- Chạy `npm run build` và manifest lint.
- Rebuild image `privos-mcp-app-demo:local`, recreate riêng `hr-app`, kiểm tra `/health`, Docker health và image ID.

## 12. Tiêu chí nghiệm thu

- [x] Ba nút header tuyển dụng nhỏ gọn và đúng thứ tự.
- [x] Không thể upload JD khi chưa chọn phòng ban.
- [x] `.md`, `.docx`, `.pdf` được lưu trong đúng thư mục JD và có metadata App Database đúng Room.
- [x] JD uploaded xuất hiện trong đúng phòng ban, hiển thị file name/format thay vì metadata giả.
- [x] Modal xem đúng cả ba định dạng bằng authenticated PrivOS reads và giữ nội dung trong vùng preview cuộn.
- [x] `.md` có action chỉnh với AI; `.docx`/`.pdf` không có action này.
- [x] Mọi JD uploaded có thể được tải xuống và chuyển sang Pipeline với đúng file identity.
- [x] `Sàng lọc CV` không còn upload JD trực tiếp; nút `Thêm JD` nhỏ gọn chuyển sang `Vị trí tuyển dụng`.
- [x] Upload file thành công nhưng metadata lỗi có thể retry mà không sinh file trùng.
- [x] Luồng tạo JD thủ công, lọc phòng ban, tìm kiếm, phân trang và navigation hiện có không bị hồi quy.
- [x] Kết quả sàng lọc bằng JD uploaded hiển thị đúng phòng ban trong Kanban và modal chi tiết của tab `Ứng viên`.
