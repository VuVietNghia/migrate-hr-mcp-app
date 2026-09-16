/**
 * Room admins name the custom fields on the employee list, so mapping a field name onto a profile
 * property has to be a lookup. It used to be a chain of `includes` tests, and a room holding both
 * "Ngày sinh" and "Ngày bắt đầu" matched both on `includes('ngày')` — the write path then stored
 * the start date into the birthday field, corrupting real data.
 *
 * Matching is exact against this table instead. A field name that is not listed is left alone:
 * that field stops syncing, which is visible and recoverable, rather than overwriting a neighbour.
 */

export type ProfileFieldKey =
  | 'phone'
  | 'email'
  | 'position'
  | 'department'
  | 'startDate'
  | 'attachedFileObj';

/** Keys here MUST already be normalised — `resolveProfileFieldKey` normalises only its input. */
const ALIASES = new Map<string, ProfileFieldKey>([
  ['SO DIEN THOAI', 'phone'],
  ['SDT', 'phone'],
  ['DIEN THOAI', 'phone'],
  ['PHONE', 'phone'],

  ['EMAIL', 'email'],
  ['THU DIEN TU', 'email'],

  ['VI TRI', 'position'],
  ['CHUC DANH', 'position'],
  ['POSITION', 'position'],

  ['PHONG BAN', 'department'],
  ['BO PHAN', 'department'],
  ['DEPARTMENT', 'department'],

  ['NGAY BAT DAU', 'startDate'],
  ['NGAY VAO LAM', 'startDate'],
  ['START DATE', 'startDate'],

  ['HO SO DINH KEM', 'attachedFileObj'],
  ['TAI LIEU', 'attachedFileObj'],
  ['DOCUMENT', 'attachedFileObj'],
]);

/**
 * Diacritics are stripped before `đ` is replaced: NFD does not decompose `đ`, it is a distinct
 * letter rather than a vowel carrying a mark.
 */
export function normalizeFieldName(fieldName: string): string {
  return (fieldName || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

export function resolveProfileFieldKey(fieldName: string): ProfileFieldKey | undefined {
  return ALIASES.get(normalizeFieldName(fieldName));
}
