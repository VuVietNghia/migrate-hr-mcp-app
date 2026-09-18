/** List thô từ `mcpapp.lists.getAll`; chỉ các field dưới đây được đọc. */
export interface ScreeningListRef {
  _id?: string;
  id?: string;
  name: string;
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

function listIdOf(list: { _id?: unknown; id?: unknown }): string {
  return typeof list._id === 'string' ? list._id : (typeof list.id === 'string' ? list.id : '');
}

/**
 * Các list SCREENING trong payload `mcpapp.lists.getAll` đã parse.
 * Trả null khi payload không phải mảng hay `{ lists: [] }`: một lần gọi hỏng không được hiểu thành
 * "mọi list đã bị xoá" rồi gỡ sạch board.
 */
export function readScreeningLists(parsed: unknown): ScreeningListRef[] | null {
  const lists: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' ? (parsed as { lists?: unknown }).lists : undefined);
  if (!Array.isArray(lists)) return null;

  return lists.filter((list): list is ScreeningListRef =>
    Boolean(list) && typeof list === 'object'
    && listIdOf(list) !== ''
    && typeof (list as { name?: unknown }).name === 'string'
    && (list as { name: string }).name.includes('SCREENING'));
}

/** Id các list SCREENING còn trên Hub; null khi payload hỏng (xem readScreeningLists). */
export function readScreeningListIds(parsed: unknown): Set<string> | null {
  const lists = readScreeningLists(parsed);
  return lists ? new Set(lists.map(listIdOf)) : null;
}

/** Mới cập nhật trước; thời gian bằng hoặc thiếu thì so id giảm dần. Cùng thứ tự loadData dùng. */
export function compareListsNewestFirst(a: ScreeningListRef, b: ScreeningListRef): number {
  const tA = new Date(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0).getTime();
  const tB = new Date(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0).getTime();
  if (tA !== tB && tA > 0 && tB > 0) return tB - tA;
  return listIdOf(b).localeCompare(listIdOf(a));
}

/** List SCREENING chưa có board trên màn hình (vừa tạo trên Hub), mới nhất trước. */
export function findNewLists(
  lists: ReadonlyArray<ScreeningListRef>,
  boards: ReadonlyArray<{ listId: string }>,
): ScreeningListRef[] {
  const shown = new Set(boards.map((board) => board.listId));
  return lists.filter((list) => !shown.has(listIdOf(list))).sort(compareListsNewestFirst);
}

/** Tách board có list đã bị xoá khỏi Hub (không còn trong liveIds). */
export function splitRemovedBoards<T extends { listId: string }>(
  boards: ReadonlyArray<T>,
  liveIds: ReadonlySet<string>,
): { kept: T[]; removed: T[] } {
  const kept: T[] = [];
  const removed: T[] = [];
  for (const board of boards) (liveIds.has(board.listId) ? kept : removed).push(board);
  return { kept, removed };
}
