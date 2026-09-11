export interface TrackedInviteEmailInput {
  roomId: string;
  cvItemId: string;
  cvListId: string;
  jdName?: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
}

export interface TrackedInviteEmailRequest {
  roomId: string;
  source: 'cv_scored';
  cvItemId: string;
  cvListId: string;
  jdName?: string;
  toName: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
}

export function buildTrackedInviteEmailRequest(
  input: TrackedInviteEmailInput,
): TrackedInviteEmailRequest {
  const roomId = input.roomId.trim();
  const cvItemId = input.cvItemId.trim();
  const cvListId = input.cvListId.trim();
  if (!roomId || !cvItemId || !cvListId) {
    throw new Error('Thiếu Room hoặc thông tin CV để theo dõi email.');
  }

  return {
    roomId,
    source: 'cv_scored',
    cvItemId,
    cvListId,
    ...(input.jdName?.trim() ? { jdName: input.jdName.trim() } : {}),
    toName: input.toName.trim(),
    toEmail: input.toEmail.trim(),
    subject: input.subject,
    htmlContent: input.body.replace(/\n/g, '<br/>'),
  };
}
