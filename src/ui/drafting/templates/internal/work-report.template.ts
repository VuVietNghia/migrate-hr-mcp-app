import { DraftingTemplate } from '../../types';

export const workReportTemplate: DraftingTemplate = {
  id: 'work-report',
  title: 'Báo cáo công tác / Tổng kết (Work Report)',
  category: 'kehoach',
  categoryLabel: 'Kế hoạch & Báo cáo',
  track: 'nd30_administrative',
  icon: '📊',
  description: 'Báo cáo tổng kết tình hình thực hiện nhiệm vụ, kết quả và kiến nghị công tác chuẩn thể thức NĐ 30.',
  defaultData: {
    companyName: '[Tên công ty]',
    docCode: '45',
    reportTitle: 'Báo cáo kết quả công tác Quý III và Phương hướng nhiệm vụ Quý IV năm 2026',
    reportingDept: 'Phòng Vận hành & Phát triển Kinh doanh',
    reporterRole: 'TRƯỞNG PHÒNG VẬN HÀNH',
    reporterName: 'Phạm Thu Trang',
    recipients: '- Ban Giám đốc (để b/c);\n- Các Phòng/Ban liên quan;\n- Lưu: VT, VH.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docCode}}/{{year}}/BC-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# BÁO CÁO
### {{reportTitle}}

**Đơn vị thực hiện:** {{reportingDept}}

- Căn cứ Kế hoạch công tác năm {{year}} của {{companyName}};
- Căn cứ kết quả hoạt động thực tế của các đơn vị trong Quý III/{{year}},

{{reportingDept}} trân trọng báo cáo Ban Giám đốc kết quả thực hiện nhiệm vụ công tác và đề xuất phương hướng nhiệm vụ thời gian tới như sau:

**I. TÌNH HÌNH CHUNG VÀ BỐI CẢNH TRIỂN KHAI**
Trong Quý III/{{year}}, toàn thể cán bộ nhân viên đã nỗ lực hoàn thành tốt các chỉ tiêu kế hoạch được giao trong bối cảnh thị trường công nghệ có nhiều chuyển biến tích cực.

**II. KẾT QUẢ THỰC HIỆN NHIỆM VỤ**
1. Về công tác chuyên môn và vận hành:
- Đã hoàn thành 100% các mốc tiến độ phát triển phần mềm theo đúng kế hoạch ban hành.
- Tỷ lệ hài lòng của khách hàng doanh nghiệp đối với dịch vụ đạt 96.8% (vượt 4.8% so với mục tiêu).
- Duy trì thời gian hoạt động ổn định hệ thống (uptime) đạt 99.92%.

2. Về quản trị nhân sự và tài chính:
- Thực hiện nghiêm túc quy chế làm việc, đảm bảo an toàn an ninh văn phòng và dữ liệu khách hàng.
- Tối ưu hóa chi phí vận hành thường xuyên, tiết kiệm 12% so với định mức ngân sách được duyệt.

**III. ĐÁNH GIÁ CHUNG**
1. Ưu điểm nổi bật:
- Tinh thần trách nhiệm cao, phối hợp liên phòng ban nhịp nhàng, xử lý sự cố nhanh chóng.
- Ứng dụng hiệu quả các công cụ trí tuệ nhân tạo (AI) giúp tăng năng suất lao động lên 35%.

2. Tồn tại, hạn chế và nguyên nhân:
- Một số vị trí nhân sự tuyển dụng mới cần thêm thời gian đào tạo chuyên sâu về quy trình nội bộ.

**IV. PHƯƠNG HƯỚNG NHIỆM VỤ VÀ KIẾN NGHỊ QUÝ IV/{{year}}**
1. Phương hướng trọng tâm:
- Đẩy mạnh hoàn thiện phiên bản thương mại của các ứng dụng chuyển đổi số trước tháng 12/{{year}}.
- Tổ chức chương trình đào tạo nội bộ nâng cao kỹ năng cho đội ngũ kỹ sư và quản trị viên.

2. Kiến nghị, đề xuất:
- Kính đề nghị Ban Giám đốc xem xét phê duyệt bổ sung định biên 05 chuyên viên kỹ thuật chất lượng cao để đáp ứng quy mô mở rộng dự án./.

| **Nơi nhận:**<br>*- {{recipients}}* | *Hà Nội, ngày {{currentDate}}*<br><br>**{{reporterRole}}**<br><br><br>*(Đã ký)*<br><br>**{{reporterName}}** |
| :--- | :---: |
`
};
