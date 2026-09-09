import type { McpApp } from '@privos_ai/app-react';
import defaultTemplateMarkdown from '../data/email-templates/moi-phong-van-mac-dinh.md?raw';
import {
  InterviewEmailTemplateRepository,
  PrivosInterviewEmailTemplateFileGateway,
} from './interview-email-template-repository';

export { defaultTemplateMarkdown };

export function createInterviewEmailTemplateRepository(app: McpApp, roomId: string) {
  return new InterviewEmailTemplateRepository(
    new PrivosInterviewEmailTemplateFileGateway(app, roomId),
    defaultTemplateMarkdown,
  );
}
