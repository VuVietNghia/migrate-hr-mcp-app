import type { ScreeningListRef } from './candidate-model';

export const ALL_SCREENING_LISTS = '__all_screening_lists__';

export function screeningListId(list: Pick<ScreeningListRef, '_id' | 'id'>): string {
  return typeof list._id === 'string' ? list._id : (typeof list.id === 'string' ? list.id : '');
}

function creationTimestamp(list: ScreeningListRef): number | null {
  const raw = list.createdAt ?? list.created_at;
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

export function compareScreeningListsNewestFirst(a: ScreeningListRef, b: ScreeningListRef): number {
  const aTime = creationTimestamp(a);
  const bTime = creationTimestamp(b);
  if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
  if (aTime !== null && bTime === null) return -1;
  if (aTime === null && bTime !== null) return 1;
  return screeningListId(b).localeCompare(screeningListId(a));
}

export function sortScreeningListsNewestFirst(lists: ReadonlyArray<ScreeningListRef>): ScreeningListRef[] {
  return [...lists].sort(compareScreeningListsNewestFirst);
}

function hasList(lists: ReadonlyArray<ScreeningListRef>, listId: string): boolean {
  return lists.some((list) => screeningListId(list) === listId);
}

export function resolveInitialScreeningListId(
  lists: ReadonlyArray<ScreeningListRef>,
  intentListId?: string,
): string | null {
  if (lists.length === 0) return null;
  if (intentListId === ALL_SCREENING_LISTS || (intentListId && hasList(lists, intentListId))) {
    return intentListId;
  }
  return screeningListId(sortScreeningListsNewestFirst(lists)[0]);
}

export function reconcileScreeningListSelection(
  lists: ReadonlyArray<ScreeningListRef>,
  currentListId: string | null | undefined,
): string | null {
  if (lists.length === 0) return null;
  if (currentListId === ALL_SCREENING_LISTS || (currentListId && hasList(lists, currentListId))) {
    return currentListId;
  }
  return screeningListId(sortScreeningListsNewestFirst(lists)[0]);
}

export interface ScreeningRequestToken {
  scopeId: string;
  generation: number;
}

export class ScreeningRequestGuard {
  private generation = 0;
  private selectedScopeId: string | null = null;

  select(scopeId: string | null): void {
    if (scopeId === this.selectedScopeId) return;
    this.selectedScopeId = scopeId;
    this.generation += 1;
  }

  begin(scopeId: string): ScreeningRequestToken {
    return { scopeId, generation: this.generation };
  }

  isCurrent(token: ScreeningRequestToken, selectedScopeId: string | null): boolean {
    return token.scopeId === selectedScopeId
      && token.scopeId === this.selectedScopeId
      && token.generation === this.generation;
  }
}
