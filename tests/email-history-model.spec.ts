import { describe, expect, it } from 'vitest';
import {
  filterEmailHistory,
  parseEmailHistoryItem,
  type EmailHistoryRecord,
} from '../src/services/mail/email-history-model';

const stages = { interviewSent: 's1', interviewFailed: 's2', employeeSent: 's3', employeeFailed: 's4' };
const item = (overrides: Record<string, unknown> = {}) => ({
  _id: 'i1',
  listId: 'l1',
  stageId: 's1',
  customFields: [
    { fieldId: 'source', value: 'cv_scored' },
    { fieldId: 'recipient_name', value: 'A' },
    { fieldId: 'recipient_email', value: 'a@x.vn' },
    { fieldId: 'subject', value: 'Hi' },
    { fieldId: 'html_content', value: '<p>x</p>' },
    { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' },
    { fieldId: 'updated_at', value: '2026-09-02T00:00:00Z' },
    { fieldId: 'attempt_count', value: 2 },
  ],
  ...overrides,
});

describe('parseEmailHistoryItem', () => {
  it('maps stage → status/source and custom fields → record', () => {
    const record = parseEmailHistoryItem(item(), stages)!;
    expect(record).toMatchObject({
      id: 'i1',
      status: 'sent',
      source: 'cv_scored',
      recipientEmail: 'a@x.vn',
      attemptCount: 2,
    });
  });
  it('returns null when source field disagrees with the stage', () => {
    expect(parseEmailHistoryItem(item({ stageId: 's3' }), stages)).toBeNull();
  });
  it('returns null on unknown stage or missing required field', () => {
    expect(parseEmailHistoryItem(item({ stageId: 'zzz' }), stages)).toBeNull();
    expect(parseEmailHistoryItem(item({ customFields: [] }), stages)).toBeNull();
  });
});

describe('filterEmailHistory', () => {
  const rec = (o: Partial<EmailHistoryRecord>): EmailHistoryRecord =>
    ({
      id: 'x',
      listId: 'l',
      stageId: 's',
      status: 'sent',
      source: 'cv_scored',
      recipientName: 'Nguyễn Văn Á',
      recipientEmail: 'a@x.vn',
      subject: 'Mời phỏng vấn',
      htmlContent: '',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
      attemptCount: 1,
      ...o,
    }) as EmailHistoryRecord;
  it('matches Vietnamese text without diacritics', () => {
    expect(filterEmailHistory([rec({})], 'all', 'nguyen van a')).toHaveLength(1);
  });
  it('filters by status, source and date range', () => {
    const rows = [rec({ id: '1', status: 'failed' }), rec({ id: '2', source: 'lifecycle' })];
    expect(filterEmailHistory(rows, 'failed', '').map((r) => r.id)).toEqual(['1']);
    expect(filterEmailHistory(rows, 'all', '', { from: '', to: '' }, 'lifecycle').map((r) => r.id)).toEqual(['2']);
    expect(filterEmailHistory(rows, 'all', '', { from: '2026-09-03', to: '' })).toHaveLength(0);
  });
});
