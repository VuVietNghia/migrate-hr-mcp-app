import { DraftingTemplate } from '../../types';;

export const salaryIncreaseDecisionTemplate: DraftingTemplate = {
  id: 'salary-increase-decision',
  title: 'Quyết định bổ nhiệm / Tăng lương',
  category: 'chidao',
  categoryLabel: 'Chỉ đạo & Điều hành',
  track: 'nd30_administrative',
  icon: '🎖️',
  description: 'Quyết định hành chính chuẩn thể thức NĐ 30/2020/NĐ-CP về bổ nhiệm và điều chỉnh lương.',
  defaultData: {
    companyName: '[Tên công ty]',
    signerName: 'Trần Văn Giám Đốc',
    signerRole: 'TỔNG GIÁM ĐỐC',
    employeeName: 'Nguyễn Văn A',
    currentPosition: 'Chuyên viên Kỹ thuật',
    newPosition: 'Trưởng nhóm Phát triển Sản phẩm (Tech Lead)',
    department: 'Phòng Kỹ thuật & Công nghệ',
    oldSalary: '25.000.000 VNĐ / tháng',
    newSalary: '35.000.000 VNĐ / tháng',
    effectiveDate: '01/09/2026',
    reason: 'Hoàn thành xuất sắc các chỉ tiêu KPI và dẫn dắt thành công dự án trọng điểm.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docNumber}}/{{year}}/QĐ-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# QUYẾT ĐỊNH
### Về việc bổ nhiệm chức danh và điều chỉnh mức lương nhân sự

**{{signerRole}} {{companyName}}**

- Căn cứ Điều lệ tổ chức và hoạt động của {{companyName}};
- Căn cứ Quy chế Tiền lương & Đãi ngộ hiện hành của Công ty;
- Xét kết quả đánh giá năng lực công tác và đề xuất của Trưởng phòng Nhân sự,

### QUYẾT ĐỊNH:

**Điều 1.** Bổ nhiệm chức vụ và điều chỉnh mức lương cho cán bộ nhân sự:
- **Họ và tên:** **Ông/Bà {{employeeName}}**
- **Vị trí hiện tại:** {{currentPosition}}
- **Vị trí bổ nhiệm mới:** **{{newPosition}}**
- **Phòng ban:** {{department}}

**Điều 2.** Điều chỉnh mức thu nhập hàng tháng:
- **Mức lương cũ:** {{oldSalary}}
- **Mức lương mới:** **{{newSalary}}** (Chưa bao gồm các khoản phụ cấp trách nhiệm theo quy chế).
- **Lý do:** {{reason}}

**Điều 3.** Quyết định này có hiệu lực thi hành kể từ ngày **{{effectiveDate}}**.

**Điều 4.** Phòng Hành chính - Nhân sự, Phòng Kế toán - Tài chính, các bộ phận liên quan và Ông/Bà **{{employeeName}}** chịu trách nhiệm thi hành Quyết định này./.

| **Nơi nhận:**<br>*- Như Điều 4;*<br>*- Lưu: VT, HSNV.* | *Hà Nội, ngày {{currentDate}}*<br><br>**{{signerRole}}**<br><br><br>*(Đã ký & Đóng dấu)*<br><br>**{{signerName}}** |
| :--- | :---: |
`
};
