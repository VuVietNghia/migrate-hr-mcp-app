import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  RightOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { CVFile, ProcessingStatus } from '../pipeline-service';
import { getCvPipelineDisplayReason } from '../cv-pipeline-display-reason';
import { StudioCard, StudioInlineState, StudioPageHeader } from '../studio/StudioPrimitives';
export { JDDocumentPreview as PipelineJDPreview } from '../jd-document/JDDocumentPreview';
import {
  canOpenSavedCandidateBoard,
  getQueueSelectionState,
  type PipelineBatchProgress,
  type PipelineRunOutcome,
} from './pipeline-view-model';

type FileInputRef = RefObject<HTMLInputElement>;

export function PipelinePageHeader() {
  return (
    <StudioPageHeader
      eyebrow="Tuyển dụng"
      title="Sàng lọc CV"
      description="Đối chiếu hồ sơ với Job Description, chấm điểm và lưu ứng viên theo một luồng liền mạch."
    />
  );
}

interface PipelineFlowStripProps {
  jdReady: boolean;
  selectedCount: number;
  completedCount: number;
}

export function PipelineFlowStrip({ jdReady, selectedCount, completedCount }: PipelineFlowStripProps) {
  const steps = [
    { number: '01', label: 'Chọn mô tả công việc', complete: jdReady },
    { number: '02', label: 'Chọn CV', complete: selectedCount > 0 },
    { number: '03', label: 'Đánh giá & kết quả', complete: completedCount > 0 },
  ];
  const activeIndex = completedCount > 0 ? 2 : jdReady ? 1 : 0;

  return (
    <ol className="pipeline-studio-flow" aria-label="Quy trình sàng lọc CV">
      {steps.map((step, index) => (
        <li
          key={step.number}
          className={`${step.complete ? 'is-complete ' : ''}${activeIndex === index ? 'is-active' : ''}`.trim()}
        >
          <span>{step.number}</span>
          <strong>{step.label}</strong>
          {index < steps.length - 1 ? <RightOutlined aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

interface PipelineJDPanelProps {
  jds: CVFile[];
  selectedName: string;
  loadStatus: 'idle' | 'loading' | 'success' | 'error';
  loadError?: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (fileId: string) => void;
  onOpenSelected: () => void;
  onAddJD: () => void;
  onRetry: () => void;
}

interface PipelineJDSelectProps {
  regularJDs: CVFile[];
  generatedJDs: CVFile[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (fileId: string) => void;
}

export function getNextPipelineJDOptionIndex(currentIndex: number, key: string, optionCount: number) {
  if (optionCount <= 0) return null;
  if (key === 'ArrowDown') return (currentIndex + 1) % optionCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + optionCount) % optionCount;
  if (key === 'Home') return 0;
  if (key === 'End') return optionCount - 1;
  return null;
}

function PipelineJDSelect({ regularJDs, generatedJDs, selectedId, loading, disabled, onSelect }: PipelineJDSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const regularGroupLabelId = useId();
  const generatedGroupLabelId = useId();
  const allJDs = [...regularJDs, ...generatedJDs];
  const selected = allJDs.find(jd => jd._id === selectedId);
  const selectedIndex = Math.max(0, allJDs.findIndex(jd => jd._id === selectedId) + 1);
  const isDisabled = disabled || loading;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (isDisabled) setOpen(false);
  }, [isDisabled]);

  const optionElements = () => Array.from(
    rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
  );

  const focusOption = (index: number) => {
    optionElements()[index]?.focus();
  };

  const openAndFocus = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };

  const choose = (fileId: string) => {
    onSelect(fileId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const option = (jd: Pick<CVFile, '_id' | 'name'>) => (
    <button
      key={jd._id || 'empty'}
      type="button"
      role="option"
      aria-selected={jd._id === selectedId}
      className={`pipeline-studio-select-option${jd._id === selectedId ? ' is-selected' : ''}`}
      tabIndex={-1}
      onClick={() => choose(jd._id)}
    >
      <span>{jd.name}</span>
      {jd._id === selectedId ? <CheckCircleOutlined aria-hidden="true" /> : null}
    </button>
  );

  return (
    <div
      className="pipeline-studio-select-wrap"
      ref={rootRef}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        id="pipeline-jd-select"
        type="button"
        className="pipeline-studio-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby="pipeline-jd-select-label pipeline-jd-select-value"
        disabled={isDisabled}
        onClick={event => {
          if (open) setOpen(false);
          else if (event.detail === 0) openAndFocus(selectedIndex);
          else setOpen(true);
        }}
        onKeyDown={event => {
          const nextIndex = getNextPipelineJDOptionIndex(selectedIndex, event.key, allJDs.length + 1);
          if (nextIndex !== null) {
            event.preventDefault();
            openAndFocus(nextIndex);
          } else if (event.key === 'Escape') {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        <span id="pipeline-jd-select-value">{loading ? 'Đang tải danh sách JD…' : selected?.name ?? 'Chọn một JD'}</span>
        <DownOutlined aria-hidden="true" className={open ? 'is-open' : undefined} />
      </button>
      <div
        id={listboxId}
        className="pipeline-studio-select-menu"
        role="listbox"
        aria-label="Danh sách Job Description"
        hidden={!open}
        onKeyDown={event => {
          const elements = optionElements();
          const current = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="option"]');
          const currentIndex = current ? elements.indexOf(current) : selectedIndex;
          const nextIndex = getNextPipelineJDOptionIndex(currentIndex, event.key, elements.length);
          if (nextIndex !== null) {
            event.preventDefault();
            focusOption(nextIndex);
          } else if ((event.key === 'Enter' || event.key === ' ') && current) {
            event.preventDefault();
            current.click();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          } else if (event.key === 'Tab') {
            setOpen(false);
          }
        }}
      >
        {option({ _id: '', name: 'Chọn một JD' })}
        {regularJDs.length > 0 ? (
          <div className="pipeline-studio-select-group" role="group" aria-labelledby={regularGroupLabelId}>
            <span id={regularGroupLabelId} className="pipeline-studio-select-group__label">JD tuyển dụng</span>
            {regularJDs.map(option)}
          </div>
        ) : null}
        {generatedJDs.length > 0 ? (
          <div className="pipeline-studio-select-group" role="group" aria-labelledby={generatedGroupLabelId}>
            <span id={generatedGroupLabelId} className="pipeline-studio-select-group__label">JD AI tạo</span>
            {generatedJDs.map(option)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineJDPanel({
  jds,
  selectedName,
  loadStatus,
  loadError,
  loading,
  disabled,
  onSelect,
  onOpenSelected,
  onAddJD,
  onRetry,
}: PipelineJDPanelProps) {
  const selected = jds.find(jd => jd.name === selectedName);
  const regularJDs = jds.filter(jd => !jd.name.startsWith('JD_AI_'));
  const generatedJDs = jds.filter(jd => jd.name.startsWith('JD_AI_'));
  const loadState = !selected
    ? { label: 'Chưa chọn JD', className: 'is-idle' }
    : loadStatus === 'loading'
      ? { label: 'Đang nạp JD', className: 'is-loading' }
      : loadStatus === 'success'
        ? { label: 'Đã nạp JD', className: 'is-success' }
        : loadStatus === 'error'
          ? { label: 'Nạp JD thất bại', className: 'is-error' }
          : { label: 'Chưa chọn JD', className: 'is-idle' };

  return (
    <StudioCard
      actions={(
        <span
          className={'pipeline-studio-jd-status ' + loadState.className}
          role={'status'}
          aria-live={'polite'}
        >
          {loadState.label}
        </span>
      )}
      className="pipeline-studio-jd"
      title="Job Description"
      description="Chọn mô tả công việc dùng làm tiêu chí chấm điểm."
    >
      <div className="pipeline-studio-field-heading">
        <label id="pipeline-jd-select-label" htmlFor="pipeline-jd-select">Chọn JD có sẵn</label>
        <button
          type="button"
          className="studio-button studio-button--secondary pipeline-studio-add-jd"
          onClick={onAddJD}
          disabled={disabled || loading}
        >
          <PlusOutlined aria-hidden="true" /> Thêm JD
        </button>
      </div>
      <PipelineJDSelect
        regularJDs={regularJDs}
        generatedJDs={generatedJDs}
        selectedId={selected?._id ?? ''}
        loading={loading}
        disabled={disabled}
        onSelect={onSelect}
      />

      {selected ? (
        <button
          type="button"
          className="pipeline-studio-jd-summary"
          aria-label={`Mở nội dung JD ${selected.name}`}
          onClick={onOpenSelected}
        >
          <span className="pipeline-studio-jd-summary__icon"><FileTextOutlined /></span>
          <span>
            <strong>{selected.name}</strong>
            <small>
              {loadStatus === 'loading' ? 'Đang nạp nội dung…' : loadStatus === 'error' ? 'Không tải được nội dung' : 'Đã chọn làm tiêu chí chấm'}
            </small>
          </span>
          <RightOutlined aria-hidden="true" />
        </button>
      ) : (
        <div className="pipeline-studio-empty pipeline-studio-empty--compact">
          <FileTextOutlined aria-hidden="true" />
          <span>Chưa chọn JD</span>
        </div>
      )}

      {selected && loadStatus === 'error' ? (
        <StudioInlineState tone="danger" title="Không thể tải JD">
          <span>{loadError || 'Vui lòng thử lại.'}</span>{' '}
          <button type="button" className="pipeline-studio-text-button" onClick={onRetry}>Thử lại</button>
        </StudioInlineState>
      ) : null}
    </StudioCard>
  );
}

interface PipelineCVQueueProps {
  files: CVFile[];
  selectedIds: Set<string>;
  loading: boolean;
  processing: boolean;
  deletingId: string | null;
  pendingDeleteId: string | null;
  fileInputRef: FileInputRef;
  canStart: boolean;
  onToggleFile: (fileId: string) => void;
  onToggleAll: (selected: boolean) => void;
  onArmDelete: (fileId: string) => void;
  onDelete: (file: CVFile) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onStart: () => void;
}

export function PipelineCVQueue({
  files,
  selectedIds,
  loading,
  processing,
  deletingId,
  pendingDeleteId,
  fileInputRef,
  canStart,
  onToggleFile,
  onToggleAll,
  onArmDelete,
  onDelete,
  onUpload,
  onStart,
}: PipelineCVQueueProps) {
  const selection = getQueueSelectionState(files, selectedIds);

  return (
    <StudioCard
      className="pipeline-studio-queue"
      title="Hàng chờ CV"
      description="Chọn các hồ sơ cần đối chiếu với JD."
      actions={<span className="pipeline-studio-count">{selection.selectedCount}/{files.length} CV đã chọn</span>}
    >
      <input
        ref={fileInputRef}
        className="studio-sr-only"
        type="file"
        multiple
        onChange={onUpload}
        accept=".pdf,.doc,.docx,.jpg,.png"
      />
      <div className="pipeline-studio-queue__toolbar">
        <label className="pipeline-studio-check-all">
          <input
            type="checkbox"
            checked={selection.allSelected}
            ref={input => { if (input) input.indeterminate = selection.partiallySelected; }}
            onChange={event => onToggleAll(event.target.checked)}
            disabled={processing || files.length === 0}
          />
          Chọn tất cả
        </label>
        <button
          type="button"
          className="studio-button studio-button--secondary studio-button--compact"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || processing}
        >
          <UploadOutlined aria-hidden="true" /> Tải CV
        </button>
      </div>

      <div className="pipeline-studio-file-list">
        {loading ? (
          <div className="pipeline-studio-empty"><LoadingOutlined spin /> <span>Đang tải danh sách CV…</span></div>
        ) : files.length === 0 ? (
          <div className="pipeline-studio-empty"><FileTextOutlined /> <span>Chưa có CV trong hàng chờ</span></div>
        ) : files.map(file => {
          const selected = selectedIds.has(file._id);
          const armed = pendingDeleteId === file._id;
          return (
            <div className={`pipeline-studio-file${selected ? ' is-selected' : ''}`} key={file._id}>
              <label title={file.name}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleFile(file._id)}
                  disabled={processing}
                />
                <span><strong>{file.name}</strong><small>Sẵn sàng chấm điểm</small></span>
              </label>
              <button
                type="button"
                className={`studio-icon-button${armed ? ' is-danger' : ''}`}
                aria-label={armed ? `Xác nhận xóa ${file.name}` : `Xóa ${file.name}`}
                title={armed ? 'Bấm lần nữa để xác nhận xóa' : 'Xóa CV'}
                disabled={processing || deletingId !== null}
                onClick={() => armed ? onDelete(file) : onArmDelete(file._id)}
              >
                {deletingId === file._id ? <LoadingOutlined spin /> : armed ? <span>Xóa?</span> : <DeleteOutlined />}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="studio-button studio-button--primary pipeline-studio-start"
        onClick={onStart}
        disabled={!canStart || processing}
      >
        {processing ? <><LoadingOutlined spin /> Đang xử lý…</> : `Chấm điểm ${selection.selectedCount} CV`}
      </button>
    </StudioCard>
  );
}

interface PipelineProgressPanelProps {
  progress: PipelineBatchProgress;
  outcome: PipelineRunOutcome;
  savedResultCount: number;
  onStop: () => void;
  onOpenCandidates: () => void;
}

export function PipelineProgressPanel({
  progress,
  outcome,
  savedResultCount,
  onStop,
  onOpenCandidates,
}: PipelineProgressPanelProps) {
  const percentage = progress.total === 0 ? 0 : Math.round((progress.processed / progress.total) * 100);
  const stopping = outcome === 'stop-requested';
  const running = outcome === 'running' || stopping;
  const canOpen = canOpenSavedCandidateBoard(outcome, savedResultCount);
  const message = progress.active
    ? stopping
      ? `Sẽ dừng sau CV hiện tại: ${progress.active.originalName}`
      : `Đang chấm: ${progress.active.originalName}`
    : outcome === 'stopped'
      ? 'Đã dừng an toàn. Các CV chưa xử lý vẫn được giữ trong hàng chờ.'
      : outcome === 'save-error'
        ? 'Đã chấm xong nhưng chưa lưu được bảng ứng viên.'
        : outcome === 'completed-with-errors'
          ? 'Đã hoàn tất, có hồ sơ cần kiểm tra lại.'
          : outcome === 'completed'
            ? 'Đã hoàn tất và lưu kết quả.'
            : 'Sẵn sàng bắt đầu sàng lọc.';

  return (
    <StudioCard className="pipeline-studio-progress" title="Tiến trình" actions={<strong>{percentage}%</strong>}>
      <div
        className="pipeline-studio-progress__track"
        role="progressbar"
        aria-label="Tiến trình chấm CV"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.processed}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <div className="pipeline-studio-progress__summary">
        <span>{progress.processed}/{progress.total} CV đã xử lý</span>
        <span>{progress.completed} thành công · {progress.failed.length} lỗi</span>
      </div>
      <p className="pipeline-studio-progress__message">{message}</p>
      <div className="pipeline-studio-progress__actions">
        {running ? (
          <button
            type="button"
            className="studio-button studio-button--secondary"
            onClick={onStop}
            disabled={stopping}
          >
            <PauseCircleOutlined /> {stopping ? 'Đang chờ CV hiện tại…' : 'Dừng sau CV hiện tại'}
          </button>
        ) : null}
        {canOpen ? (
          <button
            type="button"
            className="studio-button studio-button--primary"
            onClick={onOpenCandidates}
          >
            Xem bảng ứng viên <RightOutlined />
          </button>
        ) : null}
      </div>
    </StudioCard>
  );
}

interface PipelineResultsPanelProps {
  statuses: ProcessingStatus[];
}

const statusLabel: Record<ProcessingStatus['status'], string> = {
  pending: 'Đang chờ',
  uploading: 'Đang tải',
  renaming: 'Đang chuẩn hóa',
  scoring: 'Đang chấm',
  completed: 'Hoàn thành',
  error: 'Lỗi',
};

export function PipelineResultsPanel({ statuses }: PipelineResultsPanelProps) {
  return (
    <StudioCard
      className="pipeline-studio-results"
      title="Kết quả chấm"
      description="Kết quả được cập nhật trực tiếp theo từng CV."
      actions={statuses.length > 0 ? <span className="pipeline-studio-count">{statuses.length} CV</span> : undefined}
    >
      {statuses.length === 0 ? (
        <div className="pipeline-studio-empty pipeline-studio-empty--results">
          <CheckCircleOutlined />
          <strong>Chưa có kết quả</strong>
          <span>Chọn JD, chọn CV và bắt đầu chấm điểm.</span>
        </div>
      ) : (
        <div className="pipeline-studio-result-list">
          {statuses.map(item => {
            const reason = item.reason ? getCvPipelineDisplayReason(item.reason) : '';
            return (
              <details className={`pipeline-studio-result pipeline-studio-result--${item.status}`} key={item.fileId}>
                <summary>
                  <span className="pipeline-studio-result__file">
                    <strong>{item.normalizedName || item.originalName}</strong>
                    {item.normalizedName ? <small>{item.originalName}</small> : null}
                  </span>
                  {item.score !== undefined ? <strong className="pipeline-studio-result__score">{item.score}<small>/100</small></strong> : null}
                  {item.category ? <span className="pipeline-studio-result__category">{item.category}</span> : null}
                  <span className="pipeline-studio-result__status">{statusLabel[item.status]}</span>
                </summary>
                {reason || item.errorMsg ? (
                  <div className="pipeline-studio-result__detail">
                    {reason ? <p>{reason}</p> : null}
                    {item.errorMsg ? <p className="is-error">{item.errorMsg}</p> : null}
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </StudioCard>
  );
}
