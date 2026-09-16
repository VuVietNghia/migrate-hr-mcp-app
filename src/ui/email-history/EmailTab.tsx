import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';

import type {
  EmailHistoryDateRange,
  EmailHistoryFilter,
  EmailHistoryRecord,
  EmailSourceFilter,
} from '../../services/mail/email-history-model';
import { usePolling } from '../hooks/usePolling';
import { EmailHistoryService } from './email-history-service';
import { toggleEmailSourceFilter } from './email-mailbox-state';
import { EmailMailboxView, type ByTemplateCategory, type TemplatePanelCallbacks } from './EmailMailboxView';
import {
  createEmployeeEmailTemplateRepository,
  createInterviewEmailTemplateRepository,
} from '../email-templates/interview-email-template-default';
import type { EmailTemplateCategory } from '../email-templates/interview-email-template-state';
import './email-tab.css';

const ZERO_COUNTS: ByTemplateCategory<number> = { cv_scored: 0, lifecycle: 0 };
const NOT_READY: ByTemplateCategory<boolean> = { cv_scored: false, lifecycle: false };

export interface EmailTabProps {
  active: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function EmailTab({ active }: EmailTabProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const service = useMemo(() => app ? new EmailHistoryService(app) : null, [app]);
  const templateRepositories = useMemo(
    () => app && roomId
      ? {
          cv_scored: createInterviewEmailTemplateRepository(app, roomId),
          lifecycle: createEmployeeEmailTemplateRepository(app, roomId),
        }
      : null,
    [app, roomId],
  );
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [records, setRecords] = useState<EmailHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmailHistoryFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<EmailSourceFilter>('all');
  // Separate from `sourceFilter` so browsing templates never leaves the history lists filtered.
  const [templateFilter, setTemplateFilter] = useState<EmailSourceFilter>('all');
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<EmailHistoryDateRange>({ from: '', to: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<EmailHistoryRecord | null>(null);
  const [templateCreateRequests, setTemplateCreateRequests] = useState<ByTemplateCategory<number>>(ZERO_COUNTS);
  const [templateCounts, setTemplateCounts] = useState<ByTemplateCategory<number>>(ZERO_COUNTS);
  const [templateReady, setTemplateReady] = useState<ByTemplateCategory<boolean>>(NOT_READY);
  const templatePanelCallbacks = useMemo<ByTemplateCategory<TemplatePanelCallbacks>>(() => {
    const forCategory = (category: EmailTemplateCategory): TemplatePanelCallbacks => ({
      onCountChange: count => setTemplateCounts(current => current[category] === count
        ? current
        : { ...current, [category]: count }),
      onReadyChange: ready => setTemplateReady(current => current[category] === ready
        ? current
        : { ...current, [category]: ready }),
    });
    return { cv_scored: forCategory('cv_scored'), lifecycle: forCategory('lifecycle') };
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    hasLoadedRef.current = false;
    setRecords([]);
    setSelectedId(null);
    setFilter('all');
    setSourceFilter('all');
    setTemplateFilter('all');
    setQuery('');
    setDateRange({ from: '', to: '' });
    setTemplateCreateRequests(ZERO_COUNTS);
    setTemplateCounts(ZERO_COUNTS);
    setTemplateReady(NOT_READY);
    setError(null);
    setDeleteCandidate(null);
  }, [roomId]);

  const refresh = useCallback(async (showLoading = false) => {
    if (!active || !service || !roomId) return;
    const requestId = ++requestRef.current;
    if (showLoading) setLoading(true);

    try {
      const nextRecords = await service.load(roomId);
      if (requestId !== requestRef.current) return;
      setRecords(nextRecords);
      setSelectedId(previous => previous && nextRecords.some(record => record.id === previous)
        ? previous
        : null);
      setError(null);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError(`Không thể tải lịch sử email: ${getErrorMessage(loadError)}`);
    } finally {
      if (showLoading && requestId === requestRef.current) setLoading(false);
    }
  }, [active, roomId, service]);

  useEffect(() => {
    if (!active) return;
    void refresh(!hasLoadedRef.current);
  }, [active, refresh]);

  usePolling(
    () => refresh(false),
    {
      enabled: active && Boolean(service && roomId),
      interval: 3000,
      immediate: false,
    },
  );

  const handleRetry = async (record: EmailHistoryRecord) => {
    if (!service || !roomId || retryingId) return;
    setRetryingId(record.id);
    setError(null);
    try {
      await service.retry(roomId, record.id);
      await refresh(false);
    } catch (retryError) {
      setError(`Không thể gửi lại email: ${getErrorMessage(retryError)}`);
      await refresh(false);
    } finally {
      setRetryingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!service || !deleteCandidate || deletingId || retryingId === deleteCandidate.id) return;
    const itemId = deleteCandidate.id;
    setDeletingId(itemId);
    setError(null);
    try {
      await service.delete(itemId);
      setDeleteCandidate(null);
      await refresh(false);
    } catch (deleteError) {
      setError(`Không thể xóa email: ${getErrorMessage(deleteError)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <EmailMailboxView
      records={records}
      selectedId={selectedId}
      filter={filter}
      sourceFilter={sourceFilter}
      templateFilter={templateFilter}
      query={query}
      dateRange={dateRange}
      active={active}
      loading={loading}
      error={error}
      retryingId={retryingId}
      deletingId={deletingId}
      deleteCandidate={deleteCandidate}
      templateRepositories={templateRepositories}
      templateCreateRequests={templateCreateRequests}
      templateCounts={templateCounts}
      templateReady={templateReady}
      templatePanelCallbacks={templatePanelCallbacks}
      onSelect={setSelectedId}
      onBack={() => setSelectedId(null)}
      onFilterChange={setFilter}
      onSourceFilterChange={source => setSourceFilter(current => toggleEmailSourceFilter(current, source))}
      onTemplateFilterChange={source => setTemplateFilter(current => toggleEmailSourceFilter(current, source))}
      onCreateTemplate={category => setTemplateCreateRequests(current => ({
        ...current,
        [category]: current[category] + 1,
      }))}
      onQueryChange={setQuery}
      onDateRangeChange={setDateRange}
      onRetry={record => { void handleRetry(record); }}
      onRequestDelete={setDeleteCandidate}
      onCancelDelete={() => setDeleteCandidate(null)}
      onConfirmDelete={() => { void handleConfirmDelete(); }}
    />
  );
}
