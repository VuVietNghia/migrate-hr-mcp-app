import type { AppTab } from './studio-navigation';

export interface StudioJDReference {
  fileId: string;
  fileName: string;
}

export interface StudioScreeningReference {
  listId: string;
  listName: string;
}

export interface StudioNavigationIntent {
  sequence: number;
  target: AppTab;
  jd?: StudioJDReference;
  screening?: StudioScreeningReference;
}

export function nextStudioNavigationIntent(
  previous: StudioNavigationIntent | null,
  target: AppTab,
  context?: Pick<StudioNavigationIntent, 'jd' | 'screening'>,
): StudioNavigationIntent {
  return {
    sequence: (previous?.sequence ?? 0) + 1,
    target,
    ...(context?.jd ? { jd: context.jd } : {}),
    ...(context?.screening ? { screening: context.screening } : {}),
  };
}

export function resolveIntentJD<T extends { _id: string; name: string }>(
  intent: StudioNavigationIntent | null,
  target: AppTab,
  files: readonly T[],
): T | undefined {
  if (!intent?.jd || intent.target !== target) return undefined;
  return files.find((file) => file._id === intent.jd?.fileId)
    ?? files.find((file) => file.name === intent.jd?.fileName);
}

export function resolveIntentScreeningBoard<T extends { listId: string; listName: string }>(
  intent: StudioNavigationIntent | null,
  target: AppTab,
  boards: readonly T[],
): T | undefined {
  if (!intent?.screening || intent.target !== target) return undefined;
  return boards.find((board) => board.listId === intent.screening?.listId);
}

export async function resolveOrLoadIntentScreeningBoard<T extends { listId: string; listName: string }>(
  intent: StudioNavigationIntent | null,
  target: AppTab,
  boards: readonly T[],
  load: (reference: StudioScreeningReference) => Promise<T>,
  wait: () => Promise<void>,
  maxAttempts = 5,
): Promise<T | undefined> {
  const existing = resolveIntentScreeningBoard(intent, target, boards);
  if (existing) return existing;
  if (!intent?.screening || intent.target !== target) return undefined;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await load(intent.screening);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await wait();
    }
  }
  throw lastError;
}

export function screeningBoardRevealSequence(
  intent: StudioNavigationIntent | null,
  board: { listId: string; listName: string },
): number | undefined {
  return resolveIntentScreeningBoard(intent, 'cvScored', [board]) ? intent?.sequence : undefined;
}
