import { describe, expect, it } from 'vitest';
import type { CVFile, ProcessingStatus } from '../src/ui/pipeline-service';
import {
  canOpenSavedCandidateBoard,
  getPipelineBatchProgress,
  getQueueSelectionState,
  toggleAllQueueFiles,
  type PipelineRunOutcome,
} from '../src/ui/pipeline/pipeline-view-model';

const cv = (_id: string): CVFile => ({ _id, name: `${_id}.pdf` });
const status = (
  fileId: string,
  value: ProcessingStatus['status'],
): ProcessingStatus => ({ fileId, originalName: `${fileId}.pdf`, status: value });

describe('pipeline queue selection', () => {
  it('does not treat an empty queue as fully selected', () => {
    expect(getQueueSelectionState([], new Set())).toEqual({
      selectedCount: 0,
      allSelected: false,
      partiallySelected: false,
      visibleIds: [],
    });
  });

  it('reports a partial selection using only visible files', () => {
    expect(getQueueSelectionState([cv('a'), cv('b')], new Set(['a', 'outside']))).toEqual({
      selectedCount: 1,
      allSelected: false,
      partiallySelected: true,
      visibleIds: ['a', 'b'],
    });
  });

  it('selects every visible file without mutating the input set', () => {
    const selected = new Set(['outside']);

    expect([...toggleAllQueueFiles([cv('a'), cv('b')], selected, true)]).toEqual(['outside', 'a', 'b']);
    expect([...selected]).toEqual(['outside']);
  });

  it('deselects visible files without dropping an id outside the current queue', () => {
    const selected = new Set(['a', 'b', 'outside']);

    expect([...toggleAllQueueFiles([cv('a'), cv('b')], selected, false)]).toEqual(['outside']);
    expect([...selected]).toEqual(['a', 'b', 'outside']);
  });
});

describe('pipeline batch progress', () => {
  it('counts completed and error statuses as processed but only completed as successful', () => {
    const progress = getPipelineBatchProgress(['a', 'b', 'c'], {
      a: status('a', 'completed'),
      b: status('b', 'error'),
      c: status('c', 'pending'),
    });

    expect(progress).toMatchObject({ total: 3, processed: 2, completed: 1 });
    expect(progress.failed.map((item) => item.fileId)).toEqual(['b']);
  });

  it.each(['renaming', 'scoring'] as const)('recognizes %s as the active CV', (value) => {
    expect(getPipelineBatchProgress(['a'], { a: status('a', value) }).active?.fileId).toBe('a');
  });

  it('does not count a batch id that has no status yet', () => {
    expect(getPipelineBatchProgress(['a', 'b'], { a: status('a', 'completed') })).toMatchObject({
      total: 2,
      processed: 1,
      completed: 1,
    });
  });
});

describe('candidate board availability', () => {
  it.each<PipelineRunOutcome>([
    'idle',
    'running',
    'stop-requested',
    'interrupted',
    'save-error',
  ])('keeps the candidate CTA disabled for %s', (outcome) => {
    expect(canOpenSavedCandidateBoard(outcome, 2)).toBe(false);
  });

  it.each<PipelineRunOutcome>(['completed', 'completed-with-errors', 'stopped'])(
    'enables the candidate CTA for saved results after %s',
    (outcome) => {
      expect(canOpenSavedCandidateBoard(outcome, 2)).toBe(true);
      expect(canOpenSavedCandidateBoard(outcome, 0)).toBe(false);
    },
  );
});
