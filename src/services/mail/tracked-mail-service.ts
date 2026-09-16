import type { EmailHistoryRecord, StoredEmailPayload } from './email-history-model';
import type { SendMailParams } from './mail-relay-service';

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
  ): Promise<EmailHistoryRecord>;
  markSent(roomId: string, itemId: string): Promise<EmailHistoryRecord>;
  markFailed(roomId: string, itemId: string, error: unknown): Promise<EmailHistoryRecord>;
  prepareRetry(
    roomId: string,
    itemId: string,
  ): Promise<{ record: EmailHistoryRecord; payload: StoredEmailPayload }>;
}

export interface MailDeliveryGateway {
  queueMail(params: SendMailParams): Promise<void>;
}

/**
 * The message has already left EmailJS once `queueMail` resolves, so a failure
 * to write the history row is reported as `sent_unlogged` rather than an error:
 * surfacing it as a send failure makes the operator resend, and the recipient
 * gets the same email twice.
 */
export type SendTrackedMailOutcome =
  | { status: 'sent'; record: EmailHistoryRecord }
  | { status: 'sent_unlogged'; historyError: string };

function toDeliveryParams(payload: StoredEmailPayload): SendMailParams {
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
  async deliver(payload: StoredEmailPayload): Promise<void> {
    await this.delivery.queueMail(toDeliveryParams(payload));
  }

  async send(request: SendTrackedMailRequest): Promise<SendTrackedMailOutcome> {
    const { roomId, requestedBy, ...payload } = request;

    try {
      await this.delivery.queueMail(toDeliveryParams(payload));
    } catch (deliveryError) {
      try {
        await this.history.createResult(roomId, payload, 'failed', deliveryError, requestedBy);
      } catch (historyError) {
        const message = historyError instanceof Error ? historyError.message : String(historyError);
        throw new Error(`Gửi email thất bại và không thể lưu lịch sử: ${message}`);
      }
      throw deliveryError;
    }

    try {
      const record = await this.history.createResult(roomId, payload, 'sent', undefined, requestedBy);
      return { status: 'sent', record };
    } catch (historyError) {
      const historyErrorMessage = historyError instanceof Error ? historyError.message : String(historyError);
      // Swallowed on purpose (see SendTrackedMailOutcome) — but never silently.
      console.warn('[hrm.mail] email delivered, history write failed:', historyErrorMessage);
      return { status: 'sent_unlogged', historyError: historyErrorMessage };
    }
  }

  async retry(roomId: string, itemId: string): Promise<EmailHistoryRecord> {
    const retryKey = `${roomId}:${itemId}`;
    if (this.activeRetries.has(retryKey)) {
      throw new Error('Email này đang được gửi lại. Vui lòng chờ kết quả.');
    }
    this.activeRetries.add(retryKey);

    try {
      const prepared = await this.history.prepareRetry(roomId, itemId);
      try {
        await this.delivery.queueMail(toDeliveryParams(prepared.payload));
      } catch (error) {
        await this.history.markFailed(roomId, prepared.record.id, error);
        throw error;
      }

      try {
        return await this.history.markSent(roomId, prepared.record.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Email đã gửi nhưng không thể cập nhật lịch sử: ${message}`);
      }
    } finally {
      this.activeRetries.delete(retryKey);
    }
  }
}
