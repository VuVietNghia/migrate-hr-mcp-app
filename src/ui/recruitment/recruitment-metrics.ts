import { parseToolResult } from '@privos_ai/app-react';

import { fetchScreeningListItems } from '../cv-scored/cv-list-reader';
import { readScreeningLists } from '../cv-scored/cv-list-presence';
import type { ListItemPagingApp } from '../list-item-paging';

function listIdOf(list: { _id?: unknown; id?: unknown }): string {
  if (typeof list._id === 'string') return list._id;
  if (typeof list.id === 'string') return list.id;
  return '';
}

export async function loadEvaluatedCandidateCount(
  app: ListItemPagingApp,
  roomId: string,
): Promise<number> {
  const response = await app.callServerTool({
    name: 'mcpapp.lists.getAll',
    arguments: { roomId },
  });
  const lists = readScreeningLists(parseToolResult(response));
  if (!lists) throw new Error('PrivOS returned an invalid list payload.');

  const itemGroups = await Promise.all(
    lists.map((list) => fetchScreeningListItems(app, listIdOf(list))),
  );
  return itemGroups.reduce((total, items) => total + items.length, 0);
}
