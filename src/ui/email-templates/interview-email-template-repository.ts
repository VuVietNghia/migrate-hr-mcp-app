import type { McpApp } from '@privos_ai/app-react';
import type { ActiveTemplateStore } from './active-template-store';
import {
  ACTIVE_TEMPLATE_FILE_NAME,
  createUniqueTemplateId,
  INTERVIEW_EMAIL_TEMPLATE_FOLDER,
  parseActiveTemplateId,
  parseInterviewEmailTemplate,
  serializeInterviewEmailTemplate,
  type InterviewEmailTemplateDocument,
  type InterviewEmailTemplateDraft,
} from './interview-email-template';
import {
  createOrUpdateFile,
  ensureFolderPath,
  readRoomFileText,
} from '../privos-rest';

const CANONICAL_TEMPLATE_FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const DEFAULT_INTERVIEW_TEMPLATE_ID = 'moi-phong-van-mac-dinh';

function isCanonicalTemplateFileName(fileName: string): boolean {
  return CANONICAL_TEMPLATE_FILE_NAME_PATTERN.test(fileName);
}

function assertSafeTemplateGatewayFileName(fileName: string): void {
  if (fileName !== ACTIVE_TEMPLATE_FILE_NAME && !isCanonicalTemplateFileName(fileName)) {
    throw new Error('Interview email template filename is invalid');
  }
}

function addValidationError(template: InterviewEmailTemplateDocument, error: string): void {
  template.validationError = template.validationError
    ? `${template.validationError}; ${error}`
    : error;
}

function createInvalidFilenameDocument(file: InterviewEmailTemplateFile): InterviewEmailTemplateDocument {
  return {
    id: file.name.endsWith('.md') ? file.name.slice(0, -3) : file.name,
    fileId: file.id,
    fileName: file.name,
    name: '',
    subject: '',
    body: '',
    validationError: 'Invalid template filename',
  };
}

export interface InterviewEmailTemplateSnapshot {
  templates: InterviewEmailTemplateDocument[];
  activeTemplateId: string | null;
}

export interface InterviewEmailTemplateFileIdentity {
  fileId: string;
  fileName: string;
}

export interface IInterviewEmailTemplateRepository {
  ensureInitialized(): Promise<InterviewEmailTemplateSnapshot>;
  listTemplates(): Promise<InterviewEmailTemplateSnapshot>;
  getTemplate(templateId: string): Promise<InterviewEmailTemplateDocument>;
  getActiveTemplate(): Promise<InterviewEmailTemplateDocument>;
  createTemplate(input: Omit<InterviewEmailTemplateDraft, 'id'>): Promise<InterviewEmailTemplateSnapshot>;
  saveTemplate(fileName: string, input: InterviewEmailTemplateDraft): Promise<InterviewEmailTemplateSnapshot>;
  setActiveTemplate(templateId: string): Promise<InterviewEmailTemplateSnapshot>;
  deleteTemplate(identity: InterviewEmailTemplateFileIdentity): Promise<InterviewEmailTemplateSnapshot>;
}

export interface InterviewEmailTemplateFile {
  id: string;
  name: string;
  downloadUrl?: string;
}

export interface InterviewEmailTemplateFileGateway {
  ensureFolder(): Promise<string>;
  listFiles(folderId: string): Promise<InterviewEmailTemplateFile[]>;
  read(fileName: string, fileId?: string, downloadUrl?: string): Promise<string>;
  write(fileName: string, content: string): Promise<void>;
  delete(fileId: string): Promise<void>;
}

export interface EmailTemplateRepositoryOptions {
  /** Template the active pointer falls back to when it is missing or broken. */
  defaultActiveTemplateId?: string;
  /** Vietnamese category label used in user-facing errors, e.g. "phỏng vấn". */
  label?: string;
}

interface LoadedTemplateSnapshot {
  snapshot: InterviewEmailTemplateSnapshot;
  /** Id held by the App Database store, before any legacy fallback. */
  storedTemplateId: string | null;
  /** A pre-App-Database `_active-template.md` still sitting in the folder. */
  legacyPointerFile: InterviewEmailTemplateFile | undefined;
}

export class InterviewEmailTemplateRepository implements IInterviewEmailTemplateRepository {
  private readonly defaultTemplateMarkdowns: readonly string[];
  private readonly defaultActiveTemplateId: string;
  private readonly label: string;

  constructor(
    private readonly gateway: InterviewEmailTemplateFileGateway,
    private readonly activeTemplateStore: ActiveTemplateStore,
    defaultTemplateMarkdown: string | readonly string[],
    options: EmailTemplateRepositoryOptions = {},
  ) {
    this.defaultTemplateMarkdowns = typeof defaultTemplateMarkdown === 'string'
      ? [defaultTemplateMarkdown]
      : defaultTemplateMarkdown;
    this.defaultActiveTemplateId = options.defaultActiveTemplateId ?? DEFAULT_INTERVIEW_TEMPLATE_ID;
    this.label = options.label ?? 'phỏng vấn';
  }

  async ensureInitialized(): Promise<InterviewEmailTemplateSnapshot> {
    const loaded = await this.loadSnapshot();
    if (loaded.legacyPointerFile) {
      await this.migrateLegacyPointer(loaded);
    }

    let snapshot = await this.listTemplates();
    let validTemplates = snapshot.templates.filter(template => template.validationError === null);

    if (validTemplates.length === 0) {
      const reservedIds = this.getReservedTemplateIds(snapshot.templates);
      for (const markdown of this.defaultTemplateMarkdowns) {
        const defaultTemplate = parseInterviewEmailTemplate('default.md', 'default', markdown);
        if (defaultTemplate.validationError) {
          throw new Error(`Default ${this.label} email template is invalid: ${defaultTemplate.validationError}`);
        }
        const id = createUniqueTemplateId(defaultTemplate.id, reservedIds);
        reservedIds.add(id);
        await this.gateway.write(`${id}.md`, serializeInterviewEmailTemplate({
          id,
          name: defaultTemplate.name,
          subject: defaultTemplate.subject,
          body: defaultTemplate.body,
        }));
      }
      snapshot = await this.listTemplates();
      validTemplates = snapshot.templates.filter(template => template.validationError === null);
    }

    const activeTemplate = validTemplates.find(template => template.id === snapshot.activeTemplateId);
    if (!activeTemplate) {
      const fallbackTemplate = validTemplates.find(template => template.id === this.defaultActiveTemplateId)
        ?? validTemplates[0];
      if (!fallbackTemplate) {
        throw new Error(`No valid ${this.label} email template is available after initialization`);
      }
      await this.activeTemplateStore.write(fallbackTemplate.id);
      snapshot = await this.listTemplates();
    }

    return snapshot;
  }

  async listTemplates(): Promise<InterviewEmailTemplateSnapshot> {
    return (await this.loadSnapshot()).snapshot;
  }

  /**
   * Rooms set up before the App Database pointer kept the active id in `_active-template.md`.
   * Copy it into the store first, then drop the file; the store is authoritative from then on, so a
   * failed delete (e.g. another tab migrated at the same time) only leaves a file nothing reads.
   */
  private async migrateLegacyPointer(loaded: LoadedTemplateSnapshot): Promise<void> {
    const legacyTemplateId = loaded.snapshot.activeTemplateId;
    if (loaded.storedTemplateId === null && legacyTemplateId) {
      await this.activeTemplateStore.write(legacyTemplateId);
    }
    try {
      await this.gateway.delete(loaded.legacyPointerFile!.id);
    } catch (error) {
      console.warn(`[EmailTemplates] Không xóa được file ${ACTIVE_TEMPLATE_FILE_NAME} cũ`, error);
    }
  }

  private async loadSnapshot(): Promise<LoadedTemplateSnapshot> {
    const folderId = await this.gateway.ensureFolder();
    const files = await this.gateway.listFiles(folderId);
    const pointerFile = files.find(file => file.name === ACTIVE_TEMPLATE_FILE_NAME);
    const templateFiles = files.filter(file => file.name !== ACTIVE_TEMPLATE_FILE_NAME && file.name.endsWith('.md'));
    const templates = await Promise.all(templateFiles.map(async file => {
      if (!isCanonicalTemplateFileName(file.name)) {
        return createInvalidFilenameDocument(file);
      }
      return parseInterviewEmailTemplate(
        file.name,
        file.id,
        await this.gateway.read(file.name, file.id, file.downloadUrl),
      );
    }));

    const canonicalTemplates = templates.filter(template => isCanonicalTemplateFileName(template.fileName));
    for (const template of canonicalTemplates) {
      const filenameStem = template.fileName.slice(0, -3);
      if (template.id !== filenameStem) {
        addValidationError(template, 'Template id does not match filename stem');
      }
    }

    const idCounts = new Map<string, number>();
    for (const template of canonicalTemplates) {
      idCounts.set(template.id, (idCounts.get(template.id) ?? 0) + 1);
    }
    for (const template of canonicalTemplates) {
      if ((idCounts.get(template.id) ?? 0) > 1) {
        addValidationError(template, 'Duplicate template id');
      }
    }

    templates.sort((left, right) => {
      const validity = Number(left.validationError !== null) - Number(right.validationError !== null);
      return validity || left.name.localeCompare(right.name, 'vi') || left.fileName.localeCompare(right.fileName, 'vi');
    });

    const storedTemplateId = await this.activeTemplateStore.read();
    const pointerTemplateId = storedTemplateId ?? (pointerFile
      ? parseActiveTemplateId(await this.gateway.read(pointerFile.name, pointerFile.id, pointerFile.downloadUrl))
      : null);
    const activeMatches = pointerTemplateId
      ? templates.filter(template => template.id === pointerTemplateId && template.validationError === null)
      : [];

    return {
      snapshot: {
        templates,
        activeTemplateId: activeMatches.length === 1 ? pointerTemplateId : null,
      },
      storedTemplateId,
      legacyPointerFile: pointerFile,
    };
  }

  async getTemplate(templateId: string): Promise<InterviewEmailTemplateDocument> {
    const template = (await this.listTemplates()).templates.find(item => item.id === templateId);
    if (!template) {
      throw new Error(`Không tìm thấy mẫu email ${this.label}: ${templateId}`);
    }
    return template;
  }

  async getActiveTemplate(): Promise<InterviewEmailTemplateDocument> {
    const snapshot = await this.listTemplates();
    const template = snapshot.templates.find(item => item.id === snapshot.activeTemplateId);
    if (!template || template.validationError) {
      throw new Error(`Không tìm thấy mẫu email ${this.label} đang sử dụng hợp lệ`);
    }
    return template;
  }

  async createTemplate(input: Omit<InterviewEmailTemplateDraft, 'id'>): Promise<InterviewEmailTemplateSnapshot> {
    const snapshot = await this.listTemplates();
    const id = createUniqueTemplateId(input.name, this.getReservedTemplateIds(snapshot.templates));
    await this.gateway.write(`${id}.md`, serializeInterviewEmailTemplate({ ...input, id }));
    return this.listTemplates();
  }

  async saveTemplate(fileName: string, input: InterviewEmailTemplateDraft): Promise<InterviewEmailTemplateSnapshot> {
    if (fileName === ACTIVE_TEMPLATE_FILE_NAME) {
      throw new Error('Không thể ghi đè active template pointer');
    }
    if (!isCanonicalTemplateFileName(fileName)) {
      throw new Error('Tên file mẫu email không hợp lệ');
    }
    const snapshot = await this.listTemplates();
    const existingTemplate = snapshot.templates.find(template => template.fileName === fileName);
    if (!existingTemplate) {
      throw new Error(`Không tìm thấy file mẫu email ${this.label}: ${fileName}`);
    }
    await this.gateway.write(fileName, serializeInterviewEmailTemplate({
      ...input,
      id: fileName.slice(0, -3),
    }));
    return this.listTemplates();
  }

  async setActiveTemplate(templateId: string): Promise<InterviewEmailTemplateSnapshot> {
    const template = await this.getTemplate(templateId);
    if (template.validationError) {
      throw new Error(`Không thể sử dụng mẫu email không hợp lệ: ${template.validationError}`);
    }
    await this.activeTemplateStore.write(template.id);
    return this.listTemplates();
  }

  async deleteTemplate(identity: InterviewEmailTemplateFileIdentity): Promise<InterviewEmailTemplateSnapshot> {
    const snapshot = await this.listTemplates();
    const template = snapshot.templates.find(item => item.fileName === identity.fileName)
      ?? snapshot.templates.find(item => item.fileId === identity.fileId);
    if (!template) {
      throw new Error(`Không tìm thấy file mẫu email ${this.label}: ${identity.fileName || identity.fileId}`);
    }
    if (snapshot.activeTemplateId === template.id) {
      throw new Error('Không thể xóa mẫu email đang sử dụng');
    }
    if (snapshot.templates.filter(item => item.validationError === null).length <= 1 && template.validationError === null) {
      throw new Error('Không thể xóa mẫu cuối cùng');
    }
    await this.gateway.delete(template.fileId);
    return this.listTemplates();
  }

  private getReservedTemplateIds(templates: InterviewEmailTemplateDocument[]): Set<string> {
    const reserved = new Set<string>();
    for (const template of templates) {
      reserved.add(template.id);
      if (this.isSafeTemplateFileName(template.fileName)) {
        reserved.add(template.fileName.slice(0, -3));
      }
    }
    return reserved;
  }

  private isSafeTemplateFileName(fileName: string): boolean {
    return fileName.endsWith('.md') && !/[\\/\r\n]/u.test(fileName);
  }
}

export class PrivosInterviewEmailTemplateFileGateway implements InterviewEmailTemplateFileGateway {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
    private readonly folder: readonly string[] = INTERVIEW_EMAIL_TEMPLATE_FOLDER,
  ) {}

  async ensureFolder(): Promise<string> {
    const folderId = await ensureFolderPath(this.app, this.roomId, [...this.folder]);
    if (!folderId) {
      throw new Error(`Không thể truy cập thư mục mẫu email ${this.folder.join('/')}`);
    }
    return folderId;
  }

  async listFiles(folderId: string): Promise<InterviewEmailTemplateFile[]> {
    const response = await this.app.callServerTool({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: this.roomId, folderId },
    });

    return this.parseFiles(response);
  }

  async read(fileName: string, fileId?: string, downloadUrl?: string): Promise<string> {
    assertSafeTemplateGatewayFileName(fileName);
    if (!fileId && !downloadUrl) {
      throw new Error(`Room Files file identity is missing: ${fileName}`);
    }
    // The file-management content route first: the presigned downloadUrl can point at a MinIO host
    // the browser cannot reach, which made every template read time out.
    return readRoomFileText(this.app, { _id: fileId, downloadUrl });
  }

  async write(fileName: string, content: string): Promise<void> {
    assertSafeTemplateGatewayFileName(fileName);
    await createOrUpdateFile(this.app, `${this.roomId}/${this.folder.join('/')}/${fileName}`, content);
  }

  async delete(fileId: string): Promise<void> {
    await this.app.callServerTool({ name: 'mcpapp.files.delete', arguments: { fileId } });
  }

  private parseFiles(response: unknown): InterviewEmailTemplateFile[] {
    const content = this.asRecord(response)?.content;
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error('Invalid Room Files listing response');
    }
    const text = this.asRecord(content[0])?.text;
    if (typeof text !== 'string') {
      throw new Error('Invalid Room Files listing response');
    }

    try {
      const parsed: unknown = JSON.parse(text);
      const collection = Array.isArray(parsed) ? parsed : this.asRecord(parsed)?.files;
      if (!Array.isArray(collection)) {
        throw new Error('Invalid Room Files listing response');
      }

      return collection.map(item => {
        const record = this.asRecord(item);
        const id = typeof record?._id === 'string' ? record._id : record?.id;
        const name = record?.name;
        const downloadUrl = record?.downloadUrl;
        if (typeof id !== 'string' || typeof name !== 'string') {
          throw new Error('Invalid Room Files listing response');
        }
        return {
          id,
          name,
          ...(typeof downloadUrl === 'string' && downloadUrl ? { downloadUrl } : {}),
        };
      });
    } catch {
      throw new Error('Invalid Room Files listing response');
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
  }
}
