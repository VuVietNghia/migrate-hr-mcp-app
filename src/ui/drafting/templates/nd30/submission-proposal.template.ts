import { DraftingTemplate } from '../../types';

export const submissionProposalTemplate: DraftingTemplate = {
  id: 'submission-proposal',
  title: 'Tờ trình phê duyệt (Submission / Proposal)',
  category: 'kehoach',
  categoryLabel: 'Kế hoạch & Báo cáo',
  track: 'nd30_administrative',
  icon: '📑',
  description: 'Tờ trình trình cấp có thẩm quyền phê duyệt chủ trương, kinh phí hoặc phương án công tác chuẩn NĐ 30.',
  defaultData: {
    companyName: '[Tên công ty]',
    docCode: '12',
    subject: 'V/v phê duyệt chủ trương đầu tư nâng cấp hạ tầng máy chủ AI năm 2026',
    approver: 'Hội đồng Quản trị và Tổng Giám đốc Công ty',
    proposerRole: 'TRƯỞNG PHÒNG CÔNG NGHỆ THÔNG TIN',
    proposerName: 'Lê Văn Kỹ Thuật',
    budget: '2.500.000.000 VNĐ (Hai tỷ năm trăm triệu đồng)',
    recipients: '- Như kính gửi;\n- Phòng Kế toán - Tài chính;\n- Lưu: VT, CNTT.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docCode}}/{{year}}/TTr-CNTT | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# TỜ TRÌNH
### {{subject}}

Kính gửi: **{{approver}}**

- Căn cứ Chiến lược phát triển sản phẩm công nghệ và ứng dụng trí tuệ nhân tạo (AI) giai đoạn 2025 - 2027 của Công ty;
- Căn cứ tình hình thực tế về nhu cầu tài nguyên tính toán phục vụ các mô hình phân tích dữ liệu tuyển dụng và tự động hóa quy trình,

Phòng Công nghệ thông tin kính trình Ban Giám đốc xem xét, phê duyệt chủ trương đầu tư với các nội dung chi tiết sau:

**1. Sự cần thiết đầu tư:**
Hệ thống máy chủ hiện tại đã khai thác 90% công suất tải. Để đáp ứng lưu lượng xử lý tài liệu đồng thời của hơn 10.000 người dùng doanh nghiệp, việc nâng cấp cụm GPU chuyên dụng là yêu cầu cấp thiết nhằm tránh gián đoạn dịch vụ.

**2. Phương án và quy mô thực hiện:**
- Mua sắm bổ sung 04 cụm máy chủ tính toán GPU hiệu năng cao đạt chuẩn Tier 3.
- Nâng cấp băng thông kết nối nội bộ lên 40Gbps và bổ sung hệ thống lưu trữ phân tán SSD NVMe 100TB.
- Thời gian triển khai dự kiến: 45 ngày kể từ ngày được phê duyệt ngân sách.

**3. Dự toán kinh phí và nguồn vốn:**
- Tổng kinh phí đầu tư dự kiến: **{{budget}}**.
- Nguồn vốn: Trích từ Quỹ Đầu tư và Phát triển Công nghệ năm {{year}} của Công ty.

**4. Kiến nghị:**
Kính trình Ban Giám đốc xem xét, phê duyệt chủ trương đầu tư và ủy quyền cho Phòng Công nghệ thông tin phối hợp với Phòng Kế toán thực hiện quy trình mua sắm theo đúng quy chế hiện hành.

Kính trình Ban Giám đốc xem xét, quyết định./.

| **Nơi nhận:**<br>*- {{recipients}}* | *Hà Nội, ngày {{currentDate}}*<br><br>**{{proposerRole}}**<br><br><br>*(Đã ký)*<br><br>**{{proposerName}}** |
| :--- | :---: |
`
};
