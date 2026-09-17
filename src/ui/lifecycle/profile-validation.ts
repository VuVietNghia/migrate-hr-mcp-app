import type { EmployeeMdDocument } from './employee-md-document';
import { isValidEmailAddress } from '../utils/email-validation';

export const PHONE_REGEX = /^\+?[0-9\s\-().]{8,20}$/;

/**
 * Lỗi đầu tiên khiến bản sửa không được lưu, hoặc null. Chạy trước khi ghi đè file.
 *
 * `bankAccount` không được chứa " - ": dòng ngân hàng trong file là "<số tài khoản> - <tên
 * ngân hàng>" và được tách ở dấu " - " đầu tiên, nên một số tài khoản chứa nó sẽ bị cắt sang
 * tên ngân hàng ở lần mở sau.
 */
export function findEmployeeDocError(doc: EmployeeMdDocument): string | null {
  if (!doc.fullName.trim()) return 'Vui lòng nhập Họ và Tên nhân sự.';
  const phone = doc.phone.trim();
  if (!phone) return 'Vui lòng nhập Số điện thoại liên hệ.';
  if (!PHONE_REGEX.test(phone)) return 'Số điện thoại không hợp lệ (hỗ trợ số di động, cố định hoặc quốc tế có +).';
  const email = doc.email.trim();
  if (email && !isValidEmailAddress(email)) return 'Email không đúng định dạng (VD: an.nguyen@company.com).';
  if (doc.bankAccount.includes(' - ')) return 'Số tài khoản ngân hàng không được chứa " - ".';
  return null;
}
