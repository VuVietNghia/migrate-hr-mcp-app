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
 * shifting every later row toward `offset` skew.
 *
 * Pinning the sort is not enough on its own. `createdAt` is not a unique key and the hub offers
 * no secondary sort key (`tools_lists.md:271` allows only `createdAt`, `name`, `order`), and a
 * row DELETED mid-read pulls every later row back one position, so `offset` paging skips one.
 * `seenIds` cannot see that: it catches a repeated row, never a missing one. The walk therefore
 * reconciles against the `total` the hub returns with every page (`tools_lists.md:298-301`) — the
 * hub includes it in EVERY `getItems` response, single-page or multi-page, so this reconciliation
 * runs on every read that returns a `total`, not only reads over 100 items.
 *
 * A DECREASE in `total` between two pages of the same read, or a final collected count that
 * disagrees with the most recently observed `total`, means a row was deleted mid-read, and the
 * whole walk restarts from offset 0. An INCREASE is not treated as mutation: under the pinned
 * ascending sort a row appended mid-read lands past the read cursor, so growth alone does not
 * corrupt an in-flight walk — restarting on it would turn ordinary appends during 3-second
 * polling into false failures.
 *
 * What this does NOT catch: a compensating delete+add mid-read (one row removed, one row added,
 * net row count and `total` unchanged) is invisible to a `total`-only signal — the decrease and
 * the final-count check both stay quiet because the numbers land back where they started. Closing
 * that gap needs overlap-paging or per-row versioning, out of scope here.
 *
 * Detection needs the `total` envelope. A bare-array response carries no `total`, and those reads
 * keep the older, unverified behaviour rather than inventing a signal that isn't there.
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

/**
 * Số lần đọc lại từ đầu khi phát hiện list đổi giữa chừng, dùng chung cho mọi caller.
 * `LifecycleDashboard` và `CVScoredTab` đều gọi qua polling 3 giây, nên một vòng đọc lại không
 * trần sẽ nhân số request lên đúng vào lúc room đang bị sửa nhiều nhất.
 */
export const LIST_ITEMS_MAX_RESTARTS = 2;

export function readItemId(item: unknown): string {
  const record = item as { _id?: unknown; id?: unknown } | null | undefined;
  if (typeof record?._id === 'string' && record._id.length > 0) return record._id;
  if (typeof record?.id === 'string' && record.id.length > 0) return record.id;
  return '';
}

/**
 * `mutated` chỉ dành cho trường hợp list đổi giữa chừng — thứ đọc lại thì cứu được. Lỗi cứng
 * (thiếu id, Hub bỏ qua offset, vượt trần trang) ném thẳng ra ngoài, không đi qua kiểu này.
 */
type WalkOutcome =
  | { status: 'complete'; items: any[] }
  | { status: 'mutated'; detail: string };

function reconcileWalk(
  collected: any[],
  skippedMissingId: number,
  expectedTotal: number | undefined,
): WalkOutcome {
  // Mảng trần không kèm `total`: không có gì để đối chiếu, giữ nguyên hành vi cũ.
  if (expectedTotal === undefined) return { status: 'complete', items: collected };

  // Item thiếu id bị loại khỏi `collected` nhưng Hub vẫn đếm nó, nên phải cộng lại mới so được.
  const accountedFor = collected.length + skippedMissingId;
  if (accountedFor !== expectedTotal) {
    return {
      status: 'mutated',
      detail: `đọc được ${accountedFor} item nhưng Hub báo tổng ${expectedTotal}`,
    };
  }

  return { status: 'complete', items: collected };
}

/**
 * List items carry room-defined custom fields and have no static schema, so `any` here is the
 * real shape of the data rather than a skipped type.
 */
async function walkAllPages(
  app: ListItemPagingApp,
  listId: string,
  options: ListItemPagingOptions,
  pageSize: number,
): Promise<WalkOutcome> {
  const collected: any[] = [];
  const seenIds = new Set<string>();
  let skippedMissingId = 0;
  let expectedTotal: number | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    const res = await app.callServerTool({
      name: 'mcpapp.lists.getItems',
      arguments: {
        listId,
        count: pageSize,
        offset: page * pageSize,
        // Ascending, pinned — lý do đầy đủ ở docstring đầu file: mặc định của Hub là
        // `createdAt desc`, dưới desc một dòng mới chèn lên đầu và đẩy lệch mọi dòng sau nó.
        sortBy: 'createdAt',
        sortOrder: 'asc',
      },
    });

    const parsed: any = parseToolResult(res);
    const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);
    const total: number | undefined = typeof parsed?.total === 'number' ? parsed.total : undefined;

    if (total !== undefined) {
      if (expectedTotal === undefined) {
        expectedTotal = total;
      } else if (total < expectedTotal) {
        return {
          status: 'mutated',
          detail: `tổng số item giảm từ ${expectedTotal} xuống ${total} giữa lúc đang phân trang — có dòng bị xoá`,
        };
      } else {
        // Duoi sortBy createdAt asc, mot dong THEM giua luc doc luon roi xuong cuoi, sau con tro
        // hien tai, nen tang total la an toan — khong phai mutation. Cap nhat expectedTotal len
        // gia tri moi nhat de phep doi chieu cuoi cung so voi tong mot nhat da thay.
        expectedTotal = total;
      }
    }

    let idsOnPage = 0;
    let alreadySeenOnPage = 0;

    for (const item of items) {
      const id = readItemId(item);
      if (id.length === 0) {
        if (options.missingId === 'throw') {
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id. `
            + 'Dừng để không trả về dữ liệu không an toàn.',
          );
        }
        skippedMissingId += 1;
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
    // Đây là lỗi cứng, không phải list bị đổi: ném thẳng, đọc lại cũng chỉ ra kết quả y hệt.
    if (idsOnPage > 0 && alreadySeenOnPage === idsOnPage) {
      throw new Error(
        `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
        + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về dữ liệu thiếu.',
      );
    }

    if (items.length < pageSize) return reconcileWalk(collected, skippedMissingId, expectedTotal);
  }

  throw new Error(
    `Danh sách ${listId} vượt quá ${options.maxPages * pageSize} item. Dừng để không trả về dữ liệu thiếu.`,
  );
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

  let lastDetail = '';
  for (let attempt = 0; attempt <= LIST_ITEMS_MAX_RESTARTS; attempt += 1) {
    const outcome = await walkAllPages(app, listId, options, pageSize);
    if (outcome.status === 'complete') return outcome.items;
    lastDetail = outcome.detail;
  }

  throw new Error(
    `Danh sách ${listId} thay đổi liên tục trong lúc đọc, đã thử ${LIST_ITEMS_MAX_RESTARTS + 1} lượt. `
    + `Lần cuối: ${lastDetail}. Dừng để không trả về dữ liệu thiếu.`,
  );
}
