import { DraftingTemplate } from '../../types';

export const implementationPlanTemplate: DraftingTemplate = {
  id: 'implementation-plan',
  title: 'Kế hoạch triển khai (Implementation Plan / Roadmap)',
  category: 'kehoach',
  categoryLabel: 'Kế hoạch & Báo cáo',
  track: 'nd30_administrative',
  icon: '📋',
  description: 'Kế hoạch triển khai dự án/chuyển đổi số chuẩn thể thức NĐ 30/2020/NĐ-CP (Khớp 100% định dạng Word chuẩn).',
  defaultData: {
    companyName: '[Tên công ty]',
    planCode: '03',
    subject: 'V/v triển khai Ứng dụng di động (App) phục vụ chăm sóc khách hàng năm 2026',
    draftingDept: 'Phòng Công nghệ thông tin',
    recipients: '- Ban Giám đốc Công ty;\n- Các Phòng: Công nghệ thông tin, Kinh doanh, Marketing, Chăm sóc khách hàng;\n- Trung tâm Vận hành.',
    signerName: 'Trần Văn Giám Đốc',
    signerRole: 'GIÁM ĐỐC',
    totalBudget: '5.000.000.000 đồng (năm tỷ đồng)',
    duration: '05 tháng'
  },
  templateText: `| **{{companyName}}**<br>Số: {{planCode}}/{{year}}/KH-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# KẾ HOẠCH
### {{subject}}

**Đơn vị soạn thảo:** {{draftingDept}}

**Kính gửi:**
{{recipients}}

- Căn cứ Luật Doanh nghiệp số 59/2020/QH14 được Quốc hội nước Cộng hòa xã hội chủ nghĩa Việt Nam thông qua ngày 17 tháng 6 năm 2020;
- Căn cứ Điều lệ tổ chức và hoạt động của {{companyName}};
- Căn cứ Nghị quyết Hội đồng quản trị Công ty về chiến lược chuyển đổi số giai đoạn 2025 - 2027;
- Xét đề nghị của Trưởng phòng Công nghệ thông tin và Trưởng phòng Kinh doanh,

Nhằm đẩy nhanh tiến độ chiến lược chuyển đổi số của Công ty, nâng cao trải nghiệm khách hàng và mở rộng thị phần dịch vụ trong năm 2026, Ban Giám đốc ban hành Kế hoạch triển khai chi tiết như sau:

**1. Mục tiêu - Yêu cầu:** Triển khai thành công phiên bản App thương mại (MVP) trên hai nền tảng iOS và Android trong Quý IV/2026.

a) Mục tiêu chi tiết:
- Giao diện ứng dụng thân thiện, dễ sử dụng, thống nhất với nhận diện thương hiệu của Công ty trên các nền tảng số.
- Tích hợp đầy đủ các tính năng cốt lõi: đăng ký/đăng nhập tài khoản, tra cứu thông tin sản phẩm - dịch vụ, tích điểm đổi quà và thanh toán trực tuyến bảo mật.
- Đạt chứng nhận bảo mật dữ liệu theo quy định của Luật An ninh mạng 2018 và Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.

b) Yêu cầu kỹ thuật:
- Kiến trúc microservices, hỗ trợ mở rộng linh hoạt; thời gian phản hồi (response time) dưới 02 giây cho 95% số lượng tác vụ người dùng.
- Tỷ lệ hoạt động ổn định (uptime) đạt tối thiểu 99.5% trong điều kiện tải bình thường và giờ cao điểm.

**2. Đối tượng và phạm vi áp dụng:** Kế hoạch áp dụng đối với toàn bộ cán bộ, nhân viên các Phòng: Công nghệ thông tin, Kinh doanh, Marketing, Chăm sóc khách hàng và các đơn vị liên quan.

**3. Nội dung công việc:** Bao gồm các giai đoạn triển khai chính:
a) Giai đoạn chuẩn bị (Tháng 07 - 08/{{year}}): Hoàn thiện tài liệu yêu cầu nghiệp vụ (PRD), thiết kế UI/UX và phê duyệt kiến trúc kỹ thuật tổng thể.
b) Giai đoạn phát triển (Tháng 08 - 10/{{year}}): Lập trình các module backend và frontend; tích hợp cổng thanh toán và hệ thống CRM.
c) Giai đoạn thử nghiệm (Tháng 10/{{year}}): Tổ chức Closed Beta với 500 người dùng nội bộ và khách hàng thân thiết để ghi nhận phản hồi, khắc phục lỗi.
d) Giai đoạn phát hành chính thức (Tháng 11/{{year}}): Đăng tải App lên App Store và Google Play; triển khai chiến dịch truyền thông diện rộng.
e) Giai đoạn vận hành - bảo trì (Từ tháng 12/{{year}} trở đi): Giám sát hệ thống, phát hành các bản cập nhật định kỳ và tối ưu hóa hiệu năng.

**4. Tiến độ thực hiện:** Tổng thời gian triển khai là {{duration}} kể từ ngày Kế hoạch có hiệu lực.

**5. Tổ chức bộ máy điều hành:** Thành lập Ban Chỉ đạo dự án do Giám đốc điều hành làm Trưởng ban; Phó ban Thường trực là Trưởng phòng Công nghệ thông tin.

**6. Nguồn lực bảo đảm:** Tổng mức đầu tư dự kiến là {{totalBudget}}, bảo đảm từ nguồn vốn đầu tư phát triển công nghệ năm {{year}} của Công ty.

**7. Phân công trách nhiệm:** Cụ thể như sau:
- Phòng Công nghệ thông tin: Chủ trì thiết kế kiến trúc, lập trình, kiểm thử và vận hành kỹ thuật.
- Phòng Kinh doanh: Cung cấp yêu cầu nghiệp vụ, danh mục sản phẩm - dịch vụ và chính sách giá trên App.
- Phòng Marketing: Lên kế hoạch truyền thông, nội dung sáng tạo và quảng bá App trên các kênh số.
- Phòng Chăm sóc khách hàng: Chuẩn bị kịch bản hỗ trợ, đào tạo tổng đài viên và xử lý phản hồi người dùng.
- Trung tâm Vận hành: Đảm bảo quy trình giao dịch, hoàn tất đơn hàng và xử lý khiếu nại liên quan.

**8. Tiêu chí đánh giá hiệu quả:**
- Số lượt tải và cài đặt đạt tối thiểu 100.000 trong 03 tháng đầu phát hành.
- Điểm đánh giá trung bình trên App Store và Google Play đạt từ 4.2/5 sao trở lên.
- Tỷ lệ chuyển đổi giao dịch qua App chiếm ít nhất 25% tổng giao dịch toàn hệ thống.

Kế hoạch này là cơ sở để các Phòng, Ban và cá nhân có liên quan triển khai thực hiện. Trong quá trình thực hiện, nếu có khó khăn, vướng mắc, các đơn vị kịp thời báo cáo Ban Chỉ đạo dự án để xem xét, chỉ đạo giải quyết./.

| **Nơi nhận:**<br>*- Như trên (để chỉ đạo, triển khai);*<br>*- Ban Giám đốc (để báo cáo);*<br>*- Lưu: VT, CNTT.* | *Hà Nội, ngày {{currentDate}}*<br><br>**{{signerRole}}**<br><br><br>*(Đã ký)*<br><br>**{{signerName}}** |
| :--- | :---: |
`
};
