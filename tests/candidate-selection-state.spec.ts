import { describe, expect, it } from 'vitest';
import {
  ALL_SCREENING_LISTS,
  ScreeningRequestGuard,
  reconcileScreeningListSelection,
  resolveInitialScreeningListId,
  sortScreeningListsNewestFirst,
} from '../src/ui/cv-scored/candidate-selection-state';

const lists = [
  { _id: 'older', name: 'SCREENING_OLDER', createdAt: '2026-09-01T00:00:00Z' },
  { _id: 'newer', name: 'SCREENING_NEWER', created_at: '2026-10-01T00:00:00Z' },
];

describe('sortScreeningListsNewestFirst', () => {
  it('sorts by creation time and ignores update time', () => {
    const sorted = sortScreeningListsNewestFirst([
      { _id: 'a', name: 'SCREENING_A', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' },
      { _id: 'b', name: 'SCREENING_B', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
    ]);

    expect(sorted.map((list) => list._id)).toEqual(['b', 'a']);
  });

  it('prefers createdAt over created_at, puts invalid dates last, and uses id as a stable tie-breaker', () => {
    const sorted = sortScreeningListsNewestFirst([
      { _id: 'a', name: 'SCREENING_A', createdAt: '2026-03-01T00:00:00Z', created_at: '2026-12-01T00:00:00Z' },
      { _id: 'b', name: 'SCREENING_B', createdAt: '2026-03-01T00:00:00Z' },
      { _id: 'z', name: 'SCREENING_Z', createdAt: 'not-a-date' },
      { _id: 'y', name: 'SCREENING_Y' },
    ]);

    expect(sorted.map((list) => list._id)).toEqual(['b', 'a', 'z', 'y']);
  });
});

describe('screening selection', () => {
  it('uses a valid intent and falls back to the newest list for an invalid intent', () => {
    expect(resolveInitialScreeningListId(lists, 'older')).toBe('older');
    expect(resolveInitialScreeningListId(lists, 'missing')).toBe('newer');
  });

  it('accepts the all-campaign scope only when at least one screening list exists', () => {
    expect(resolveInitialScreeningListId(lists, ALL_SCREENING_LISTS)).toBe(ALL_SCREENING_LISTS);
    expect(resolveInitialScreeningListId([], ALL_SCREENING_LISTS)).toBeNull();
  });

  it('preserves current scope and falls back when a selected list disappears', () => {
    expect(reconcileScreeningListSelection(lists, ALL_SCREENING_LISTS)).toBe(ALL_SCREENING_LISTS);
    expect(reconcileScreeningListSelection(lists, 'older')).toBe('older');
    expect(reconcileScreeningListSelection(lists, 'deleted')).toBe('newer');
    expect(reconcileScreeningListSelection([], 'older')).toBeNull();
  });
});

describe('ScreeningRequestGuard', () => {
  it('rejects a result captured before the selected scope changed', () => {
    const guard = new ScreeningRequestGuard();
    guard.select('older');
    const token = guard.begin('older');
    guard.select(ALL_SCREENING_LISTS);

    expect(guard.isCurrent(token, ALL_SCREENING_LISTS)).toBe(false);
    expect(guard.isCurrent(guard.begin(ALL_SCREENING_LISTS), ALL_SCREENING_LISTS)).toBe(true);
  });
});
