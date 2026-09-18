import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LeftOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  RightOutlined,
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
import {
  clampPage,
  describePageRange,
  getConcatenatedPageWindows,
  getPageCount,
  getPageSlice,
} from './email-pagination';
import { InterviewEmailTemplatePanel } from '../email-templates/InterviewEmailTemplatePanel';
import type { IInterviewEmailTemplateRepository } from '../email-templates/interview-email-template-repository';
import {
  canCreateEmailTemplate,
  getEmailMailboxContentMode,
  isTemplateCategoryVisible,
  type EmailTemplateCategory,
} from '../email-templates/interview-email-template-state';

export type ByTemplateCategory<T> = Record<EmailTemplateCategory, T>;

export interface TemplatePanelCallbacks {
  onCountChange: (count: number) => void;
  onReadyChange: (ready: boolean) => void;
}

export interface EmailMailboxViewProps {
  records: EmailHistoryRecord[];
  selectedId: string | null;
  filter: EmailHistoryFilter;
  sourceFilter: EmailSourceFilter;
  /** The template list's own Phỏng vấn / Nhân sự toggle; "all" (nothing picked) shows both lists. */
  templateFilter: EmailSourceFilter;
  query: string;
  dateRange: EmailHistoryDateRange;
  active: boolean;
  loading: boolean;
  error: string | null;
  retryingId: string | null;
  deletingId: string | null;
  deleteCandidate: EmailHistoryRecord | null;
  templateRepositories: ByTemplateCategory<IInterviewEmailTemplateRepository> | null;
  templateCreateRequests: ByTemplateCategory<number>;
  templateCounts: ByTemplateCategory<number>;
  templateReady: ByTemplateCategory<boolean>;
  /** Must be referentially stable: the panels poll through them. */
  templatePanelCallbacks: ByTemplateCategory<TemplatePanelCallbacks>;
  onSelect: (id: string) => void;
  onBack: () => void;
  onFilterChange: (filter: EmailHistoryFilter) => void;
  onSourceFilterChange: (source: EmailSource) => void;
  onTemplateFilterChange: (source: EmailSource) => void;
  onCreateTemplate: (category: EmailTemplateCategory) => void;
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

interface EmailPagerProps {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Hidden while everything fits on one page: there is nothing to step through. */
export function EmailPager({ page, pageCount, total, onPageChange }: EmailPagerProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="email-pager" aria-label="Phân trang">
      <span className="email-pager-range">{describePageRange(total, page)}</span>
      <div className="email-pager-controls">
        <button
          type="button"
          className="email-action-btn"
          aria-label="Trang trước"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
        >
          <LeftOutlined />
          Trước
        </button>
        <span className="email-pager-status" aria-live="polite">
          Trang {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="email-action-btn"
          aria-label="Trang sau"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
          <RightOutlined />
        </button>
      </div>
    </nav>
  );
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
  templateFilter,
  query,
  dateRange,
  active,
  loading,
  error,
  retryingId,
  deletingId,
  deleteCandidate,
  templateRepositories,
  templateCreateRequests,
  templateCounts,
  templateReady,
  templatePanelCallbacks,
  onSelect,
  onBack,
  onFilterChange,
  onSourceFilterChange,
  onTemplateFilterChange,
  onCreateTemplate,
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<EmailTemplateCategory | null>(null);
  const isTemplateMode = filter === 'templates';
  const sourceRecords = sourceFilter === 'all'
    ? records
    : records.filter(record => record.source === sourceFilter);
  const visibleRecords = isTemplateMode ? [] : filterEmailHistory(records, filter, query, dateRange, sourceFilter);
  const selected = records.find(record => record.id === selectedId) || null;
  const contentMode = getEmailMailboxContentMode(filter, templateFilter, Boolean(templateRepositories));
  const showsTemplates = contentMode === 'all-templates'
    || contentMode === 'interview-templates'
    || contentMode === 'employee-templates';
  const counts = {
    all: sourceRecords.length,
    sent: sourceRecords.filter(record => record.status === 'sent').length,
    failed: sourceRecords.filter(record => record.status === 'failed').length,
    templates: templateFilter === 'all'
      ? templateCounts.cv_scored + templateCounts.lifecycle
      : templateCounts[templateFilter],
  };
  const templatePanels: Array<{ category: EmailTemplateCategory; label: string }> = [
    { category: 'cv_scored', label: 'Mẫu phỏng vấn' },
    { category: 'lifecycle', label: 'Mẫu nhân sự' },
  ];
  const canCreateCategory = (category: EmailTemplateCategory) => showsTemplates
    && isTemplateCategoryVisible(templateFilter, category)
    && canCreateEmailTemplate(active, Boolean(templateRepositories), templateReady[category]);
  const createTemplate = (category: EmailTemplateCategory) => {
    setCreateMenuOpen(false);
    onCreateTemplate(category);
  };
  // With both lists on screen, an open detail/create form in one hides the other list.
  const editingCallbacks = useMemo<ByTemplateCategory<(editing: boolean) => void>>(() => {
    const track = (category: EmailTemplateCategory) => (editing: boolean) => {
      setEditingCategory(current => editing ? category : current === category ? null : current);
    };
    return { cv_scored: track('cv_scored'), lifecycle: track('lifecycle') };
  }, []);

  // Paging. The page belongs to whatever is being browsed: changing the section, source, search or
  // dates starts again at page 1. Deriving the reset from `pageScope` (instead of an effect that sets
  // the page back) means the old page number is never rendered against the new list, not even once.
  const listRef = useRef<HTMLDivElement>(null);
  const pageScope = JSON.stringify([filter, sourceFilter, templateFilter, query, dateRange.from, dateRange.to]);
  const [paging, setPaging] = useState({ scope: pageScope, page: 0 });
  const requestedPage = paging.scope === pageScope ? paging.page : 0;
  const goToPage = (page: number) => {
    setPaging({ scope: pageScope, page });
    listRef.current?.scrollIntoView({ block: 'start' });
  };

  const recordPageCount = getPageCount(visibleRecords.length);
  const recordPage = clampPage(requestedPage, recordPageCount);
  const pagedRecords = getPageSlice(visibleRecords, recordPage);

  // Each panel reports how many templates pass the search; the mailbox pages over their sum.
  const [templateVisibleCounts, setTemplateVisibleCounts] = useState<ByTemplateCategory<number>>({
    cv_scored: 0,
    lifecycle: 0,
  });
  const visibleCountCallbacks = useMemo<ByTemplateCategory<(count: number) => void>>(() => {
    const track = (category: EmailTemplateCategory) => (count: number) => {
      setTemplateVisibleCounts(current => current[category] === count ? current : { ...current, [category]: count });
    };
    return { cv_scored: track('cv_scored'), lifecycle: track('lifecycle') };
  }, []);
  const pagedCategories = showsTemplates
    ? templatePanels.filter(({ category }) => isTemplateCategoryVisible(templateFilter, category))
    : [];
  const templateTotal = pagedCategories.reduce((sum, { category }) => sum + templateVisibleCounts[category], 0);
  const templatePageCount = getPageCount(templateTotal);
  const templatePage = clampPage(requestedPage, templatePageCount);
  const templateWindows = getConcatenatedPageWindows(
    pagedCategories.map(({ category }) => templateVisibleCounts[category]),
    templatePage,
  );
  const templateWindowFor = (category: EmailTemplateCategory) =>
    templateWindows[pagedCategories.findIndex(entry => entry.category === category)];
  // A panel showing a template or the create form is not browsing its list, so paging stops.
  const templateEditing = editingCategory !== null && isTemplateCategoryVisible(templateFilter, editingCategory);

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
                  className={templateFilter === 'lifecycle'
                    ? 'email-source-filter-button is-active'
                    : 'email-source-filter-button'}
                  aria-pressed={templateFilter === 'lifecycle'}
                  onClick={() => onTemplateFilterChange('lifecycle')}
                >
                  Nhân sự
                </button>
                <button
                  type="button"
                  className={templateFilter === 'cv_scored'
                    ? 'email-source-filter-button is-active'
                    : 'email-source-filter-button'}
                  aria-pressed={templateFilter === 'cv_scored'}
                  onClick={() => onTemplateFilterChange('cv_scored')}
                >
                  Phỏng vấn
                </button>
                <div className="email-create-template-wrapper">
                  <button
                    type="button"
                    className="email-create-template-button"
                    aria-haspopup={templateFilter === 'all' ? 'menu' : undefined}
                    aria-expanded={templateFilter === 'all' ? createMenuOpen : undefined}
                    disabled={!templatePanels.some(({ category }) => canCreateCategory(category))}
                    onClick={() => {
                      if (templateFilter === 'all') setCreateMenuOpen(open => !open);
                      else createTemplate(templateFilter);
                    }}
                  >
                    Tạo mẫu Email
                  </button>
                  {templateFilter === 'all' && createMenuOpen && (
                    <div className="email-create-template-menu" role="menu">
                      {templatePanels.map(({ category, label }) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={category}
                          disabled={!canCreateCategory(category)}
                          onClick={() => createTemplate(category)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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

            <div
              ref={listRef}
              className="email-message-list"
              aria-label={isTemplateMode ? 'Danh sách mẫu email' : 'Danh sách email'}
            >
              {templateRepositories && templatePanels.map(({ category }) => {
                const visible = showsTemplates && isTemplateCategoryVisible(templateFilter, category);
                const hiddenByOtherForm = templateFilter === 'all'
                  && editingCategory !== null
                  && editingCategory !== category;
                const pageWindow = visible ? templateWindowFor(category) : undefined;
                // Nothing of this panel falls on the page. Still shown when it is the panel being
                // edited, or when it is empty: its "no templates", loading or error state belongs
                // on the first page. It stays mounted either way, so it keeps reporting its count.
                const hiddenByPage = visible
                  && editingCategory !== category
                  && pageWindow !== undefined
                  && pageWindow.start === pageWindow.end
                  && !(templateVisibleCounts[category] === 0 && templatePage === 0);
                return (
                  <div key={category} hidden={!visible || hiddenByOtherForm || hiddenByPage}>
                    <InterviewEmailTemplatePanel
                      repository={templateRepositories[category]}
                      category={category}
                      active={active && visible}
                      createRequest={templateCreateRequests[category]}
                      query={query}
                      onCountChange={templatePanelCallbacks[category].onCountChange}
                      onReadyChange={templatePanelCallbacks[category].onReadyChange}
                      onEditingChange={editingCallbacks[category]}
                      pageWindow={pageWindow}
                      onVisibleCountChange={visibleCountCallbacks[category]}
                    />
                  </div>
                );
              })}
              {showsTemplates && !templateEditing && (
                <EmailPager
                  page={templatePage}
                  pageCount={templatePageCount}
                  total={templateTotal}
                  onPageChange={goToPage}
                />
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
              {pagedRecords.map(record => (
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
              <EmailPager
                page={recordPage}
                pageCount={recordPageCount}
                total={visibleRecords.length}
                onPageChange={goToPage}
              />
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
