import { DraftingTemplate, DraftingActionType } from '../types';

export function renderDraftingTemplate(
  template: DraftingTemplate | string,
  customData: Record<string, string> = {}
): string {
  const defaultData = typeof template === 'object' ? template.defaultData : {};
  let text = typeof template === 'object' ? template.templateText : template;

  const mergedData: Record<string, string> = {
    ...defaultData,
    ...customData
  };

  const now = new Date();
  if (!mergedData.currentDate) {
    mergedData.currentDate = `${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
  }
  if (!mergedData.year) {
    mergedData.year = `${now.getFullYear()}`;
  }
  if (!mergedData.docNumber) {
    mergedData.docNumber = '01';
  }

  Object.entries(mergedData).forEach(([key, val]) => {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    text = text.replace(pattern, val || `[${key}]`);
  });

  return text;
}

export function buildDraftingAIPrompt(
  template: DraftingTemplate,
  formData: Record<string, string>,
  actionType: DraftingActionType | string = 'full_generation',
  customPrompt?: string,
  currentDocContent?: string,
  companyContext?: string
): string {
  const mergedData = { ...template.defaultData, ...formData };

  let actionInstruction = '';
  switch (actionType) {
    case 'make_formal':
      actionInstruction = `NÂNG CAO TÍNH TRANG TRỌNG: Viết lại hoặc tinh chỉnh văn bản hiện tại với văn phong hành chính nhà nước/doanh nghiệp cao cấp, chuẩn mực, uy nghiêm và đúng ngữ pháp pháp lý.`;
      break;
    case 'make_concise':
      actionInstruction = `TINH GỌN VĂN BẢN: Tối ưu hoá câu chữ, súc tích, loại bỏ từ thừa nhưng tuyệt đối giữ nguyên toàn bộ các số liệu, ngày tháng, tên người và các điều khoản quan trọng.`;
      break;
    case 'add_nda':
      actionInstruction = `BỔ SUNG ĐIỀU KHOẢN BẢO MẬT: Chèn thêm một điều khoản/mục riêng về Bảo mật thông tin (NDA), quyền sở hữu trí tuệ và chế tài xử lý vi phạm phù hợp với loại văn bản này.`;
      break;
    case 'bilingual_summary':
      actionInstruction = `TÓM TẮT SONG NGỮ: Thêm một khung tóm tắt song ngữ Việt - Anh (Executive Summary) ngắn gọn ở đầu văn bản trước khi vào nội dung chính.`;
      break;
    case 'custom':
      actionInstruction = `YÊU CẦU TÙY CHỈNH TỪ NGƯỜI DÙNG: "${customPrompt || 'Hoàn thiện văn bản theo ngữ cảnh'}"`;
      break;
    case 'full_generation':
    default:
      actionInstruction = `SOẠN THẢO HOÀN CHỈNH: Điền toàn bộ thông tin từ biểu mẫu vào văn bản, diễn giải chi tiết, rõ ràng các nội dung nghiệp vụ dựa trên mẫu chuẩn.`;
      break;
  }

  return `${companyContext ? `${companyContext}\n` : ''}Bạn là Trợ lý Soạn thảo Văn bản Hành chính & Doanh nghiệp cấp cao (AI Copilot).

THÔNG TIN MẪU VĂN BẢN:
- Tên mẫu: ${template.title}
- Danh mục: ${template.categoryLabel}
- Chuẩn thể thức: ${template.track === 'nd30_administrative' ? 'Nghị định 30/2020/NĐ-CP' : 'Doanh nghiệp hiện đại'}

DỮ LIỆU ĐẦU VÀO (FORM DATA):
${JSON.stringify(mergedData, null, 2)}

NỘI DUNG MẪU GỐC (MARKDOWN TEMPLATE - HÃY TÔN TRỌNG CẤU TRÚC NÀY 100%):
"""
${template.templateText}
"""

${currentDocContent ? `NỘI DUNG VĂN BẢN HIỆN TẠI:\n"""\n${currentDocContent}\n"""\n` : ''}

${buildCompanyContextInstruction(companyContext)}

TÁC VỤ CẦN THỰC HIỆN:
${actionInstruction}

QUY TẮC BẮT BUỘC:
1. Giữ cấu trúc định dạng Markdown chuẩn thể thức văn bản từ "NỘI DUNG MẪU GỐC":
   - Giữ nguyên các định dạng Quốc hiệu in hoa đậm, Tiêu ngữ in thường đứng đậm, Bảng 2 cột cân đối ở tiêu đề và phần Nơi nhận/Ký tên.
   - Thay thế toàn bộ các biến placeholder {{key}} bằng dữ liệu thực tế được cung cấp. Nếu dữ liệu không được cung cấp, tự sinh dữ liệu hợp lý. KHÔNG để lại placeholder thô dạng {{key}}.
2. Không bịa đặt các số liệu không hợp lý.
3. Bọc toàn bộ nội dung văn bản Markdown kết quả bên trong thẻ <drafting_content>...</drafting_content>.
4. TUYỆT ĐỐI KHÔNG META-COMMENTARY (ANTI-YAPPING): Bạn không được phép giải thích, chú thích, xin lỗi, hay nhận xét về những gì bạn làm (ví dụ: không được sinh ra các câu như "Lưu ý...", "Dưới đây là..."). Nội dung sinh ra bên trong và bên ngoài thẻ <drafting_content> phải là VĂN BẢN NGUYÊN BẢN DUY NHẤT. Bắt đầu ngay lập tức bằng <drafting_content>.`;
}

export function buildGenericDraftingAIPrompt(
  userPrompt: string,
  currentDocContent?: string,
  companyContext?: string
): string {
  return `${companyContext ? `${companyContext}\n` : ''}Bạn là Trợ lý Soạn thảo Văn bản Hành chính & Doanh nghiệp cấp cao (AI Copilot).

YÊU CẦU TỪ NGƯỜI DÙNG (YÊU CẦU SOẠN TỰ DO):
"${userPrompt}"

${currentDocContent ? `NỘI DUNG VĂN BẢN HIỆN TẠI:\n"""\n${currentDocContent}\n"""\n` : ''}

${buildCompanyContextInstruction(companyContext)}

TÁC VỤ CẦN THỰC HIỆN:
1. Phân tích yêu cầu của người dùng để soạn thảo một văn bản hành chính/doanh nghiệp hoàn chỉnh từ con số 0.
2. Bạn BẮT BUỘC phải trình bày văn bản theo chuẩn định dạng Markdown của Nghị định 30/2020/NĐ-CP với bộ khung (layout) chuẩn như sau:

<div class="a4-header-grid">
  <div class="a4-header-col-left">
    <p class="a4-org-block"><strong>[TÊN CƠ QUAN CHỦ QUẢN]</strong><br/><strong>[TÊN CƠ QUAN BAN HÀNH]</strong><br/>-------<br/>Số: [Số]/[Ký hiệu]</p>
  </div>
  <div class="a4-header-col-right">
    <p class="a4-org-block"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br/><strong>Độc lập - Tự do - Hạnh phúc</strong><br/>---------------<br/><em>[Địa danh], ngày [Ngày] tháng [Tháng] năm [Năm]</em></p>
  </div>
</div>

<h1 class="a4-heading-1">[TÊN LOẠI VĂN BẢN (VD: QUYẾT ĐỊNH, THÔNG BÁO, TỜ TRÌNH)]</h1>
<h3 class="a4-heading-3">V/v: [Trích yếu nội dung văn bản]</h3>

<p class="a4-paragraph">[Nội dung chi tiết do bạn tự soạn thảo dựa vào yêu cầu người dùng...]</p>

<div class="a4-footer-grid">
  <div class="a4-footer-col-left">
    <p class="a4-recipient"><strong>Nơi nhận:</strong><br/>- Như điều 1;<br/>- Lưu: VT.</p>
  </div>
  <div class="a4-footer-col-right">
    <p class="a4-signature"><strong>[CHỨC VỤ NGƯỜI KÝ]</strong><br/><br/><br/><br/><strong>[Họ tên người ký]</strong></p>
  </div>
</div>

QUY TẮC BẮT BUỘC:
1. Tuân thủ chính xác cấu trúc thẻ HTML/Markdown ở trên. Thay thế các nội dung trong dấu ngoặc vuông [...] bằng thông tin phù hợp.
2. Bọc toàn bộ nội dung văn bản kết quả bên trong thẻ <drafting_content>...</drafting_content>.
3. TUYỆT ĐỐI KHÔNG META-COMMENTARY (ANTI-YAPPING): Bạn không được phép giải thích, chú thích, xin lỗi, hay nhận xét về những gì bạn làm (ví dụ: không được sinh ra các câu như "Lưu ý...", "Dưới đây là..."). Nội dung sinh ra bên trong và bên ngoài thẻ <drafting_content> phải là VĂN BẢN NGUYÊN BẢN DUY NHẤT. Bắt đầu ngay lập tức bằng <drafting_content>.`;
}

export function buildDraftingRouterPrompt(
  templates: DraftingTemplate[],
  userPrompt: string
): string {
  const templatesDesc = templates.map(t => `- ID: ${t.id}\n  Tên mẫu: ${t.title}\n  Mô tả: ${t.description}`).join('\n\n');

  return `Bạn là một Bộ Phân Loại Ý Định (Intent Router). Nhiệm vụ của bạn là xem xét yêu cầu của người dùng và chọn một mẫu văn bản phù hợp nhất từ danh sách hỗ trợ.

DANH SÁCH MẪU VĂN BẢN HỖ TRỢ:
${templatesDesc}

YÊU CẦU NGƯỜI DÙNG:
"${userPrompt}"

QUY TẮC BẮT BUỘC:
1. Trả về đúng ID của mẫu (ví dụ: decision_appointment) bọc trong thẻ <router_result>...</router_result>.
2. Nếu KHÔNG CÓ mẫu nào trong danh sách trên phù hợp với yêu cầu của người dùng (tức là yêu cầu ngoài phạm vi các mẫu trên), BẮT BUỘC trả về <router_result>unknown</router_result>.
3. Bạn KHÔNG cần giải thích, CHỈ TRẢ VỀ thẻ <router_result>.`;
}

export class DraftingTemplateService {
  public render(template: DraftingTemplate | string, customData: Record<string, string> = {}): string {
    return renderDraftingTemplate(template, customData);
  }

  public buildAIPrompt(
    template: DraftingTemplate,
    formData: Record<string, string>,
    actionType: DraftingActionType | string = 'full_generation',
    customPrompt?: string,
    currentDocContent?: string,
    companyContext?: string
  ): string {
    return buildDraftingAIPrompt(template, formData, actionType, customPrompt, currentDocContent, companyContext);
  }

  public buildRouterPrompt(
    templates: DraftingTemplate[],
    userPrompt: string
  ): string {
    return buildDraftingRouterPrompt(templates, userPrompt);
  }
  
  public buildGenericPrompt(
    userPrompt: string,
    currentDocContent?: string,
    companyContext?: string
  ): string {
    return buildGenericDraftingAIPrompt(userPrompt, currentDocContent, companyContext);
  }
}

function buildCompanyContextInstruction(companyContext?: string): string {
  if (!companyContext) return '';

  return `QUY TẮC THÔNG TIN CÔNG TY:
1. BẮT BUỘC đọc và chỉ sử dụng thông tin công ty từ tài liệu tham chiếu ở trên cho bên/cơ quan ban hành văn bản.
2. Thông tin công ty trong tài liệu tham chiếu được ưu tiên hơn mọi dữ liệu công ty mặc định trong mẫu; không dùng dữ liệu công ty mặc định trong mẫu.
3. Chỉ dùng các thông tin được nêu rõ trong tài liệu tham chiếu. Thiếu thông tin thì để dạng [Chưa có thông tin], không tự suy diễn.`;
}
