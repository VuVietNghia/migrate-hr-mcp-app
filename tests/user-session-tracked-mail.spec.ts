import { describe, expect, it } from 'vitest';

import {
  EMAIL_HISTORY_FIELD_IDS,
  EMAIL_HISTORY_LIST_NAME,
  EMAIL_HISTORY_STAGES,
} from '../src/services/mail/email-history-model';
import { UserSessionTrackedMail, type UiMailRequest } from '../src/ui/email-history/user-session-tracked-mail';

type ToolCall = { name: string; arguments?: Record<string, any> };

const STAGES = [
  { _id: 'st-is', name: EMAIL_HISTORY_STAGES.interviewSent },
  { _id: 'st-if', name: EMAIL_HISTORY_STAGES.interviewFailed },
  { _id: 'st-es', name: EMAIL_HISTORY_STAGES.employeeSent },
  { _id: 'st-ef', name: EMAIL_HISTORY_STAGES.employeeFailed },
];

const request: UiMailRequest = {
  roomId: 'room-1',
  source: 'lifecycle',
  toName: 'Nguyễn Văn A',
  toEmail: 'a@example.com',
  subject: 'Thông báo',
  htmlContent: 'Chào A<br/>',
};

/**
 * Stand-in for the iframe bridge: `hrm.mail.send` plus the mediated list tools, with an in-memory
 * history list that already exists in the Room.
 */
function createAppStub({ sendFails = false, createItemFails = false } = {}) {
  const calls: ToolCall[] = [];
  const items = new Map<string, any>();
  const ok = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      const args = call.arguments ?? {};
      switch (call.name) {
        case 'hrm.mail.send':
          if (sendFails) throw new Error('EmailJS 400: bad template');
          return ok({ itemId: null, status: 'delivered', requestedBy: 'user-1' });
        case 'mcpapp.lists.getAll':
          return ok([{ _id: 'list-1', name: EMAIL_HISTORY_LIST_NAME, stages: STAGES }]);
        case 'mcpapp.lists.createItem': {
          if (createItemFails) return { isError: true, content: [{ type: 'text', text: 'lists:write denied' }] };
          const id = `item-${items.size + 1}`;
          items.set(id, { _id: id, listId: 'list-1', title: args.title, stageId: args.stageId, customFields: args.customFields });
          return ok({ _id: id });
        }
        case 'mcpapp.lists.getItem':
          return ok(items.get(args.itemId));
        case 'mcpapp.lists.moveItemToStage':
          items.get(args.itemId).stageId = args.stageId;
          return ok({});
        case 'mcpapp.lists.updateItem':
          items.get(args.itemId).customFields = args.customFields;
          return ok({});
        default:
          throw new Error(`unexpected tool call: ${call.name}`);
      }
    },
  };
  return { app: app as never, calls, items };
}

function field(item: any, fieldId: string) {
  return item.customFields.find((entry: any) => entry.fieldId === fieldId)?.value;
}

describe('UserSessionTrackedMail', () => {
  it('delivers without server history, then writes a sent row with the verified requestedBy', async () => {
    const { app, calls, items } = createAppStub();

    await expect(new UserSessionTrackedMail(app).send(request)).resolves.toEqual({ logged: true });

    expect(calls[0]).toEqual({ name: 'hrm.mail.send', arguments: { ...request, recordHistory: false } });
    const [row] = [...items.values()];
    expect(row.stageId).toBe('st-es');
    expect(field(row, EMAIL_HISTORY_FIELD_IDS.recipientEmail)).toBe('a@example.com');
    expect(field(row, EMAIL_HISTORY_FIELD_IDS.requestedBy)).toBe('user-1');
  });

  it('records a failed row and rethrows when delivery fails', async () => {
    const { app, items } = createAppStub({ sendFails: true });

    await expect(new UserSessionTrackedMail(app).send(request)).rejects.toThrow('EmailJS 400');

    const [row] = [...items.values()];
    expect(row.stageId).toBe('st-ef');
    expect(field(row, EMAIL_HISTORY_FIELD_IDS.lastError)).toContain('EmailJS 400');
  });

  it('reports a delivered-but-unlogged email instead of throwing, so nobody resends it', async () => {
    const { app } = createAppStub({ createItemFails: true });

    await expect(new UserSessionTrackedMail(app).send(request)).resolves.toEqual({ logged: false });
  });

  it('retries a failed row and moves that same row to sent', async () => {
    const failing = createAppStub({ sendFails: true });
    await expect(new UserSessionTrackedMail(failing.app).send(request)).rejects.toThrow();
    const [failedRow] = [...failing.items.values()];

    const { app, items } = createAppStub();
    items.set(failedRow._id, failedRow);
    await new UserSessionTrackedMail(app).retry('room-1', failedRow._id);

    expect(items.size).toBe(1);
    expect(items.get(failedRow._id).stageId).toBe('st-es');
    expect(field(items.get(failedRow._id), EMAIL_HISTORY_FIELD_IDS.attemptCount)).toBe(2);
  });
});
