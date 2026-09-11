import { DraftingTemplate } from '../../types';

export const digitalProposalTemplate: DraftingTemplate = {
  id: 'digital-proposal',
  title: 'Đề xuất giải pháp & ROI (Business Proposal)',
  category: 'kehoach',
  categoryLabel: 'Kế hoạch & Báo cáo',
  track: 'modern_enterprise',
  icon: '💡',
  description: 'Bản đề xuất giải pháp công nghệ, lộ trình và phân tích hiệu quả tài chính (ROI) hiện đại.',
  defaultData: {
    projectName: 'Ứng dụng AI vào Tự động hóa Quy trình Tuyển dụng & Quản trị Nhân sự',
    preparedFor: 'Ban Giám đốc công ty',
    preparedBy: 'Phòng Kỹ thuật & Sáng tạo Công nghệ',
    budgetEstimate: '850.000.000 VNĐ',
    timeline: '03 tháng (Q3 - Q4/2026)',
    roiProjection: 'Tiết kiệm 45% chi phí vận hành nhân sự và rút ngắn 60% thời gian tuyển dụng.'
  },
  templateText: `# ĐỀ XUẤT GIẢI PHÁP VÀ ĐÁNH GIÁ HIỆU QUẢ ĐẦU TƯ
### DỰ ÁN: {{projectName}}

**Kính gửi:** **{{preparedFor}}**
**Đơn vị đề xuất:** {{preparedBy}}
**Ngày lập:** {{currentDate}}

---

### I. TỔNG QUAN VÀ BỐI CẢNH DỰ ÁN
Trong kỷ nguyên số hóa mạnh mẽ, việc tối ưu hóa quy trình quản trị nội bộ thông qua các công cụ AI thông minh là chìa khóa để duy trì lợi thế cạnh tranh. Đề xuất này tập trung giải quyết các bài toán tắc nghẽn hiện tại trong khâu sàng lọc hồ sơ, soạn thảo văn bản và tương tác nội bộ.

### II. MỤC TIÊU VÀ PHẠM VI TRIỂN KHAI
- **Mục tiêu:** Tự động hóa 80% các tác vụ hành chính nhân sự lặp lại; nâng cao độ chính xác trong thẩm định CV lên trên 90%.
- **Phạm vi:** Áp dụng cho toàn bộ khối Tuyển dụng, Hành chính - Nhân sự và Ban Lãnh đạo.

### III. KIẾN TRÚC GIẢI PHÁP CỐT LÕI
1. **Module AI CV Screening:** Tự động bóc tách kỹ năng, kinh nghiệm và xếp hạng ứng viên theo JD.
2. **Module Bot Soạn thảo Đa năng:** Sinh tự động 100% các biểu mẫu hành chính chuẩn thể thức NĐ 30/2020 và phong cách doanh nghiệp hiện đại.
3. **Tích hợp Rocket.Chat & PrivOS:** Giao diện trực quan, tương tác thời gian thực và bảo mật dữ liệu tuyệt đối.

### IV. DỰ TOÁN NGÂN SÁCH VÀ LỘ TRÌNH THỰC HIỆN
- **Tổng ngân sách dự kiến:** **{{budgetEstimate}}**
- **Lộ trình:** {{timeline}}
  - *Tháng 1:* Khảo sát chi tiết, thiết kế UI/UX và xây dựng Prompt AI.
  - *Tháng 2:* Lập trình tích hợp Mini-app, thử nghiệm Alpha với dữ liệu mẫu.
  - *Tháng 3:* Hoàn thiện, đào tạo người dùng và bàn giao chính thức.

### V. PHÂN TÍCH HIỆU QUẢ ĐẦU TƯ (ROI)
{{roiProjection}}

Kính trình Ban Giám đốc phê duyệt chủ trương triển khai./.

| **ĐƠN VỊ ĐỀ XUẤT**<br>*(Ký & ghi rõ họ tên)*<br><br><br>**TRƯỞNG NHÓM SẢN PHẨM** | **PHÊ DUYỆT CỦA BAN GIÁM ĐỐC**<br>*(Ký tên & Đóng dấu)*<br><br><br>**TỔNG GIÁM ĐỐC** |
| :---: | :---: |
`
};
