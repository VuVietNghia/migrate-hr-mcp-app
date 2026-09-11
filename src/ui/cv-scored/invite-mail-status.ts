export function getInviteMailButtonState(isInviteSent: boolean) {
  return isInviteSent
    ? { label: 'Đã gửi mail', className: 'badge-tenure cv-invite-mail-sent', disabled: false }
    : { label: 'Gửi mail pv', className: 'position-badge', disabled: false };
}
