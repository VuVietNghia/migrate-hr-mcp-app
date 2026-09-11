import {
  EMAIL_HISTORY_FIELD_IDS,
  EMAIL_HISTORY_LIST_NAME,
  EMAIL_HISTORY_STAGES,
  parseEmailHistoryItem,
  type EmailHistoryRecord,
  type EmailHistoryStageIds,
  type StoredEmailPayload,
} from './email-history-model';
import type { HubToolCaller } from '../hub-tool-caller';

export interface EmailHistoryStore {
  listId: string;
  stageIds: EmailHistoryStageIds;
}

type EmailHistoryRepositoryDependencies = {
  now?: () => string;
  createRecordId?: () => string;
};

const FIELD_DEFINITIONS = [
  { _id: EMAIL_HISTORY_FIELD_IDS.recordId, name: 'Mã email', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.source, name: 'Nguồn gửi', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.recipientName, name: 'Tên người nhận', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.recipientEmail, name: 'Email người nhận', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.subject, name: 'Tiêu đề', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.htmlContent, name: 'Nội dung HTML', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.cvItemId, name: 'CV item ID', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.cvListId, name: 'CV list ID', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.jdName, name: 'Tên JD', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.createdAt, name: 'Thời gian tạo', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.updatedAt, name: 'Cập nhật gần nhất', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.sentAt, name: 'Thời gian gửi', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.attemptCount, name: 'Số lần gửi', type: 'NUMBER' },
  { _id: EMAIL_HISTORY_FIELD_IDS.lastError, name: 'Lỗi gần nhất', type: 'TEXT' },
  { _id: EMAIL_HISTORY_FIELD_IDS.requestedBy, name: 'Người gửi', type: 'TEXT' },
];

const STAGE_DEFINITIONS = [
  { name: EMAIL_HISTORY_STAGES.interviewSent, color: '#16a34a' },
  { name: EMAIL_HISTORY_STAGES.interviewFailed, color: '#dc2626' },
  { name: EMAIL_HISTORY_STAGES.employeeSent, color: '#16a34a' },
  { name: EMAIL_HISTORY_STAGES.employeeFailed, color: '#dc2626' },
];

function parseToolResponse(response: unknown): any {
  if (!response || typeof response !== 'object') return response;
  const envelope = response as Record<string, any>;
  const text = envelope.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return envelope.body ?? response;
}

function getListId(value: any): string | undefined {
  return value?._id || value?.id || value?.listId;
}

function resolveStageIds(stages: unknown): EmailHistoryStageIds | null {
  if (!Array.isArray(stages)) return null;
  const idsByName = new Map<string, string>();
  for (const stage of stages) {
    const id = stage?._id || stage?.id;
    if (typeof id === 'string' && typeof stage?.name === 'string') {
      idsByName.set(stage.name, id);
    }
  }

  const interviewSent = idsByName.get(EMAIL_HISTORY_STAGES.interviewSent);
  const interviewFailed = idsByName.get(EMAIL_HISTORY_STAGES.interviewFailed);
  const employeeSent = idsByName.get(EMAIL_HISTORY_STAGES.employeeSent);
  const employeeFailed = idsByName.get(EMAIL_HISTORY_STAGES.employeeFailed);
  return interviewSent && interviewFailed && employeeSent && employeeFailed
    ? { interviewSent, interviewFailed, employeeSent, employeeFailed }
    : null;
}

function getStageId(
  stages: EmailHistoryStageIds,
  source: StoredEmailPayload['source'],
  status: EmailHistoryRecord['status'],
): string {
  if (source === 'cv_scored') {
    return status === 'sent' ? stages.interviewSent : stages.interviewFailed;
  }
  return status === 'sent' ? stages.employeeSent : stages.employeeFailed;
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(accessToken|privateKey|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 1000);
}

function recordToCustomFields(record: EmailHistoryRecord, recordId: string) {
  return [
    { fieldId: EMAIL_HISTORY_FIELD_IDS.recordId, value: recordId },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.source, value: record.source },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.recipientName, value: record.recipientName },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.recipientEmail, value: record.recipientEmail },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.subject, value: record.subject },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.htmlContent, value: record.htmlContent },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.cvItemId, value: record.cvItemId || '' },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.cvListId, value: record.cvListId || '' },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.jdName, value: record.jdName || '' },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.createdAt, value: record.createdAt },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.updatedAt, value: record.updatedAt },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.sentAt, value: record.sentAt || '' },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.attemptCount, value: record.attemptCount },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.lastError, value: record.lastError || '' },
    { fieldId: EMAIL_HISTORY_FIELD_IDS.requestedBy, value: record.requestedBy || '' },
  ];
}

function recordPayload(record: EmailHistoryRecord): StoredEmailPayload {
  return {
    source: record.source,
    recipientName: record.recipientName,
    recipientEmail: record.recipientEmail,
    subject: record.subject,
    htmlContent: record.htmlContent,
    ...(record.cvItemId ? { cvItemId: record.cvItemId } : {}),
    ...(record.cvListId ? { cvListId: record.cvListId } : {}),
    ...(record.jdName ? { jdName: record.jdName } : {}),
  };
}

export class EmailHistoryRepository {
  private readonly stores = new Map<string, Promise<EmailHistoryStore>>();
  private readonly now: () => string;
  private readonly createRecordId: () => string;

  constructor(
    private readonly callTool: HubToolCaller,
    dependencies: EmailHistoryRepositoryDependencies = {},
  ) {
    this.now = dependencies.now || (() => new Date().toISOString());
    this.createRecordId = dependencies.createRecordId || (() => crypto.randomUUID());
  }

  ensureStore(roomId: string): Promise<EmailHistoryStore> {
    const existing = this.stores.get(roomId);
    if (existing) return existing;

    const pending = this.findOrCreateStore(roomId).catch(error => {
      this.stores.delete(roomId);
      throw error;
    });
    this.stores.set(roomId, pending);
    return pending;
  }

  async createResult(
    roomId: string,
    payload: StoredEmailPayload,
    status: EmailHistoryRecord['status'],
    error?: unknown,
    requestedBy?: string,
  ): Promise<EmailHistoryRecord> {
    const store = await this.ensureStore(roomId);
    const timestamp = this.now();
    const recordId = this.createRecordId();
    const stageId = getStageId(store.stageIds, payload.source, status);
    const draft: EmailHistoryRecord = {
      id: '',
      listId: store.listId,
      stageId,
      status,
      ...payload,
      createdAt: timestamp,
      updatedAt: timestamp,
      sentAt: status === 'sent' ? timestamp : undefined,
      attemptCount: 1,
      lastError: status === 'failed' ? normalizeError(error) : undefined,
      requestedBy,
    };

    // The item is created directly in its final stage, so no follow-up move is needed.
    const response = parseToolResponse(await this.callTool('mcpapp.lists.createItem', {
      listId: store.listId,
      title: payload.subject,
      stageId,
      customFields: recordToCustomFields(draft, recordId),
    }));
    const item = response?.item || response;
    const itemId = getListId(item);
    if (!itemId) throw new Error('Không lấy được item ID sau khi tạo lịch sử email.');

    return { ...draft, id: itemId };
  }

  async markSent(roomId: string, itemId: string): Promise<EmailHistoryRecord> {
    const store = await this.ensureStore(roomId);
    const current = await this.getRecord(roomId, itemId);
    const timestamp = this.now();
    return this.updateRecord({
      ...current,
      stageId: getStageId(store.stageIds, current.source, 'sent'),
      status: 'sent',
      updatedAt: timestamp,
      sentAt: timestamp,
      attemptCount: current.attemptCount + 1,
      lastError: undefined,
    });
  }

  async markFailed(roomId: string, itemId: string, error: unknown): Promise<EmailHistoryRecord> {
    const store = await this.ensureStore(roomId);
    const current = await this.getRecord(roomId, itemId);
    return this.updateRecord({
      ...current,
      stageId: getStageId(store.stageIds, current.source, 'failed'),
      status: 'failed',
      updatedAt: this.now(),
      attemptCount: current.attemptCount + 1,
      lastError: normalizeError(error),
    });
  }

  async prepareRetry(
    roomId: string,
    itemId: string,
  ): Promise<{ record: EmailHistoryRecord; payload: StoredEmailPayload }> {
    const current = await this.getRecord(roomId, itemId);
    if (current.status !== 'failed') {
      throw new Error('Chỉ có thể gửi lại email ở trạng thái Gửi lỗi.');
    }

    return { record: current, payload: recordPayload(current) };
  }

  async getRecord(roomId: string, itemId: string): Promise<EmailHistoryRecord> {
    const store = await this.ensureStore(roomId);
    const item = await this.getRawRecordItem(store.listId, itemId);
    const record = parseEmailHistoryItem({ ...item, listId: store.listId }, store.stageIds);
    if (!record) throw new Error('Dữ liệu lịch sử email không hợp lệ.');
    return record;
  }

  private async findOrCreateStore(roomId: string): Promise<EmailHistoryStore> {
    const allResponse = parseToolResponse(await this.callTool('mcpapp.lists.getAll', { roomId }));
    const lists = Array.isArray(allResponse) ? allResponse : allResponse?.lists;
    const existing = Array.isArray(lists)
      ? lists.find(list => list?.name === EMAIL_HISTORY_LIST_NAME)
      : undefined;

    if (existing) {
      const listId = getListId(existing);
      let stages = existing.stages;
      if (!resolveStageIds(stages) && listId) {
        stages = parseToolResponse(await this.callTool('mcpapp.stages.getByList', { listId }));
      }
      const stageIds = resolveStageIds(stages);
      if (!listId || !stageIds) throw new Error('List lịch sử email thiếu cấu hình stage bắt buộc.');
      return { listId, stageIds };
    }

    const created = parseToolResponse(await this.callTool('mcpapp.lists.create', {
      roomId,
      name: EMAIL_HISTORY_LIST_NAME,
      description: 'Lịch sử email dùng chung của HR Mini App. Không xóa List này.',
      fieldDefinitions: FIELD_DEFINITIONS,
      stages: STAGE_DEFINITIONS,
    }));
    const list = created?.list || created;
    const listId = getListId(list);
    const stageIds = resolveStageIds(created?.stages || list?.stages);
    if (!listId || !stageIds) throw new Error('Không thể khởi tạo List lịch sử email.');
    return { listId, stageIds };
  }

  private async updateRecord(record: EmailHistoryRecord): Promise<EmailHistoryRecord> {
    const currentItem = await this.getRawRecordItem(record.listId, record.id);
    const recordIdField = Array.isArray(currentItem.customFields)
      ? currentItem.customFields.find((field: any) => field?.fieldId === EMAIL_HISTORY_FIELD_IDS.recordId)
      : undefined;
    const recordId = typeof recordIdField?.value === 'string' && recordIdField.value
      ? recordIdField.value
      : record.id;

    if (currentItem.stageId !== record.stageId) {
      await this.callTool('mcpapp.lists.moveItemToStage', {
        itemId: record.id,
        stageId: record.stageId,
      });
    }
    await this.callTool('mcpapp.lists.updateItem', {
      itemId: record.id,
      title: record.subject,
      customFields: recordToCustomFields(record, recordId),
    });
    return record;
  }

  /**
   * One item, one request. The original scanned the whole list (`getItems`, count 1000) for a
   * single id — an O(list) read on every send, retry and status change.
   */
  private async getRawRecordItem(listId: string, itemId: string): Promise<any> {
    const response = parseToolResponse(await this.callTool('mcpapp.lists.getItem', { itemId }));
    const item = response?.item || response;
    const id = item?._id || item?.id;
    if (!id || (item.listId && item.listId !== listId)) {
      throw new Error('Không tìm thấy email trong Room hiện tại.');
    }
    return item;
  }
}
