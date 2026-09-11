import type { EmailSource, EmailSourceFilter } from '../../services/mail/email-history-model';

export function reconcileEmailSelection(
  records: ReadonlyArray<{ id: string }>,
  selectedId: string | null,
): string | null {
  if (selectedId && records.some(record => record.id === selectedId)) {
    return selectedId;
  }
  return records[0]?.id || null;
}

export function toggleEmailSourceFilter(
  current: EmailSourceFilter,
  selected: EmailSource,
): EmailSourceFilter {
  return current === selected ? 'all' : selected;
}
