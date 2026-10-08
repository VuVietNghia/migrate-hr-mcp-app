import { describe, expect, it } from 'vitest';

import * as navigationIntentModule from '../src/ui/studio/studio-navigation-intent';
import {
  nextStudioNavigationIntent,
  resolveIntentJD,
} from '../src/ui/studio/studio-navigation-intent';

const jd = { fileId: 'file-2', fileName: 'JD_Backend.md' };
const screening = { listId: 'screening-2', listName: 'SCREENING_BACKEND' };

type ScreeningBoard = { listId: string; listName: string; cvs: string[] };
type ScreeningNavigationModule = {
  resolveIntentScreeningBoard?: (
    intent: ReturnType<typeof nextStudioNavigationIntent>,
    target: 'cvScored',
    boards: readonly ScreeningBoard[],
  ) => ScreeningBoard | undefined;
  resolveOrLoadIntentScreeningBoard?: (
    intent: ReturnType<typeof nextStudioNavigationIntent>,
    target: 'cvScored',
    boards: readonly ScreeningBoard[],
    load: (reference: typeof screening) => Promise<ScreeningBoard>,
    wait: () => Promise<void>,
    maxAttempts?: number,
  ) => Promise<ScreeningBoard | undefined>;
  screeningBoardRevealSequence?: (
    intent: ReturnType<typeof nextStudioNavigationIntent>,
    board: Pick<ScreeningBoard, 'listId' | 'listName'>,
  ) => number | undefined;
};

const screeningNavigation = navigationIntentModule as ScreeningNavigationModule;

describe('studio navigation intent', () => {
  it('creates a fresh sequence even when navigating to the same JD twice', () => {
    const first = nextStudioNavigationIntent(null, 'pipeline', { jd });
    const second = nextStudioNavigationIntent(first, 'pipeline', { jd });

    expect(first).toEqual({ sequence: 1, target: 'pipeline', jd });
    expect(second.sequence).toBe(first.sequence + 1);
  });

  it('matches by stable file id before file name', () => {
    const intent = nextStudioNavigationIntent(null, 'pipeline', { jd });
    const files = [
      { _id: 'file-1', name: 'JD_Backend.md' },
      { _id: 'file-2', name: 'JD_Old_Name.md' },
    ];

    expect(resolveIntentJD(intent, 'pipeline', files)).toEqual(files[1]);
  });

  it('uses the filename only when an id match is unavailable', () => {
    const intent = nextStudioNavigationIntent(null, 'chatbotJD', { jd });
    const files = [{ _id: 'replacement-id', name: 'JD_Backend.md' }];

    expect(resolveIntentJD(intent, 'chatbotJD', files)).toEqual(files[0]);
  });

  it('ignores an intent for another tab and returns undefined for a deleted JD', () => {
    const intent = nextStudioNavigationIntent(null, 'pipeline', { jd });

    expect(resolveIntentJD(intent, 'chatbotJD', [{ _id: 'file-2', name: 'JD_Backend.md' }])).toBeUndefined();
    expect(resolveIntentJD(intent, 'pipeline', [])).toBeUndefined();
  });

  it('preserves the exact screening list produced by the completed pipeline save', () => {
    const intent = nextStudioNavigationIntent(null, 'cvScored', { screening } as never);

    expect(intent).toEqual({ sequence: 1, target: 'cvScored', screening });
  });

  it('selects the screening board by stable list id before its display name', () => {
    const intent = nextStudioNavigationIntent(null, 'cvScored', { screening } as never);
    const boards = [
      { listId: 'screening-1', listName: 'SCREENING_BACKEND', cvs: ['old'] },
      { listId: 'screening-2', listName: 'SCREENING_RENAMED', cvs: ['new'] },
    ];

    expect(screeningNavigation.resolveIntentScreeningBoard?.(intent, 'cvScored', boards)).toEqual(boards[1]);
  });

  it('does not fall back to a stale board with the same name when an exact list id was supplied', async () => {
    const intent = nextStudioNavigationIntent(null, 'cvScored', { screening } as never);
    const staleBoard = { listId: 'screening-1', listName: 'SCREENING_BACKEND', cvs: ['old'] };
    const freshBoard = { ...screening, cvs: ['new'] };

    expect(screeningNavigation.resolveIntentScreeningBoard?.(intent, 'cvScored', [staleBoard])).toBeUndefined();
    expect(screeningNavigation.screeningBoardRevealSequence?.(intent, staleBoard)).toBeUndefined();
    expect(await screeningNavigation.resolveOrLoadIntentScreeningBoard?.(
      intent,
      'cvScored',
      [staleBoard],
      async () => freshBoard,
      async () => undefined,
    )).toEqual(freshBoard);
  });

  it('waits for a newly saved screening board when the eager-loaded snapshot does not contain it yet', async () => {
    const intent = nextStudioNavigationIntent(null, 'cvScored', { screening } as never);
    const loadedBoard = { ...screening, cvs: ['candidate-1'] };
    let attempts = 0;

    const resolved = await screeningNavigation.resolveOrLoadIntentScreeningBoard?.(
      intent,
      'cvScored',
      [],
      async (reference) => {
        attempts += 1;
        if (attempts === 1) throw new Error('Hub is still publishing the list');
        return { ...loadedBoard, ...reference };
      },
      async () => undefined,
      3,
    );

    expect(resolved).toEqual(loadedBoard);
    expect(attempts).toBe(2);
  });

  it('only reveals the board targeted by the latest candidate navigation', () => {
    const intent = nextStudioNavigationIntent(null, 'cvScored', { screening } as never);

    expect(screeningNavigation.screeningBoardRevealSequence?.(intent, screening)).toBe(1);
    expect(screeningNavigation.screeningBoardRevealSequence?.(intent, {
      listId: 'screening-1',
      listName: 'SCREENING_OTHER',
    })).toBeUndefined();
  });
});
