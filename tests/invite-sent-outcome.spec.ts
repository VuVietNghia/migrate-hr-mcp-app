import { describe, expect, it } from 'vitest';
import {
  applyInviteSentToBoards,
  buildInviteSentMessage,
  moveInvitedCVToPendingStage,
} from '../src/ui/cv-scored/invite-sent-outcome';
import type { CVBoardData } from '../src/ui/cv-scored/CVScoredTab';

type ToolCall = { name: string; arguments?: Record<string, unknown> };

function createAppStub(respond: (call: ToolCall) => unknown) {
  const calls: ToolCall[] = [];
  const app = {
    async callServerTool(call: ToolCall) {
      calls.push(call);
      return respond(call);
    },
  };
  return { app, calls };
}

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function boardsFixture(): CVBoardData[] {
  return [
    {
      listId: 'list-1',
      listName: 'Backend Dev',
      stagesMap: { 'stage-5': '05_Moi_Phong_Van', 'stage-7': '07_Chua_Phong_Van' },
      fieldsMap: {},
      cvs: [
        { _id: 'cv-1', name: 'Nguyen Van A', status: '05_Moi_Phong_Van' },
        { _id: 'cv-2', name: 'Tran Thi B', status: '05_Moi_Phong_Van' },
      ],
    },
  ];
}

describe('moveInvitedCVToPendingStage', () => {
  it('khong goi Hub khi list khong co stage Chua phong van', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', undefined)).resolves.toEqual({ status: 'no-stage' });
    expect(calls).toEqual([]);
  });

  it('tra moved khi Hub chuyen xong', async () => {
    const { app, calls } = createAppStub(() => jsonResult({ moved: true }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'moved',
      stageId: 'stage-7',
    });
    expect(calls).toEqual([
      { name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: 'cv-1', stageId: 'stage-7' } },
    ]);
  });

  it('tra failed kem thong diep Hub khi Hub tu choi, khong reject', async () => {
    const { app } = createAppStub(() => ({
      isError: true,
      content: [{ type: 'text', text: 'Stage not found' }],
    }));

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'failed',
      detail: 'Stage not found',
    });
  });

  it('tra failed khi loi duong truyen, khong reject', async () => {
    const app = {
      async callServerTool(): Promise<unknown> {
        throw new Error('network down');
      },
    };

    await expect(moveInvitedCVToPendingStage(app, 'cv-1', 'stage-7')).resolves.toEqual({
      status: 'failed',
      detail: 'network down',
    });
  });
});

describe('buildInviteSentMessage', () => {
  it('giu nguyen thong bao thanh cong cu khi da luu lich su va da chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: true,
      stageMove: { status: 'moved', stageId: 'stage-7' },
    })).toBe('Đã gửi email mời phỏng vấn thành công tới a@x.com!');
  });

  it('giu nguyen thong bao cu khi chua luu lich su nhung khong loi chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: false,
      stageMove: { status: 'no-stage' },
    })).toBe('Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.');
  });

  it('bao da gui mail nhung chua chuyen cot khi chuyen stage that bai', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: true,
      stageMove: { status: 'failed', detail: 'Stage not found' },
    })).toBe(
      'Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa chuyển được CV sang cột "Chưa phỏng vấn" (Stage not found), hãy kéo thẻ thủ công. Không cần gửi lại email.',
    );
  });

  it('gop ca hai luu y khi vua chua luu lich su vua chua chuyen cot', () => {
    expect(buildInviteSentMessage({
      targetEmail: 'a@x.com',
      logged: false,
      stageMove: { status: 'failed', detail: 'Stage not found' },
    })).toBe(
      'Đã gửi email mời phỏng vấn tới a@x.com. Lưu ý: chưa lưu được vào lịch sử email và chưa chuyển được CV sang cột "Chưa phỏng vấn" (Stage not found), hãy kéo thẻ thủ công. Không cần gửi lại email.',
    );
  });
});

describe('applyInviteSentToBoards', () => {
  it('dat cot Chua phong van va danh dau da gui khi chuyen stage thanh cong', () => {
    const boards = boardsFixture();
    const next = applyInviteSentToBoards(boards, 'cv-1', [{ _id: 'f', value: true }], {
      status: 'moved',
      stageId: 'stage-7',
    });

    expect(next[0].cvs[0]).toEqual({
      _id: 'cv-1',
      name: 'Nguyen Van A',
      status: '07_Chua_Phong_Van',
      customFields: [{ _id: 'f', value: true }],
      inviteMailSent: true,
    });
    expect(next[0].cvs[1]).toBe(boards[0].cvs[1]);
  });

  it('giu nguyen cot nhung van danh dau da gui khi chuyen stage that bai', () => {
    const next = applyInviteSentToBoards(boardsFixture(), 'cv-1', [], {
      status: 'failed',
      detail: 'Stage not found',
    });

    expect(next[0].cvs[0].status).toBe('05_Moi_Phong_Van');
    expect(next[0].cvs[0].inviteMailSent).toBe(true);
  });

  it('giu nguyen cot khi list khong co stage Chua phong van', () => {
    const next = applyInviteSentToBoards(boardsFixture(), 'cv-1', [], { status: 'no-stage' });

    expect(next[0].cvs[0].status).toBe('05_Moi_Phong_Van');
    expect(next[0].cvs[0].inviteMailSent).toBe(true);
  });
});
