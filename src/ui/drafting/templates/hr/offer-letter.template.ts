import { DraftingTemplate } from '../../types';

export const offerLetterTemplate: DraftingTemplate = {
  id: 'offer-letter',
  title: 'Thư mời nhận việc (Offer Letter)',
  category: 'thoathuan',
  categoryLabel: 'Ghi nhận & Thỏa thuận',
  track: 'modern_enterprise',
  icon: '✉️',
  description: 'Thư mời nhận việc trang trọng gửi ứng viên trúng tuyển, chuẩn chính sách đãi ngộ của doanh nghiệp.',
  defaultData: {
    companyName: '[Tên công ty]',
    candidateName: 'Nguyễn Văn A',
    position: 'Senior Frontend Engineer',
    department: 'Phòng Kỹ thuật & Công nghệ',
    startDate: '15/08/2026',
    probationSalary: '25.500.000 VNĐ / tháng',
    officialSalary: '30.000.000 VNĐ / tháng',
    probationDuration: '02 tháng (hưởng 85% lương chính thức)',
    workLocation: 'Tầng 8, Tòa nhà [Trụ sở công ty], Cầu Giấy, Hà Nội',
    reportingTo: 'Trưởng phòng Kỹ thuật',
    replyDeadline: '10/08/2026'
  },
  templateText: `# THƯ MỜI NHẬN VIỆC (JOB OFFER LETTER)
### V/v Tuyển dụng nhân sự vị trí {{position}}

**Số:** {{docNumber}}/{{year}}/OL-{{companyCode}}
**Hà Nội, ngày {{currentDate}}**

---

### Kính gửi: **Ông/Bà {{candidateName}}**

Ban Giám đốc và Phòng Nhân sự **{{companyName}}** trân trọng chúc mừng và gửi lời mời Ông/Bà gia nhập đội ngũ nhân sự của công ty với các thông tin chi tiết như sau:

**1. Thông tin vị trí công tác:**
- **Vị trí tuyển dụng:** {{position}}
- **Phòng ban / Bộ phận:** {{department}}
- **Cán bộ quản lý trực tiếp:** {{reportingTo}}
- **Địa điểm làm việc:** {{workLocation}}
- **Thời gian làm việc:** Từ Thứ 2 đến Thứ 6 (08:30 - 17:30)
- **Ngày bắt đầu nhận việc (Onboarding Date):** **{{startDate}}**

**2. Chế độ tiền lương & Đãi ngộ:**
- **Thời gian thử việc:** {{probationDuration}}
- **Mức lương thử việc:** **{{probationSalary}}**
- **Mức lương chính thức (Gross):** **{{officialSalary}}**
- **Đánh giá & Thưởng:** Thưởng KPI định kỳ theo quý, lương tháng 13 và thưởng Lễ Tết.
- **Bảo hiểm & Phúc lợi:** Tham gia đầy đủ BHXH, BHYT, BHTN theo quy định; Gói bảo hiểm sức khỏe bảo hiểm sức khỏe theo chính sách công ty.

**3. Xác nhận nhận việc:**
Vui lòng phản hồi xác nhận đồng ý nhận việc bằng cách gửi email hoặc ký xác nhận văn bản này trước **17:00 ngày {{replyDeadline}}**.

Chúng tôi rất hân hạnh được chào đón Ông/Bà đồng hành cùng sự phát triển của **{{companyName}}**.

| **ĐẠI DIỆN CÔNG TY**<br>*(Ký & Đóng dấu)*<br><br><br>**TRƯỞNG PHÒNG NHÂN SỰ** | **XÁC NHẬN CỦA ỨNG VIÊN**<br>*(Ký & Ghi rõ họ tên)*<br><br><br>**{{candidateName}}** |
| :---: | :---: |
`
};
