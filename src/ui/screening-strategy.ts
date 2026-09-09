export interface IScreeningStrategy {
  getRenamePrompt(cvContext: string): string;
  getScoringPrompt(cvContext: string, jdContent: string): string;
}

export class MarkdownScreeningStrategy implements IScreeningStrategy {
  private chuanHoaRules: string;
  private sangLocRules: string;

  constructor(chuanHoaRules: string, sangLocRules: string) {
    this.chuanHoaRules = chuanHoaRules;
    this.sangLocRules = sangLocRules;
  }

  getRenamePrompt(cvContext: string): string {
    return `<task>
  <objective>Đọc nội dung CV và trích xuất họ tên, ngày nộp để tạo tên file mới.</objective>
  <strict_constraints>
    - CẤM MỌI HÀNH VI TỰ CHẾ HOẶC DỰ ĐOÁN. Nếu không tìm thấy, dùng giá trị "KhongXacDinh".
  </strict_constraints>
  <data_standardization>
${this.chuanHoaRules}
  </data_standardization>
  
${cvContext}

  <output_format>
    Bạn BẮT BUỘC phải bọc tên file mới bên trong thẻ XML <filename>.
    Ví dụ: <filename>2026-07-01_CV_NguyenVanA</filename>
    Nghiêm cấm viết bất kỳ lời giải thích nào bên ngoài thẻ <filename>.
  </output_format>
</task>`;
  }

  getScoringPrompt(cvContext: string, jdContent: string): string {
    return `<task>
  <objective>
    Đọc CV ứng viên, chấm điểm dựa trên Job Description và Bộ Tiêu Chuẩn.
  </objective>
  <context>
    <job_description>
${jdContent}
    </job_description>
    <evaluation_criteria>
${this.sangLocRules}
    </evaluation_criteria>
  </context>
  
${cvContext}

  <execution_steps>
    1. Đọc nội dung CV dựa trên hướng dẫn bên trên.
    2. Trích xuất CÁC TRÍCH DẪN NGUYÊN VĂN (exact quotes) từ văn bản cho các kỹ năng, kinh nghiệm, học vấn.
    3. Đối chiếu các trích dẫn đó với <evaluation_criteria> để ra quyết định ĐẠT/CÂN NHẮC/KHÔNG ĐẠT/KHÔNG TUYỂN.
  </execution_steps>

  <strict_constraints>
    - KHÔNG TỰ BỊA DỮ LIỆU. Mọi đánh giá phải có BẰNG CHỨNG LÀ TRÍCH DẪN TỪ TEXT TRONG CV.
    - Nếu CV không ghi thông tin, mặc định là ứng viên KHÔNG CÓ thông tin đó. Không tự suy diễn.
  </strict_constraints>

  <output_schema>
    Bạn PHẢI trả về ĐÚNG CẤU TRÚC JSON sau. Đặt nó bên trong khối \`\`\`json ... \`\`\`.
    {
      "verification": {
        "text_analyzed": "Yes/No (Bạn đã đọc được nội dung CV chưa?)"
      },
      "extracted_evidence": [
        "Quote 1 nguyên văn từ CV...",
        "Quote 2 nguyên văn từ CV..."
      ],
      "category": "ĐẠT | CÂN NHẮC | KHÔNG ĐẠT | KHÔNG TUYỂN",
      "score": 85,
      "reason": "Lý do (Phải viện dẫn các quote ở trên)"
    }
  </output_schema>
</task>`;
  }
}
