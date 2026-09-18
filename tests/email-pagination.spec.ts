import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EMAIL_PAGE_SIZE,
  clampPage,
  describePageRange,
  getConcatenatedPageWindows,
  getPageCount,
  getPageSlice,
} from '../src/ui/email-history/email-pagination';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('email pagination', () => {
  it('shows 15 rows a page', () => {
    expect(EMAIL_PAGE_SIZE).toBe(15);
  });

  it('counts pages, never fewer than one', () => {
    expect(getPageCount(0)).toBe(1);
    expect(getPageCount(15)).toBe(1);
    expect(getPageCount(16)).toBe(2);
    expect(getPageCount(30)).toBe(2);
    expect(getPageCount(31)).toBe(3);
  });

  it('pulls an out-of-range page back in range', () => {
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(Number.NaN, 3)).toBe(0);
    expect(clampPage(7, 3)).toBe(2);
    expect(clampPage(1, 3)).toBe(1);
  });

  it('slices one list into pages of at most 15', () => {
    const items = range(40);
    expect(getPageSlice(items, 0)).toEqual(range(15));
    expect(getPageSlice(items, 1)).toEqual(range(15).map(i => i + 15));
    expect(getPageSlice(items, 2)).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });

  it('steps back to the last page instead of rendering an empty one', () => {
    // e.g. the only row of page 3 was just deleted
    expect(getPageSlice(range(30), 2)).toEqual(range(15).map(i => i + 15));
  });

  it('pages the two template lists as one list laid end to end', () => {
    // 10 interview templates then 20 HR templates: page 1 = all 10 + first 5 HR.
    expect(getConcatenatedPageWindows([10, 20], 0)).toEqual([{ start: 0, end: 10 }, { start: 0, end: 5 }]);
    expect(getConcatenatedPageWindows([10, 20], 1)).toEqual([{ start: 10, end: 10 }, { start: 5, end: 20 }]);
  });

  it('never puts more than 15 templates on a page, and shows each exactly once', () => {
    for (const counts of [[0, 0], [0, 20], [7, 0], [15, 15], [16, 1], [3, 44], [31, 29]]) {
      const total = counts[0] + counts[1];
      const seen = counts.map(() => new Set<number>());
      for (let page = 0; page < getPageCount(total); page++) {
        const windows = getConcatenatedPageWindows(counts, page);
        const onPage = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
        expect(onPage).toBeLessThanOrEqual(EMAIL_PAGE_SIZE);
        windows.forEach((w, list) => {
          for (let i = w.start; i < w.end; i++) {
            expect(seen[list].has(i)).toBe(false);
            seen[list].add(i);
          }
        });
      }
      counts.forEach((count, list) => expect(seen[list].size).toBe(count));
    }
  });

  it('describes the rows on screen, 1-based', () => {
    expect(describePageRange(72, 0)).toBe('1–15 / 72');
    expect(describePageRange(72, 1)).toBe('16–30 / 72');
    expect(describePageRange(72, 4)).toBe('61–72 / 72');
    expect(describePageRange(0, 0)).toBe('0 / 0');
  });
});

/**
 * The mailbox is `.tsx` and this project has no DOM test environment, so the wiring is asserted
 * against the source the way `ui-error-surfacing.spec.ts` does.
 */
describe('Email tab wiring', () => {
  const view = fs.readFileSync(path.resolve('src/ui/email-history/EmailMailboxView.tsx'), 'utf8');
  const panel = fs.readFileSync(path.resolve('src/ui/email-templates/InterviewEmailTemplatePanel.tsx'), 'utf8');

  it('renders only the current page of Tất cả / Đã gửi / Gửi lỗi', () => {
    expect(view).toContain('{pagedRecords.map(record => (');
    expect(view).not.toContain('{visibleRecords.map(record => (');
  });

  it('hands each template panel its share of the page', () => {
    expect(view).toContain('pageWindow={pageWindow}');
    expect(view).toContain('onVisibleCountChange={visibleCountCallbacks[category]}');
    expect(panel).toContain('{pagedTemplates.map(template => (');
    expect(panel).not.toContain('{visibleTemplates.map(template => (');
  });

  it('renders a pager for both the email lists and the template lists', () => {
    expect(view.match(/<EmailPager\b/g)?.length).toBe(2);
  });

  it('starts again at page 1 when the section, source, search or dates change', () => {
    expect(view).toContain(
      'JSON.stringify([filter, sourceFilter, templateFilter, query, dateRange.from, dateRange.to])',
    );
  });
});
