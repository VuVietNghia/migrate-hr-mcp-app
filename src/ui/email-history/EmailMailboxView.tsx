import { useState, type ReactNode } from 'react';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

import type {
  EmailHistoryDateRange,
  EmailHistoryFilter,
  EmailHistoryRecord,
  EmailHistoryStatus,
  EmailSource,
  EmailSourceFilter,
} from '../../services/mail/email-history-model';
import { canDeleteEmail, canRetryEmail, filterEmailHistory } from '../../services/mail/email-history-model';
import { InterviewEmailTemplatePanel } from '../email-templates/InterviewEmailTemplatePanel';
import type { IInterviewEmailTemplateRepository } from '../email-templates/interview-email-template-repository';
import {
  canCreateInterviewTemplate,
  getEmailMailboxContentMode,
} from '../email-templates/interview-email-template-state';

export interface EmailMailboxViewProps {
  records: EmailHistoryRecord[];
  selectedId: string | null;
  filter: EmailHistoryFilter;
  sourceFilter: EmailSourceFilter;
  query: string;
  dateRange: EmailHistoryDateRange;
  active: boolean;
  loading: boolean;
  error: string | null;
  retryingId: string | null;
  deletingId: string | null;
  deleteCandidate: EmailHistoryRecord | null;
  templateRepository: IInterviewEmailTemplateRepository | null;
  templateCreateRequest: number;
  templateCount: number;
  templateReady: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
  onFilterChange: (filter: EmailHistoryFilter) => void;
  onSourceFilterChange: (source: EmailSource) => void;
  onCreateTemplate: () => void;
  onTemplateCountChange: (count: number) => void;
  onTemplateReadyChange: (ready: boolean) => void;
  onQueryChange: (query: string) => void;
  onDateRangeChange: (dateRange: EmailHistoryDateRange) => void;
  onRetry: (record: EmailHistoryRecord) => void;
  onRequestDelete: (record: EmailHistoryRecord) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

const STATUS_LABELS: Record<EmailHistoryStatus, string> = {
  sent: 'Đã gửi',
  failed: 'Gửi lỗi',
};

const STATUS_ICONS: Record<EmailHistoryStatus, ReactNode> = {
  sent: <CheckCircleOutlined />,
  failed: <CloseCircleOutlined />,
};

const FILTERS: Array<{ id: EmailHistoryFilter; label: string; icon: ReactNode }> = [
  { id: 'all', label: 'Tất cả', icon: <MailOutlined /> },
  { id: 'sent', label: STATUS_LABELS.sent, icon: STATUS_ICONS.sent },
  { id: 'failed', label: STATUS_LABELS.failed, icon: STATUS_ICONS.failed },
  { id: 'templates', label: 'Mẫu email', icon: <FileTextOutlined /> },
];

function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

interface EmailDateFilterDialogProps {
  draftDateRange: EmailHistoryDateRange;
  dateFilterError: string | null;
  onDraftDateRangeChange: (dateRange: EmailHistoryDateRange) => void;
  onClearError: () => void;
  onClear: () => void;
  onClose: () => void;
  onApply: () => void;
}

export function EmailDateFilterDialog({
  draftDateRange,
  dateFilterError,
  onDraftDateRangeChange,
  onClearError,
  onClear,
  onClose,
  onApply,
}: EmailDateFilterDialogProps) {
  return (
    <div className="email-modal-backdrop" role="presentation">
      <div className="email-date-dialog" role="dialog" aria-modal="true" aria-labelledby="email-date-filter-title">
        <button
          type="button"
          className="email-icon-button email-date-close"
          aria-label="Đóng bộ lọc theo ngày"
          title="Đóng"
          onClick={onClose}
        >
          <CloseOutlined />
        </button>
        <div className="email-date-dialog-heading">
          <CalendarOutlined aria-hidden="true" />
          <h2 id="email-date-filter-title">Lọc email theo ngày cập nhật</h2>
        </div>
        <div className="email-date-fields">
          <label>
            <span>Từ ngày</span>
            <input
              type="date"
              value={draftDateRange.from}
              onChange={event => {
                onDraftDateRangeChange({ ...draftDateRange, from: event.target.value });
                onClearError();
              }}
            />
          </label>
          <label>
            <span>Đến ngày</span>
            <input
              type="date"
              value={draftDateRange.to}
              onChange={event => {
                onDraftDateRangeChange({ ...draftDateRange, to: event.target.value });
                onClearError();
              }}
            />
          </label>
        </div>
        {dateFilterError && <p className="email-date-error" role="alert">{dateFilterError}</p>}
        <div className="email-modal-actions">
          <button type="button" className="email-action-btn" onClick={onClear}>Xóa bộ lọc</button>
          <button type="button" className="email-action-btn is-primary" onClick={onApply}>Áp dụng</button>
        </div>
      </div>
    </div>
  );
}

export function EmailMailboxView({
  records,
  selectedId,
  filter,
  sourceFilter,
  query,
  dateRange,
  active,
  loading,
  error,
  retryingId,
  deletingId,
  deleteCandidate,
  templateRepository,
  templateCreateRequest,
  templateCount,
  templateReady,
  onSelect,
  onBack,
  onFilterChange,
  onSourceFilterChange,
  onCreateTemplate,
  onTemplateCountChange,
  onTemplateReadyChange,
  onQueryChange,
  onDateRangeChange,
  onRetry,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: EmailMailboxViewProps) {
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [draftDateRange, setDraftDateRange] = useState<EmailHistoryDateRange>(dateRange);
  const [dateFilterError, setDateFilterError] = useState<string | null>(null);
  const isTemplateMode = filter === 'templates';
  const sourceRecords = sourceFilter === 'all'
    ? records
    : records.filter(record => record.source === sourceFilter);
  const visibleRecords = isTemplateMode ? [] : filterEmailHistory(records, filter, query, dateRange, sourceFilter);
  const selected = records.find(record => record.id === selectedId) || null;
  const contentMode = getEmailMailboxContentMode(filter, sourceFilter, Boolean(templateRepository));
  const counts = {
    all: sourceRecords.length,
    sent: sourceRecords.filter(record => record.status === 'sent').length,
    failed: sourceRecords.filter(record => record.status === 'failed').length,
    templates: templateCount,
  };

  return (
    <section className="email-mailbox" aria-label="Quản lý email">
      {error && <div className="email-inline-error" role="alert">{error}</div>}

      {!selected && (
        <>
          <header className="email-mailbox-header">
            <button
              type="button"
              className="email-icon-button email-sidebar-toggle"
              aria-label={filtersCollapsed ? 'Mở bộ lọc email' : 'Thu gọn bộ lọc email'}
              title={filtersCollapsed ? 'Mở bộ lọc' : 'Thu gọn bộ lọc'}
              onClick={() => setFiltersCollapsed(collapsed => !collapsed)}
            >
              {filtersCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <h1>Email</h1>
            <div className="email-header-actions">
              {isTemplateMode ? <>
                <label className="email-search">
                  <SearchOutlined aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={event => onQueryChange(event.target.value)}
                    placeholder="Tìm kiếm mẫu email theo tên"
                    aria-label="Tìm kiếm mẫu email"
                  />
                </label>
                <button
                  type="button"
                  className={sourceFilter === 'lifecycle'
                    ? 'email-source-filter-button is-active'
                    : 'email-source-filter-button'}
                  aria-pressed={sourceFilter === 'lifecycle'}
                  onClick={() => onSourceFilterChange('lifecycle')}
                >
                  Nhân sự
                </button>
                <button
                  type="button"
                  className={sourceFilter === 'cv_scored'
                    ? 'email-source-filter-button is-active'
                    : 'email-source-filter-button'}
                  aria-pressed={sourceFilter === 'cv_scored'}
                  onClick={() => onSourceFilterChange('cv_scored')}
                >
                  Phỏng vấn
                </button>
                <button
                  type="button"
                  className="email-create-template-button"
                  disabled={!canCreateInterviewTemplate(active, sourceFilter, Boolean(templateRepository), templateReady)}
                  onClick={onCreateTemplate}
                >
                  Tạo mẫu Email
                </button>
              </> : <>
              <button
                type="button"
                className={dateRange.from || dateRange.to
                  ? 'email-calendar-button is-active'
                  : 'email-calendar-button'}
                aria-label="Lọc email theo ngày"
                title="Lọc theo ngày"
                onClick={() => {
                  setDraftDateRange(dateRange);
                  setDateFilterError(null);
                  setDateFilterOpen(true);
                }}
              >
                <CalendarOutlined />
              </button>
              <button
                type="button"
                className={sourceFilter === 'cv_scored'
                  ? 'email-source-filter-button is-active'
                  : 'email-source-filter-button'}
                aria-pressed={sourceFilter === 'cv_scored'}
                onClick={() => onSourceFilterChange('cv_scored')}
              >
                Phỏng vấn
              </button>
              <button
                type="button"
                className={sourceFilter === 'lifecycle'
                  ? 'email-source-filter-button is-active'
                  : 'email-source-filter-button'}
                aria-pressed={sourceFilter === 'lifecycle'}
                onClick={() => onSourceFilterChange('lifecycle')}
              >
                Nhân sự
              </button>
              <label className="email-search">
                <SearchOutlined aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={event => onQueryChange(event.target.value)}
                  placeholder="Tìm kiếm email"
                  aria-label="Tìm kiếm email"
                />
              </label>
              </>}
            </div>
          </header>

          <div className={filtersCollapsed ? 'email-mailbox-grid is-sidebar-collapsed' : 'email-mailbox-grid'}>
            <aside className="email-status-sidebar" aria-label="Bộ lọc trạng thái">
              {FILTERS.map(option => (
                <button
                  type="button"
                  key={option.id}
                  className={filter === option.id ? 'email-status-filter is-active' : 'email-status-filter'}
                  aria-label={`${option.label}: ${counts[option.id]}`}
                  title={filtersCollapsed ? option.label : undefined}
                  onClick={() => onFilterChange(option.id)}
                >
                  <span
                    className={option.id === 'sent' || option.id === 'failed'
                      ? `email-filter-icon is-${option.id}`
                      : 'email-filter-icon'}
                    aria-hidden="true"
                  >
                    {option.icon}
                  </span>
                  <span className="email-filter-label">{option.label}</span>
                  <strong>{counts[option.id]}</strong>
                </button>
              ))}
            </aside>

            <div className="email-message-list" aria-label={isTemplateMode ? 'Danh sách mẫu email' : 'Danh sách email'}>
              {contentMode === 'lifecycle-empty' && (
                <div className="email-empty-state">Chưa có mẫu email nhân sự</div>
              )}
              {templateRepository && (
                <div hidden={contentMode !== 'interview-templates'}>
                  <InterviewEmailTemplatePanel
                    repository={templateRepository}
                    category="cv_scored"
                    active={active && contentMode === 'interview-templates'}
                    createRequest={templateCreateRequest}
                    query={query}
                    onCountChange={onTemplateCountChange}
                    onReadyChange={onTemplateReadyChange}
                  />
                </div>
              )}
              {contentMode === 'template-unavailable' && (
                <div className="email-empty-state">Không thể truy cập mẫu email</div>
              )}
              {!isTemplateMode && <>
              {loading && records.length === 0 && (
                <div className="email-empty-state">Đang tải lịch sử email…</div>
              )}
              {!loading && visibleRecords.length === 0 && (
                <div className="email-empty-state">Không có email nào trong mục này</div>
              )}
              {visibleRecords.map(record => (
                <button
                  type="button"
                  key={record.id}
                  className="email-message-row"
                  onClick={() => onSelect(record.id)}
                >
                  <span
                    className={`email-row-status is-${record.status}`}
                    aria-label={STATUS_LABELS[record.status]}
                    title={STATUS_LABELS[record.status]}
                  >
                    {STATUS_ICONS[record.status]}
                  </span>
                  <span className="email-message-recipient">{record.recipientName}</span>
                  <span className="email-message-copy">
                    <span className="email-message-subject">{record.subject}</span>
                    <span className="email-message-separator"> — </span>
                    <span className="email-message-preview">{toPlainText(record.htmlContent)}</span>
                  </span>
                  <time dateTime={record.updatedAt}>{formatTimestamp(record.updatedAt)}</time>
                </button>
              ))}
              </>}
            </div>
          </div>
        </>
      )}

      {selected && (
        <article className="email-detail-pane">
          <div className="email-detail-toolbar">
            <button
              type="button"
              className="email-icon-button"
              aria-label="Quay lại danh sách email"
              title="Quay lại"
              onClick={onBack}
            >
              <ArrowLeftOutlined />
            </button>
            <span className={`email-status-badge is-${selected.status}`}>
              {STATUS_ICONS[selected.status]}
              {STATUS_LABELS[selected.status]}
            </span>
            <div className="email-detail-actions">
              {canRetryEmail(selected) && (
                <button
                  type="button"
                  className="email-action-btn is-primary"
                  disabled={retryingId === selected.id}
                  onClick={() => onRetry(selected)}
                >
                  <ReloadOutlined />
                  {retryingId === selected.id ? 'Đang gửi lại…' : 'Gửi lại'}
                </button>
              )}
              {canDeleteEmail(selected) && (
                <button
                  type="button"
                  className="email-action-btn is-danger"
                  disabled={deletingId === selected.id || retryingId === selected.id}
                  onClick={() => onRequestDelete(selected)}
                >
                  <DeleteOutlined />
                  {deletingId === selected.id ? 'Đang xóa…' : 'Xóa'}
                </button>
              )}
            </div>
          </div>

          <div className="email-detail-card">
            <header className="email-detail-header">
              <div>
                <h2>{selected.subject}</h2>
                <p>
                  <strong>{selected.recipientName}</strong>
                  <span>&lt;{selected.recipientEmail}&gt;</span>
                </p>
              </div>
              <time dateTime={selected.updatedAt}>{formatTimestamp(selected.updatedAt)}</time>
            </header>

            <dl className="email-detail-metadata">
              <div><dt>Nguồn</dt><dd>{selected.source === 'cv_scored' ? 'CV đã chấm' : 'Hồ sơ NS'}</dd></div>
              {selected.jdName && <div><dt>JD</dt><dd>{selected.jdName}</dd></div>}
              <div><dt>Số lần gửi</dt><dd>{selected.attemptCount}</dd></div>
              <div><dt>Cập nhật</dt><dd>{formatTimestamp(selected.updatedAt)}</dd></div>
            </dl>

            {selected.lastError && (
              <div className="email-failure-detail" role="status">
                <strong>Lỗi gần nhất</strong>
                <p>{selected.lastError}</p>
              </div>
            )}

            <div className="email-body-content">{toPlainText(selected.htmlContent)}</div>
          </div>
        </article>
      )}

      {dateFilterOpen && (
        <EmailDateFilterDialog
          draftDateRange={draftDateRange}
          dateFilterError={dateFilterError}
          onDraftDateRangeChange={setDraftDateRange}
          onClearError={() => setDateFilterError(null)}
          onClear={() => {
            const emptyRange = { from: '', to: '' };
            setDraftDateRange(emptyRange);
            onDateRangeChange(emptyRange);
            setDateFilterError(null);
            setDateFilterOpen(false);
          }}
          onClose={() => setDateFilterOpen(false)}
          onApply={() => {
            if (draftDateRange.from && draftDateRange.to && draftDateRange.from > draftDateRange.to) {
              setDateFilterError('Từ ngày không được lớn hơn Đến ngày.');
              return;
            }
            onDateRangeChange(draftDateRange);
            setDateFilterError(null);
            setDateFilterOpen(false);
          }}
        />
      )}

      {deleteCandidate && (
        <div className="email-modal-backdrop" role="presentation">
          <div className="email-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="email-delete-title">
            <h2 id="email-delete-title">Xóa vĩnh viễn email?</h2>
            <p>
              Email “{deleteCandidate.subject}” sẽ bị xóa khỏi lịch sử chung của Room và không thể khôi phục.
            </p>
            <div>
              <button type="button" className="email-action-btn" onClick={onCancelDelete}>Hủy</button>
              <button type="button" className="email-action-btn is-danger" onClick={onConfirmDelete}>Xóa vĩnh viễn</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
