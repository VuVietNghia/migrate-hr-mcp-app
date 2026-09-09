import { DraftingTemplate } from '../../types';

export const officialDispatchTemplate: DraftingTemplate = {
  id: 'official-dispatch',
  title: 'Công văn hành chính (Official Dispatch)',
  category: 'thongtin',
  categoryLabel: 'Thông tin & Giao tiếp',
  track: 'nd30_administrative',
  icon: '📨',
  description: 'Công văn trao đổi công việc, đề nghị phối hợp hoặc phúc đáp đối tác chuẩn thể thức Nghị định 30.',
  defaultData: {
    companyName: '[Tên công ty]',
    docCode: '88',
    subject: 'V/v phối hợp triển khai hạ tầng kết nối và bảo mật hệ thống năm 2026',
    recipientOrg: 'TẬP ĐOÀN VIỄN THÔNG VÀ CÔNG NGHỆ THÔNG TIN',
    signerName: 'Trần Văn Giám Đốc',
    signerRole: 'TỔNG GIÁM ĐỐC',
    draftingDept: 'Phòng Kỹ thuật & Hạ tầng',
    recipients: '- Như trên;\n- Ban Giám đốc (để b/c);\n- Lưu: VT, KT.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docCode}}/{{year}}/{{companyCode}}-CV<br>V/v {{subject}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

Kính gửi: **{{recipientOrg}}**

- Căn cứ Biên bản ghi nhớ hợp tác chiến lược giữa {{companyName}} và {{recipientOrg}} ký ngày 15 tháng 01 năm 2026;
- Căn cứ Kế hoạch nâng cấp và bảo đảm an toàn thông tin mạng năm 2026 của Công ty,

Nhằm bảo đảm tiến độ triển khai đồng bộ hạ tầng truyền dẫn số và nâng cao độ an toàn cho các ứng dụng nghiệp vụ trọng điểm, {{companyName}} trân trọng gửi lời chào và trân trọng đề nghị Quý đơn vị phối hợp triển khai các nội dung sau:

**1. Nội dung phối hợp kỹ thuật:**
- Cung cấp kênh truyền dẫn cáp quang dự phòng tốc độ 10Gbps kết nối trực tiếp giữa hai Trung tâm dữ liệu (DC chính và DC dự phòng).
- Phối hợp thiết lập hệ thống tường lửa thế hệ mới (Next-Gen Firewall) và kiểm thử khả năng phòng chống tấn công từ chối dịch vụ (DDoS).
- Cử cán bộ kỹ thuật thường trực tham gia Ban Chỉ đạo kỹ thuật chung trước ngày 20/08/{{year}}.

**2. Tiến độ và đầu mối liên hệ:**
- Thời gian hoàn tất kiểm thử kết nối: Trước ngày 30/09/{{year}}.
- Đầu mối phụ trách kỹ thuật của {{companyName}}: {{draftingDept}} (Điện thoại: 024.3888.9999 - Email: {{companyEmail}}).

{{companyName}} rất mong nhận được sự quan tâm, phối hợp chặt chẽ của Quý đơn vị để công tác triển khai đạt hiệu quả cao nhất./.

| **Nơi nhận:**<br>*- {{recipients}}* | *Hà Nội, ngày {{currentDate}}*<br><br>**{{signerRole}}**<br><br><br>*(Đã ký & Đóng dấu)*<br><br>**{{signerName}}** |
| :--- | :---: |
`
};
