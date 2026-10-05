import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompanyDocumentRepository,
  classifyCompanyDocument,
  describeCompanyDocumentFormat,
  filterCompanyDocuments,
  getCompanyDocumentCapabilities,
  type CompanyDocument,
} from '../src/ui/company/company-documents';

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function listing(collection: Record<string, unknown[]>): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(collection) }] };
}

function appWithFiles(filesResponse: unknown, calls: ToolCall[] = []): McpApp {
  return {
    callServerTool: async (call: ToolCall) => {
      calls.push(call);
      if (call.name === 'mcpapp.folders.getByChannel') {
        return call.arguments.parentId === 'folder-hr'
          ? listing({ folders: [{ _id: 'folder-company', name: 'company' }] })
          : listing({ folders: [{ _id: 'folder-hr', name: 'hr-miniapp' }] });
      }
      if (call.name === 'mcpapp.files.getByChannel') return filesResponse;
      throw new Error(`Unexpected tool: ${call.name}`);
    },
  } as unknown as McpApp;
}

describe('CompanyDocumentRepository', () => {
  it('resolves hr-miniapp/company without creating folders and maps valid files', async () => {
    const calls: ToolCall[] = [];
    const repository = new CompanyDocumentRepository(
      appWithFiles(listing({ files: [
        { _id: 'new', name: 'Mới.pdf', file_size: 2048, type: 'application/pdf', updatedAt: '2026-10-04T00:00:00Z', downloadUrl: 'https://files/new' },
        { _id: 'old', name: 'Cũ.md', size: 12, mimeType: 'text/markdown', createdAt: '2026-09-01T00:00:00Z' },
        { _id: '', name: 'missing-id.pdf' },
        { _id: 'missing-name' },
      ] }), calls),
      'room-1',
    );

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: 'new', name: 'Mới.pdf', size: 2048, mimeType: 'application/pdf' }),
      expect.objectContaining({ id: 'old', name: 'Cũ.md', size: 12, mimeType: 'text/markdown' }),
    ]);
    expect(calls.map((call) => call.name)).not.toContain('mcpapp.folders.create');
    expect(calls.at(-1)).toMatchObject({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: 'room-1', folderId: 'folder-company' },
    });
  });

  it('returns an empty list only when the company folder does not exist', async () => {
    const app = {
      callServerTool: vi.fn(async () => listing({ folders: [] })),
    } as unknown as McpApp;

    await expect(new CompanyDocumentRepository(app, 'room-1').list()).resolves.toEqual([]);
  });

  it('rejects tool errors and malformed file listings', async () => {
    await expect(new CompanyDocumentRepository(appWithFiles({
      isError: true,
      content: [{ type: 'text', text: 'Permission denied' }],
    }), 'room-1').list()).rejects.toThrow(/Permission denied/);

    await expect(new CompanyDocumentRepository(appWithFiles({
      content: [{ type: 'text', text: JSON.stringify({ documents: [] }) }],
    }), 'room-1').list()).rejects.toThrow(/files list/);
  });

  it('downloads a file through the authenticated REST bridge as a Blob', async () => {
    const blob = new Blob(['document bytes'], { type: 'application/pdf' });
    const rest = vi.fn(async () => ({ statusCode: 200, body: blob, fileName: 'policy.pdf' }));
    const repository = new CompanyDocumentRepository({ rest } as unknown as McpApp, 'room-1');
    const document: CompanyDocument = { id: 'file/id', name: 'fallback.pdf' };

    const readBlob = (repository as unknown as {
      readBlob?: (input: CompanyDocument) => Promise<{ blob: Blob; fileName: string }>;
    }).readBlob?.bind(repository);
    const result = await readBlob?.(document);

    expect(result).toEqual({ blob, fileName: 'policy.pdf' });
    expect(rest).toHaveBeenCalledWith({
      method: 'GET',
      path: 'file-management.files/file%2Fid/download',
      responseType: 'blob',
      timeoutMs: 60_000,
    });
  });
});

describe('Company document model', () => {
  const document = (name: string, mimeType?: string, downloadUrl?: string): CompanyDocument => ({
    id: name,
    name,
    mimeType,
    downloadUrl,
  });

  it('searches without case or Vietnamese diacritics', () => {
    const documents = [document('Văn hóa nội bộ.pdf'), document('Quy trình tuyển dụng.md')];
    expect(filterCompanyDocuments(documents, 'VAN HOA')).toEqual([documents[0]]);
  });

  it.each([
    [document('avatar.png', 'image/png'), 'image'],
    [document('handbook.pdf'), 'pdf'],
    [document('overview.md'), 'text'],
    [document('archive.zip', 'application/zip'), 'other'],
  ] as const)('classifies $name as $1', (input, expected) => {
    expect(classifyCompanyDocument(input)).toBe(expected);
  });

  it.each([
    ['handbook.md', undefined, { id: 'markdown', label: 'Markdown (.md)' }],
    ['candidate.docx', undefined, { id: 'word', label: 'Word (.docx)' }],
    ['policy.pdf', undefined, { id: 'pdf', label: 'PDF (.pdf)' }],
    ['download', 'application/pdf', { id: 'pdf', label: 'PDF (.pdf)' }],
  ] as const)('describes %s from its extension or MIME type', (name, mimeType, expected) => {
    expect(describeCompanyDocumentFormat(document(name, mimeType))).toEqual(expected);
  });

  it('uses an explicit neutral label when neither extension nor MIME identifies the file', () => {
    expect(describeCompanyDocumentFormat(document('README'))).toEqual({ id: 'other', label: 'Tệp khác' });
  });

  it('previews supported files and downloads every file through the authenticated content route', () => {
    expect(getCompanyDocumentCapabilities(document('notes.md'))).toEqual({ canPreview: true, canDownload: true });
    expect(getCompanyDocumentCapabilities(document('photo.png', 'image/png'))).toEqual({ canPreview: true, canDownload: true });
    expect(getCompanyDocumentCapabilities(document('photo.png', 'image/png', 'https://files/photo'))).toEqual({ canPreview: true, canDownload: true });
    expect(getCompanyDocumentCapabilities(document('candidate.docx'))).toEqual({ canPreview: true, canDownload: true });
    expect(getCompanyDocumentCapabilities(document('archive.zip', 'application/zip'))).toEqual({ canPreview: false, canDownload: true });
  });
});
