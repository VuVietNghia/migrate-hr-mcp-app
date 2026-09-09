import { DraftingTemplate } from '../../types';

export const powerOfAttorneyTemplate: DraftingTemplate = {
  id: 'power-of-attorney',
  title: 'Giấy ủy quyền (Power of Attorney)',
  category: 'thongtin',
  categoryLabel: 'Thông tin & Giao tiếp',
  track: 'nd30_administrative',
  icon: '⚖️',
  description: 'Văn bản ủy quyền đại diện ký kết hợp đồng, giải quyết thủ tục pháp lý hoặc điều hành công việc.',
  defaultData: {
    companyName: '[Tên công ty]',
    grantorName: 'Trần Văn Giám Đốc',
    grantorRole: 'Tổng Giám đốc - Người đại diện theo pháp luật',
    grantorId: '001080001111',
    granteeName: 'Nguyễn Văn Phó',
    granteeRole: 'Phó Tổng Giám đốc Điều hành',
    granteeId: '001085002222',
    scopeOfAuthority: 'Được toàn quyền đại diện ký kết các Hợp đồng kinh tế, Hợp đồng cung cấp dịch vụ có giá trị dưới 1.000.000.000 VNĐ và điều hành các hoạt động tác nghiệp hàng ngày của Công ty trong thời gian Tổng Giám đốc đi công tác.',
    validUntil: '31/12/2026'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docNumber}}/{{year}}/GUQ-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# GIẤY ỦY QUYỀN
### V/v Thực hiện các giao dịch và ký kết hợp đồng nhân danh Công ty

*Hôm nay, ngày {{currentDate}}, tại trụ sở Công ty, chúng tôi gồm có:*

**1. BÊN ỦY QUYỀN (NGƯỜI ỦY QUYỀN):**
- **Họ và tên:** **{{grantorName}}**
- **Chức vụ:** {{grantorRole}}
- **Số CCCD:** {{grantorId}} - Đại diện pháp luật của **{{companyName}}**

**2. BÊN ĐƯỢC ỦY QUYỀN (NGƯỜI NHẬN ỦY QUYỀN):**
- **Họ và tên:** **{{granteeName}}**
- **Chức vụ:** {{granteeRole}}
- **Số CCCD:** {{granteeId}}

**3. PHẠM VI VÀ NỘI DUNG ỦY QUYỀN:**
{{scopeOfAuthority}}

**4. THỜI HẠN ỦY QUYỀN:**
Giấy ủy quyền này có hiệu lực kể từ ngày ký cho đến hết ngày **{{validUntil}}** hoặc chấm dứt khi Người ủy quyền có văn bản thay thế.

Hai bên cam kết chịu hoàn toàn trách nhiệm trước pháp luật về mọi giao dịch được thực hiện trong phạm vi ủy quyền nêu trên./.

| **NGƯỜI ĐƯỢC ỦY QUYỀN**<br>*(Ký & ghi rõ họ tên)*<br><br><br>**{{granteeName}}** | **NGƯỜI ỦY QUYỀN**<br>*(Ký tên, đóng dấu)*<br><br><br>**{{grantorName}}** |
| :---: | :---: |
`
};
