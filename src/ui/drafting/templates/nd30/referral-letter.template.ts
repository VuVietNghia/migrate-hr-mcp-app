import { DraftingTemplate } from '../../types';

export const referralLetterTemplate: DraftingTemplate = {
  id: 'referral-letter',
  title: 'Giấy giới thiệu (Referral Letter)',
  category: 'thongtin',
  categoryLabel: 'Thông tin & Giao tiếp',
  track: 'nd30_administrative',
  icon: '📄',
  description: 'Mẫu Giấy giới thiệu (Referral Letter) chuẩn thể thức Nghị định 30/2020/NĐ-CP.',
  defaultData: {
    companyName: '[Tên công ty]',
    docCode: '01'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docCode}}/{{year}}/{{companyCode}}<br>V/v nội dung | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

Kính gửi: Các phòng ban/Đơn vị liên quan

Căn cứ quy định hiện hành và yêu cầu thực tiễn...

**Nội dung chính:**
1. Nội dung thứ nhất...
2. Nội dung thứ hai...

Yêu cầu các đơn vị nghiêm túc triển khai thực hiện./.

| **Nơi nhận:**<br>*- Như trên;<br>- Lưu: VT.* | *Hà Nội, ngày {{currentDate}}*<br><br>**TỔNG GIÁM ĐỐC**<br><br><br>*(Đã ký & Đóng dấu)*<br><br>**Trần Văn Giám Đốc** |
| :--- | :---: |
`
};
