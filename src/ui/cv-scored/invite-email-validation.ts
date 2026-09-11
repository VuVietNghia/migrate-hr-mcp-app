export interface InviteEmailForm {
  candidateName: string;
  email: string;
  position: string;
  company: string;
  interviewDate: string;
  subject: string;
  body: string;
}

const GMAIL_EMAIL_PATTERN = /^[^\s@]+@gmail\.com$/i;

export function getInviteEmailValidationError(form: InviteEmailForm): string | null {
  if (!form.candidateName.trim()) return 'Vui lòng nhập tên ứng viên.';
  if (!form.email.trim()) return 'Vui lòng nhập email ứng viên.';
  if (!GMAIL_EMAIL_PATTERN.test(form.email.trim())) return 'Email ứng viên phải có đuôi @gmail.com.';
  if (!form.position.trim()) return 'Vui lòng nhập tên vị trí.';
  if (!form.company.trim()) return 'Vui lòng nhập tên công ty.';
  if (!form.interviewDate.trim()) return 'Vui lòng chọn thời gian phỏng vấn.';
  if (!form.subject.trim()) return 'Vui lòng nhập tiêu đề thư mời.';
  if (!form.body.trim()) return 'Vui lòng nhập nội dung thư mời.';
  return null;
}
