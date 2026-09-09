export const EMAIL_HISTORY_LIST_NAME = 'Quản lí Email';

export const EMAIL_HISTORY_STAGES = {
  interviewSent: 'Email Phỏng vấn - Đã gửi',
  interviewFailed: 'Email Phỏng vấn - Gửi lỗi',
  employeeSent: 'Email Nhân sự - Đã gửi',
  employeeFailed: 'Email Nhân sự - Gửi lỗi',
} as const;

export const EMAIL_HISTORY_FIELD_IDS = {
  recordId: 'email_record_id',
  source: 'source',
  recipientName: 'recipient_name',
  recipientEmail: 'recipient_email',
  subject: 'subject',
  htmlContent: 'html_content',
  cvItemId: 'cv_item_id',
  cvListId: 'cv_list_id',
  jdName: 'jd_name',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  sentAt: 'sent_at',
  attemptCount: 'attempt_count',
  lastError: 'last_error',
  requestedBy: 'requested_by',
} as const;

export type EmailHistoryStatus = 'sent' | 'failed';
export type EmailHistoryFilter = EmailHistoryStatus | 'all' | 'templates';
export type EmailSource = 'cv_scored' | 'lifecycle';
export type EmailSourceFilter = EmailSource | 'all';

export interface EmailHistoryDateRange {
  from: string;
  to: string;
}

export interface EmailHistoryStageIds {
  interviewSent: string;
  interviewFailed: string;
  employeeSent: string;
  employeeFailed: string;
}

export interface StoredEmailPayload {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  htmlContent: string;
  source: EmailSource;
  cvItemId?: string;
  cvListId?: string;
  jdName?: string;
}

export interface EmailHistoryRecord extends StoredEmailPayload {
  id: string;
  listId: string;
  stageId: string;
  status: EmailHistoryStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  attemptCount: number;
  lastError?: string;
  requestedBy?: string;
}

type PrivOSCustomField = {
  fieldId?: unknown;
  fieldDefinitionId?: unknown;
  value?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readCustomFields(value: unknown): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  if (!Array.isArray(value)) return fields;

  for (const rawField of value) {
    if (!rawField || typeof rawField !== 'object') continue;
    const field = rawField as PrivOSCustomField;
    const fieldId = asNonEmptyString(field.fieldId) || asNonEmptyString(field.fieldDefinitionId);
    if (fieldId) fields.set(fieldId, field.value);
  }

  return fields;
}

function getStatus(
  stageId: string,
  stages: EmailHistoryStageIds,
): { status: EmailHistoryStatus; source: EmailSource } | null {
  if (stageId === stages.interviewSent) return { status: 'sent', source: 'cv_scored' };
  if (stageId === stages.interviewFailed) return { status: 'failed', source: 'cv_scored' };
  if (stageId === stages.employeeSent) return { status: 'sent', source: 'lifecycle' };
  if (stageId === stages.employeeFailed) return { status: 'failed', source: 'lifecycle' };
  return null;
}

export function parseEmailHistoryItem(
  rawItem: unknown,
  stages: EmailHistoryStageIds,
): EmailHistoryRecord | null {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const item = rawItem as Record<string, unknown>;
  const id = asNonEmptyString(item._id) || asNonEmptyString(item.id);
  const listId = asNonEmptyString(item.listId);
  const stageId = asNonEmptyString(item.stageId);
  if (!id || !listId || !stageId) return null;

  const stageIdentity = getStatus(stageId, stages);
  if (!stageIdentity) return null;

  const fields = readCustomFields(item.customFields);
  const source = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.source));
  const recipientName = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.recipientName));
  const recipientEmail = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.recipientEmail));
  const subject = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.subject));
  const htmlContent = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.htmlContent));
  const createdAt = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.createdAt))
    || asNonEmptyString(item.createdAt);
  const updatedAt = asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.updatedAt))
    || asNonEmptyString(item.updatedAt)
    || createdAt;

  if (
    source !== stageIdentity.source
    || !recipientName
    || !recipientEmail
    || !subject
    || !htmlContent
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  const rawAttemptCount = fields.get(EMAIL_HISTORY_FIELD_IDS.attemptCount);
  const parsedAttemptCount = typeof rawAttemptCount === 'number'
    ? rawAttemptCount
    : Number(rawAttemptCount);
  const attemptCount = Number.isFinite(parsedAttemptCount) && parsedAttemptCount >= 1
    ? Math.floor(parsedAttemptCount)
    : 1;

  return {
    id,
    listId,
    stageId,
    status: stageIdentity.status,
    source: stageIdentity.source,
    recipientName,
    recipientEmail,
    subject,
    htmlContent,
    createdAt,
    updatedAt,
    attemptCount,
    cvItemId: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.cvItemId)),
    cvListId: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.cvListId)),
    jdName: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.jdName)),
    sentAt: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.sentAt)),
    lastError: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.lastError)),
    requestedBy: asNonEmptyString(fields.get(EMAIL_HISTORY_FIELD_IDS.requestedBy)),
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function filterEmailHistory(
  records: EmailHistoryRecord[],
  filter: EmailHistoryFilter,
  query: string,
  dateRange: EmailHistoryDateRange = { from: '', to: '' },
  sourceFilter: EmailSourceFilter = 'all',
): EmailHistoryRecord[] {
  if (filter === 'templates') return [];

  const normalizedQuery = normalizeSearchText(query);

  return records.filter(record => {
    if (sourceFilter !== 'all' && record.source !== sourceFilter) return false;
    if (filter !== 'all' && record.status !== filter) return false;
    if (dateRange.from || dateRange.to) {
      const updatedAt = new Date(record.updatedAt);
      if (!Number.isFinite(updatedAt.getTime())) return false;
      const updatedDate = [
        updatedAt.getFullYear(),
        String(updatedAt.getMonth() + 1).padStart(2, '0'),
        String(updatedAt.getDate()).padStart(2, '0'),
      ].join('-');
      if (dateRange.from && updatedDate < dateRange.from) return false;
      if (dateRange.to && updatedDate > dateRange.to) return false;
    }
    if (normalizedQuery) {
      const searchable = normalizeSearchText(
        `${record.recipientName} ${record.recipientEmail} ${record.subject}`,
      );
      if (!searchable.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

export function canRetryEmail(record: EmailHistoryRecord): boolean {
  return record.status === 'failed';
}

export function canDeleteEmail(record: EmailHistoryRecord): boolean {
  return Boolean(record.id);
}
