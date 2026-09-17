import { moveCVToStage, type CVStageMoveApp } from './cv-stage-move';
import type { CVBoardData } from './CVScoredTab';

const INTERVIEW_PENDING_STATUS = '07_Chua_Phong_Van';
const INTERVIEW_PENDING_LABEL = 'Chưa phỏng vấn';

export type InviteStageMoveResult =
  | { status: 'moved'; stageId: string }
  | { status: 'no-stage' }
  | { status: 'failed'; detail: string };

// Không reject: tới bước này email đã gửi, nên lỗi chuyển cột là thành công một phần,
// không được rơi vào nhánh "Lỗi gửi email" khiến người dùng gửi lại.
export async function moveInvitedCVToPendingStage(
  app: CVStageMoveApp,
  itemId: string,
  stageId: string | undefined,
): Promise<InviteStageMoveResult> {
  if (!stageId) return { status: 'no-stage' };
  try {
    await moveCVToStage(app, itemId, stageId);
    return { status: 'moved', stageId };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

export function buildInviteSentMessage(input: {
  targetEmail: string;
  logged: boolean;
  stageMove: InviteStageMoveResult;
}): string {
  const { targetEmail, logged, stageMove } = input;

  if (stageMove.status !== 'failed') {
    return logged
      ? `Đã gửi email mời phỏng vấn thành công tới ${targetEmail}!`
      : `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.`;
  }

  const stageNote = `chưa chuyển được CV sang cột "${INTERVIEW_PENDING_LABEL}" (${stageMove.detail}), hãy kéo thẻ thủ công`;
  const notes = logged ? stageNote : `chưa lưu được vào lịch sử email và ${stageNote}`;
  return `Đã gửi email mời phỏng vấn tới ${targetEmail}. Lưu ý: ${notes}. Không cần gửi lại email.`;
}

export function applyInviteSentToBoards(
  boards: CVBoardData[],
  cvId: string,
  customFields: unknown,
  stageMove: InviteStageMoveResult,
): CVBoardData[] {
  return boards.map((board) => ({
    ...board,
    cvs: board.cvs.map((cv) => cv._id === cvId
      ? {
          ...cv,
          customFields,
          inviteMailSent: true,
          ...(stageMove.status === 'moved' ? { status: INTERVIEW_PENDING_STATUS } : {}),
        }
      : cv),
  }));
}
