/** How many rows the Email tab shows at once, in every section (Tất cả / Đã gửi / Gửi lỗi / Mẫu email). */
export const EMAIL_PAGE_SIZE = 15;

/** Half-open index range `[start, end)` into one list. */
export interface PageWindow {
  start: number;
  end: number;
}

/** Never less than 1, so "Trang 1 / 1" stays meaningful for an empty list. */
export function getPageCount(total: number, pageSize = EMAIL_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * Pulls a page back in range. Deleting the last row of the last page shrinks the page count under
 * the current page; without this the list would render empty instead of stepping back a page.
 */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.floor(page), Math.max(0, pageCount - 1));
}

export function getPageSlice<T>(items: readonly T[], page: number, pageSize = EMAIL_PAGE_SIZE): T[] {
  const current = clampPage(page, getPageCount(items.length, pageSize));
  return items.slice(current * pageSize, (current + 1) * pageSize);
}

/**
 * Pages several lists as if they were one list laid end to end, and returns each list's share of
 * the page as an index window into that list.
 *
 * "Mẫu email" renders the interview and HR template lists as two separate panels, each owning its
 * own data. Paging them independently would put up to twice the page size on screen with two pagers
 * stacked; paging them as one keeps every page at most `pageSize` rows, in the same order the two
 * panels already appear.
 */
export function getConcatenatedPageWindows(
  counts: readonly number[],
  page: number,
  pageSize = EMAIL_PAGE_SIZE,
): PageWindow[] {
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  const current = clampPage(page, getPageCount(total, pageSize));
  const pageStart = current * pageSize;
  const pageEnd = pageStart + pageSize;

  let offset = 0;
  return counts.map(rawCount => {
    const count = Math.max(0, rawCount);
    const start = Math.min(Math.max(pageStart - offset, 0), count);
    const end = Math.min(Math.max(pageEnd - offset, 0), count);
    offset += count;
    return { start, end };
  });
}

/** "16–30 / 72" — the rows on screen out of the total, 1-based as people count them. */
export function describePageRange(total: number, page: number, pageSize = EMAIL_PAGE_SIZE): string {
  if (total <= 0) return '0 / 0';
  const current = clampPage(page, getPageCount(total, pageSize));
  const first = current * pageSize + 1;
  const last = Math.min(total, (current + 1) * pageSize);
  return `${first}–${last} / ${total}`;
}
