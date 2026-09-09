import type { EmployeeProfile } from '../types';

export interface EmailDraft {
  subject: string;
  content: string;
}

export interface EmployeeEmailTemplate {
  id: string;
  name: string;
  createDraft(profile: EmployeeProfile): EmailDraft;
}

export interface IEmployeeEmailTemplateProvider {
  getTemplates(): readonly EmployeeEmailTemplate[];
  getTemplateById(templateId: string): EmployeeEmailTemplate | undefined;
}

export class BuiltinEmployeeEmailTemplateProvider implements IEmployeeEmailTemplateProvider {
  private readonly templates: readonly EmployeeEmailTemplate[];

  public constructor(templates: readonly EmployeeEmailTemplate[] = BUILTIN_EMPLOYEE_EMAIL_TEMPLATES) {
    this.templates = templates;
  }

  public getTemplates(): readonly EmployeeEmailTemplate[] {
    return this.templates;
  }

  public getTemplateById(templateId: string): EmployeeEmailTemplate | undefined {
    return this.templates.find(template => template.id === templateId);
  }
}

const BUILTIN_EMPLOYEE_EMAIL_TEMPLATES: readonly EmployeeEmailTemplate[] = [
  {
    id: 'PROFILE_COMPLETION_REQUEST',
    name: 'Yêu cầu bổ sung hồ sơ nhân sự',
    createDraft: profile => ({
      subject: `Yêu cầu bổ sung hồ sơ nhân sự - ${profile.name}`,
      content: `Chào ${employeeName(profile)},

Phòng Nhân sự đề nghị Anh/Chị bổ sung và hoàn thiện hồ sơ nhân sự cho vị trí ${position(profile)} thuộc ${department(profile)}.

Danh mục cần bổ sung: [BỔ SUNG: danh mục hồ sơ cần hoàn thiện]
Thời hạn hoàn thành: [BỔ SUNG: thời hạn]

Vui lòng phản hồi Phòng Nhân sự khi đã hoàn tất.

Trân trọng,
Phòng Nhân sự`
    })
  },
  {
    id: 'CONTRACT_SIGNATURE_OR_RENEWAL',
    name: 'Thông báo ký/gia hạn hợp đồng',
    createDraft: profile => ({
      subject: `Thông báo ký/gia hạn hợp đồng - ${profile.name}`,
      content: `Chào ${employeeName(profile)},

Phòng Nhân sự thông báo về thủ tục ký hoặc gia hạn hợp đồng lao động của Anh/Chị tại vị trí ${position(profile)}.

Loại hợp đồng: [BỔ SUNG: loại hợp đồng]
Thời gian ký hoặc gia hạn: [BỔ SUNG: thời gian]
Địa điểm hoặc hình thức thực hiện: [BỔ SUNG: địa điểm/hình thức]

Vui lòng liên hệ Phòng Nhân sự nếu cần hỗ trợ.

Trân trọng,
Phòng Nhân sự`
    })
  },
  {
    id: 'PROBATION_EVALUATION_NOTICE',
    name: 'Thông báo đánh giá kết thúc thử việc',
    createDraft: profile => ({
      subject: `Thông báo đánh giá kết thúc thử việc - ${profile.name}`,
      content: `Chào ${employeeName(profile)},

Phòng Nhân sự thông báo kế hoạch đánh giá kết thúc thử việc cho vị trí ${position(profile)} thuộc ${department(profile)}.

Ngày bắt đầu làm việc: ${profile.startDate || '[BỔ SUNG: ngày bắt đầu làm việc]'}
Thời gian đánh giá: [BỔ SUNG: thời gian đánh giá]
Người phụ trách đánh giá: [BỔ SUNG: người phụ trách]

Vui lòng phối hợp cung cấp thông tin theo hướng dẫn của quản lý trực tiếp.

Trân trọng,
Phòng Nhân sự`
    })
  },
  {
    id: 'EMPLOYEE_INFORMATION_UPDATE',
    name: 'Thông báo cập nhật thông tin nhân sự',
    createDraft: profile => ({
      subject: `Thông báo cập nhật thông tin nhân sự - ${profile.name}`,
      content: `Chào ${employeeName(profile)},

Phòng Nhân sự thông báo về việc cập nhật thông tin nhân sự của Anh/Chị tại ${department(profile)}.

Nội dung cập nhật: [BỔ SUNG: nội dung thay đổi]
Thời điểm áp dụng: [BỔ SUNG: thời điểm áp dụng]
Hành động cần thực hiện: [BỔ SUNG: hướng dẫn cho nhân sự]

Vui lòng phản hồi Phòng Nhân sự nếu thông tin cần điều chỉnh thêm.

Trân trọng,
Phòng Nhân sự`
    })
  }
];

function employeeName(profile: EmployeeProfile): string {
  return profile.name || 'Anh/Chị';
}

function position(profile: EmployeeProfile): string {
  return profile.position || '[BỔ SUNG: vị trí công việc]';
}

function department(profile: EmployeeProfile): string {
  return profile.department || '[BỔ SUNG: phòng ban]';
}
