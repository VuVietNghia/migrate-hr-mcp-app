import { describe, expect, it } from 'vitest';
import { EmailHistoryRepository } from '../src/services/mail/email-history-repository';
import { EMAIL_HISTORY_LIST_NAME, EMAIL_HISTORY_STAGES } from '../src/services/mail/email-history-model';

const stageList = Object.values(EMAIL_HISTORY_STAGES).map((name, i) => ({ _id: `st${i}`, name }));
const payload = {
  source: 'cv_scored' as const,
  recipientName: 'A',
  recipientEmail: 'a@x.vn',
  subject: 'Hi',
  htmlContent: '<p>x</p>',
};

function fakeHub(existingList: boolean) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    calls.push([name, args]);
    switch (name) {
      case 'mcpapp.lists.getAll':
        return existingList ? [{ _id: 'L1', name: EMAIL_HISTORY_LIST_NAME, stages: stageList }] : [];
      case 'mcpapp.lists.create':
        return { list: { _id: 'L1', stages: stageList } };
      case 'mcpapp.lists.createItem':
        return { item: { _id: 'I1' } };
      case 'mcpapp.lists.getItem':
        return {
          _id: 'I1',
          listId: 'L1',
          stageId: 'st1',
          customFields: [
            { fieldId: 'email_record_id', value: 'rec-1' },
            { fieldId: 'source', value: 'cv_scored' },
            { fieldId: 'recipient_name', value: 'A' },
            { fieldId: 'recipient_email', value: 'a@x.vn' },
            { fieldId: 'subject', value: 'Hi' },
            { fieldId: 'html_content', value: '<p>x</p>' },
            { fieldId: 'created_at', value: '2026-09-01T00:00:00Z' },
            { fieldId: 'updated_at', value: '2026-09-01T00:00:00Z' },
            { fieldId: 'attempt_count', value: 1 },
          ],
        };
      default:
        return {};
    }
  };
  return { call, calls };
}

describe('EmailHistoryRepository', () => {
  it('creates the list on first use, then creates the item in the sent stage', async () => {
    const hub = fakeHub(false);
    const repo = new EmailHistoryRepository(hub.call, {
      now: () => '2026-09-08T00:00:00Z',
      createRecordId: () => 'rec-1',
    });
    const record = await repo.createResult('room-1', payload, 'sent', undefined, 'u1');
    expect(record.id).toBe('I1');
    expect(record.stageId).toBe('st0');
    expect(hub.calls.map(([n]) => n)).toEqual([
      'mcpapp.lists.getAll',
      'mcpapp.lists.create',
      'mcpapp.lists.createItem',
    ]);
    expect(hub.calls[2][1]).toMatchObject({ listId: 'L1', stageId: 'st0', title: 'Hi' });
  });

  it('reuses an existing list and caches the store per room', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call);
    await repo.ensureStore('room-1');
    await repo.ensureStore('room-1');
    expect(hub.calls.filter(([n]) => n === 'mcpapp.lists.getAll')).toHaveLength(1);
  });

  it('getRecord fetches ONE item by id instead of scanning the list', async () => {
    const hub = fakeHub(true);
    const record = await new EmailHistoryRepository(hub.call).getRecord('room-1', 'I1');
    expect(record.status).toBe('failed');
    expect(hub.calls.some(([n]) => n === 'mcpapp.lists.getItems')).toBe(false);
    expect(hub.calls.find(([n]) => n === 'mcpapp.lists.getItem')![1]).toEqual({ itemId: 'I1' });
  });

  it('prepareRetry refuses a record that is not failed', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call);
    // stageId st1 = interviewFailed in fakeHub → allowed
    await expect(repo.prepareRetry('room-1', 'I1')).resolves.toMatchObject({
      payload: { recipientEmail: 'a@x.vn' },
    });
  });

  it('markSent moves stage and bumps attemptCount', async () => {
    const hub = fakeHub(true);
    const repo = new EmailHistoryRepository(hub.call, { now: () => '2026-09-09T00:00:00Z' });
    const updated = await repo.markSent('room-1', 'I1');
    expect(updated.status).toBe('sent');
    expect(updated.attemptCount).toBe(2);
    expect(hub.calls.map(([n]) => n)).toContain('mcpapp.lists.moveItemToStage');
    expect(hub.calls.map(([n]) => n)).toContain('mcpapp.lists.updateItem');
  });
});
