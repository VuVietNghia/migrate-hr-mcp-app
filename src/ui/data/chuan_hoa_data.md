---
description: Chuẩn Hóa Dữ Liệu CV Ứng Viên (Tuyến Tính)
---
# Workflow: Chuẩn Hóa Dữ Liệu CV Ứng Viên (Tuyến Tính)

**Mục đích:** Nhận thư mục CV lộn xộn đa định dạng, xử lý tuần tự 3 bước: đổi tên chuẩn → chuẩn hóa nội dung thành Markdown → tổng hợp bảng danh sách + sắp xếp vào Workspace 4 khu vực. Mỗi bước phải hoàn thành trước khi đến bước sau.

**Mô hình:** Tuyến tính (Linear) — Bước 1 → Bước 2 → Bước 3, không rẽ nhánh, không bỏ qua.

**Dữ liệu đầu vào:** Thư mục `cv_lon_xon/` chứa 25 file CV đa định dạng:
- 15 file văn bản: `.docx`, `.pdf`, `.eml`, `.txt`
- 10 file ảnh: `.jpg`, `.png` (chụp tay, photo, scan, screenshot)

---

## Bước 1: Đổi tên file theo chuẩn

**Input:**
- Thư mục `cv_lon_xon/` chứa 25 file tên lộn xộn.

**Công thức đặt tên:**

```
[Ngày]_CV_[HoTenKhongDau].[ĐịnhDạngGốc]
```

| Thành phần | Quy tắc | Ví dụ |
|---|---|---|
| Ngày | ISO 8601: `YYYY-MM-DD` — lấy từ nội dung hoặc metadata file | `2025-03-10` |
| Nhãn | Luôn là `CV` | `CV` |
| Họ tên | Viết liền, không dấu, họ đứng trước | `TranVanCuong` |
| Định dạng | Giữ nguyên đuôi gốc | `.docx`, `.pdf`, `.png` |

**5 quy tắc đặt tên:**
1. Ngày đặt trước — file tự sắp theo thời gian
2. Nhãn `CV` rõ ràng — nhìn tên biết loại tài liệu
3. Tên viết liền không dấu — tránh lỗi ký tự đặc biệt
4. Không dùng khoảng trắng, ký tự đặc biệt
5. Giữ đuôi file gốc — không đổi `.png` thành `.pdf`

**Process:**
1. Mở từng file, đọc nội dung để xác định: **họ tên ứng viên** và **ngày nộp/ngày tạo**.
2. Với file ảnh (.jpg, .png): dùng Vision/OCR để đọc nội dung.
3. Tạo tên file mới theo công thức.
4. Đổi tên file (rename, không xóa file gốc).

**Output:** 25 file đã đổi tên chuẩn, vẫn giữ định dạng gốc. Ví dụ:

```
cv_lon_xon/
├── 2025-03-10_CV_TranVanCuong.docx        (gốc: CV_TranVanCuong_QuanLy.docx)
├── 2025-03-15_CV_DangThuyLinh.eml          (gốc: cv pha che - Linh.eml)
├── 2025-03-20_CV_TranMinhKhoi.png          (gốc: Screenshot_2025-03-20 TranMinhKhoi.png)
├── 2025-04-01_CV_HoangMinh.pdf             (gốc: 20250401_CV_shipper_HoangMinh.pdf)
└── ... (25 file)
```

---

## Bước 2: Chuẩn hóa nội dung và trích xuất dữ liệu

**Input:** 25 file CV đã đổi tên chuẩn từ Bước 1.

**Process:**
1. Mở từng file, đọc toàn bộ nội dung chi tiết.
   - File văn bản (.docx, .pdf, .txt, .eml): đọc trực tiếp.
   - File ảnh (.jpg, .png): dùng OCR/Vision để biên dịch thành text.
2. Trích xuất các trường dữ liệu quan trọng cho mỗi CV:

| Trường | Mô tả | Ví dụ |
|---|---|---|
| **Họ tên** | Họ tên đầy đủ | Trần Văn Cường |
| **Vị trí ứng tuyển** | Vị trí ghi trong CV | Quản lý cửa hàng |
| **Kinh nghiệm** | Số năm + mô tả ngắn | 5 năm quản lý F&B |
| **Lương mong muốn** | Số tiền (nếu có) | 12.000.000₫ |
| **SĐT** | Số điện thoại liên hệ | 0901234567 |
| **Ghi chú** | Điểm nổi bật hoặc thiếu sót | Có chứng chỉ ATTP |

3. Chuyển nội dung mỗi CV thành 1 file Markdown (`.md`) có cấu trúc rõ ràng. Tên file `.md` trùng tên file gốc (chỉ đổi đuôi).
4. **Tổng hợp tất cả dữ liệu trích xuất thành 1 bảng CSV** tên `BangTongHop_CV_Q2.csv` với các cột:

```csv
STT,Ho_Ten,Vi_Tri_Ung_Tuyen,Kinh_Nghiem,Luong_Mong_Muon,SDT,Ghi_Chu
1,Trần Văn Cường,Quản lý cửa hàng,5 năm F&B,12000000,0901234567,Có KN quản lý 20 người
2,...
```

**Output:**
- 25 file `.md` — nội dung CV chuẩn hóa.
- 1 file `BangTongHop_CV_Q2.csv` — bảng tổng hợp toàn bộ 25 ứng viên.

---

## Bước 3: Tổ chức Workspace 4 khu vực

**Input:**
- 25 file CV gốc (đã đổi tên) từ Bước 1.
- 25 file `.md` + 1 file `BangTongHop_CV_Q2.csv` từ Bước 2.

**Process:**
1. Tạo thư mục cha: `TuyenDung_Q2/`
2. Tạo cấu trúc 4 khu vực:

```
TuyenDung_Q2/
├── 01_Inputs/       ← File CV gốc đã đổi tên (25 file)
├── 02_Process/      ← File .md đã chuẩn hóa (25 file) + BangTongHop_CV_Q2.csv
├── 03_Outputs/      ← (Trống — sẵn sàng cho bước sàng lọc ở Bài 2)
├── 04_Archive/      ← (Trống — lưu trữ sau)
└── README.md        ← Metadata: lịch sử xử lý, số lượng file, ngày chạy
```

3. Di chuyển file vào đúng khu vực.
4. Tạo file `README.md` ghi nhận:
   - Ngày chạy workflow
   - Số file ban đầu: 25
   - Số file sau xử lý: 25 gốc + 25 md + 1 CSV
   - Các bước đã thực hiện

**Output:**
- Workspace sạch sẽ, chuẩn kiến trúc 4 khu vực.
- File `BangTongHop_CV_Q2.csv` nằm trong `02_Process/` — sẵn sàng làm đầu vào cho **Bài tập 2 (Sàng lọc CV)**.
