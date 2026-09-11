export interface ICvContextBuilder {
  /**
   * Sinh ra đoạn văn bản Context (có thể là nội dung file, hoặc đường dẫn file) 
   * để gài vào Prompt đưa cho AI.
   * 
   * @param roomId ID của Room hiện tại
   * @param originalFileName Tên gốc của file CV (ví dụ: "CV Vũ Việt Nghĩa.pdf")
   * @returns Đoạn văn bản Context
   */
  buildContext(roomId: string, originalFileName: string): string;
}

export class MarkdownPathContextBuilder implements ICvContextBuilder {
  buildContext(roomId: string, originalFileName: string): string {
    // Theo quy luật của PrivOS Auto Parse, khoảng trắng trong tên file sẽ bị đổi thành dấu gạch dưới (_)
    const sanitizedFileName = originalFileName.replace(/ /g, '_');
    const mdFileName = `${sanitizedFileName}.md`;
    const fullPath = `@Files:${roomId}/.markdown/hr-miniapp/cv-lon-xon/${mdFileName}`;
    
    return `
TÀI LIỆU CV CỦA ỨNG VIÊN:
1. Bạn BẮT BUỘC phải sử dụng công cụ nội bộ của bạn để tìm và đọc toàn bộ nội dung file Markdown của CV này tại đường dẫn tuyệt đối sau: 
   ${fullPath}
2. [QUAN TRỌNG] Nếu bạn không tìm thấy file, có thể hệ thống Auto Parse đang xử lý. BẮT BUỘC đợi 3-5 giây và thử tìm lại (thử tối đa 3 lần).
3. Đọc dữ liệu thô từ file, TUYỆT ĐỐI KHÔNG TỰ BỊA (hallucinate) thông tin CV nếu không đọc được file.
`.trim();
  }
}
