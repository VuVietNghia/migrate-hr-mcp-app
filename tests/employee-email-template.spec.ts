import { describe, expect, it } from 'vitest';

import { DEFAULT_EMPLOYEE_TEMPLATE_ID, renderEmployeeEmailTemplate } from '../src/ui/email-templates/employee-email-template';
import { DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS } from '../src/ui/email-templates/interview-email-template-default';
import { parseInterviewEmailTemplate } from '../src/ui/email-templates/interview-email-template';
import {
  InterviewEmailTemplateRepository,
  type InterviewEmailTemplateFileGateway,
} from '../src/ui/email-templates/interview-email-template-repository';
import {
  getEmailMailboxContentMode,
  isTemplateCategoryVisible,
} from '../src/ui/email-templates/interview-email-template-state';
import type { ActiveTemplateStore } from '../src/ui/email-templates/active-template-store';

class MemoryStore implements ActiveTemplateStore {
  constructor(public value: string | null = null) {}
  async read() { return this.value; }
  async write(templateId: string) { this.value = templateId; }
}

class MemoryGateway implements InterviewEmailTemplateFileGateway {
  readonly files = new Map<string, string>();

  async ensureFolder() { return 'folder-1'; }
  async listFiles() { return [...this.files.keys()].map(name => ({ id: `id-${name}`, name })); }
  async read(fileName: string) { return this.files.get(fileName) ?? ''; }
  async write(fileName: string, content: string) { this.files.set(fileName, content); }
  async delete(fileId: string) { this.files.delete(fileId.replace(/^id-/, '')); }
}

describe('employee email templates', () => {
  it('ships the four former built-in lifecycle templates as valid markdown', () => {
    const parsed = DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS.map(markdown => parseInterviewEmailTemplate('x.md', 'x', markdown));
    expect(parsed.map(template => template.validationError)).toEqual([null, null, null, null]);
    expect(parsed.map(template => template.name)).toEqual([
      'Yêu cầu bổ sung hồ sơ nhân sự',
      'Thông báo ký/gia hạn hợp đồng',
      'Thông báo đánh giá kết thúc thử việc',
      'Thông báo cập nhật thông tin nhân sự',
    ]);
  });

  it('seeds all four templates into an empty folder and activates the default one', async () => {
    const gateway = new MemoryGateway();
    const store = new MemoryStore();
    const repository = new InterviewEmailTemplateRepository(gateway, store, DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS, {
      defaultActiveTemplateId: DEFAULT_EMPLOYEE_TEMPLATE_ID,
      label: 'nhân sự',
    });

    const snapshot = await repository.ensureInitialized();

    expect(snapshot.templates).toHaveLength(4);
    expect(snapshot.activeTemplateId).toBe(DEFAULT_EMPLOYEE_TEMPLATE_ID);
    expect(store.value).toBe(DEFAULT_EMPLOYEE_TEMPLATE_ID);
    expect([...gateway.files.keys()]).not.toContain('_active-template.md');
    // A second initialization must not re-seed or duplicate.
    expect((await repository.ensureInitialized()).templates).toHaveLength(4);
  });

  it('keeps the active choice in the store, never in a Room Files pointer', async () => {
    const gateway = new MemoryGateway();
    const store = new MemoryStore();
    const repository = new InterviewEmailTemplateRepository(gateway, store, DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS, {
      defaultActiveTemplateId: DEFAULT_EMPLOYEE_TEMPLATE_ID,
    });
    await repository.ensureInitialized();

    const snapshot = await repository.setActiveTemplate('thong-bao-ky-gia-han-hop-dong');

    expect(snapshot.activeTemplateId).toBe('thong-bao-ky-gia-han-hop-dong');
    expect(store.value).toBe('thong-bao-ky-gia-han-hop-dong');
    expect([...gateway.files.keys()]).not.toContain('_active-template.md');
  });

  it('migrates a legacy _active-template.md into the store and deletes the file', async () => {
    const gateway = new MemoryGateway();
    for (const markdown of DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS) {
      const template = parseInterviewEmailTemplate('x.md', 'x', markdown);
      gateway.files.set(`${template.id}.md`, markdown);
    }
    gateway.files.set('_active-template.md', '# Active interview email template\n\nactive_template_id: thong-bao-danh-gia-ket-thuc-thu-viec\n');
    const store = new MemoryStore();
    const repository = new InterviewEmailTemplateRepository(gateway, store, DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS, {
      defaultActiveTemplateId: DEFAULT_EMPLOYEE_TEMPLATE_ID,
    });

    // Before migration the legacy file still answers reads, so an un-migrated Room keeps its choice.
    expect((await repository.listTemplates()).activeTemplateId).toBe('thong-bao-danh-gia-ket-thuc-thu-viec');

    const snapshot = await repository.ensureInitialized();

    expect(snapshot.activeTemplateId).toBe('thong-bao-danh-gia-ket-thuc-thu-viec');
    expect(store.value).toBe('thong-bao-danh-gia-ket-thuc-thu-viec');
    expect(gateway.files.has('_active-template.md')).toBe(false);
  });

  it('renders profile values and keeps visible placeholders for blank fields', () => {
    const template = parseInterviewEmailTemplate('x.md', 'x', DEFAULT_EMPLOYEE_TEMPLATE_MARKDOWNS[2]);
    const rendered = renderEmployeeEmailTemplate(template, {
      employeeName: 'Nguyễn Văn A',
      employeeEmail: 'a@example.com',
      position: 'Developer',
      department: '',
      startDate: '',
    });

    expect(rendered.subject).toBe('Thông báo đánh giá kết thúc thử việc - Nguyễn Văn A');
    expect(rendered.body).toContain('vị trí Developer thuộc [BỔ SUNG: phòng ban]');
    expect(rendered.body).toContain('Ngày bắt đầu làm việc: [BỔ SUNG: ngày bắt đầu làm việc]');
  });

  it('shows every template until a category is picked, then routes to that panel', () => {
    expect(getEmailMailboxContentMode('templates', 'all', true)).toBe('all-templates');
    expect(isTemplateCategoryVisible('all', 'cv_scored')).toBe(true);
    expect(isTemplateCategoryVisible('all', 'lifecycle')).toBe(true);
    expect(isTemplateCategoryVisible('lifecycle', 'cv_scored')).toBe(false);
    expect(getEmailMailboxContentMode('templates', 'lifecycle', true)).toBe('employee-templates');
    expect(getEmailMailboxContentMode('templates', 'cv_scored', true)).toBe('interview-templates');
    expect(getEmailMailboxContentMode('templates', 'lifecycle', false)).toBe('template-unavailable');
    expect(getEmailMailboxContentMode('sent', 'lifecycle', true)).toBe('history');
  });
});
