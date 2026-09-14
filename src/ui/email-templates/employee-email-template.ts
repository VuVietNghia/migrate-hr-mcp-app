import {
  renderEmailTemplateText,
  type EmailTemplateTokenRenderers,
  type InterviewEmailTemplateDocument,
  type RenderedInterviewEmailTemplate,
} from './interview-email-template';

export const EMPLOYEE_EMAIL_TEMPLATE_FOLDER = ['hr-miniapp', 'email', 'nhan-su'] as const;
export const DEFAULT_EMPLOYEE_TEMPLATE_ID = 'yeu-cau-bo-sung-ho-so-nhan-su';

export interface EmployeeEmailTemplateVariables {
  employeeName: string;
  employeeEmail: string;
  position: string;
  department: string;
  startDate: string;
}

/** Fallbacks mirror the former built-in lifecycle drafts, so a blank profile field stays visible to fill in. */
const TOKEN_RENDERERS: EmailTemplateTokenRenderers<EmployeeEmailTemplateVariables> = {
  '{{ten_nhan_vien}}': ({ employeeName }) => employeeName.trim() ? employeeName : 'Anh/Chị',
  '{{email_nhan_vien}}': ({ employeeEmail }) => employeeEmail.trim() ? employeeEmail : '[Email nhân viên]',
  '{{vi_tri}}': ({ position }) => position.trim() ? position : '[BỔ SUNG: vị trí công việc]',
  '{{phong_ban}}': ({ department }) => department.trim() ? department : '[BỔ SUNG: phòng ban]',
  '{{ngay_bat_dau}}': ({ startDate }) => startDate.trim() ? startDate : '[BỔ SUNG: ngày bắt đầu làm việc]',
};

export function renderEmployeeEmailTemplate(
  template: InterviewEmailTemplateDocument,
  variables: EmployeeEmailTemplateVariables,
): RenderedInterviewEmailTemplate {
  return {
    subject: renderEmailTemplateText(template.subject, variables, TOKEN_RENDERERS),
    body: renderEmailTemplateText(template.body, variables, TOKEN_RENDERERS),
  };
}
