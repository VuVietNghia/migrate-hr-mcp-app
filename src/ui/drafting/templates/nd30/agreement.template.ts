import { DraftingTemplate } from '../../types';

export const agreementTemplate: DraftingTemplate = {
  id: 'agreement',
  title: 'Bản thỏa thuận (Agreement)',
  category: 'thoathuan',
  categoryLabel: 'Ghi nhận & Thỏa thuận',
  track: 'nd30_administrative',
  icon: '📄',
  description: 'Mẫu Bản thỏa thuận (Agreement) chuẩn thể thức Nghị định 30/2020/NĐ-CP.',
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
