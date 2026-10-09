import { parseToolResult, type McpApp } from '@privos_ai/app-react';

import { isAlreadyRegisteredError } from '../../services/payroll/payroll-schema';
import type { RecruitmentJobFileMetadata } from './recruitment-uploaded-jobs';

export const RECRUITMENT_JOB_FILES_COLLECTION = 'hr_recruitment_job_files';

const FIELDS = [
  { name: 'roomId', type: 'string', required: true, maxLength: 64 },
  { name: 'fileId', type: 'string', required: true, maxLength: 128 },
  { name: 'fileName', type: 'string', required: true, maxLength: 255 },
  { name: 'departmentKey', type: 'string', required: true, maxLength: 100 },
  { name: 'source', type: 'string', required: true, enum: ['uploaded'] },
  { name: 'createdAt', type: 'string', required: true, maxLength: 40 },
] as const;

const INDEXES = [{ fields: { roomId: 1, fileId: 1 }, unique: true }] as const;

interface MetadataRow {
  _id?: unknown;
  roomId?: unknown;
  fileId?: unknown;
  fileName?: unknown;
  departmentKey?: unknown;
  source?: unknown;
  createdAt?: unknown;
}

function isCollectionMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /collection/iu.test(message) && /not found/iu.test(message);
}

function parseMetadata(row: MetadataRow, expectedRoomId: string): RecruitmentJobFileMetadata | null {
  if (
    row.roomId !== expectedRoomId
    || typeof row.fileId !== 'string' || !row.fileId.trim()
    || typeof row.fileName !== 'string' || !row.fileName.trim()
    || typeof row.departmentKey !== 'string' || !row.departmentKey.trim()
    || row.source !== 'uploaded'
    || typeof row.createdAt !== 'string' || !row.createdAt.trim()
  ) return null;
  return {
    fileId: row.fileId,
    fileName: row.fileName,
    departmentKey: row.departmentKey,
    source: 'uploaded',
    createdAt: row.createdAt,
  };
}

function assertMetadata(metadata: RecruitmentJobFileMetadata): void {
  if (
    !metadata.fileId.trim()
    || !metadata.fileName.trim()
    || !metadata.departmentKey.trim()
    || metadata.source !== 'uploaded'
    || !metadata.createdAt.trim()
  ) throw new Error('Metadata JD tải lên không hợp lệ.');
}

export class AppDbRecruitmentJobFileRepository {
  constructor(private readonly app: McpApp, private readonly roomId: string) {}

  async list(): Promise<RecruitmentJobFileMetadata[]> {
    try {
      const response = await this.call('mcpapp.db.query', {
        collection: RECRUITMENT_JOB_FILES_COLLECTION,
        where: [{ field: 'roomId', op: '==', value: this.roomId }],
        limit: 1000,
      });
      const rows = Array.isArray(response.records) ? response.records as MetadataRow[] : [];
      return rows.map((row) => parseMetadata(row, this.roomId)).filter((item): item is RecruitmentJobFileMetadata => item !== null);
    } catch (error) {
      if (isCollectionMissingError(error)) return [];
      throw error;
    }
  }

  async upsert(metadata: RecruitmentJobFileMetadata): Promise<RecruitmentJobFileMetadata> {
    assertMetadata(metadata);
    try {
      await this.upsertRegistered(metadata);
    } catch (error) {
      if (!isCollectionMissingError(error)) throw error;
      await this.registerCollection();
      await this.upsertRegistered(metadata);
    }
    return metadata;
  }

  private async upsertRegistered(metadata: RecruitmentJobFileMetadata): Promise<void> {
    const data = { roomId: this.roomId, ...metadata };
    const existing = await this.find(metadata.fileId);
    if (typeof existing?._id === 'string') {
      await this.call('mcpapp.db.update', {
        collection: RECRUITMENT_JOB_FILES_COLLECTION,
        id: existing._id,
        data,
      });
      return;
    }
    try {
      await this.call('mcpapp.db.create', { collection: RECRUITMENT_JOB_FILES_COLLECTION, data });
    } catch (error) {
      const raced = await this.find(metadata.fileId);
      if (typeof raced?._id !== 'string') throw error;
      await this.call('mcpapp.db.update', {
        collection: RECRUITMENT_JOB_FILES_COLLECTION,
        id: raced._id,
        data,
      });
    }
  }

  private async find(fileId: string): Promise<MetadataRow | null> {
    const response = await this.call('mcpapp.db.query', {
      collection: RECRUITMENT_JOB_FILES_COLLECTION,
      where: [
        { field: 'roomId', op: '==', value: this.roomId },
        { field: 'fileId', op: '==', value: fileId },
      ],
      limit: 1,
    });
    return Array.isArray(response.records) ? response.records[0] as MetadataRow | undefined ?? null : null;
  }

  private async registerCollection(): Promise<void> {
    try {
      await this.call('mcpapp.db.registerCollection', {
        collection: RECRUITMENT_JOB_FILES_COLLECTION,
        scope: 'room',
        fields: FIELDS,
        indexes: INDEXES,
      });
    } catch (error) {
      if (!isAlreadyRegisteredError(error)) throw error;
    }
  }

  private async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return parseToolResult(await this.app.callServerTool({ name, arguments: args }));
  }
}
