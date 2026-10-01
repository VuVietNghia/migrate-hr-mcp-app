import { parseToolResult, type McpApp } from '@privos_ai/app-react';

import { parseMailReceipt, type MailReceipt } from '../../services/mail/mail-contracts';
import { isMailErrorCode, MailError } from '../../services/mail/mail-errors';
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
  /** False when the provider accepted the email but its history row could not be written. */
  logged: boolean;
  receipt: MailReceipt;
}

function toolErrorText(response: unknown, name: string): string {
  const content = (response as { content?: Array<{ text?: unknown }> } | null)?.content;
  const text = content?.[0]?.text;
  return typeof text === 'string' && text ? text : `${name} failed`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseMailToolResult(raw: unknown): unknown {
  const envelope = asRecord(raw);
  if (envelope.isError === true) {
    const text = toolErrorText(raw, 'hrm.mail');
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
    }
    const error = asRecord(payload);
    if (!isMailErrorCode(error.code)) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
    const retryAfterSeconds = typeof error.retryAfterSeconds === 'number' ? error.retryAfterSeconds : undefined;
    throw new MailError(error.code, retryAfterSeconds);
  }
  return parseToolResult(raw);
}

/** Mediated Hub tools run AS THE CURRENT USER (`lists:read` / `lists:write`), unlike the server's bot caller. */
function createUserSessionCaller(app: MailApp): HubToolCaller {
  return async (name, args = {}) => {
    const response = await app.callServerTool({ name, arguments: args });
    if ((response as { isError?: boolean } | null)?.isError) {
      throw new Error(`Hub operation failed: ${name}`);
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
 * Sends through the Room mailbox gateway with `recordHistory: false`, then
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
    let receipt: MailReceipt;
    try {
      const result = asRecord(parseMailToolResult(await this.app.callServerTool({
        name: 'hrm.mail.send',
        arguments: { ...request, recordHistory: false },
      })));
      requestedBy = typeof result.requestedBy === 'string' ? result.requestedBy : undefined;
      receipt = parseMailReceipt(result.receipt);
    } catch (deliveryError) {
      try {
        const status = deliveryError instanceof MailError && deliveryError.code === 'MAIL_SEND_UNKNOWN'
          ? 'unknown'
          : 'failed';
        await this.history.createResult(request.roomId, payload, status, deliveryError);
      } catch {
        console.warn('[hrm.mail] send failed and its history row could not be written');
      }
      throw deliveryError;
    }

    try {
      await this.history.createResult(request.roomId, payload, 'sent', undefined, requestedBy, receipt);
      return { logged: true, receipt };
    } catch {
      console.warn('[hrm.mail] email delivered, history write failed');
      return { logged: false, receipt };
    }
  }

  /** Re-sends a "Gửi lỗi" row from its stored content and moves that same row to its new status. */
  async retry(roomId: string, itemId: string): Promise<UiMailSendResult> {
    const { record, payload } = await this.history.prepareRetry(roomId, itemId);
    let receipt: MailReceipt;
    try {
      const result = asRecord(parseMailToolResult(await this.app.callServerTool({
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
      })));
      receipt = parseMailReceipt(result.receipt);
    } catch (deliveryError) {
      if (deliveryError instanceof MailError && deliveryError.code === 'MAIL_SEND_UNKNOWN') {
        await this.history.markUnknown(roomId, record.id, deliveryError);
      } else {
        await this.history.markFailed(roomId, record.id, deliveryError);
      }
      throw deliveryError;
    }

    try {
      await this.history.markSent(roomId, record.id, receipt);
      return { logged: true, receipt };
    } catch {
      console.warn('[hrm.mail] email delivered, history update failed');
      try {
        await this.history.markUnknown(roomId, record.id, new MailError('MAIL_SEND_UNKNOWN'));
      } catch {
        console.warn('[hrm.mail] accepted retry could not be marked unknown');
      }
      return { logged: false, receipt };
    }
  }
}
