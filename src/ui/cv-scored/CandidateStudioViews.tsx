import { useRef, type DragEvent } from 'react';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MailOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import {
  StudioInlineState,
  StudioMetricCard,
  StudioPage,
  StudioPageHeader,
  StudioSearchInput,
} from '../studio/StudioPrimitives';
import type {
  CandidateApplication,
  CandidateMetricSummary,
  ScreeningListRef,
} from './candidate-model';
import { ALL_SCREENING_LISTS, screeningListId } from './candidate-selection-state';
import { displayCandidateDepartmentPeriod, displayCandidatePosition, formatScreeningListLabel } from './candidate-view-model';
import { canShowInviteMailButton } from './kanban-stages';
import { CandidateStudioSelect } from './CandidateStudioSelect';

export type CandidateViewMode = 'kanban' | 'list';

interface CandidateStage {
  status: string;
  label: string;
}

const CANDIDATE_STAGES: CandidateStage[] = [
  { status: '02_Loai_CV', label: 'Loại' },
  { status: '03_Tiem_Nang', label: 'Tiềm năng' },
  { status: '05_Moi_Phong_Van', label: 'Mời phỏng vấn' },
  { status: '06_Sai_JD', label: 'Sai JD' },
  { status: '07_Chua_Phong_Van', label: 'Chưa phỏng vấn' },
  { status: '08_Da_Phong_Van', label: 'Đã phỏng vấn' },
  { status: '09_CV_Cu', label: 'CV cũ' },
];

const RESULT_OPTIONS = ['ĐẠT', 'CÂN NHẮC', 'KHÔNG ĐẠT', 'SAI JD'];
const DRAG_MIME = 'application/x-privos-candidate';

export function serializeCandidateDragData(candidate: Pick<CandidateApplication, 'sourceListId' | '_id'>): string {
  return JSON.stringify({ listId: candidate.sourceListId, itemId: candidate._id });
}

export function parseCandidateDragData(value: string): { listId: string; itemId: string } | null {
  try {
    const parsed = JSON.parse(value) as { listId?: unknown; itemId?: unknown };
    return typeof parsed.listId === 'string' && parsed.listId
      && typeof parsed.itemId === 'string' && parsed.itemId
      ? { listId: parsed.listId, itemId: parsed.itemId }
      : null;
  } catch {
    return null;
  }
}

function displayCandidateName(value: string): string {
  const withoutExtension = value.replace(/\.md$/i, '');
  const marker = withoutExtension.indexOf('_CV_');
  const candidate = marker >= 0 ? withoutExtension.slice(marker + 4) : withoutExtension;
  return candidate.replace(/-[a-f0-9]{6}$/i, '').replace(/_/g, ' ').trim() || value;
}

function initials(value: string): string {
  return displayCandidateName(value).split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('') || 'UV';
}

function resultTone(category?: string): string {
  const normalized = (category || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  if (normalized === 'dat') return 'is-success';
  if (normalized.includes('can nhac')) return 'is-warning';
  if (normalized.includes('sai jd')) return 'is-info';
  if (normalized.includes('khong')) return 'is-danger';
  return 'is-neutral';
}

function stageLabel(status: string): string {
  if (status === '07_CV_Cu' || status === '10_CV_Cu') return 'CV cũ';
  return CANDIDATE_STAGES.find((stage) => stage.status === status)?.label ?? status;
}

function stageMatches(candidateStatus: string, columnStatus: string): boolean {
  return candidateStatus === columnStatus
    || (columnStatus === '09_CV_Cu' && (candidateStatus === '07_CV_Cu' || candidateStatus === '10_CV_Cu'));
}

interface CandidateCardProps {
  candidate: CandidateApplication;
  showCampaignLabel: boolean;
  inviteSent: boolean;
  onInvite: (candidate: CandidateApplication) => void;
  onDetail: (candidate: CandidateApplication) => void;
}

function CandidateCard({ candidate, showCampaignLabel, inviteSent, onInvite, onDetail }: CandidateCardProps) {
  const name = displayCandidateName(candidate.name);
  const departmentPeriod = displayCandidateDepartmentPeriod(candidate);
  return (
    <article
      className="candidate-studio-card"
      draggable
      onDragStart={(event) => {
        const payload = serializeCandidateDragData(candidate);
        event.dataTransfer.setData(DRAG_MIME, payload);
        event.dataTransfer.setData('text/plain', payload);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button type="button" className="candidate-studio-card__body" onClick={() => onDetail(candidate)}>
        <span className="candidate-studio-avatar" aria-hidden="true">{initials(name)}</span>
        <span className="candidate-studio-score">{candidate.score ?? '—'}<small>/100</small></span>
        <strong>{name}</strong>
        <span className="candidate-studio-position">{displayCandidatePosition(candidate)}</span>
        {departmentPeriod ? <span className="candidate-studio-campaign">{departmentPeriod}</span>
          : showCampaignLabel ? <span className="candidate-studio-campaign">{displayCandidatePosition({ sourceListName: candidate.sourceListName })}</span> : null}
        <span className={`candidate-studio-badge ${resultTone(candidate.category)}`}>• {candidate.category || 'Chưa phân loại'}</span>
        <span className="candidate-studio-card__footer">
          <small>{candidate.email || 'Chưa có email'}</small>
          <ArrowRightOutlined aria-hidden="true" />
        </span>
      </button>
      {canShowInviteMailButton(candidate.status, inviteSent) ? (
        <button
          type="button"
          className={`candidate-studio-invite${inviteSent ? ' is-sent' : ''}`}
          disabled={inviteSent}
          onClick={() => onInvite(candidate)}
        >
          <MailOutlined aria-hidden="true" />
          {inviteSent ? 'Đã gửi email' : 'Gửi email phỏng vấn'}
        </button>
      ) : null}
    </article>
  );
}

interface CandidateKanbanProps extends Pick<CandidateStudioScreenProps, 'candidates' | 'showCampaignLabel' | 'onMove' | 'onInvite' | 'onDetail' | 'isInviteSent'> {}

function CandidateKanban(props: CandidateKanbanProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const board = boardRef.current;
    const column = board?.querySelector<HTMLElement>('.candidate-studio-column');
    if (!board || !column) return;
    const gap = Number.parseFloat(getComputedStyle(board).gap) || 16;
    board.scrollBy({ left: direction * (column.getBoundingClientRect().width + gap), behavior: 'smooth' });
  };

  const handleDrop = (event: DragEvent<HTMLElement>, status: string) => {
    event.preventDefault();
    const payload = parseCandidateDragData(event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain'));
    if (payload) props.onMove(payload, status);
  };

  return (
    <div className="candidate-studio-kanban-shell">
      <button type="button" className="candidate-studio-scroll is-left" aria-label="Xem cột trước" onClick={() => scroll(-1)}>
        <ArrowLeftOutlined />
      </button>
      <div ref={boardRef} className="candidate-studio-kanban">
        {CANDIDATE_STAGES.map((stage, stageIndex) => {
          const stageCandidates = props.candidates.filter((candidate) => stageMatches(candidate.status, stage.status));
          return (
            <section
              key={stage.status}
              className="candidate-studio-column"
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
              onDrop={(event) => handleDrop(event, stage.status)}
            >
              <header>
                <span className={`candidate-studio-stage-marker marker-${stageIndex % 5}`} />
                <h2>{stage.label}</h2>
                <span>{stageCandidates.length}</span>
              </header>
              <div className="candidate-studio-column__cards">
                {stageCandidates.length > 0 ? stageCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.applicationKey}
                    candidate={candidate}
                    showCampaignLabel={props.showCampaignLabel}
                    inviteSent={props.isInviteSent(candidate.applicationKey)}
                    onInvite={props.onInvite}
                    onDetail={props.onDetail}
                  />
                )) : <div className="candidate-studio-column__empty">Thả ứng viên vào đây</div>}
              </div>
            </section>
          );
        })}
      </div>
      <button type="button" className="candidate-studio-scroll is-right" aria-label="Xem cột tiếp theo" onClick={() => scroll(1)}>
        <ArrowRightOutlined />
      </button>
    </div>
  );
}

interface CandidateListProps extends Pick<CandidateStudioScreenProps, 'candidates' | 'showCampaignLabel' | 'onDetail'> {}

function CandidateList({ candidates, showCampaignLabel, onDetail }: CandidateListProps) {
  return (
    <div className="candidate-studio-table-wrap">
      <table className="candidate-studio-table">
        <thead><tr><th>Ứng viên</th><th>Vị trí / đợt</th><th>Điểm</th><th>Kết quả</th><th>Trạng thái</th><th><span className="studio-sr-only">Thao tác</span></th></tr></thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.applicationKey}>
              <td><button type="button" className="candidate-studio-person" onClick={() => onDetail(candidate)}><span className="candidate-studio-avatar">{initials(candidate.name)}</span><span><strong>{displayCandidateName(candidate.name)}</strong><small>{candidate.email || 'Chưa có email'}</small></span></button></td>
              <td><strong>{displayCandidatePosition(candidate)}</strong>{displayCandidateDepartmentPeriod(candidate) ? <small>{displayCandidateDepartmentPeriod(candidate)}</small> : showCampaignLabel ? <small>{displayCandidatePosition({ sourceListName: candidate.sourceListName })}</small> : null}</td>
              <td><span className="candidate-studio-score is-table">{candidate.score ?? '—'}<small>/100</small></span></td>
              <td><span className={`candidate-studio-badge ${resultTone(candidate.category)}`}>• {candidate.category || 'Chưa phân loại'}</span></td>
              <td><span className="candidate-studio-badge is-neutral">{stageLabel(candidate.status)}</span></td>
              <td><button type="button" className="candidate-studio-detail" onClick={() => onDetail(candidate)}>Chi tiết <ArrowRightOutlined /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface CandidateStudioScreenProps {
  lists: ReadonlyArray<ScreeningListRef>;
  selectedListId: string | null;
  candidates: CandidateApplication[];
  metrics: CandidateMetricSummary;
  viewMode: CandidateViewMode;
  searchQuery: string;
  resultFilter: string;
  loading: boolean;
  showCampaignLabel: boolean;
  notice?: string | null;
  onDismissNotice?: () => void;
  onScopeChange: (scopeId: string) => void;
  onSearchChange: (query: string) => void;
  onResultFilterChange: (filter: string) => void;
  onViewModeChange: (mode: CandidateViewMode) => void;
  onRefresh: () => void;
  onMove: (identity: { listId: string; itemId: string }, status: string) => void;
  onInvite: (candidate: CandidateApplication) => void;
  onDetail: (candidate: CandidateApplication) => void;
  isInviteSent: (applicationKey: string) => boolean;
}

export function CandidateStudioScreen(props: CandidateStudioScreenProps) {
  return (
    <StudioPage className="candidate-studio-page">
      <StudioPageHeader
        eyebrow="TUYỂN DỤNG"
        title="Ứng viên"
        description="Theo dõi kết quả đánh giá và tiến độ tuyển dụng trong Room."
        actions={<button type="button" className="candidate-studio-refresh" onClick={props.onRefresh} disabled={props.loading}><ReloadOutlined /> Làm mới</button>}
      />

      <section className="candidate-studio-metrics" aria-label="Tổng quan ứng viên">
        <StudioMetricCard label="Tất cả ứng viên" value={props.metrics.total} description="Trong phạm vi đang chọn" icon={<TeamOutlined />} loading={props.loading} />
        <StudioMetricCard label="Đạt yêu cầu" value={props.metrics.passed} description="Theo kết quả đánh giá" icon={<CheckCircleOutlined />} loading={props.loading} />
        <StudioMetricCard label="Chờ phỏng vấn" value={props.metrics.awaitingInterview} description="Sẵn sàng cho bước tiếp theo" icon={<ClockCircleOutlined />} loading={props.loading} />
        <StudioMetricCard label="Đã phỏng vấn" value={props.metrics.interviewed} description="Đã đi qua bước phỏng vấn" icon={<UserSwitchOutlined />} loading={props.loading} />
      </section>

      {props.notice ? <StudioInlineState tone="info" className="candidate-studio-notice"><span>{props.notice}</span>{props.onDismissNotice ? <button type="button" onClick={props.onDismissNotice}>Đóng</button> : null}</StudioInlineState> : null}

      <section className="candidate-studio-toolbar" aria-label="Bộ lọc ứng viên">
        <StudioSearchInput icon={<SearchOutlined />} label="Tìm ứng viên" placeholder="Tìm ứng viên, vị trí hoặc email..." value={props.searchQuery} onChange={(event) => props.onSearchChange(event.target.value)} />
        <div className="candidate-studio-toolbar__controls">
          <CandidateStudioSelect
            ariaLabel="Đợt tuyển dụng"
            value={props.selectedListId ?? ALL_SCREENING_LISTS}
            groupLabel="Đợt tuyển dụng"
            disabled={props.lists.length === 0}
            options={[
              { value: ALL_SCREENING_LISTS, label: 'Tất cả đợt tuyển dụng' },
              ...props.lists.map((list) => ({ value: screeningListId(list), label: formatScreeningListLabel(list) })),
            ]}
            onChange={props.onScopeChange}
          />
          <CandidateStudioSelect
            ariaLabel="Kết quả"
            value={props.resultFilter}
            groupLabel="Kết quả đánh giá"
            options={[
              { value: 'all', label: 'Tất cả kết quả' },
              ...RESULT_OPTIONS.map((option) => ({ value: option, label: option })),
            ]}
            onChange={props.onResultFilterChange}
          />
          <div className="candidate-studio-segmented" aria-label="Kiểu hiển thị">
            <button type="button" className={props.viewMode === 'kanban' ? 'is-active' : ''} aria-pressed={props.viewMode === 'kanban'} onClick={() => props.onViewModeChange('kanban')}><AppstoreOutlined /> Kanban</button>
            <button type="button" className={props.viewMode === 'list' ? 'is-active' : ''} aria-pressed={props.viewMode === 'list'} onClick={() => props.onViewModeChange('list')}><UnorderedListOutlined /> Danh sách</button>
          </div>
        </div>
      </section>

      <div className="candidate-studio-meta"><span>{props.candidates.length} ứng viên phù hợp</span><span>{props.viewMode === 'kanban' ? 'Kéo thẻ hoặc mở chi tiết để đổi trạng thái' : 'Chọn ứng viên để xem đánh giá chi tiết'}</span></div>

      {props.loading && props.candidates.length === 0 ? <StudioInlineState>Đang tải dữ liệu ứng viên…</StudioInlineState>
        : props.candidates.length === 0 ? <StudioInlineState title="Chưa có ứng viên phù hợp">Thử đổi đợt tuyển dụng, kết quả hoặc từ khóa tìm kiếm.</StudioInlineState>
          : props.viewMode === 'kanban'
            ? <CandidateKanban {...props} />
            : <CandidateList candidates={props.candidates} showCampaignLabel={props.showCampaignLabel} onDetail={props.onDetail} />}
    </StudioPage>
  );
}
