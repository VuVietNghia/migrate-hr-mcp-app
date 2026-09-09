const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}
