import { DraftingTemplate } from '../../types';;

export const internalAnnouncementTemplate: DraftingTemplate = {
  id: 'internal-announcement',
  title: 'Thông báo nội bộ (Nghỉ Lễ / Quy chế)',
  category: 'thongtin',
  categoryLabel: 'Thông tin & Giao tiếp',
  track: 'nd30_administrative',
  icon: '📢',
  description: 'Thông báo toàn thể CBNV chuẩn thể thức văn bản hành chính công vụ.',
  defaultData: {
    companyName: '[Tên công ty]',
    announcementTitle: 'Lịch nghỉ Lễ Quốc khánh 02/09 và hoạt động Teambuilding năm 2026',
    recipientGroup: 'Toàn thể Cán bộ Nhân viên công ty',
    startDate: '01/09/2026',
    endDate: '03/09/2026',
    resumeDate: '04/09/2026',
    notes: '- Cán bộ nhân viên chủ động hoàn thành công việc tồn đọng trước kỳ nghỉ.\n- Bộ phận Kỹ thuật và Vận hành duy trì trực On-call 24/7 theo lịch phân công.\n- Chú ý ngắt các thiết bị điện và niêm phong văn phòng trước khi nghỉ.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docNumber}}/{{year}}/TB-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# THÔNG BÁO
### Về việc {{announcementTitle}}

**Kính gửi:** **{{recipientGroup}}**

Ban Giám đốc **{{companyName}}** trân trọng thông báo đến toàn thể Cán bộ Nhân viên lịch nghỉ và kế hoạch làm việc như sau:

**1. Thời gian nghỉ và làm việc lại:**
- Thời gian bắt đầu nghỉ: Từ ngày **{{startDate}}**
- Thời gian kết thúc nghỉ: Hết ngày **{{endDate}}**
- Tổng số ngày nghỉ: 03 ngày liên tục.
- Thời gian quay trở lại làm việc: **08:30 Thứ Sáu, ngày {{resumeDate}}**.

**2. Các quy định lưu ý:**
{{notes}}

Ban Giám đốc chúc toàn thể Cán bộ Nhân viên cùng gia đình một kỳ nghỉ lễ nhiều niềm vui và an toàn./.

| **Nơi nhận:**<br>*- Toàn thể CBNV;*<br>*- Lưu: Hành chính.* | *Hà Nội, ngày {{currentDate}}*<br><br>**TRƯỞNG PHÒNG HÀNH CHÍNH - NHÂN SỰ**<br><br><br>*(Đã duyệt & thông báo)* |
| :--- | :---: |
`
};
