# HƯỚNG DẪN XỬ LÝ VÀ CHẤM ĐIỂM CV (ANTI-HALLUCINATION)

**MỤC ĐÍCH TỐI THƯỢNG:**

* KHÔNG BAO GIỜ tự bịa đặt hoặc suy diễn thông tin.
* Bắt buộc phải trích xuất dữ liệu dựa trên bản Text (Markdown) gốc do hệ thống Auto-parse tạo ra.
* Đảm bảo 100% các CV sau khi xử lý đều có chung một cấu trúc trình bày thống nhất và được ĐÁNH GIÁ SÀNG LỌC theo tiêu chuẩn.

***

## BƯỚC 1: COPY FILE RAW VÀO THƯ MỤC RAWS-CV TRONG ROOM FILES (BẮT BUỘC)

> ⚠️ **SYSTEM DIRECTIVE - NO SANDBOX:** BẮT BUỘC DÙNG PRIVOS FILE TOOL ĐỂ LƯU FILE VÀO ROOM FILES: `hr-miniapp/raws-cv/[YYYY-MM]/` TRƯỚC KHI TIẾP TỤC. NẾU BẠN BỎ QUA BƯỚC NÀY HOẶC LƯU VÀO SANDBOX CONTAINER, TOÀN BỘ QUY TRÌNH SẼ BỊ LỖI. TUYỆT ĐỐI KHÔNG THÊM TIỀN TỐ `RoomFiles/` HOẶC `[ROOM_ID]/` VÀO ĐƯỜNG DẪN LƯU FILE.

Ngay khi nhận được yêu cầu xử lý một file CV raw (ví dụ: `NguyenVanA.pdf`), bạn phải thực hiện quy trình sau để lưu trữ bản gốc:

* **Cách làm:** Thay vì phải gọi tool kiểm tra danh sách file, bạn hãy ĐỔI TÊN file gốc theo chuẩn `[YYYY-MM-DD]_CV_[TenKhongDau]_[ViTriKhongDau]_[Timestamp_YYYYMMDD_HHMMSS].[extension]`.
* **Ví dụ:** File gốc là `NguyenVanA.pdf` ứng tuyển Data Analyst, ở thời điểm hiện tại (ví dụ 16:05:30 ngày 09/07/2026), bạn sẽ đặt tên là `2026-07-09_CV_NguyenVanA_DataAnalyst_20260709_160530.pdf`.
* **Thực thi:** Dùng công cụ PrivOS File Tool để lưu/copy file này trực tiếp vào Room Files: `hr-miniapp/raws-cv/[YYYY-MM]/` với tên vừa tạo. Bằng cách này 100% không bao giờ bị trùng tên! KHÔNG CẦN LOOP HAY KIỂM TRA LẠI, CV có thể có nhiều đuôi khác nhau (ví dụ: .pdf, .doc, .docx, vv) cần phải copy hết.

**(TUYỆT ĐỐI KHÔNG ĐƯỢC GHI ĐÈ FILE CŨ, KHÔNG LƯU VÀO SANDBOX VÀ KHÔNG BỎ QUA BƯỚC NÀY)**

## BƯỚC 2: TÌM VÀ ĐỌC BẢN TEXT GỐC (BẮT BUỘC)

Khi nhận được yêu cầu xử lý CV, AI **KHÔNG ĐƯỢC** đọc thẳng file PDF. Thay vào đó, AI phải tìm bản text đã được bóc tách nằm trong thư mục ẩn theo các đường dẫn sau (thay khoảng trắng bằng dấu `_`):

1. `[ROOM_ID]/.markdown/[Tên_File_Có_Gạch_Dưới].pdf.md`
2. `[ROOM_ID]/.markdown/[Tên_File_Có_Gạch_Dưới].md`
3. `[ROOM_ID]/.markdown/hr-miniapp/cv-lon-xon/[Tên_File_Có_Gạch_Dưới].md`

_Lưu ý: Nội dung lấy từ file MD này chính là "Nguồn Dữ Liệu Gốc". Nếu không tìm thấy file, hãy dừng lại báo lỗi._

## BƯỚC 3: CHUẨN HÓA FORMAT & ĐÁNH GIÁ SÀNG LỌC

Sử dụng nội dung từ "Nguồn Dữ Liệu Gốc", định dạng lại CV theo cấu trúc sau.
**Yêu cầu:** Sắp xếp lại nội dung, giữ nguyên văn kỹ năng/kinh nghiệm. Sau đó, dựa vào thông tin trích xuất, thực hiện **ĐÁNH GIÁ SÀNG LỌC** theo 3 tiêu chí dưới đây đối chiếu với JD đính kèm:

### 3 Tiêu Chí Đánh Giá Chính (Thang điểm 100):

1. **Vị trí ứng tuyển:** Có đúng với danh sách tuyển dụng trong JD hay không?
2. **Kinh nghiệm & Yêu cầu cốt lõi:** Có đạt yêu cầu tối thiểu của JD không?
3. **Mức lương mong muốn:** Có nằm trong Budget (nếu JD có đề cập) không?

### Phân Loại Kết Quả Rẽ Nhánh & Ngưỡng Điểm Bắt Buộc (Thang 100 điểm):

* ✅ **ĐẠT (Mời phỏng vấn):** Tổng điểm **≥ 80/100** (Đúng vị trí + Kinh nghiệm đạt yêu cầu + Lương trong budget).
* 🟡 **CÂN NHẮC (Cần xem thêm):** Tổng điểm **50 – 79/100** (Đúng vị trí nhưng thiếu 1 vài kỹ năng phụ hoặc ít kinh nghiệm hơn một chút nhưng có tiềm năng, lương hơi cao có thể thương lượng).
* ❌ **KHÔNG ĐẠT (Từ chối):** Tổng điểm **< 50/100** HOẶC Lương vượt budget quá xa HOẶC không đủ yêu cầu cơ bản của JD. *(⚠️ TUYỆT ĐỐI KHÔNG XẾP CÂN NHẮC NẾU TỔNG ĐIỂM < 50/100)*.
* ⛔ **KHÔNG TUYỂN VỊ TRÍ NÀY:** Ứng tuyển vị trí không có trong JD hiện tại.

### TEMPLATE KẾT QUẢ BẮT BUỘC (Markdown):

> **CẢNH BÁO CỐT LÕI:** BẠN BẮT BUỘC PHẢI TRÌNH BÀY FILE MARKDOWN ĐÚNG Y HỆT THEO CẤU TRÚC ĐƯỢC QUY ĐỊNH TẠI FILE TEMPLATE DƯỚI ĐÂY. BẠN PHẢI LẬP BẢNG CHẤM ĐIỂM CHI TIẾT THEO YÊU CẦU TRONG TEMPLATE.
>
> 💡 Đọc cấu trúc template tại: `@Files:[ROOM_ID]/hr-miniapp/skills/cv_md_template.md`

## BƯỚC 4: LƯU FILE VÀO OUTPUTS CV TRONG ROOM FILES (CHỐNG TRÙNG LẶP)

* Trích xuất Họ và Tên ứng viên cùng với Vị trí ứng tuyển TỪ TRONG NỘI DUNG CV. **LƯU Ý CỐT LÕI:** Vị trí ứng tuyển phải lấy đúng theo những gì ứng viên viết trong CV, TUYỆT ĐỐI KHÔNG lấy tên tiêu đề của file JD hay tên JD để đặt tên. Nếu trong CV không ghi rõ vị trí, hãy dùng `KhongXacDinh`.
* Loại bỏ dấu tiếng Việt và dấu cách cho cả Tên và Vị trí ứng tuyển (VD: `Lưu Sơn Trường` -> `LuuSonTruong`, `Lập trình viên` -> `LapTrinhVien`).
* Tên file chuẩn: `[YYYY-MM-DD]_CV_[TenKhongDau]_[ViTriUngTuyenKhongDau].md`.
* BẮT BUỘC dùng công cụ PrivOS File Tool để lưu nội dung vừa được chuẩn hóa vào các thư mục Room Files tương ứng theo tháng `[YYYY-MM]` (TUYỆT ĐỐI KHÔNG lưu vào sandbox container, TUYỆT ĐỐI KHÔNG thêm tiền tố `RoomFiles/` hay `[ROOM_ID]/` vào đường dẫn):
  * NẾU ĐANG CHẤM SƠ LOẠI VÀ ỨNG VIÊN ĐẠT/CÂN NHẮC: `hr-miniapp/outputs-cv/[YYYY-MM]/02-passed_screening/[Tên_file_chuẩn]`
  * NẾU ĐANG CHẤM SƠ LOẠI VÀ ỨNG VIÊN KHÔNG ĐẠT/KHÔNG TUYỂN: `hr-miniapp/outputs-cv/[YYYY-MM]/01-failed/[Tên_file_chuẩn]`
  * NẾU ĐANG LÀM NHIỆM VỤ ĐÁNH GIÁ CHUYÊN SÂU (Deep Review): `hr-miniapp/outputs-cv/[YYYY-MM]/03-deep_reviewed/[Tên_file_chuẩn]`
* **QUAN TRỌNG (CHỐNG TRÙNG LẶP):** Trước khi lưu, nếu phát hiện file đã tồn tại trong Room Files, bạn **BẮT BUỘC** phải tạo ra tên file mới bằng cách thêm số thứ tự (ví dụ: `..._LapTrinhVien_1.md`).

## BƯỚC 5: TẠO THẺ ỨNG VIÊN TRÊN BẢNG KANBAN (PRIVOS LISTS)

> ⚠️ **LƯU Ý:** Bước này hiện tại KHÔNG CẦN THỰC HIỆN KHI CHẤM ĐIỂM TỪNG CV.
> Hệ thống UI sẽ tự động gom kết quả và khởi tạo Bảng Kanban với đầy đủ 9 Stage, đồng thời lưu thẻ của tất cả ứng viên vào List tập trung sau khi chấm xong toàn bộ các CV.
> * **Tên bảng Kanban (List Name):** `[YYYY_MM_DD]_SCREENING` (Ví dụ: `2026_07_23_SCREENING`).
> Kỹ năng chấm điểm cá nhân của bạn chỉ cần tập trung làm tốt đến Bước 4 (Lưu file Markdown) và trả về kết quả JSON là được.

***

***

**YÊU CẦU ĐẦU RA CUỐI CÙNG (STRICT OUTPUT FORMAT):**&#x4B;hi hoàn tất toàn bộ 5 bước trên, bạn BẮT BUỘC phải trả về kết quả theo chuẩn sau để hệ thống tự động nhận diện:

* Phải trả về thẻ `<saved_file>` chứa ĐÚNG tên file MD đã lưu thành công ở BƯỚC 4.
* VD chuẩn xác: `<saved_file>2026-07-03_CV_NguyenVanA_LapTrinhVien_1.md</saved_file>`
* TUYỆT ĐỐI KHÔNG bọc thẻ `<saved_file>` vào trong block code (\`\`\`) hay bảng markdown.
