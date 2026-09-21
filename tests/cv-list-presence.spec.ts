import { describe, expect, it } from 'vitest';
import { findNewLists, readScreeningListIds, readScreeningLists, splitRemovedBoards } from '../src/ui/cv-scored/cv-list-presence';

describe('readScreeningListIds', () => {
  it('đọc payload dạng mảng và dạng { lists }, chỉ lấy list SCREENING', () => {
    const lists = [
      { _id: 'a', name: 'SCREENING_BACKEND' },
      { id: 'b', name: 'SCREENING_TESTER' },
      { _id: 'c', name: 'Hồ sơ nhân sự' },
    ];
    expect(readScreeningListIds(lists)).toEqual(new Set(['a', 'b']));
    expect(readScreeningListIds({ lists })).toEqual(new Set(['a', 'b']));
  });

  it('trả null khi payload hỏng, để không hiểu nhầm là mọi list đã bị xoá', () => {
    expect(readScreeningListIds(null)).toBeNull();
    expect(readScreeningListIds({ raw: 'oops' })).toBeNull();
    expect(readScreeningListIds({ success: false })).toBeNull();
  });
});

describe('splitRemovedBoards', () => {
  const boards = [{ listId: 'a', listName: 'A' }, { listId: 'b', listName: 'B' }, { listId: 'c', listName: 'C' }];

  it('giữ nguyên khi không có list nào bị xoá', () => {
    const { kept, removed } = splitRemovedBoards(boards, new Set(['a', 'b', 'c']));
    expect(kept).toEqual(boards);
    expect(removed).toEqual([]);
  });

  it('tách các board có list không còn trên Hub', () => {
    const { kept, removed } = splitRemovedBoards(boards, new Set(['b']));
    expect(kept.map((b) => b.listId)).toEqual(['b']);
    expect(removed.map((b) => b.listName)).toEqual(['A', 'C']);
  });

  it('gỡ hết khi Hub không còn list SCREENING nào', () => {
    const { kept, removed } = splitRemovedBoards(boards, new Set());
    expect(kept).toEqual([]);
    expect(removed).toHaveLength(3);
  });
});

describe('readScreeningLists', () => {
  it('chỉ trả list SCREENING, null khi payload hỏng', () => {
    const lists = [{ _id: 'a', name: 'SCREENING_A' }, { _id: 'c', name: 'Hồ sơ nhân sự' }];
    expect(readScreeningLists({ lists })?.map((l) => l._id)).toEqual(['a']);
    expect(readScreeningLists({ raw: 'x' })).toBeNull();
  });
});

describe('findNewLists', () => {
  const boards = [{ listId: 'a' }];

  it('rỗng khi mọi list đã có board', () => {
    expect(findNewLists([{ _id: 'a', name: 'SCREENING_A' }], boards)).toEqual([]);
  });

  it('trả list chưa có board, mới nhất trước', () => {
    const lists = [
      { _id: 'a', name: 'SCREENING_A', updatedAt: '2026-09-18T01:00:00Z' },
      { _id: 'b', name: 'SCREENING_B', updatedAt: '2026-09-18T02:00:00Z' },
      { id: 'c', name: 'SCREENING_C', createdAt: '2026-09-18T03:00:00Z' },
    ];
    expect(findNewLists(lists, boards).map((l) => l._id || l.id)).toEqual(['c', 'b']);
  });
});
