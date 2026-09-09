import type { McpApp } from '@privos_ai/app-react';

import {
  EMAIL_HISTORY_LIST_NAME,
  EMAIL_HISTORY_STAGES,
  parseEmailHistoryItem,
  type EmailHistoryRecord,
  type EmailHistoryStageIds,
} from '../../services/mail/email-history-model';
import { restCall } from '../privos-rest';

type EmailHistoryApp = Pick<McpApp, 'callServerTool' | 'rest'>;

function parseToolResponse(response: any): any {
  const text = response?.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return response?.body ?? response;
}

function resolveStageIds(stages: unknown): EmailHistoryStageIds | null {
  if (!Array.isArray(stages)) return null;
  const ids = new Map<string, string>();
  for (const stage of stages) {
    const id = stage?._id || stage?.id;
    if (typeof id === 'string' && typeof stage?.name === 'string') {
      ids.set(stage.name, id);
    }
  }

  const interviewSent = ids.get(EMAIL_HISTORY_STAGES.interviewSent);
  const interviewFailed = ids.get(EMAIL_HISTORY_STAGES.interviewFailed);
  const employeeSent = ids.get(EMAIL_HISTORY_STAGES.employeeSent);
  const employeeFailed = ids.get(EMAIL_HISTORY_STAGES.employeeFailed);
  return interviewSent && interviewFailed && employeeSent && employeeFailed
    ? { interviewSent, interviewFailed, employeeSent, employeeFailed }
    : null;
}

export class EmailHistoryService {
  constructor(private readonly app: EmailHistoryApp) {}

  async load(roomId: string): Promise<EmailHistoryRecord[]> {
    const listsResponse = parseToolResponse(await this.app.callServerTool({
      name: 'mcpapp.lists.getAll',
      arguments: { roomId },
    }));
    const lists = Array.isArray(listsResponse) ? listsResponse : listsResponse?.lists;
    const list = Array.isArray(lists)
      ? lists.find(candidate => candidate?.name === EMAIL_HISTORY_LIST_NAME)
      : undefined;
    if (!list) return [];

    const listId = list._id || list.id;
    if (!listId) throw new Error('List lịch sử email không có ID hợp lệ.');

    let stageIds = resolveStageIds(list.stages);
    if (!stageIds) {
      const detail = await restCall<any>(this.app as McpApp, 'GET', 'lists.info', {
        query: { listId },
      });
      stageIds = resolveStageIds(detail?.stages || detail?.list?.stages);
    }
    if (!stageIds) throw new Error('List lịch sử email thiếu cấu hình trạng thái.');

    const itemsResponse = parseToolResponse(await this.app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: { listId, count: 1000 },
    }));
    const items = Array.isArray(itemsResponse) ? itemsResponse : itemsResponse?.items;
    if (!Array.isArray(items)) return [];

    return items
      .map(item => parseEmailHistoryItem({ ...item, listId }, stageIds!))
      .filter((record): record is EmailHistoryRecord => Boolean(record))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  async retry(roomId: string, itemId: string): Promise<void> {
    await this.app.callServerTool({
      name: 'hrm.mail.retry',
      arguments: { roomId, itemId },
    });
  }

  async delete(itemId: string): Promise<void> {
    await restCall(this.app as McpApp, 'POST', 'items.delete', {
      body: { itemId },
    });
  }
}
