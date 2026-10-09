import { describe, expect, it } from 'vitest';
import type { CVBoardData, ScreeningListRef } from '../src/ui/cv-scored/candidate-model';
import { ALL_SCREENING_LISTS } from '../src/ui/cv-scored/candidate-selection-state';
import {
  boardsForScreeningScope,
  loadScreeningScopeBoards,
  mergeScreeningBoardResults,
  screeningMutationKey,
} from '../src/ui/cv-scored/candidate-board-flow';

const lists: ScreeningListRef[] = [
  { _id: 'new', name: 'SCREENING_NEW', createdAt: '2026-10-01T00:00:00Z' },
  { _id: 'old', name: 'SCREENING_OLD', createdAt: '2026-09-01T00:00:00Z' },
];

function board(listId: string): CVBoardData {
  return {
    listId,
    listName: `SCREENING_${listId.toUpperCase()}`,
    stagesMap: {},
    fieldsMap: {},
    cvs: [{ _id: 'same', name: `Candidate ${listId}`, status: '03_Tiem_Nang' }],
  };
}

describe('loadScreeningScopeBoards', () => {
  it('loads only the selected campaign in single-campaign scope', async () => {
    const loaded: string[] = [];
    const result = await loadScreeningScopeBoards(lists, 'old', async (list) => {
      const id = String(list._id);
      loaded.push(id);
      return board(id);
    });

    expect(loaded).toEqual(['old']);
    expect(result.boards.map((value) => value.listId)).toEqual(['old']);
    expect(result.errors).toEqual([]);
  });

  it('loads every readable campaign for all-campaign scope and isolates a failed list', async () => {
    const loaded: string[] = [];
    const result = await loadScreeningScopeBoards(lists, ALL_SCREENING_LISTS, async (list) => {
      const id = String(list._id);
      loaded.push(id);
      if (id === 'old') throw new Error('permission denied');
      return board(id);
    });

    expect(loaded).toEqual(['new', 'old']);
    expect(result.boards.map((value) => value.listId)).toEqual(['new']);
    expect(result.errors).toEqual([{ listId: 'old', listName: 'SCREENING_OLD', message: 'permission denied' }]);
  });
});

describe('scope board state', () => {
  it('keeps identical item ids from different lists in all-campaign mode', () => {
    const byListId = { old: board('old'), new: board('new') };
    const visible = boardsForScreeningScope(lists, ALL_SCREENING_LISTS, byListId);

    expect(visible.flatMap((value) => value.cvs.map((cv) => screeningMutationKey(value.listId, cv._id))))
      .toEqual(['new:same', 'old:same']);
  });

  it('merges successful loads, preserves a failed live board, and removes deleted lists', () => {
    const previous = { old: board('old'), deleted: board('deleted') };
    const freshNew = board('new');
    const next = mergeScreeningBoardResults(previous, lists, [freshNew]);

    expect(Object.keys(next).sort()).toEqual(['new', 'old']);
    expect(next.old).toBe(previous.old);
    expect(next.new).toBe(freshNew);
  });
});
