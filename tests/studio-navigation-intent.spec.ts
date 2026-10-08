import { describe, expect, it } from 'vitest';

import {
  nextStudioNavigationIntent,
  resolveIntentJD,
} from '../src/ui/studio/studio-navigation-intent';

const jd = { fileId: 'file-2', fileName: 'JD_Backend.md' };

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
});
