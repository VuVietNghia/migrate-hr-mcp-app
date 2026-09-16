import type { McpApp } from '@privos_ai/app-react';

import {
  EMAIL_HISTORY_LIST_NAME,
  EMAIL_HISTORY_STAGES,
  parseEmailHistoryItem,
  type EmailHistoryRecord,
  type EmailHistoryStageIds,
} from '../../services/mail/email-history-model';
import { restCall } from '../privos-rest';
import { UserSessionTrackedMail } from './user-session-tracked-mail';
import { fetchAllListItems } from '../list-item-paging';

/**
 * 100 × 100 = 10.000 bản ghi, cùng trần với roster nhân sự. Trước đây chỗ này gửi `count: 1000`
 * một phát, nhưng Hub chặn `count` ở 100 (`tools_lists.md:270`) và không báo lỗi khi vượt — hộp
 * thư quá 100 email đang mất phần dư trong im lặng.
 *
 * Trần đặt cao vì vượt trần là ném lỗi, tức tab Email trống trơn. Với một hộp thư chỉ để đọc,
 * trống trơn còn tệ hơn hiển thị thiếu, nên trần phải nằm ngoài mọi room hợp lý; nó chỉ còn là
 * lưới chặn vòng lặp vô hạn khi list hỏng.
 */
const EMAIL_HISTORY_MAX_PAGES = 100;

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

    const items = await fetchAllListItems(this.app, listId, {
      missingId: 'skip',
      maxPages: EMAIL_HISTORY_MAX_PAGES,
    });

    return items
      .map(item => parseEmailHistoryItem({ ...item, listId }, stageIds!))
      .filter((record): record is EmailHistoryRecord => Boolean(record))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  /** Runs over the user session (see `UserSessionTrackedMail`), not the bot-credential `hrm.mail.retry`. */
  async retry(roomId: string, itemId: string): Promise<void> {
    await new UserSessionTrackedMail(this.app).retry(roomId, itemId);
  }

  async delete(itemId: string): Promise<void> {
    await restCall(this.app as McpApp, 'POST', 'items.delete', {
      body: { itemId },
    });
  }
}
