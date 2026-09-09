import { DraftingTemplate } from '../../types';;

export const probationContractTemplate: DraftingTemplate = {
  id: 'probation-contract',
  title: 'Hợp đồng thử việc (Probation Contract)',
  category: 'thoathuan',
  categoryLabel: 'Ghi nhận & Thỏa thuận',
  track: 'nd30_administrative',
  icon: '📝',
  description: 'Hợp đồng thử việc chuẩn theo Bộ luật Lao động 2019 và thể thức văn bản hiện đại.',
  defaultData: {
    companyName: '[Tên công ty]',
    companyRep: 'Trần Văn Giám Đốc',
    companyRole: 'Tổng Giám đốc',
    companyAddress: 'Tầng 8, Tòa nhà [Trụ sở công ty], Cầu Giấy, Hà Nội',
    candidateName: 'Nguyễn Văn A',
    dob: '01/01/1995',
    idCard: '001095012345',
    idCardDate: '10/05/2021',
    idCardPlace: 'Cục Cảnh sát QLHC về TTXH',
    candidateAddress: 'Số 123 Đường Cầu Giấy, Hà Nội',
    position: 'Chuyên viên Kỹ thuật phần mềm',
    department: 'Phòng Kỹ thuật & Công nghệ',
    startDate: '15/08/2026',
    endDate: '15/10/2026',
    baseSalary: '25.500.000 VNĐ / tháng (85% mức lương chính thức)'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docNumber}}/{{year}}/HĐTV-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# HỢP ĐỒNG THỬ VIỆC
### V/v Thử việc vị trí {{position}}

*Hôm nay, ngày {{currentDate}}, tại trụ sở Công ty, chúng tôi gồm có:*

**BÊN A: NGƯỜI SỬ DỤNG LAO ĐỘNG**
- **Tên doanh nghiệp:** **{{companyName}}**
- **Đại diện:** {{companyRep}} - **Chức vụ:** {{companyRole}}
- **Địa chỉ:** {{companyAddress}}

**BÊN B: NGƯỜI LAO ĐỘNG**
- **Họ và tên:** **{{candidateName}}**
- **Ngày sinh:** {{dob}} - **Số CCCD:** {{idCard}} (Cấp ngày: {{idCardDate}} tại {{idCardPlace}})
- **Địa chỉ thường trú:** {{candidateAddress}}

Hai bên thống nhất ký kết Hợp đồng thử việc với các điều khoản sau:

**Điều 1. Công việc và thời hạn hợp đồng:**
- Vị trí công tác: {{position}} - Bộ phận: {{department}}
- Thời hạn thử việc: 02 tháng, bắt đầu từ ngày **{{startDate}}** đến hết ngày **{{endDate}}**.
- Nhiệm vụ: Thực hiện các công việc chuyên môn theo Bản mô tả công việc (JD) và chỉ đạo của Cán bộ quản lý trực tiếp.

**Điều 2. Chế độ làm việc & Tiền lương:**
- Thời gian làm việc: 40 giờ/tuần (Thứ 2 đến Thứ 6: 08:30 - 17:30).
- Tiền lương trong thời gian thử việc: **{{baseSalary}}**.
- Hình thức trả lương: Chuyển khoản ngân hàng vào ngày 05 hàng tháng.

**Điều 3. Nghĩa vụ và quyền lợi:**
- Bên A: Có trách nhiệm hướng dẫn, tạo điều kiện thuận lợi và đánh giá trung thực kết quả thử việc của Bên B.
- Bên B: Tuân thủ nội quy lao động, quy chế bảo mật thông tin và hoàn thành nhiệm vụ được giao.

**Điều 4. Hiệu lực hợp đồng:**
Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản để thực hiện.

| **ĐẠI DIỆN BÊN A**<br>*(Ký tên, đóng dấu)*<br><br><br>**{{companyRep}}** | **ĐẠI DIỆN BÊN B**<br>*(Ký & ghi rõ họ tên)*<br><br><br>**{{candidateName}}** |
| :---: | :---: |
`
};
