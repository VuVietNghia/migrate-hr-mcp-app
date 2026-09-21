import type { CVProfile } from './CVScoredTab';

/** Các field hiển thị trên thẻ, so bằng ===. customFields là mảng/object nên so riêng. */
const COMPARED_FIELDS = ['status', 'name', 'score', 'category', 'reason', 'email', 'sdt', 'inviteMailSent'] as const;

/**
 * Hai danh sách thẻ giống nhau về mọi thứ người dùng thấy và mọi thứ luồng gửi mail mời ghi lại
 * (customFields). Poll chỉ setBoards khi hàm này trả false, để không re-render mỗi 3 giây.
 */
export function areCvListsEqual(a: ReadonlyArray<CVProfile>, b: ReadonlyArray<CVProfile>): boolean {
  if (a.length !== b.length) return false;
  return a.every((cv, index) => {
    const other = b[index];
    return cv._id === other._id
      && COMPARED_FIELDS.every((field) => cv[field] === other[field])
      && JSON.stringify(cv.customFields) === JSON.stringify(other.customFields);
  });
}

export function areStageMapsEqual(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}
