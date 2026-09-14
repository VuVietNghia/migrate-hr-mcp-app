import type { McpApp } from '@privos_ai/app-react';
import defaultTemplateMarkdown from '../data/email-templates/moi-phong-van-mac-dinh.md?raw';
import profileCompletionMarkdown from '../data/email-templates/nhan-su/yeu-cau-bo-sung-ho-so-nhan-su.md?raw';
import contractMarkdown from '../data/email-templates/nhan-su/thong-bao-ky-gia-han-hop-dong.md?raw';
import probationMarkdown from '../data/email-templates/nhan-su/thong-bao-danh-gia-ket-thuc-thu-viec.md?raw';
import informationUpdateMarkdown from '../data/email-templates/nhan-su/thong-bao-cap-nhat-thong-tin-nhan-su.md?raw';
import { AppDbActiveTemplateStore } from './active-template-store';
import {
  InterviewEmailTemplateRepository,
  PrivosInterviewEmailTemplateFileGateway,
} from './interview-email-template-repository';
import { DEFAULT_EMPLOYEE_TEMPLATE_ID, EMPLOYEE_EMAIL_TEMPLATE_FOLDER } from './employee-email-template';

export { defaultTemplateMarkdown };

export const DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS = [
  profileCompletionMarkdown,
  contractMarkdown,
  probationMarkdown,
  informationUpdateMarkdown,
] as const;

export function createInterviewEmailTemplateRepository(app: McpApp, roomId: string) {
  return new InterviewEmailTemplateRepository(
    new PrivosInterviewEmailTemplateFileGateway(app, roomId),
    new AppDbActiveTemplateStore(app, roomId, 'cv_scored'),
    defaultTemplateMarkdown,
  );
}

/** Lifecycle (Hồ sơ NS) templates: seeded with the four former built-in drafts into `hr-miniapp/email/nhan-su`. */
export function createEmployeeEmailTemplateRepository(app: McpApp, roomId: string) {
  return new InterviewEmailTemplateRepository(
    new PrivosInterviewEmailTemplateFileGateway(app, roomId, EMPLOYEE_EMAIL_TEMPLATE_FOLDER),
    new AppDbActiveTemplateStore(app, roomId, 'lifecycle'),
    DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS,
    { defaultActiveTemplateId: DEFAULT_EMPLOYEE_TEMPLATE_ID, label: 'nhân sự' },
  );
}
