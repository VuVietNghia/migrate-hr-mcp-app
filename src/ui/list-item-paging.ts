import { parseToolResult } from '@privos_ai/app-react';

/**
 * Read every item of a PrivOS list.
 *
 * `mcpapp.lists.getItems` caps `count` at 100 (`tools_lists.md:270`) and does support `offset`
 * (`tools_lists.md:269`). Sending a larger `count` is not an error — the hub just returns the
 * first 100 — so every single-shot read in this codebase was silently truncating.
 *
 * Paging is pinned to `sortBy: 'createdAt', sortOrder: 'asc'` (see the call below) instead of
 * the hub's `createdAt desc` default, so a row created mid-read appends past the end instead of
 * shifting every later row toward `offset` skew. Residual: `createdAt` is not a unique key, so
 * rows sharing an identical timestamp can still reorder between pages. The window for that is
 * far smaller than under `desc`, but it is not zero — this module reduces the risk, it does not
 * eliminate it.
 */

/** Xử lý item không mang `_id` lẫn `id`. */
export type MissingIdPolicy = 'throw' | 'skip';

export interface ListItemPagingApp {
  callServerTool(call: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
}

export interface ListItemPagingOptions {
  missingId: MissingIdPolicy;
  /** Trần số trang đọc trước khi bỏ cuộc. */
  maxPages: number;
  /** Item mỗi trang. Hub chặn ở 100. */
  pageSize?: number;
}

export const LIST_ITEMS_PAGE_SIZE = 100;

export function readItemId(item: unknown): string {
  const record = item as { _id?: unknown; id?: unknown } | null | undefined;
  if (typeof record?._id === 'string' && record._id.length > 0) return record._id;
  if (typeof record?.id === 'string' && record.id.length > 0) return record.id;
  return '';
}

/**
 * List items carry room-defined custom fields and have no static schema, so `any` here is the
 * real shape of the data rather than a skipped type.
 */
export async function fetchAllListItems(
  app: ListItemPagingApp,
  listId: string,
  options: ListItemPagingOptions,
): Promise<any[]> {
  // Clamped, not trusted: the hub caps `count` at 100 (`tools_lists.md:270`) and returns 100
  // without erroring when asked for more. An unclamped `pageSize: 1000` would make
  // `items.length < pageSize` true on a full page, so the loop would exit after one page and
  // return a silently truncated read — the exact defect this module exists to prevent,
  // reintroduced through its own option.
  const pageSize = Math.min(options.pageSize ?? LIST_ITEMS_PAGE_SIZE, LIST_ITEMS_PAGE_SIZE);
  const collected: any[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < options.maxPages; page += 1) {
    const res = await app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: {
        listId,
        count: pageSize,
        offset: page * pageSize,
        // Ascending, pinned: the hub's default is `createdAt desc` (`tools_lists.md:271-272`),
        // and under desc a row created mid-read inserts at the front and shifts every later
        // row, so `offset` paging can SKIP rows. `seenIds` below catches repeats but cannot
        // detect skips, and a silent partial read is the failure this module exists to stop.
        // Ascending appends new rows past the end instead. Same reasoning as
        // `PayrollService.queryByRoom`, which pins `orderBy` for the same reason.
        sortBy: 'createdAt',
        sortOrder: 'asc',
      },
    });

    const parsed: any = parseToolResult(res);
    const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);

    let idsOnPage = 0;
    let alreadySeenOnPage = 0;

    for (const item of items) {
      const id = readItemId(item);
      if (id.length === 0) {
        if (options.missingId === 'throw') {
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id nên không đối chiếu được với bảng lương. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
        }
        continue;
      }

      idsOnPage += 1;
      if (seenIds.has(id)) {
        alreadySeenOnPage += 1;
        continue;
      }
      seenIds.add(id);
      collected.push(item);
    }

    // Trang có id, và mọi id đều đã thu thập trước đó: Hub đang phát lại trang 0, tức là
    // `offset` bị bỏ qua. Lặp tiếp thì quay vòng, cắt ngang thì mất dữ liệu âm thầm — cả hai
    // đều tệ hơn là nói thẳng. Trang không có id nào thì không kết luận được gì, bỏ qua phép dò.
    if (idsOnPage > 0 && alreadySeenOnPage === idsOnPage) {
      throw new Error(
        `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
        + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về dữ liệu thiếu.',
      );
    }

    if (items.length < pageSize) return collected;
  }

  throw new Error(
    `Danh sách ${listId} vượt quá ${options.maxPages * pageSize} item. Dừng để không trả về dữ liệu thiếu.`,
  );
}
