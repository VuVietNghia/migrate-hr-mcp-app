import { parseToolResult, type McpApp } from '@privos_ai/app-react';

import type { StoredEmailPayload } from '../../services/mail/email-history-model';
import { EmailHistoryRepository } from '../../services/mail/email-history-repository';
import type { HubToolCaller } from '../../services/hub-tool-caller';

type MailApp = Pick<McpApp, 'callServerTool'>;

/** The `hrm.mail.send` arguments the composers build (invite and lifecycle). */
export interface UiMailRequest {
  roomId: string;
  source: StoredEmailPayload['source'];
  toName: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
  cvItemId?: string;
  cvListId?: string;
  jdName?: string;
}

export interface UiMailSendResult {
  /** False when the email left EmailJS but its history row could not be written — never resend then. */
  logged: boolean;
}

function toolErrorText(response: unknown, name: string): string {
  const content = (response as { content?: Array<{ text?: unknown }> } | null)?.content;
  const text = content?.[0]?.text;
  return typeof text === 'string' && text ? text : `${name} failed`;
}

/** Mediated Hub tools run AS THE CURRENT USER (`lists:read` / `lists:write`), unlike the server's bot caller. */
function createUserSessionCaller(app: MailApp): HubToolCaller {
  return async (name, args = {}) => {
    const response = await app.callServerTool({ name, arguments: args });
    if ((response as { isError?: boolean } | null)?.isError) {
      throw new Error(toolErrorText(response, name));
    }
    return response;
  };
}

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function toPayload(request: UiMailRequest): StoredEmailPayload {
  return {
    source: request.source,
    recipientName: request.toName,
    recipientEmail: request.toEmail,
    subject: request.subject,
    htmlContent: request.htmlContent,
    ...(request.cvItemId ? { cvItemId: request.cvItemId } : {}),
    ...(request.cvListId ? { cvListId: request.cvListId } : {}),
    ...(request.jdName ? { jdName: request.jdName } : {}),
  };
}

/**
 * Sends through the server relay (EmailJS secrets stay server-side) with `recordHistory: false`, then
 * writes the "Tất cả / Đã gửi / Gửi lỗi" row itself over the user session. The server's own history
 * path needs the installation-bot credential, which only a workspace admin can issue — without it every
 * email went out unlogged.
 */
export class UserSessionTrackedMail {
  private readonly history: EmailHistoryRepository;

  constructor(private readonly app: MailApp) {
    this.history = new EmailHistoryRepository(createUserSessionCaller(app), { createRecordId });
  }

  async send(request: UiMailRequest): Promise<UiMailSendResult> {
    const payload = toPayload(request);
    let requestedBy: string | undefined;
    try {
      const result = parseToolResult(await this.app.callServerTool({
        name: 'hrm.mail.send',
        arguments: { ...request, recordHistory: false },
      })) as { requestedBy?: unknown } | null;
      requestedBy = typeof result?.requestedBy === 'string' ? result.requestedBy : undefined;
    } catch (deliveryError) {
      try {
        await this.history.createResult(request.roomId, payload, 'failed', deliveryError);
      } catch (historyError) {
        console.warn('[hrm.mail] send failed and its history row could not be written', historyError);
      }
      throw deliveryError;
    }

    try {
      await this.history.createResult(request.roomId, payload, 'sent', undefined, requestedBy);
      return { logged: true };
    } catch (historyError) {
      console.warn('[hrm.mail] email delivered, history write failed', historyError);
      return { logged: false };
    }
  }

  /** Re-sends a "Gửi lỗi" row from its stored content and moves that same row to its new status. */
  async retry(roomId: string, itemId: string): Promise<void> {
    const { record, payload } = await this.history.prepareRetry(roomId, itemId);
    try {
      await this.app.callServerTool({
        name: 'hrm.mail.send',
        arguments: {
          roomId,
          source: payload.source,
          toName: payload.recipientName,
          toEmail: payload.recipientEmail,
          subject: payload.subject,
          htmlContent: payload.htmlContent,
          ...(payload.cvItemId ? { cvItemId: payload.cvItemId } : {}),
          ...(payload.cvListId ? { cvListId: payload.cvListId } : {}),
          ...(payload.jdName ? { jdName: payload.jdName } : {}),
          recordHistory: false,
        },
      }).then(parseToolResult);
    } catch (deliveryError) {
      await this.history.markFailed(roomId, record.id, deliveryError);
      throw deliveryError;
    }

    try {
      await this.history.markSent(roomId, record.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Email đã gửi nhưng không thể cập nhật lịch sử: ${message}`);
    }
  }
}
