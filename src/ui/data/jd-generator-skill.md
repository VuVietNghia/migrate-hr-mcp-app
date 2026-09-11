---
name: jd-generator
description: "Kỹ năng chuyên biệt để tạo Job Description (JD) chuẩn form của công ty B.Army. Tuyệt đối không bịa đặt thông tin."
---

# Kỹ năng Tạo JD (JD Generator Skill)

Kỹ năng này giúp tự động tạo ra một Job Description (JD) chuyên nghiệp, tuân thủ đúng template và văn hoá của công ty B.Army.

## 1. Triggers (Khi nào sử dụng)
Sử dụng kỹ năng này khi người dùng yêu cầu: "Tạo JD", "Viết mô tả công việc", "Soạn JD cho vị trí...".

## 2. Dependencies (Tài liệu tham khảo)
1. `@Files:[ROOM_ID]/hr-miniapp/skills/jd_template.md`: Mẫu JD chuẩn bắt buộc phải tuân theo.
2. Nguồn dữ liệu công ty: Truy cập và đọc thông tin từ website chính thức: `https://www.b.army/`

## 3. Workflow (Quy trình thực thi)

### Bước 1: Thu thập thông tin
- Hỏi người dùng về các thông tin cốt lõi nếu họ chưa cung cấp: Tên vị trí, số năm kinh nghiệm yêu cầu, mức lương (nếu có).
- Sử dụng công cụ Browse/Web Search để truy cập `https://www.b.army/` đọc qua về tầm nhìn, sứ mệnh, sản phẩm để hiểu văn hoá công ty (chỉ dùng thông tin có thật).

### Bước 2: Sinh nội dung JD (Anti-Hallucination)
- **SYSTEM DIRECTIVE:** Bắt buộc phải sinh JD dựa theo bộ khung (template) `jd_template.md`.
- Tuyệt đối KHÔNG BỊA ĐẶT (Hallucinate) các chế độ phúc lợi (Ví dụ: Không tự ý ghi "Du lịch châu Âu", "Tháng lương 13", "Macbook Pro" nếu người dùng không cung cấp hoặc trên web công ty không có). Nếu không chắc chắn, hãy ghi "Theo chính sách hiện hành của công ty".
- Hãy dịch hoặc viết lại cho mạch lạc, thu hút ứng viên nhưng giữ tính trung thực.

### Bước 3: Lưu file JD (BẮT BUỘC VÀO ROOM FILES)
- ⚠️ **STRICT DIRECTIVE - NO SANDBOX STORAGE:**
  - Tuyệt đối KHÔNG ĐƯỢC lưu file vào thư mục container sandbox nội bộ (`/tmp` hoặc `/workspace`).
  - BẮT BUỘC phải dùng công cụ quản lý Room File của PrivOS để lưu file trực tiếp vào không gian lưu trữ của phòng chat (Room Files).
  - TUYỆT ĐỐI KHÔNG thêm tiền tố `RoomFiles/` hay `[ROOM_ID]/` vào đường dẫn lưu file.
  - **Đường dẫn chuẩn:** `hr-miniapp/jds/JD_AI_[TênVịTríKhôngDấu].md`.
- Tên file chuẩn: `JD_AI_[TênVịTríKhôngDấu].md` (Ví dụ: `JD_AI_DataAnalyst.md`).
- Nếu file đã tồn tại trong thư mục `hr-miniapp/jds/`, tự động thêm số thứ tự vào sau (VD: `JD_AI_DataAnalyst_1.md`).

### Bước 4: Trả kết quả (Strict Output Format)
- Báo cho người dùng biết file JD đã được tạo thành công kèm theo đường dẫn:
  `<saved_file>JD_AI_[TênVịTríKhôngDấu].md</saved_file>`
- Kèm theo toàn bộ nội dung Markdown của JD vừa tạo trong thẻ:
  <jd_content>
  [Toàn bộ nội dung JD theo chuẩn template]
  </jd_content>
