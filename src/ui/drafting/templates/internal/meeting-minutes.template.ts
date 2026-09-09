import { DraftingTemplate } from '../../types';

export const meetingMinutesTemplate: DraftingTemplate = {
  id: 'meeting-minutes',
  title: 'Biên bản cuộc họp (Meeting Minutes)',
  category: 'thoathuan',
  categoryLabel: 'Ghi nhận & Thỏa thuận',
  track: 'nd30_administrative',
  icon: '✍️',
  description: 'Biên bản ghi nhận diễn biến, kết luận cuộc họp Ban Giám đốc hoặc Hội đồng chuyên môn.',
  defaultData: {
    companyName: '[Tên công ty]',
    meetingTitle: 'Họp rà soát tiến độ dự án chuyển đổi số Quý III và chuẩn bị kế hoạch kinh doanh Quý IV',
    location: 'Phòng họp VIP 1, Tòa nhà [Trụ sở công ty]',
    chairperson: 'Ông Trần Văn Giám Đốc - Tổng Giám đốc',
    secretary: 'Bà Hoàng Kim Thư - Thư ký Ban Giám đốc',
    attendees: 'Ban Giám đốc, Trưởng các Phòng: CNTT, Kinh doanh, Marketing, Kế toán và Nhân sự.'
  },
  templateText: `| **{{companyName}}**<br>Số: {{docNumber}}/{{year}}/BB-{{companyCode}} | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**<br>**Độc lập - Tự do - Hạnh phúc** |
| :---: | :---: |

# BIÊN BẢN CUỘC HỌP
### Về việc {{meetingTitle}}

**1. Thời gian, địa điểm:**
- Thời gian bắt đầu: 09:00 ngày {{currentDate}}
- Địa điểm: {{location}}

**2. Thành phần tham dự:**
- **Chủ trì cuộc họp:** {{chairperson}}
- **Thư ký cuộc họp:** {{secretary}}
- **Thành viên tham dự:** {{attendees}}
- Tình trạng: Đầy đủ, đúng thành phần triệu tập.

**3. Nội dung cuộc họp:**
- **Phần 1: Báo cáo tình hình:** Trưởng phòng CNTT báo cáo tiến độ phát triển phần mềm và các chỉ số vận hành hệ thống trong tháng qua.
- **Phần 2: Thảo luận:** Các phòng ban thảo luận về phương án phối hợp marketing, tối ưu hóa quy trình tư vấn khách hàng và phân bổ ngân sách.
- **Phần 3: Ý kiến của Chủ tọa:** Đánh giá cao nỗ lực của các đơn vị, đồng thời yêu cầu khắc phục một số điểm nghẽn trong khâu giao vận và hỗ trợ kỹ thuật.

**4. Kết luận và chỉ đạo của Chủ tọa:**
- Thống nhất phê duyệt kế hoạch ra mắt phiên bản mới trước ngày 30/11/{{year}}.
- Giao Phòng CNTT chủ trì việc kiểm thử an toàn thông tin với đơn vị độc lập.
- Giao Phòng Kế toán cân đối và giải ngân kinh phí giai đoạn 2 theo đúng tiến độ hợp đồng.

Biên bản kết thúc vào hồi 11:30 cùng ngày, đã được đọc lại cho toàn thể các thành viên tham dự nghe và nhất trí thông qua./.

| **THƯ KÝ CUỘC HỌP**<br>*(Ký & ghi rõ họ tên)*<br><br><br>**{{secretary}}** | **CHỦ TRÌ CUỘC HỌP**<br>*(Ký & ghi rõ họ tên)*<br><br><br>**{{chairperson}}** |
| :---: | :---: |
`
};
