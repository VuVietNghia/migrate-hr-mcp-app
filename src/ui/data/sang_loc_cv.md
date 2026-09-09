---
description: Sàng Lọc CV Ứng Viên (Điều Kiện)
---
# Workflow: Sàng Lọc CV Ứng Viên (Điều Kiện)

**Mục đích:** Đọc bảng tổng hợp CV từ Bài 1 (`BangTongHop_CV_Q2.csv`), đánh giá từng ứng viên theo tiêu chuẩn tuyển dụng AFC, rẽ nhánh phân loại khác nhau cho từng trường hợp.

**Mô hình:** Điều kiện rẽ nhánh (Conditional) — Agent đọc từng dòng, so sánh với tiêu chuẩn, chọn nhánh xử lý.

**Dữ liệu đầu vào:** File `BangTongHop_CV_Q2.csv` — bảng tổng hợp 25 ứng viên đã chuẩn hóa ở Bài 1 (nằm trong thư mục `TuyenDung_Q2/02_Process/`).

---

## Bước 1: Đọc dữ liệu và tiêu chuẩn

**Input:**
- File `BangTongHop_CV_Q2.csv` — output của Bài 1, gồm các cột: STT, Ho_Ten, Vi_Tri_Ung_Tuyen, Kinh_Nghiem, Luong_Mong_Muon, SDT, Ghi_Chu.

**Tiêu chuẩn tuyển dụng AFC Q2/2026:**

| Vị trí | Yêu cầu tối thiểu | Budget lương (₫/tháng) |
|---|---|---|
| Phục vụ | Ưu tiên có kinh nghiệm F&B | 5.000.000 – 6.000.000 |
| Bếp | Ưu tiên KN bếp ≥ 6 tháng, có chứng chỉ ATTP | 5.500.000 – 7.500.000 |
| Thu ngân | Biết dùng máy POS hoặc có KN thu ngân | 5.000.000 – 6.000.000 |
| Giao hàng | Có xe máy + bằng lái | 5.000.000 – 6.500.000 |
| Quản lý cửa hàng | ≥ 3 năm quản lý F&B, từng quản lý ≥ 10 NV | 10.000.000 – 13.000.000 |
| Marketing | ≥ 1 năm kinh nghiệm, có portfolio/case study | 7.000.000 – 10.000.000 |

**Process:**
1. Đọc toàn bộ file CSV.
2. Ghi nhận tiêu chuẩn cho từng vị trí.

**Output:** Danh sách ứng viên + bộ tiêu chuẩn sẵn sàng đánh giá.

---

## Bước 2: Phân loại từng ứng viên (rẽ nhánh)

**Input:** Danh sách ứng viên + tiêu chuẩn từ Bước 1.

**Process:** Với MỖI dòng trong bảng, Agent đánh giá 3 tiêu chí và rẽ vào 1 trong 4 nhánh:

**3 tiêu chí đánh giá:**
1. Vị trí ứng tuyển có nằm trong danh sách tuyển Q2 không?
2. Kinh nghiệm có đạt yêu cầu tối thiểu không?
3. Lương mong muốn có nằm trong budget không?

**4 nhánh phân loại:**

### Nhánh A — ✅ ĐẠT (Mời phỏng vấn)
- Điều kiện: Đúng vị trí + KN đạt yêu cầu + Lương trong budget
- Hành động: Đánh dấu ✅ ĐẠT

### Nhánh B — 🟡 CÂN NHẮC (Cần xem thêm)
- Điều kiện: Đúng vị trí nhưng **thiếu 1 tiêu chí** (ít KN hoặc lương hơi cao nhưng có thể thương lượng)
- Hành động: Đánh dấu 🟡 CÂN NHẮC + ghi rõ thiếu gì

### Nhánh C — ❌ KHÔNG ĐẠT (Từ chối)
- Điều kiện: Lương vượt budget quá xa HOẶC không đủ yêu cầu cơ bản (VD: giao hàng mà không có xe)
- Hành động: Đánh dấu ❌ KHÔNG ĐẠT + ghi rõ lý do

### Nhánh D — ⛔ KHÔNG TUYỂN VỊ TRÍ NÀY
- Điều kiện: Ứng tuyển vị trí AFC không tuyển đợt Q2
- Hành động: Đánh dấu ⛔ KHÔNG TUYỂN

**Output:** Bảng phân loại 25 dòng:

```markdown
| STT | Họ tên | Vị trí | Lương | Kết quả | Lý do |
|---|---|---|---|---|---|
| 1 | Nguyễn Thị Mai Anh | Phục vụ | 5.5tr | ✅ ĐẠT | KN 6 tháng, lương OK |
| 2 | ... | ... | ... | ... | ... |
```

---

## Bước 3: Tổng kết và lưu báo cáo

**Input:** Bảng phân loại từ Bước 2.

**Process:**
1. Đếm số lượng theo từng nhánh:
   - ✅ ĐẠT: ? người
   - 🟡 CÂN NHẮC: ? người
   - ❌ KHÔNG ĐẠT: ? người
   - ⛔ KHÔNG TUYỂN: ? người
2. Lưu bảng phân loại thành file `KetQua_SangLoc_Q2.md` trong workspace.
3. Bảng phân loại này sẽ là đầu vào cho **Bài tập 3 (Soạn email phản hồi ứng viên)**.

**Output:** File `KetQua_SangLoc_Q2.md` — bảng kết quả sàng lọc + thống kê tổng.
