import { fetchAllListItems, type ListItemPagingApp } from '../list-item-paging';

/** 100 × 100 = 10.000 CV mỗi list, cùng trần với roster nhân sự và hộp thư email. */
export const CV_LIST_MAX_PAGES = 100;

const SYSTEM_ITEM_MARKER = '[Hệ thống] Không xoá';

function isSystemConfigItem(item: { name?: unknown; title?: unknown }): boolean {
  const label = typeof item.name === 'string' && item.name.length > 0
    ? item.name
    : (typeof item.title === 'string' ? item.title : '');
  return label.includes(SYSTEM_ITEM_MARKER);
}

/**
 * Đọc hết item của một list SCREENING, bỏ item cấu hình hệ thống.
 *
 * `missingId: 'skip'` chứ không phải `'throw'`: đây là dữ liệu hiển thị, mất một thẻ dễ thấy
 * hơn nhiều so với việc cả tab trắng vì một item hỏng. Roster nhân sự thì ngược lại, vì nó
 * dùng để đối chiếu và xoá dòng lương.
 *
 * Kết quả được đảo ngược: `fetchAllListItems` ghim `createdAt asc`, còn lời gọi
 * `mcpapp.lists.getItems` trước đây ăn theo mặc định `createdAt desc` của Hub. Không đảo thì
 * thứ tự thẻ trên Kanban lật ngược so với hành vi người dùng đang quen.
 */
export async function fetchScreeningListItems(
  app: ListItemPagingApp,
  listId: string,
): Promise<any[]> {
  const items = await fetchAllListItems(app, listId, {
    missingId: 'skip',
    maxPages: CV_LIST_MAX_PAGES,
  });
  return items.filter((item) => !isSystemConfigItem(item)).reverse();
}
