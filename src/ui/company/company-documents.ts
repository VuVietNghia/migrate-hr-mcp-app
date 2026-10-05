import type { McpApp } from '@privos_ai/app-react';
import { findFolderPath, readRoomFileText, readToolList } from '../privos-rest';

export interface CompanyDocument {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  downloadUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CompanyDocumentKind = 'image' | 'pdf' | 'text' | 'other';
export type CompanyDocumentFormatId = 'markdown' | 'word' | 'pdf' | 'other';

export interface CompanyDocumentFormat {
  id: CompanyDocumentFormatId;
  label: string;
}

export interface CompanyDocumentBlob {
  blob: Blob;
  fileName: string;
}

const IMAGE_EXTENSIONS = new Set(['bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const TEXT_EXTENSIONS = new Set(['csv', 'json', 'md', 'markdown', 'txt', 'xml', 'yaml', 'yml']);
const WORD_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase('en');
}

export function classifyCompanyDocument(document: CompanyDocument): CompanyDocumentKind {
  const mimeType = document.mimeType?.toLocaleLowerCase('en') ?? '';
  const fileExtension = extension(document.name);

  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(fileExtension)) return 'image';
  if (mimeType === 'application/pdf' || fileExtension === 'pdf') return 'pdf';
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(fileExtension)) return 'text';
  return 'other';
}

export function describeCompanyDocumentFormat(document: CompanyDocument): CompanyDocumentFormat {
  const mimeType = document.mimeType?.toLocaleLowerCase('en') ?? '';
  const fileExtension = extension(document.name);

  if (fileExtension === 'md' || fileExtension === 'markdown' || mimeType === 'text/markdown') {
    return { id: 'markdown', label: 'Markdown (.md)' };
  }
  if (fileExtension === 'doc' || fileExtension === 'docx' || WORD_MIME_TYPES.has(mimeType)) {
    return { id: 'word', label: fileExtension === 'doc' ? 'Word (.doc)' : 'Word (.docx)' };
  }
  if (fileExtension === 'pdf' || mimeType === 'application/pdf') {
    return { id: 'pdf', label: 'PDF (.pdf)' };
  }
  if (fileExtension) {
    return { id: 'other', label: fileExtension.toLocaleUpperCase('en') + ' (.' + fileExtension + ')' };
  }
  if (mimeType) return { id: 'other', label: mimeType };
  return { id: 'other', label: 'Tệp khác' };
}

function normalizedSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi');
}

export function filterCompanyDocuments(documents: readonly CompanyDocument[], query: string): CompanyDocument[] {
  const normalizedQuery = normalizedSearchText(query.trim());
  if (!normalizedQuery) return [...documents];
  return documents.filter((document) => normalizedSearchText(document.name).includes(normalizedQuery));
}

export function getCompanyDocumentCapabilities(document: CompanyDocument) {
  const kind = classifyCompanyDocument(document);
  const fileExtension = extension(document.name);
  const mimeType = document.mimeType?.toLocaleLowerCase('en') ?? '';
  const isDocx = fileExtension === 'docx'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return {
    canPreview: kind === 'text' || kind === 'image' || kind === 'pdf' || isDocx,
    canDownload: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function readSize(record: Record<string, unknown>): number | undefined {
  const value = record.size ?? record.file_size;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function mapCompanyDocument(value: unknown): CompanyDocument | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = readString(record, '_id');
  const name = readString(record, 'name');
  if (!id || !name) return undefined;

  return {
    id,
    name,
    ...(readSize(record) === undefined ? {} : { size: readSize(record) }),
    ...(readString(record, 'mimeType', 'mime_type', 'type') ? { mimeType: readString(record, 'mimeType', 'mime_type', 'type') } : {}),
    ...(readString(record, 'downloadUrl') ? { downloadUrl: readString(record, 'downloadUrl') } : {}),
    ...(readString(record, 'createdAt', 'created_at') ? { createdAt: readString(record, 'createdAt', 'created_at') } : {}),
    ...(readString(record, 'updatedAt', 'updated_at') ? { updatedAt: readString(record, 'updatedAt', 'updated_at') } : {}),
  };
}

function timestamp(document: CompanyDocument) {
  const value = Date.parse(document.updatedAt ?? document.createdAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

export class CompanyDocumentRepository {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
  ) {}

  async list(): Promise<CompanyDocument[]> {
    const folderId = await findFolderPath(this.app, this.roomId, ['hr-miniapp', 'company']);
    if (!folderId) return [];

    const response = await this.app.callServerTool({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: this.roomId, folderId, limit: 100 },
    });

    return readToolList(response, 'files')
      .map(mapCompanyDocument)
      .filter((document): document is CompanyDocument => Boolean(document))
      .sort((left, right) => timestamp(right) - timestamp(left) || left.name.localeCompare(right.name, 'vi'));
  }

  readText(document: CompanyDocument): Promise<string> {
    return readRoomFileText(this.app, { _id: document.id, downloadUrl: document.downloadUrl });
  }

  async readBlob(document: CompanyDocument): Promise<CompanyDocumentBlob> {
    const response = await this.app.rest({
      method: 'GET',
      path: `file-management.files/${encodeURIComponent(document.id)}/download`,
      responseType: 'blob',
      timeoutMs: 60_000,
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Không thể tải tài liệu (HTTP ${response.statusCode}).`);
    }
    if (!(response.body instanceof Blob)) {
      throw new Error('Máy chủ không trả về dữ liệu tệp hợp lệ.');
    }
    return {
      blob: response.body,
      fileName: response.fileName?.trim() || document.name,
    };
  }
}
