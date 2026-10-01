import type { EmailHistoryRecord, StoredEmailPayload } from './email-history-model';
import type { MailMessage, MailReceipt } from './mail-contracts';

export interface SendTrackedMailRequest extends StoredEmailPayload {
  roomId: string;
  requestedBy?: string;
}

export interface EmailHistoryGateway {
  createResult(
    roomId: string,
    payload: StoredEmailPayload,
    status: EmailHistoryRecord['status'],
    error?: unknown,
    requestedBy?: string,
    receipt?: MailReceipt,
  ): Promise<EmailHistoryRecord>;
  markSent(roomId: string, itemId: string, receipt?: MailReceipt): Promise<EmailHistoryRecord>;
  markFailed(roomId: string, itemId: string, error: unknown): Promise<EmailHistoryRecord>;
  markUnknown(roomId: string, itemId: string, error: unknown): Promise<EmailHistoryRecord>;
  prepareRetry(
    roomId: string,
    itemId: string,
  ): Promise<{ record: EmailHistoryRecord; payload: StoredEmailPayload }>;
}

export interface MailDeliveryGateway {
  queueMail(params: MailMessage): Promise<MailReceipt>;
}

/**
 * The provider has already accepted the message once `queueMail` resolves, so a failure
 * to write the history row is reported as `sent_unlogged` rather than an error:
 * surfacing it as a send failure makes the operator resend, and the recipient
 * gets the same email twice.
 */
export type SendTrackedMailOutcome =
  | { status: 'sent'; record: EmailHistoryRecord; receipt: MailReceipt }
  | { status: 'sent_unlogged'; receipt: MailReceipt };

function isUnknownSend(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'MAIL_SEND_UNKNOWN';
}

function toDeliveryParams(payload: StoredEmailPayload): MailMessage {
  return {
    toName: payload.recipientName,
    toEmail: payload.recipientEmail,
    subject: payload.subject,
    htmlContent: payload.htmlContent,
  };
}

export class TrackedMailService {
  private readonly activeRetries = new Set<string>();

  constructor(
    private readonly history: EmailHistoryGateway,
    private readonly delivery: MailDeliveryGateway,
  ) {}

  /** Delivery only: for a caller that keeps the history row itself (the UI, over the user session). */
  async deliver(payload: StoredEmailPayload): Promise<MailReceipt> {
    return this.delivery.queueMail(toDeliveryParams(payload));
  }

  async send(request: SendTrackedMailRequest): Promise<SendTrackedMailOutcome> {
    const { roomId, requestedBy, ...payload } = request;

    try {
      const receipt = await this.delivery.queueMail(toDeliveryParams(payload));
      try {
        const record = await this.history.createResult(roomId, payload, 'sent', undefined, requestedBy, receipt);
        return { status: 'sent', record, receipt };
      } catch {
        console.warn('[hrm.mail] email delivered, history write failed');
        return { status: 'sent_unlogged', receipt };
      }
    } catch (deliveryError) {
      try {
        await this.history.createResult(
          roomId,
          payload,
          isUnknownSend(deliveryError) ? 'unknown' : 'failed',
          deliveryError,
          requestedBy,
        );
      } catch {
        if (isUnknownSend(deliveryError)) throw deliveryError;
        throw new Error('Gửi email thất bại và không thể lưu lịch sử.');
      }
      throw deliveryError;
    }
  }

  async retry(roomId: string, itemId: string): Promise<SendTrackedMailOutcome> {
    const retryKey = `${roomId}:${itemId}`;
    if (this.activeRetries.has(retryKey)) {
      throw new Error('Email này đang được gửi lại. Vui lòng chờ kết quả.');
    }
    this.activeRetries.add(retryKey);

    try {
      const prepared = await this.history.prepareRetry(roomId, itemId);
      try {
        const receipt = await this.delivery.queueMail(toDeliveryParams(prepared.payload));
        try {
          const updated = await this.history.markSent(roomId, prepared.record.id, receipt);
          return { status: 'sent', record: updated, receipt };
        } catch {
          console.warn('[hrm.mail] email delivered, history update failed');
          return { status: 'sent_unlogged', receipt };
        }
      } catch (error) {
        if (isUnknownSend(error)) await this.history.markUnknown(roomId, prepared.record.id, error);
        else await this.history.markFailed(roomId, prepared.record.id, error);
        throw error;
      }
    } finally {
      this.activeRetries.delete(retryKey);
    }
  }
}
