const MIN_COLUMN_WIDTH = 280;

export function getKanbanColumnScrollDistance(columnWidth: number, gap: number): number {
  return Math.max(columnWidth, MIN_COLUMN_WIDTH) + gap;
}
