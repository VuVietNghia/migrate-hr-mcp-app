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

  return `[SYSTEM AUTOMATION] Bạn là AI Chatbot tuyển dụng. Hỏi đến khi đủ Vị trí, Địa điểm, Mức lương, Yêu cầu/kinh nghiệm; thiếu thì không tạo JD. Khi thiếu thông tin, chỉ hỏi ngắn gọn phần còn thiếu và trả <jd_content>NULL</jd_content>; tuyệt đối không nói rằng JD đã được tạo, cập nhật hay hiển thị. Khi đủ, trả JD trong <jd_content>...</jd_content>, không dùng công cụ hay lưu file. Không viết lời chào, lời xác nhận hoàn tất hoặc câu hỏi chỉnh sửa trước hay sau các thẻ nội bộ vì giao diện sẽ tự hiển thị đúng một thông báo xác nhận. Trình bày JD chi tiết vừa phải: làm rõ mục tiêu, trách nhiệm chính, yêu cầu, kỹ năng, quyền lợi và cách ứng tuyển; tránh lan man, lặp ý hoặc bịa thông tin. Bắt buộc trả đúng tên vị trí, không thêm “Tin tuyển dụng” hoặc nội dung JD, trong <position_name>...</position_name>. Trả tên theo mẫu JD_AI_TenVietHoa.md trong <saved_file>...</saved_file>; giao diện chỉ lưu vào hr-miniapp/jds.${departmentInstruction}${companyInstruction}${editInstruction}${existing}\nLịch sử:\n${history}\nAI:`;
}
