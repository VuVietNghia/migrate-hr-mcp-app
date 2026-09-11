export const INTERVIEW_EMAIL_TEMPLATE_FOLDER = ['hr-miniapp', 'email', 'phong-van'] as const;
export const ACTIVE_TEMPLATE_FILE_NAME = '_active-template.md';

export interface InterviewEmailTemplateDraft {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export interface InterviewEmailTemplateDocument extends InterviewEmailTemplateDraft {
  fileId: string;
  fileName: string;
  validationError: string | null;
}

export interface InterviewEmailTemplateVariables {
  candidateName: string;
  candidateEmail: string;
  position: string;
  company: string;
  interviewDate: string;
}

export interface RenderedInterviewEmailTemplate {
  subject: string;
  body: string;
}

const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function serializeInterviewEmailTemplate(draft: InterviewEmailTemplateDraft): string {
  if (!TEMPLATE_ID_PATTERN.test(draft.id)) {
    throw new Error('Template id must contain only lowercase letters, numbers, and hyphens');
  }
  if (!draft.name.trim()) {
    throw new Error('Template name cannot be blank');
  }
  if (!draft.subject.trim()) {
    throw new Error('Template subject cannot be blank');
  }
  if (!draft.body.trim()) {
    throw new Error('Template body cannot be blank');
  }

  return [
    '---',
    `id: ${draft.id}`,
    `name: ${draft.name}`,
    `subject: ${draft.subject}`,
    '---',
    '',
    draft.body,
  ].join('\n');
}

export function parseInterviewEmailTemplate(
  fileName: string,
  fileId: string,
  markdown: string,
): InterviewEmailTemplateDocument {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const fallbackId = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
  let id = fallbackId;
  let name = '';
  let subject = '';
  let body = normalizedMarkdown;
  const errors: string[] = [];

  if (!normalizedMarkdown.startsWith('---\n')) {
    errors.push('Invalid frontmatter: document must start with ---');
  } else {
    const lines = normalizedMarkdown.split('\n');
    const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
    if (closingIndex === -1) {
      errors.push('Invalid frontmatter: document has no closing ---');
    } else {
      body = lines.slice(closingIndex + 1).join('\n');
      if (body.startsWith('\n')) {
        body = body.slice(1);
      }

      for (const line of lines.slice(1, closingIndex)) {
        if (!line.trim()) {
          continue;
        }
        const separator = line.indexOf(':');
        if (separator === -1) {
          errors.push(`Invalid frontmatter line: ${line}`);
          continue;
        }
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key === 'id') {
          id = value;
        } else if (key === 'name') {
          name = value;
        } else if (key === 'subject') {
          subject = value;
        }
      }
    }
  }

  if (!id.trim() || !TEMPLATE_ID_PATTERN.test(id)) {
    errors.push('Invalid template id');
  }
  if (!name.trim()) {
    errors.push('Template name is missing or blank');
  }
  if (!subject.trim()) {
    errors.push('Template subject is missing or blank');
  }
  if (!body.trim()) {
    errors.push('Template body is missing or blank');
  }

  return {
    id,
    name,
    subject,
    body,
    fileId,
    fileName,
    validationError: errors.length > 0 ? errors.join('; ') : null,
  };
}

export function createUniqueTemplateId(name: string, existingIds: Set<string>): string {
  const baseId = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template';

  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

const TOKEN_RENDERERS: Record<string, (variables: InterviewEmailTemplateVariables) => string> = {
  '{{ten_ung_vien}}': ({ candidateName }) => candidateName.trim() ? candidateName : '[Tên ứng viên]',
  '{{email_ung_vien}}': ({ candidateEmail }) => candidateEmail.trim() ? candidateEmail : '[Email ứng viên]',
  '{{vi_tri}}': ({ position }) => position.trim() ? position : '[Tên vị trí]',
  '{{cong_ty}}': ({ company }) => company.trim() ? company : '[Tên công ty]',
  '{{thoi_gian_phong_van}}': ({ interviewDate }) => {
    if (!interviewDate.trim()) {
      return '[Ngày, giờ]';
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(interviewDate);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : interviewDate;
  },
};

function renderText(text: string, variables: InterviewEmailTemplateVariables): string {
  return text.replace(/{{[^{}]+}}/g, (token) => TOKEN_RENDERERS[token]?.(variables) ?? token);
}

export function renderInterviewEmailTemplate(
  template: InterviewEmailTemplateDocument,
  variables: InterviewEmailTemplateVariables,
): RenderedInterviewEmailTemplate {
  return {
    subject: renderText(template.subject, variables),
    body: renderText(template.body, variables),
  };
}

export function serializeActiveTemplateId(id: string): string {
  if (!TEMPLATE_ID_PATTERN.test(id)) {
    throw new Error('Active template id is invalid');
  }
  return `# Active interview email template\n\nactive_template_id: ${id}\n`;
}

export function parseActiveTemplateId(markdown: string): string | null {
  const match = /^active_template_id:\s*(\S+)\s*$/m.exec(markdown);
  return match && TEMPLATE_ID_PATTERN.test(match[1]) ? match[1] : null;
}
