export interface JDChatbotPromptInput {
  selectedName?: string;
  draft: string;
  includeCompany: boolean;
  history: string;
  department?: { key: string; label: string };
}

export function buildJDChatbotPrompt({
  selectedName,
  draft,
  includeCompany,
  history,
  department,
}: JDChatbotPromptInput): string {
  const existing = selectedName
    ? `\nJD đang chỉnh sửa, giữ tên <saved_file>${selectedName}</saved_file>:\n${draft}`
    : '';
  const companyInstruction = !includeCompany
    ? '\nKhông thêm thông tin công ty vào JD.'
    : selectedName
      ? '\nTHÔNG TIN CÔNG TY (bắt buộc trong lượt này): chỉ được dùng công cụ ĐỌC (liệt kê/đọc file) với các tài liệu trong Room Files/hr-miniapp/company, rồi thêm mục “Thông tin công ty” ngắn gọn vào JD đang chỉnh sửa (nếu JD đã có mục này thì cập nhật theo tài liệu) và điều chỉnh yêu cầu tuyển dụng phù hợp với công ty. Người dùng đã chủ động yêu cầu thay đổi này nên nó là ngoại lệ của quy tắc giữ nguyên nội dung; phải trả lại JD đầy đủ trong <jd_content>...</jd_content> kể cả khi tin nhắn của người dùng không nhắc đến công ty. TUYỆT ĐỐI không ghi, sửa, tạo hay lưu bất kỳ file nào (kể cả file JD) — người dùng tự bấm “Lưu thay đổi” trên giao diện.'
      : '\nKhi tạo JD trong lượt này, bắt buộc đọc Room Files/hr-miniapp/company (chỉ đọc, không ghi hay lưu file nào), thêm mục “Thông tin công ty” ngắn gọn và điều chỉnh yêu cầu tuyển dụng phù hợp với công ty.';
  const editInstruction = selectedName
    ? '\nQUY TẮC CHỈNH SỬA: Khi người dùng nói “thêm”, “bổ sung”, “cộng thêm” hoặc “mở rộng”, phải giữ nguyên toàn bộ thông tin cũ và chỉ thêm thông tin mới vào đúng mục; tuyệt đối không xóa giá trị cũ. Ví dụ, thêm địa điểm Hà Nội vào địa điểm hiện có phải giữ cả địa điểm cũ và Hà Nội. Chỉ được xóa hoặc thay thế khi người dùng nói rõ “xóa”, “bỏ”, “thay”, hoặc “đổi từ ... thành ...”. Mọi nội dung không được yêu cầu thay đổi phải giữ nguyên.'
    : '';
  const departmentInstruction = !selectedName && department
    ? `\nPhòng ban bắt buộc: ${department.label} (mã: ${department.key}). Phải ghi “Phòng ban: ${department.label}” trong JD và không được tự đổi phòng ban.`
    : '';
  const metadataInstruction = !selectedName
    ? '\nKhi tạo JD hoàn chỉnh, ngoài <jd_content>, bắt buộc trả thêm metadata chính xác trong các thẻ <jd_location>...</jd_location>, <jd_employment_type>...</jd_employment_type>, <jd_salary>...</jd_salary>, <jd_summary>...</jd_summary> và <jd_description>...</jd_description>. Tổng quan trong <jd_summary> phải là 1–2 câu giới thiệu ngắn về vị trí. <jd_description> phải chứa mô tả công việc đầy đủ, rõ ràng. Các thẻ metadata không được đặt bên trong <jd_content> và không ép bố cục Markdown của JD.'
    : '';

  return `[SYSTEM AUTOMATION] Bạn là AI Chatbot tuyển dụng. Khi tạo JD mới: Hỏi đến khi đủ Vị trí, Địa điểm, Hình thức làm việc, Mức lương, Yêu cầu/kinh nghiệm; thiếu thì không tạo JD. Hình thức làm việc là bắt buộc; không được tự suy đoán và phải hỏi người dùng nếu thiếu. Chấp nhận cách diễn đạt tự do như Full-time, Part-time, Intern/Thực tập, Remote, Hybrid hoặc Contract. Khi thiếu thông tin, chỉ hỏi ngắn gọn phần còn thiếu và trả <jd_content>NULL</jd_content>; tuyệt đối không nói rằng JD đã được tạo, cập nhật hay hiển thị. Khi đủ, trả JD trong <jd_content>...</jd_content>, không dùng công cụ hay lưu file. Dòng tiêu đề H1 đầu tiên của JD phải có dạng “# <tên vị trí>”; không thêm “Tin tuyển dụng”, “Thông tin tuyển dụng” hoặc “Tuyển dụng” vào tiêu đề. Không viết lời chào, lời xác nhận hoàn tất hoặc câu hỏi chỉnh sửa trước hay sau các thẻ nội bộ vì giao diện sẽ tự hiển thị đúng một thông báo xác nhận. Trình bày JD chi tiết vừa phải: làm rõ mục tiêu, trách nhiệm chính, yêu cầu, kỹ năng, quyền lợi và cách ứng tuyển; tránh lan man, lặp ý hoặc bịa thông tin. Bắt buộc trả đúng tên vị trí, không thêm “Tin tuyển dụng” hoặc nội dung JD, trong <position_name>...</position_name>. Trả tên theo mẫu JD_AI_TenVietHoa.md trong <saved_file>...</saved_file>; giao diện chỉ lưu vào hr-miniapp/jds.${metadataInstruction}${departmentInstruction}${companyInstruction}${editInstruction}${existing}\nLịch sử:\n${history}\nAI:`;
}
