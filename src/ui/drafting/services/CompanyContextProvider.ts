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

/**
 * Says the one thing the user can act on. Both "the folder was never created" and "the folder is
 * empty" mean exactly this to someone looking at the app, so they share a message — while a
 * listing that could not be read must NOT land here (see {@link CompanyContextProvider.readCollection}).
 */
const MISSING_COMPANY_INFO =
  'Chưa có thông tin công ty. Vào tab Company để nhập website hoặc tải tài liệu công ty lên.';

export class CompanyContextProvider implements ICompanyContextProvider {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string
  ) {}

  async getContext(): Promise<string> {
    const companyFolderId = await this.findCompanyFolderId();
    if (!companyFolderId) {
      throw new Error(MISSING_COMPANY_INFO);
    }

    const response = await this.app.callServerTool({
      name: 'mcpapp.files.getByChannel',
      arguments: { channelId: this.roomId, folderId: companyFolderId }
    });
    const fileNames = this.readCollection(response, 'files', 'tài liệu công ty')
      .map(value => this.asRoomFile(value)?.name)
      .filter((name): name is string => Boolean(name && this.isSafeFileName(name)))
      .sort((left, right) => left.localeCompare(right, 'vi'));

    if (fileNames.length === 0) {
      throw new Error(MISSING_COMPANY_INFO);
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

    return this.readCollection(response, 'folders', 'thư mục công ty')
      .map(value => this.asRoomFolder(value))
      .find(folder => folder?.name === folderName)?._id;
  }

  /**
   * Read a Room Files listing, throwing when the response cannot be read at all.
   *
   * The distinction is the point: this used to return `[]` for a Hub error, a malformed payload
   * and a genuinely empty folder alike, so a permission or transport failure reached the user as
   * "there is no company information" — a claim about their data that the app had no basis to
   * make. An empty-but-valid listing still returns `[]`; only unreadable responses throw.
   */
  private readCollection(response: unknown, key: 'folders' | 'files', subject: string): unknown[] {
    const unreadable = () => new Error(`Không đọc được danh sách ${subject} từ Room Files.`);
    const record = this.asRecord(response);
    if (record?.isError === true) throw unreadable();

    const content = record?.content;
    if (!Array.isArray(content)) throw unreadable();

    const text = this.asRecord(content[0])?.text;
    if (typeof text !== 'string') throw unreadable();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw unreadable();
    }
    if (Array.isArray(parsed)) return parsed;

    const nestedCollection = this.asRecord(parsed)?.[key];
    if (!Array.isArray(nestedCollection)) throw unreadable();
    return nestedCollection;
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
