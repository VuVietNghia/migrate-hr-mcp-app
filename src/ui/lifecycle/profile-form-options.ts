export interface ProfileFormOption {
  value: string;
  label: string;
}

/** Dùng chung cho form tạo và form sửa, để hai bên không bao giờ lệch danh sách. */
export const POSITION_OPTIONS: ReadonlyArray<ProfileFormOption> = [
  { value: 'Developer', label: 'Developer' },
  { value: 'Tester', label: 'Tester / QA' },
  { value: 'Designer', label: 'UI/UX Designer' },
  { value: 'Product Manager', label: 'Product Manager' },
  { value: 'HR', label: 'HR Specialist' },
  { value: 'Sales', label: 'Sales Executive' },
  { value: 'Marketing', label: 'Marketing Specialist' },
];

export const DEPARTMENT_OPTIONS: ReadonlyArray<ProfileFormOption> = [
  { value: 'IT', label: 'Kỹ thuật (IT / R&D)' },
  { value: 'Business', label: 'Kinh doanh (Business / Sales)' },
  { value: 'Marketing', label: 'Truyền thông (Marketing)' },
  { value: 'Back-office', label: 'Khối văn phòng (HR / Admin)' },
];

/**
 * Giá trị đang có trong file mà không nằm trong danh sách vẫn phải hiện ra, nếu không thì
 * chỉ riêng việc mở form rồi lưu đã âm thầm đổi vị trí hoặc phòng ban của nhân sự.
 */
export function withCurrentOption(
  options: ReadonlyArray<ProfileFormOption>,
  current: string,
): ReadonlyArray<ProfileFormOption> {
  if (!current || options.some(option => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}
