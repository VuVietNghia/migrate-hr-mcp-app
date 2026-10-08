import type { CVFile, ProcessingStatus } from '../pipeline-service';

export type PipelineRunOutcome =
  | 'idle'
  | 'running'
  | 'stop-requested'
  | 'stopped'
  | 'completed'
  | 'completed-with-errors'
  | 'interrupted'
  | 'save-error';

export interface PipelineBatchProgress {
  total: number;
  processed: number;
  completed: number;
  failed: ProcessingStatus[];
  active?: ProcessingStatus;
}

export function getPipelineBatchProgress(
  batchFileIds: string[],
  statuses: Record<string, ProcessingStatus>,
): PipelineBatchProgress {
  const batchStatuses = batchFileIds
    .map(fileId => statuses[fileId])
    .filter((status): status is ProcessingStatus => Boolean(status));
  const failed = batchStatuses.filter(status => status.status === 'error');
  const completed = batchStatuses.filter(status => status.status === 'completed').length;
  const active = batchStatuses.find(status =>
    status.status === 'uploading'
    || status.status === 'renaming'
    || status.status === 'scoring');

  return {
    total: batchFileIds.length,
    processed: completed + failed.length,
    completed,
    failed,
    active,
  };
}

export function getQueueSelectionState(files: CVFile[], selectedIds: Set<string>) {
  const visibleIds = files.map(file => file._id);
  const selectedCount = visibleIds.filter(fileId => selectedIds.has(fileId)).length;

  return {
    selectedCount,
    allSelected: visibleIds.length > 0 && selectedCount === visibleIds.length,
    partiallySelected: selectedCount > 0 && selectedCount < visibleIds.length,
    visibleIds,
  };
}

export function toggleAllQueueFiles(
  files: CVFile[],
  selectedIds: Set<string>,
  selectAll: boolean,
): Set<string> {
  const next = new Set(selectedIds);
  for (const file of files) {
    if (selectAll) next.add(file._id);
    else next.delete(file._id);
  }
  return next;
}

export function canOpenSavedCandidateBoard(
  outcome: PipelineRunOutcome,
  savedResultCount: number,
): boolean {
  return savedResultCount > 0
    && (outcome === 'completed' || outcome === 'completed-with-errors' || outcome === 'stopped');
}
