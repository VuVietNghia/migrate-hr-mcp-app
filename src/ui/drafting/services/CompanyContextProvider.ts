import type { McpApp } from '@privos_ai/app-react';
import type { ICompanyContextProvider } from '../types';

interface RoomFolder {
  _id?: string;
  name?: string;
}

interface RoomFile {
  name?: string;
}

type JsonRecord = Record<string, unknown>;

export class CompanyContextProvider implements ICompanyContextProvider {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string
  ) {}

  async getContext(): Promise<string> {
    const companyFolderId = await this.findCompanyFolderId();
    if (!companyFolderId) {
      throw new Error('Không tìm thấy thư mục hr-miniapp/company trong Room.');
    }

    const response = await this.app.callServerTool({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: this.roomId, folderId: companyFolderId }
    });
    const fileNames = this.parseCollection(response)
      .map(value => this.asRoomFile(value)?.name)
      .filter((name): name is string => Boolean(name && this.isSafeFileName(name)))
      .sort((left, right) => left.localeCompare(right, 'vi'));

    if (fileNames.length === 0) {
      throw new Error('Chưa có tài liệu trong thư mục hr-miniapp/company.');
    }

    return fileNames
      .map(fileName => `@Files:${this.roomId}/hr-miniapp/company/${fileName}`)
      .join('\n');
  }

  private async findCompanyFolderId(): Promise<string | undefined> {
    const hrMiniappFolderId = await this.findChildFolderId(undefined, 'hr-miniapp');
    if (!hrMiniappFolderId) return undefined;

    return this.findChildFolderId(hrMiniappFolderId, 'company');
  }

  private async findChildFolderId(parentId: string | undefined, folderName: string): Promise<string | undefined> {
    const response = await this.app.callServerTool({
      name: 'mcpapp.folders.getByChannel',
      arguments: {
        channelId: this.roomId,
        limit: 100,
        ...(parentId ? { parentId } : {})
      }
    });

    return this.parseCollection(response)
      .map(value => this.asRoomFolder(value))
      .find(folder => folder?.name === folderName)?._id;
  }

  private parseCollection(response: unknown): unknown[] {
    const content = this.asRecord(response)?.content;
    if (!Array.isArray(content)) return [];

    const text = this.asRecord(content[0])?.text;
    if (typeof text !== 'string') return [];

    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;

      const parsedRecord = this.asRecord(parsed);
      const nestedCollection = parsedRecord?.folders ?? parsedRecord?.files;
      return Array.isArray(nestedCollection) ? nestedCollection : [];
    } catch {
      return [];
    }
  }

  private asRoomFolder(value: unknown): RoomFolder | undefined {
    const record = this.asRecord(value);
    return record ? { _id: this.asString(record._id), name: this.asString(record.name) } : undefined;
  }

  private asRoomFile(value: unknown): RoomFile | undefined {
    const record = this.asRecord(value);
    return record ? { name: this.asString(record.name) } : undefined;
  }

  private asRecord(value: unknown): JsonRecord | undefined {
    return typeof value === 'object' && value !== null ? value as JsonRecord : undefined;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private isSafeFileName(fileName: string): boolean {
    return !/[\\/\r\n]/u.test(fileName);
  }
}
