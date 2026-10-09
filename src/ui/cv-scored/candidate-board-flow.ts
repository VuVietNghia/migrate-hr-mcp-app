import type { CVBoardData, ScreeningListRef } from './candidate-model';
import { ALL_SCREENING_LISTS, screeningListId } from './candidate-selection-state';

export interface ScreeningBoardLoadError {
  listId: string;
  listName: string;
  message: string;
}

export interface ScreeningBoardLoadResult {
  boards: CVBoardData[];
  errors: ScreeningBoardLoadError[];
}

export type ScreeningBoardsByListId = Record<string, CVBoardData>;

export function listsForScreeningScope(
  lists: ReadonlyArray<ScreeningListRef>,
  scopeId: string,
): ScreeningListRef[] {
  if (scopeId === ALL_SCREENING_LISTS) return [...lists];
  return lists.filter((list) => screeningListId(list) === scopeId);
}

export async function loadScreeningScopeBoards(
  lists: ReadonlyArray<ScreeningListRef>,
  scopeId: string,
  loadBoard: (list: ScreeningListRef) => Promise<CVBoardData>,
): Promise<ScreeningBoardLoadResult> {
  const scopedLists = listsForScreeningScope(lists, scopeId);
  const settled = await Promise.allSettled(scopedLists.map((list) => loadBoard(list)));
  const boards: CVBoardData[] = [];
  const errors: ScreeningBoardLoadError[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      boards.push(result.value);
      return;
    }
    const list = scopedLists[index];
    errors.push({
      listId: screeningListId(list),
      listName: list.name,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  return { boards, errors };
}

export function mergeScreeningBoardResults(
  previous: Readonly<ScreeningBoardsByListId>,
  liveLists: ReadonlyArray<ScreeningListRef>,
  loadedBoards: ReadonlyArray<CVBoardData>,
): ScreeningBoardsByListId {
  const liveIds = new Set(liveLists.map(screeningListId));
  const next: ScreeningBoardsByListId = {};
  for (const [listId, board] of Object.entries(previous)) {
    if (liveIds.has(listId)) next[listId] = board;
  }
  for (const board of loadedBoards) next[board.listId] = board;
  return next;
}

export function boardsForScreeningScope(
  lists: ReadonlyArray<ScreeningListRef>,
  scopeId: string | null,
  boardsByListId: Readonly<ScreeningBoardsByListId>,
): CVBoardData[] {
  if (!scopeId) return [];
  return listsForScreeningScope(lists, scopeId)
    .map((list) => boardsByListId[screeningListId(list)])
    .filter((board): board is CVBoardData => Boolean(board));
}

export function screeningMutationKey(listId: string, itemId: string): string {
  return `${listId}:${itemId}`;
}
