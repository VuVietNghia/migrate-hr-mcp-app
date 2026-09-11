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
import { EmailMailboxView } from './EmailMailboxView';
import { createInterviewEmailTemplateRepository } from '../email-templates/interview-email-template-default';
import './email-tab.css';

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
  const templateRepository = useMemo(
    () => app && roomId ? createInterviewEmailTemplateRepository(app, roomId) : null,
    [app, roomId],
  );
  const requestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [records, setRecords] = useState<EmailHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmailHistoryFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<EmailSourceFilter>('all');
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<EmailHistoryDateRange>({ from: '', to: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<EmailHistoryRecord | null>(null);
  const [templateCreateRequest, setTemplateCreateRequest] = useState(0);
  const [templateCount, setTemplateCount] = useState(0);
  const [templateReady, setTemplateReady] = useState(false);

  useEffect(() => {
    requestRef.current += 1;
    hasLoadedRef.current = false;
    setRecords([]);
    setSelectedId(null);
    setFilter('all');
    setSourceFilter('all');
    setQuery('');
    setDateRange({ from: '', to: '' });
    setTemplateCreateRequest(0);
    setTemplateCount(0);
    setTemplateReady(false);
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
      query={query}
      dateRange={dateRange}
      active={active}
      loading={loading}
      error={error}
      retryingId={retryingId}
      deletingId={deletingId}
      deleteCandidate={deleteCandidate}
      templateRepository={templateRepository}
      templateCreateRequest={templateCreateRequest}
      templateCount={templateCount}
      templateReady={templateReady}
      onSelect={setSelectedId}
      onBack={() => setSelectedId(null)}
      onFilterChange={nextFilter => {
        setFilter(nextFilter);
        if (nextFilter === 'templates') setSourceFilter('cv_scored');
      }}
      onSourceFilterChange={source => {
        setSourceFilter(current => filter === 'templates' ? source : toggleEmailSourceFilter(current, source));
      }}
      onCreateTemplate={() => setTemplateCreateRequest(current => current + 1)}
      onTemplateCountChange={setTemplateCount}
      onTemplateReadyChange={setTemplateReady}
      onQueryChange={setQuery}
      onDateRangeChange={setDateRange}
      onRetry={record => { void handleRetry(record); }}
      onRequestDelete={setDeleteCandidate}
      onCancelDelete={() => setDeleteCandidate(null)}
      onConfirmDelete={() => { void handleConfirmDelete(); }}
    />
  );
}
