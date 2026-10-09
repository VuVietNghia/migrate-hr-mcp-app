import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { parseToolResult, usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { UserOutlined } from '@ant-design/icons';
import '../hr-premium-styles.css';
import { getKanbanColumnScrollDistance } from './kanban-scroll';
import { getInviteEmailValidationError } from './invite-email-validation';
import { getInviteMailButtonState } from './invite-mail-status';
import { markInviteMailSent } from './invite-mail-persistence';
import { canShowInviteMailButton, getCVColumnLabel, getCVColumnsForStages, getInterviewPendingStageId, type CVKanbanColumn } from './kanban-stages';
import { restCall } from '../privos-rest';
import { stripCvFileSuffix } from '../pipeline-candidate-name';
import { usePolling } from '../hooks/usePolling';
import { CVBoardPollingGuard } from './polling-sync';
import { moveCVToStage } from './cv-stage-move';
import { applyInviteSentToBoard, buildInviteSentMessage, moveInvitedCVToPendingStage } from './invite-sent-outcome';
import { fetchScreeningListItems } from './cv-list-reader';
import { mapItemsToCVProfiles } from './cv-item-mapper';
import { areCvListsEqual, areStageMapsEqual } from './cv-poll-diff';
import {
  readScreeningLists,
  type ScreeningListRef,
} from './cv-list-presence';
import { loadScreeningBoard } from './cv-board-loader';
import { buildTrackedInviteEmailRequest, type TrackedInviteEmailRequest } from './invite-email-request';
import { UserSessionTrackedMail } from '../email-history/user-session-tracked-mail';
import { createInterviewEmailTemplateRepository } from '../email-templates/interview-email-template-default';
import type { InterviewEmailTemplateDocument } from '../email-templates/interview-email-template';
import {
  canSendInviteWithTemplate,
  loadActiveInviteTemplate,
  renderActiveInviteTemplate,
  type ActiveTemplateRepository,
} from './invite-template-state';
import {
  resolveOrLoadIntentScreeningBoard,
  screeningBoardRevealSequence,
  type StudioNavigationIntent,
} from '../studio/studio-navigation-intent';
import type { CandidateApplication, CVBoardData, CVProfile } from './candidate-model';
import {
  ALL_SCREENING_LISTS,
  ScreeningRequestGuard,
  reconcileScreeningListSelection,
  screeningListId,
  sortScreeningListsNewestFirst,
} from './candidate-selection-state';
import {
  boardsForScreeningScope,
  loadScreeningScopeBoards,
  mergeScreeningBoardResults,
  screeningMutationKey,
  type ScreeningBoardsByListId,
} from './candidate-board-flow';
import type { AppTab } from '../studio/studio-navigation';
import { CandidateStudioScreen, type CandidateViewMode } from './CandidateStudioViews';
import { collectCandidateApplications, filterCandidates, getCandidateMetrics, resolveCandidateInvitePosition } from './candidate-view-model';
import { CandidateDetailDialog } from './CandidateDetailDialog';
import {
  CandidateEvaluationRepository,
  type CandidateEvaluationDocument,
} from './candidate-evaluation';
import { RoomMailAccountSummary } from '../mail-connection/RoomMailAccountSummary';
import { loadCandidateRecruitmentJobsFromRoom } from './candidate-recruitment-jobs';
import type { CandidateRecruitmentJob } from './candidate-view-model';

export type { CVBoardData, CVProfile } from './candidate-model';

function CVCard({ 
  cv, 
  listName,
  onInvite,
  onSelectDetail,
  isInviteSent
}: { 
  cv: CVProfile, 
  listName: string,
  onMove: (id: string, newStatus: string) => void, 
  onInvite: (cv: CVProfile, posName?: string) => void,
  onSelectDetail: (cv: CVProfile, listName: string) => void,
  isInviteSent: boolean
}) {
  const [isDragging, setIsDragging] = useState(false);
  const displayName = cv.name.length > 27 ? cv.name.substring(0, 27) + '...' : cv.name;
  const inviteMailButton = getInviteMailButtonState(isInviteSent);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', cv._id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  return (
    <div 
      className={`hr-card ${isDragging ? 'is-dragging' : ''}`}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => onSelectDetail(cv, listName)}
      title="Bấm để xem thông tin chi tiết & nhận xét AI (hoặc Kéo thả CV)"
      style={{ cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
    >
      <div className="profile-card-header">
        <div className="profile-name-row" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="profile-avatar" style={{ backgroundColor: 'var(--accent)', flexShrink: 0 }} aria-hidden="true"><UserOutlined style={{ fontSize: '18px' }} /></div>
          <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <div className="profile-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden' }} title={cv.name}>{displayName}</div>
            <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge-tenure">Điểm: {cv.score ?? 'N/A'}</span>
              {cv.category && (() => {
                let badgeStyle: React.CSSProperties = { fontSize: '10px', padding: '2px 6px' };
                const catLower = cv.category.toLowerCase();
                if (catLower.includes('không đạt') || catLower.includes('không tuyển')) {
                  badgeStyle = { ...badgeStyle, backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' };
                } else if (catLower.includes('cân nhắc')) {
                  badgeStyle = { ...badgeStyle, backgroundColor: '#fefce8', color: '#eab308', border: '1px solid #fef08a' };
                }
                return <span className="position-badge" style={badgeStyle}>{cv.category}</span>;
              })()}
              {canShowInviteMailButton(cv.status, isInviteSent) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onInvite(cv); }}
                  className={inviteMailButton.className}
                  disabled={inviteMailButton.disabled}
                  style={{
                    marginLeft: '4px',
                    fontSize: '10px', 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    ...(isInviteSent
                      ? { border: 'none' }
                      : {
                          border: '1px solid var(--accent, #156FF5)',
                          backgroundColor: 'rgba(21, 111, 245, 0.08)',
                          color: 'var(--accent, #156FF5)',
                          transition: 'all 0.2s'
                        })
                  }}
                  onMouseOver={(e) => {
                    if (isInviteSent) return;
                    e.currentTarget.style.backgroundColor = 'var(--accent, #156FF5)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    if (isInviteSent) return;
                    e.currentTarget.style.backgroundColor = 'rgba(21, 111, 245, 0.08)';
                    e.currentTarget.style.color = 'var(--accent, #156FF5)';
                  }}
                >
                  {inviteMailButton.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {cv.reason && (
        <div className="profile-details" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {cv.reason.length > 180 ? cv.reason.substring(0, 180) + '...' : cv.reason}
        </div>
      )}
    </div>
  );
}

function CVColumn({ 
  column, 
  cvs, 
  listName,
  onMove, 
  onInvite,
  onSelectDetail,
  isInviteSent
}: { 
  column: CVKanbanColumn,
  cvs: CVProfile[], 
  listName: string,
  onMove: (id: string, newStatus: string) => void, 
  onInvite: (cv: CVProfile, posName?: string) => void,
  onSelectDetail: (cv: CVProfile, listName: string) => void,
  isInviteSent: (id: string) => boolean
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onMove(id, column.status);
  };

  return (
    <div 
      className={`hr-kanban-col ${isDragOver ? 'drag-over' : ''}`}
      style={{ flex: '0 0 calc((100% - 48px) / 3)', minWidth: '280px', alignSelf: 'stretch' }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true); }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="hr-kanban-col-header" style={{ borderTopColor: column.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: column.color }} />
          <h3 className="hr-kanban-title">{column.label}</h3>
        </div>
        <span className="hr-kanban-badge" style={{ color: column.color, backgroundColor: `${column.color}15` }}>
          {cvs.length}
        </span>
      </div>
      <div className="hr-kanban-content" style={{ overflowX: 'hidden' }}>
        {cvs.length === 0 ? (
          <p className="empty-state">{isDragOver ? 'Thả CV vào đây' : 'Trống'}</p>
        ) : (
          cvs.map(cv => (
            <CVCard 
              key={cv._id} 
              cv={cv} 
              listName={listName}
              onMove={onMove} 
              onInvite={onInvite} 
              onSelectDetail={onSelectDetail}
              isInviteSent={isInviteSent(cv._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function CVBoard({ 
  board, 
  revealSequence,
  onMove, 
  onInvite,
  onSelectDetail,
  isInviteSent
}: { 
  board: CVBoardData, 
  revealSequence?: number,
  onMove: (listId: string, id: string, newStatus: string) => void, 
  onInvite: (cv: CVProfile, listId: string, posName?: string) => void,
  onSelectDetail: (cv: CVProfile, listId: string, listName: string) => void,
  isInviteSent: (id: string) => boolean
}) {
  const boardRootRef = React.useRef<HTMLDivElement>(null);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = React.useState(!revealSequence);
  const columns = getCVColumnsForStages(board.stagesMap, board.cvs.some((cv) => cv.status === '01_Dau_Vao'));

  React.useEffect(() => {
    if (!revealSequence) return;
    setIsCollapsed(false);
    window.requestAnimationFrame(() => {
      boardRootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [revealSequence]);

  const scrollOneColumn = (direction: -1 | 1) => {
    const container = boardRef.current;
    const column = container?.querySelector<HTMLElement>('.hr-kanban-col');
    if (!container || !column) return;

    const gap = Number.parseFloat(getComputedStyle(container).gap) || 24;
    const distance = getKanbanColumnScrollDistance(column.getBoundingClientRect().width, gap);
    container.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <div ref={boardRootRef} className="cv-kanban-board" style={{ marginBottom: isCollapsed ? '16px' : '40px' }}>
      <div style={{ width: '100%', padding: '0 10px', marginBottom: isCollapsed ? '6px' : '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>{board.listName}</h3>
        <button
          type="button"
          aria-label={isCollapsed ? `Xem list ${board.listName}` : `Ẩn list ${board.listName}`}
          onClick={() => setIsCollapsed(collapsed => !collapsed)}
          style={{ width: '24px', height: '24px', flex: '0 0 24px', border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--bg-secondary, transparent)', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ display: 'block', transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transformOrigin: '50% 50%', transition: 'transform 160ms ease' }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {!isCollapsed && (
        <>
      <div className="cv-kanban-nav-zone cv-kanban-nav-zone-left">
        <button
          type="button"
          className="cv-kanban-nav"
          aria-label="Xem cột Kanban trước"
          onClick={() => scrollOneColumn(-1)}
        >
          ‹
        </button>
      </div>
      <div ref={boardRef} className="hr-kanban-container" style={{ display: 'flex', alignItems: 'stretch', gap: '24px', paddingBottom: '16px', overflowX: 'auto' }}>
        {columns.map(col => (
          <CVColumn 
            key={col.status} 
            column={col} 
            cvs={board.cvs.filter(cv => cv.status === col.status || (col.status === '07_CV_Cu' && cv.status === '10_CV_Cu'))} 
            listName={board.listName}
            onMove={(id, newStatus) => onMove(board.listId, id, newStatus)} 
            onInvite={(cv) => onInvite(cv, board.listId, board.listName.replace(/^JD\s+/i, ''))}
            onSelectDetail={(cv, listName) => onSelectDetail(cv, board.listId, listName)}
            isInviteSent={isInviteSent}
          />
        ))}
      </div>
      <div className="cv-kanban-nav-zone cv-kanban-nav-zone-right">
        <button
          type="button"
          className="cv-kanban-nav"
          aria-label="Xem cột Kanban tiếp theo"
          onClick={() => scrollOneColumn(1)}
        >
          ›
        </button>
      </div>
        </>
      )}
    </div>
  );
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: 'var(--text)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderFormattedReason(reasonText: string) {
  if (!reasonText) return <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Chưa có nhận xét chi tiết từ hệ thống AI.</p>;
  
  const lines = reasonText.split('\n');
  return (
    <div style={{ fontSize: '13.5px', lineHeight: '1.68', color: 'var(--text)', fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} style={{ height: '6px' }} />;
        
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0 4px 6px' }}>
              <span style={{ color: 'var(--accent, #156FF5)', fontSize: '14px', flexShrink: 0 }}>•</span>
              <div>{renderInlineBold(trimmed.replace(/^[-*•]\s*/, ''))}</div>
            </div>
          );
        }

        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0 4px 6px' }}>
              <span style={{ color: 'var(--accent, #156FF5)', fontWeight: 600, fontSize: '13px', flexShrink: 0 }}>{numMatch[1]}.</span>
              <div>{renderInlineBold(numMatch[2])}</div>
            </div>
          );
        }

        return (
          <p key={idx} style={{ margin: '4px 0' }}>
            {renderInlineBold(line)}
          </p>
        );
      })}
    </div>
  );
}

/** `active` is true only while this tab is on screen; polling is gated on it. */
export default function CVScoredTab({
  active = false,
  navigationIntent = null,
  onNavigate,
}: {
  active?: boolean;
  navigationIntent?: StudioNavigationIntent | null;
  onNavigate?: (target: AppTab, context?: Pick<StudioNavigationIntent, 'lifecycle'>) => void;
} = {}) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const templateRepository = useMemo(
    () => app && roomId ? createInterviewEmailTemplateRepository(app, roomId) : null,
    [app, roomId],
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [viewMode, setViewMode] = useState<CandidateViewMode>('kanban');
  const [screeningLists, setScreeningLists] = useState<ScreeningListRef[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [boardsByListId, setBoardsByListId] = useState<ScreeningBoardsByListId>({});
  const boards = useMemo(
    () => boardsForScreeningScope(screeningLists, selectedListId, boardsByListId),
    [boardsByListId, screeningLists, selectedListId],
  );
  const evaluationRepository = useMemo(
    () => app && roomId ? new CandidateEvaluationRepository(app, roomId) : null,
    [app, roomId],
  );
  const [recruitmentJobs, setRecruitmentJobs] = useState<CandidateRecruitmentJob[]>([]);
  const scopeCandidates = useMemo(() => collectCandidateApplications(boards, recruitmentJobs), [boards, recruitmentJobs]);
  const filteredCandidates = useMemo(
    () => filterCandidates(scopeCandidates, searchQuery, resultFilter),
    [resultFilter, scopeCandidates, searchQuery],
  );
  const metrics = useMemo(() => getCandidateMetrics(scopeCandidates), [scopeCandidates]);
  const [loading, setLoading] = useState(false);
  const [targetBoardLoading, setTargetBoardLoading] = useState(false);
  const boardsRef = React.useRef<CVBoardData[]>([]);
  const boardsByListIdRef = React.useRef<ScreeningBoardsByListId>({});
  const screeningListsRef = React.useRef<ScreeningListRef[]>([]);
  const selectedListIdRef = React.useRef<string | null>(null);
  const screeningRequestGuardRef = React.useRef(new ScreeningRequestGuard());
  const handledNavigationSequenceRef = React.useRef(0);
  const candidateNavigationRequestRef = React.useRef(0);
  
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCVForDetail, setSelectedCVForDetail] = useState<{ cv: CVProfile; listId: string; listName: string } | null>(null);
  const [candidateEvaluation, setCandidateEvaluation] = useState<CandidateEvaluationDocument | null>(null);
  const [candidateEvaluationLoading, setCandidateEvaluationLoading] = useState(false);
  const [candidateEvaluationError, setCandidateEvaluationError] = useState<string | null>(null);
  const evaluationRequestRef = React.useRef(0);
  const detailCandidate = useMemo(() => {
    if (!selectedCVForDetail) return null;
    return scopeCandidates.find((candidate) =>
      candidate.sourceListId === selectedCVForDetail.listId && candidate._id === selectedCVForDetail.cv._id
    ) ?? null;
  }, [scopeCandidates, selectedCVForDetail]);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedCVForInvite, setSelectedCVForInvite] = useState<{ cv: CVProfile; listId: string; listName: string } | null>(null);
  const [sentInviteCVIds, setSentInviteCVIds] = useState<Set<string>>(() => new Set());
  
  const [inviteCandidateName, setInviteCandidateName] = useState('');
  const [invitePosition, setInvitePosition] = useState('');
  const [inviteCompany, setInviteCompany] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDate, setInviteDate] = useState('');
  const [inviteSubject, setInviteSubject] = useState('');
  const [inviteEmailBody, setInviteEmailBody] = useState('');
  const [activeInviteTemplate, setActiveInviteTemplate] = useState<InterviewEmailTemplateDocument | null>(null);
  const [loadedInviteTemplateRepository, setLoadedInviteTemplateRepository] = useState<ActiveTemplateRepository | null>(null);
  const [inviteTemplateLoading, setInviteTemplateLoading] = useState(false);
  const [inviteTemplateError, setInviteTemplateError] = useState<string | null>(null);
  const [inviteToast, setInviteToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const inviteToastTimerRef = React.useRef<number | null>(null);

  /**
   * The Hub embeds this app in an iframe sandboxed WITHOUT `allow-modals`, so `alert()` is dropped
   * silently — the console only shows "Ignored call to 'alert()'". Every message in the invite-mail
   * flow has to be drawn by the app itself or the operator sees nothing at all.
   */
  const showInviteToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (inviteToastTimerRef.current) window.clearTimeout(inviteToastTimerRef.current);
    setInviteToast({ message, type });
    inviteToastTimerRef.current = window.setTimeout(() => setInviteToast(null), 6000);
  }, []);

  useEffect(() => () => {
    if (inviteToastTimerRef.current) window.clearTimeout(inviteToastTimerRef.current);
  }, []);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);

  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);

  useEffect(() => {
    boardsByListIdRef.current = boardsByListId;
  }, [boardsByListId]);

  useEffect(() => {
    screeningListsRef.current = screeningLists;
  }, [screeningLists]);

  useEffect(() => {
    const requestId = ++evaluationRequestRef.current;
    setCandidateEvaluation(null);
    setCandidateEvaluationError(null);
    if (!detailModalOpen || !detailCandidate || !evaluationRepository) {
      setCandidateEvaluationLoading(false);
      return;
    }
    setCandidateEvaluationLoading(true);
    void evaluationRepository.resolve(detailCandidate.name)
      .then(async (file) => {
        if (!file) throw new Error('Không tìm thấy file đánh giá Markdown của ứng viên.');
        return evaluationRepository.read(file);
      })
      .then((document) => {
        if (requestId === evaluationRequestRef.current) setCandidateEvaluation(document);
      })
      .catch((error) => {
        if (requestId === evaluationRequestRef.current) {
          setCandidateEvaluationError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (requestId === evaluationRequestRef.current) setCandidateEvaluationLoading(false);
      });
  }, [detailCandidate?.applicationKey, detailModalOpen, evaluationRepository]);

  const inviteValidationError = getInviteEmailValidationError({
    candidateName: inviteCandidateName,
    email: inviteEmail,
    position: invitePosition,
    company: inviteCompany,
    interviewDate: inviteDate,
    subject: inviteSubject,
    body: inviteEmailBody
  });
  const inviteTemplateSendReady = canSendInviteWithTemplate({
    activeTemplate: activeInviteTemplate,
    loadedRepository: loadedInviteTemplateRepository,
    loading: inviteTemplateLoading,
    error: inviteTemplateError,
  }, templateRepository);

  /**
   * Runs after the modal has already closed. The server relays every room's mail through ONE
   * sequential queue, so awaiting the send here would hold the operator on a spinner for as long as
   * the queue is — and the Hub times the tool call out long before a busy queue drains, which used
   * to record "Gửi lỗi" for a mail that was still on its way. `UserSessionTrackedMail` writes the
   * "Đã gửi" / "Gửi lỗi" row itself once the send settles, exactly as before.
   *
   * Takes the CV and board as arguments: the modal's reset effect clears `selectedCVForInvite` and
   * the form state as soon as it closes, so nothing here may read them.
   */
  const finishInviteSend = async (
    cv: CVProfile,
    board: CVBoardData,
    request: TrackedInviteEmailRequest,
  ) => {
    if (!app) return;
    try {
      const { logged } = await new UserSessionTrackedMail(app).send(request);
      // Poll đang chạy có thể mang dữ liệu trước khi ghi cờ đã gửi mail / đổi cột, rồi đè lên cập
      // nhật lạc quan bên dưới. Coi thao tác này như một lần kéo thẻ để guard chặn poll đó.
      const inviteCvId = cv._id;
      const inviteMutationKey = screeningMutationKey(board.listId, inviteCvId);
      const guardedInvite = pollingGuardRef.current.beginMove(inviteMutationKey);
      try {
        const updatedCustomFields = markInviteMailSent(cv.customFields);
        await restCall(app, 'POST', 'items.update', {
          body: {
            itemId: inviteCvId,
            name: cv.name,
            customFields: updatedCustomFields,
          },
        });
        const stageMove = await moveInvitedCVToPendingStage(
          app,
          inviteCvId,
          getInterviewPendingStageId(board.stagesMap),
        );
        if (stageMove.status === 'failed') {
          console.error('[CVScoredTab] Đã gửi mail mời nhưng không chuyển được CV sang cột Chưa phỏng vấn:', stageMove.detail);
        }
        setBoardsByListId((previous) => {
          const sourceBoard = previous[board.listId];
          if (!sourceBoard) return previous;
          const next = {
            ...previous,
            [board.listId]: applyInviteSentToBoard(sourceBoard, inviteCvId, updatedCustomFields, stageMove),
          };
          boardsByListIdRef.current = next;
          return next;
        });
        // The operator was already told the mail is on its way, so only the cases needing them to act
        // are worth interrupting for.
        if (!logged || stageMove.status === 'failed') {
          showInviteToast(buildInviteSentMessage({ targetEmail: request.toEmail, logged, stageMove }), 'error');
        } else {
          showInviteToast(`Đã gửi email mời phỏng vấn tới ${request.toEmail}.`);
        }
      } finally {
        if (guardedInvite) {
          pollingGuardRef.current.endMove(inviteMutationKey);
          void pollBoards(true);
        }
      }
    } catch (err: any) {
      // Undo the optimistic badge so the card can be sent again.
      setSentInviteCVIds((previous) => {
        const next = new Set(previous);
        next.delete(screeningMutationKey(board.listId, cv._id));
        return next;
      });
      console.error('Lỗi gửi email:', err);
      showInviteToast(`Lỗi gửi email tới ${request.toEmail}: ` + (err.message || err), 'error');
    }
  };

  const handleSendInviteEmail = () => {
    if (!app || !roomId || !selectedCVForInvite) return;
    if (!inviteTemplateSendReady) return;
    const targetEmail = inviteEmail.trim();

    if (inviteValidationError) {
      showInviteToast(inviteValidationError, 'error');
      return;
    }

    const { cv, listId } = selectedCVForInvite;
    const selectedBoard = boardsByListIdRef.current[listId];
    if (!selectedBoard) {
      showInviteToast('Lỗi gửi email: Không tìm thấy đợt tuyển dụng của CV này.', 'error');
      return;
    }

    let request: TrackedInviteEmailRequest;
    try {
      request = buildTrackedInviteEmailRequest({
        roomId,
        cvItemId: cv._id,
        cvListId: selectedBoard.listId,
        jdName: selectedBoard.listName,
        toName: inviteCandidateName || 'Ứng viên',
        toEmail: targetEmail,
        subject: inviteSubject,
        body: inviteEmailBody,
      });
    } catch (err: any) {
      showInviteToast('Lỗi gửi email: ' + (err.message || err), 'error');
      return;
    }

    // Set before the send settles so the card cannot queue a second copy; rolled back on failure.
    setSentInviteCVIds((previous) => new Set(previous).add(screeningMutationKey(selectedBoard.listId, cv._id)));
    setInviteModalOpen(false);
    showInviteToast(`Email đang được gửi tới ${targetEmail} — theo dõi ở tab Email.`);
    void finishInviteSend(cv, selectedBoard, request);
  };

  const inviteDateRef = React.useRef<HTMLInputElement>(null);
  const requestRef = React.useRef(0);
  const loadedRoomIdRef = React.useRef(roomId);
  const pollingGuardRef = React.useRef(new CVBoardPollingGuard());
  const pendingPollRunnerRef = React.useRef<() => void>(() => {});

  useEffect(() => {
    if (loadedRoomIdRef.current === roomId) return;
    loadedRoomIdRef.current = roomId;
    requestRef.current += 1;
    screeningRequestGuardRef.current.select(null);
    selectedListIdRef.current = null;
    screeningListsRef.current = [];
    boardsByListIdRef.current = {};
    setSelectedListId(null);
    setScreeningLists([]);
    setBoardsByListId({});
    setRecruitmentJobs([]);
    setBoardNotice(null);
    setDetailModalOpen(false);
    setInviteModalOpen(false);
  }, [roomId]);

  useEffect(() => {
    if (!inviteModalOpen) {
      setActiveInviteTemplate(null);
      setLoadedInviteTemplateRepository(null);
      setInviteTemplateLoading(false);
      setInviteTemplateError(null);
      setInviteSubject('');
      setInviteEmailBody('');
      return;
    }
    if (!templateRepository) {
      setActiveInviteTemplate(null);
      setLoadedInviteTemplateRepository(null);
      setInviteTemplateLoading(false);
      setInviteTemplateError('Không thể tải mẫu email phỏng vấn: Chưa kết nối Room');
      setInviteSubject('');
      setInviteEmailBody('');
      return;
    }

    let current = true;
    void loadActiveInviteTemplate(templateRepository, () => current, state => {
      setActiveInviteTemplate(state.activeTemplate);
      setLoadedInviteTemplateRepository(state.loadedRepository);
      setInviteTemplateLoading(state.loading);
      setInviteTemplateError(state.error);
      if (!state.activeTemplate) {
        setInviteSubject('');
        setInviteEmailBody('');
      }
    });
    return () => { current = false; };
  }, [inviteModalOpen, templateRepository]);

  useEffect(() => {
    if (
      !inviteModalOpen
      || !activeInviteTemplate
      || loadedInviteTemplateRepository !== templateRepository
    ) return;
    const rendered = renderActiveInviteTemplate(activeInviteTemplate, {
      candidateName: inviteCandidateName,
      candidateEmail: inviteEmail,
      position: invitePosition,
      company: inviteCompany,
      interviewDate: inviteDate,
    });
    setInviteSubject(rendered.subject);
    setInviteEmailBody(rendered.body);
  }, [
    activeInviteTemplate,
    inviteCandidateName,
    inviteCompany,
    inviteDate,
    inviteEmail,
    inviteModalOpen,
    invitePosition,
    loadedInviteTemplateRepository,
    templateRepository,
  ]);

  const commitSelectedScope = useCallback((scopeId: string | null) => {
    screeningRequestGuardRef.current.select(scopeId);
    selectedListIdRef.current = scopeId;
    setSelectedListId(scopeId);
  }, []);

  const loadData = useCallback(async () => {
    if (!app || !roomId) return;
    const reqId = ++requestRef.current;
    pollingGuardRef.current.beginForegroundRefresh();
    setLoading(true);
    try {
      const [parsed, jobs] = await Promise.all([
        app.callServerTool({
          name: 'mcpapp.lists.getAll',
          arguments: { roomId },
        }).then(parseToolResult),
        loadCandidateRecruitmentJobsFromRoom(app, roomId).catch((error) => {
          console.warn('[Candidates] Không tải được thông tin JD để hiển thị phòng ban:', error);
          return [] as CandidateRecruitmentJob[];
        }),
      ]);
      const liveLists = readScreeningLists(parsed);
      if (!liveLists) throw new Error('Hub trả về danh sách đợt tuyển dụng không hợp lệ.');
      const sortedLists = sortScreeningListsNewestFirst(liveLists);
      const nextScope = reconcileScreeningListSelection(sortedLists, selectedListIdRef.current);

      if (!nextScope) {
        if (reqId !== requestRef.current) return;
        screeningListsRef.current = [];
        setScreeningLists([]);
        commitSelectedScope(null);
        boardsByListIdRef.current = {};
        setBoardsByListId({});
        return;
      }

      commitSelectedScope(nextScope);
      const token = screeningRequestGuardRef.current.begin(nextScope);
      const result = await loadScreeningScopeBoards(
        sortedLists,
        nextScope,
        (list) => loadScreeningBoard(app, list),
      );
      if (
        reqId !== requestRef.current
        || !screeningRequestGuardRef.current.isCurrent(token, selectedListIdRef.current)
      ) return;

      screeningListsRef.current = sortedLists;
      setScreeningLists(sortedLists);
      setRecruitmentJobs(jobs);
      setBoardsByListId((previous) => {
        const next = mergeScreeningBoardResults(previous, sortedLists, result.boards);
        boardsByListIdRef.current = next;
        return next;
      });
      setBoardNotice(result.errors.length > 0
        ? result.errors.map((error) => `Không tải được ${error.listName}: ${error.message}`).join(' ')
        : null);
    } catch (err) {
      console.error(err);
      if (reqId === requestRef.current) {
        setBoardNotice(`Không tải được dữ liệu ứng viên: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      const shouldRunPendingPoll = pollingGuardRef.current.endForegroundRefresh();
      if (reqId === requestRef.current) setLoading(false);
      if (shouldRunPendingPoll) pendingPollRunnerRef.current();
    }
  }, [app, commitSelectedScope, roomId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!active || !app || !roomId || navigationIntent?.target !== 'cvScored' || !navigationIntent.screening) return;
    if (handledNavigationSequenceRef.current >= navigationIntent.sequence) return;
    const screeningReference = navigationIntent.screening;
    handledNavigationSequenceRef.current = navigationIntent.sequence;
    candidateNavigationRequestRef.current = navigationIntent.sequence;
    const requestSequence = navigationIntent.sequence;
    setSearchQuery('');
    setTargetBoardLoading(true);
    commitSelectedScope(screeningReference.listId);

    const openTargetBoard = async () => {
      try {
        const target = await resolveOrLoadIntentScreeningBoard(
          navigationIntent,
          'cvScored',
          boardsRef.current,
          (reference) => loadScreeningBoard(app, { _id: reference.listId, name: reference.listName }),
          () => new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
          12,
        );
        if (!target || candidateNavigationRequestRef.current !== requestSequence) return;
        setBoardsByListId((previous) => {
          const next = { ...previous, [target.listId]: target };
          boardsByListIdRef.current = next;
          return next;
        });
        setScreeningLists((previous) => {
          if (previous.some((list) => screeningListId(list) === target.listId)) return previous;
          const next = [...previous, { _id: target.listId, name: target.listName }];
          screeningListsRef.current = next;
          return next;
        });
        setBoardNotice(null);
      } catch (error) {
        if (candidateNavigationRequestRef.current !== requestSequence) return;
        setBoardNotice(`Chưa tải được bảng ${screeningReference.listName}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (candidateNavigationRequestRef.current === requestSequence) setTargetBoardLoading(false);
      }
    };

    void openTargetBoard();
  }, [active, app, commitSelectedScope, navigationIntent?.sequence, roomId]);

  // Mỗi lần poll đọc metadata trước, sau đó chỉ đồng bộ board thuộc scope một đợt hoặc tất cả.
  const pollBoards = useCallback(async (required = false) => {
    if (!app || !roomId) return;
    const pollId = required
      ? pollingGuardRef.current.requestPoll()
      : pollingGuardRef.current.tryBeginPoll();
    if (pollId === null) return;

    try {
      const parsed = parseToolResult(await app.callServerTool({
        name: 'mcpapp.lists.getAll',
        arguments: { roomId },
      }));
      const liveLists = readScreeningLists(parsed);
      if (!liveLists) throw new Error('Hub trả về danh sách đợt tuyển dụng không hợp lệ.');
      const sortedLists = sortScreeningListsNewestFirst(liveLists);
      const previousLists = screeningListsRef.current;
      const previousBoards = boardsByListIdRef.current;
      const nextScope = reconcileScreeningListSelection(sortedLists, selectedListIdRef.current);

      if (!nextScope) {
        if (!pollingGuardRef.current.canApplyPoll(pollId)) return;
        screeningListsRef.current = [];
        setScreeningLists([]);
        commitSelectedScope(null);
        boardsByListIdRef.current = {};
        setBoardsByListId({});
        return;
      }

      commitSelectedScope(nextScope);
      const scopeToken = screeningRequestGuardRef.current.begin(nextScope);
      const result = await loadScreeningScopeBoards(sortedLists, nextScope, async (list) => {
        const listId = screeningListId(list);
        const current = previousBoards[listId];
        if (!current) return loadScreeningBoard(app, list);
        const items = await fetchScreeningListItems(app, listId);
        const mapped = mapItemsToCVProfiles(items, current.fieldsMap, current.stagesMap);
        if (areCvListsEqual(current.cvs, mapped.cvs) && areStageMapsEqual(current.stagesMap, mapped.stagesMap)) {
          return current;
        }
        return { ...current, stagesMap: mapped.stagesMap, cvs: mapped.cvs };
      });

      if (
        !pollingGuardRef.current.canApplyPoll(pollId)
        || !screeningRequestGuardRef.current.isCurrent(scopeToken, selectedListIdRef.current)
      ) return;

      screeningListsRef.current = sortedLists;
      setScreeningLists(sortedLists);
      const nextBoards = mergeScreeningBoardResults(previousBoards, sortedLists, result.boards);
      boardsByListIdRef.current = nextBoards;
      setBoardsByListId(nextBoards);

      const oldIds = new Set(previousLists.map(screeningListId));
      const liveIds = new Set(sortedLists.map(screeningListId));
      const removedNames = previousLists.filter((list) => !liveIds.has(screeningListId(list))).map((list) => `"${list.name}"`);
      const addedNames = sortedLists.filter((list) => !oldIds.has(screeningListId(list))).map((list) => `"${list.name}"`);
      const notices: string[] = [];
      if (removedNames.length > 0) notices.push(`List ${removedNames.join(', ')} đã bị xoá khỏi Hub nên đã được gỡ khỏi màn hình.`);
      if (addedNames.length > 0) notices.push(`Đã phát hiện list ${addedNames.join(', ')} vừa được tạo trên Hub.`);
      if (result.errors.length > 0) {
        notices.push(result.errors.map((error) => `Không đồng bộ được "${error.listName}": ${error.message}`).join(' '));
      }
      if (notices.length > 0) setBoardNotice(notices.join(' '));
    } catch (error) {
      console.error('[CVScoredTab] Không thể đồng bộ board CV:', error);
    } finally {
      if (pollingGuardRef.current.finishPoll(pollId)) pendingPollRunnerRef.current();
    }
  }, [app, commitSelectedScope, roomId]);

  useEffect(() => {
    pendingPollRunnerRef.current = () => { void pollBoards(); };
  }, [pollBoards]);

  usePolling(
    pollBoards,
    {
      enabled: active && Boolean(app && roomId),
      interval: 3000,
      immediate: false,
    }
  );

  const handleMove = async (listId: string, id: string, newStatus: string) => {
    if (!app) return;
    
    const board = boardsByListIdRef.current[listId];
    if (!board) return;

    // Find stageId for newStatus
    let stageId = Object.keys(board.stagesMap).find(k => board.stagesMap[k] === newStatus);
    if (!stageId && newStatus === '07_CV_Cu') {
      stageId = Object.keys(board.stagesMap).find(k => board.stagesMap[k] === '10_CV_Cu');
    }
    if (!stageId) return;

    const mutationKey = screeningMutationKey(listId, id);
    if (!pollingGuardRef.current.beginMove(mutationKey)) return;
    const previousStatus = board.cvs.find(cv => cv._id === id)?.status;

    // Optimistic
    setBoardsByListId((previous) => {
      const current = previous[listId];
      if (!current) return previous;
      const next = {
        ...previous,
        [listId]: { ...current, cvs: current.cvs.map(cv => cv._id === id ? { ...cv, status: newStatus } : cv) },
      };
      boardsByListIdRef.current = next;
      return next;
    });

    try {
      await moveCVToStage(app, id, stageId);
    } catch (err) {
      console.error(err);
      if (previousStatus) {
        setBoardsByListId((previous) => {
          const current = previous[listId];
          if (!current) return previous;
          const next = {
            ...previous,
            [listId]: { ...current, cvs: current.cvs.map(cv => cv._id === id ? { ...cv, status: previousStatus } : cv) },
          };
          boardsByListIdRef.current = next;
          return next;
        });
      }
      showInviteToast(`Không thể đổi trạng thái ứng viên: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      pollingGuardRef.current.endMove(mutationKey);
      void pollBoards(true);
    }
  };

  const handleScopeChange = (scopeId: string) => {
    commitSelectedScope(scopeId);
    setSearchQuery('');
    void loadData();
  };

  const handleCandidateInvite = (candidate: CandidateApplication) => {
    let cleanName = stripCvFileSuffix(candidate.name.replace(/.md$/i, ''));
    const cvIndex = cleanName.indexOf('_CV_');
    if (cvIndex !== -1) cleanName = cleanName.substring(cvIndex + 4);
    cleanName = cleanName.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    setSelectedCVForInvite({ cv: candidate, listId: candidate.sourceListId, listName: candidate.sourceListName });
    setInviteCandidateName(cleanName);
    setInvitePosition(resolveCandidateInvitePosition(candidate));
    setInviteCompany('Công ty ABC');
    setInviteEmail(candidate.email || '');
    setInviteDate('');
    setInviteModalOpen(true);
  };

  const handleCandidateDetail = (candidate: CandidateApplication) => {
    setSelectedCVForDetail({ cv: candidate, listId: candidate.sourceListId, listName: candidate.sourceListName });
    setDetailModalOpen(true);
  };

  const handleOpenEmployeeCreate = () => {
    setDetailModalOpen(false);
    onNavigate?.('lifecycle', { lifecycle: { openCreateForm: true } });
  };

  const handleDownloadEvaluation = () => {
    if (!candidateEvaluation) return;
    const url = URL.createObjectURL(new Blob([candidateEvaluation.fullMarkdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = candidateEvaluation.file.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const displayedBoards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return boards;
    return boards.filter((board) => board.listName.toLowerCase().includes(q));
  }, [boards, searchQuery]);

  const handleRefresh = () => {
    setSearchQuery('');
    void loadData();
  };

  return (
    <>
      <CandidateStudioScreen
        lists={screeningLists}
        selectedListId={selectedListId ?? ALL_SCREENING_LISTS}
        candidates={filteredCandidates}
        metrics={metrics}
        viewMode={viewMode}
        searchQuery={searchQuery}
        resultFilter={resultFilter}
        loading={loading}
        showCampaignLabel={selectedListId === ALL_SCREENING_LISTS}
        notice={targetBoardLoading ? 'Đang tải đúng bảng ứng viên của JD vừa sàng lọc…' : boardNotice}
        onDismissNotice={() => setBoardNotice(null)}
        onScopeChange={handleScopeChange}
        onSearchChange={setSearchQuery}
        onResultFilterChange={setResultFilter}
        onViewModeChange={setViewMode}
        onRefresh={handleRefresh}
        onMove={(identity, status) => void handleMove(identity.listId, identity.itemId, status)}
        onInvite={handleCandidateInvite}
        onDetail={handleCandidateDetail}
        isInviteSent={(applicationKey) => sentInviteCVIds.has(applicationKey) || scopeCandidates.some((candidate) =>
          candidate.applicationKey === applicationKey && candidate.inviteMailSent === true
        )}
      />
      <CandidateDetailDialog
        open={detailModalOpen}
        candidate={detailCandidate}
        stageOptions={selectedCVForDetail
          ? Object.values(boardsByListId[selectedCVForDetail.listId]?.stagesMap || {}).map((status) => ({
              value: status,
              label: getCVColumnLabel(boardsByListId[selectedCVForDetail.listId]?.stagesMap || {}, status) || status,
            }))
          : []}
        evaluation={candidateEvaluation}
        evaluationLoading={candidateEvaluationLoading}
        evaluationError={candidateEvaluationError}
        onClose={() => setDetailModalOpen(false)}
        onStageChange={(status) => {
          if (detailCandidate) void handleMove(detailCandidate.sourceListId, detailCandidate._id, status);
        }}
        onInvite={() => {
          if (!detailCandidate) return;
          setDetailModalOpen(false);
          handleCandidateInvite(detailCandidate);
        }}
        onOpenEmployeeCreate={handleOpenEmployeeCreate}
        onDownload={handleDownloadEvaluation}
      />
    <div className="hr-terminal-ui">
      {false && (
        <>
      <header className="hr-header-block">
        <div className="header-content">
          <h2 className="hr-title">CV đã chấm</h2>
          <p className="hr-subtitle">Kanban hiển thị kết quả lọc CV theo đợt tuyển dụng.</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input 
            type="text" 
            className="pl-input" 
            placeholder="Tìm kiếm List Kanban..."
            style={{ height: '38px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', minWidth: '220px' }}
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
          />
          <button className="hr-btn" onClick={handleRefresh} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            Làm mới
          </button>
        </div>
      </header>

      {boardNotice && (
        <div className="hr-status-banner hr-status-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span>{boardNotice}</span>
          <button type="button" className="hr-btn hr-btn-subtle" onClick={() => setBoardNotice(null)} aria-label="Đóng thông báo">
            Đóng
          </button>
        </div>
      )}

      {targetBoardLoading && (
        <div className="hr-status-banner hr-status-info">
          Đang tải đúng bảng ứng viên của JD vừa sàng lọc…
        </div>
      )}

      {loading ? (
        <div className="kanban-loading">
          <div className="spinner"></div>
          <p>Đang tải dữ liệu CV...</p>
        </div>
      ) : displayedBoards.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Không tìm thấy danh sách chấm điểm nào{searchQuery ? ` phù hợp với "${searchQuery}"` : ''}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {displayedBoards.map(board => (
            <CVBoard 
              key={board.listId} 
              board={board} 
              revealSequence={screeningBoardRevealSequence(navigationIntent, board)}
              onMove={handleMove} 
              onInvite={(cv, listId, posName) => {
                let cleanName = stripCvFileSuffix(cv.name.replace(/\.md$/i, ''));
                const cvIndex = cleanName.indexOf('_CV_');
                if (cvIndex !== -1) {
                  cleanName = cleanName.substring(cvIndex + 4);
                }
                cleanName = cleanName.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
                
                let cleanPos = posName || '';
                cleanPos = cleanPos.replace(/^SCREENING_/i, '').replace(/_/g, ' ');

                setSelectedCVForInvite({ cv, listId, listName: board.listName });
                setInviteCandidateName(cleanName);
                setInvitePosition(cleanPos);
                setInviteCompany('Công ty ABC');
                setInviteEmail(cv.email || '');
                setInviteDate('');
                setInviteModalOpen(true);
              }}
              onSelectDetail={(cv, listId, listName) => {
                setSelectedCVForDetail({ cv, listId, listName });
                setDetailModalOpen(true);
              }}
              isInviteSent={(cvId) => sentInviteCVIds.has(screeningMutationKey(board.listId, cvId)) || board.cvs.some((cv) =>
                cv._id === cvId && cv.inviteMailSent === true,
              )}
            />
          ))}
        </div>
      )}

        </>
      )}
      {/* CV Detail & AI Scoring Modal Popup */}
      {detailModalOpen && selectedCVForDetail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
            ,visibility: 'hidden'
          }}
          onClick={() => setDetailModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '800px',
              maxWidth: '95%',
              maxHeight: '88vh',
              backgroundColor: 'var(--bg-card, #fff)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10000,
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-light, #e2e8f0)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--accent, #156FF5)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '18px',
                    boxShadow: '0 4px 12px rgba(21,111,245,0.25)'
                  }}
                  aria-hidden="true"
                >
                  <UserOutlined style={{ fontSize: '26px' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                    {selectedCVForDetail.cv.name}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>Đợt tuyển dụng: <strong>{selectedCVForDetail.listName}</strong></span>
                    {selectedCVForDetail.cv.email && <span>✉️ Email: <strong>{selectedCVForDetail.cv.email}</strong></span>}
                    {selectedCVForDetail.cv.sdt && <span>📞 SĐT: <strong>{selectedCVForDetail.cv.sdt}</strong></span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                  borderRadius: '6px'
                }}
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Stats Summary Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
              <div style={{ background: 'var(--bg-subtle, var(--bg-card))', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-light, var(--border))' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                  Tổng điểm AI
                </span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: selectedCVForDetail.cv.score && Number(selectedCVForDetail.cv.score) >= 75 ? '#22c55e' : selectedCVForDetail.cv.score && Number(selectedCVForDetail.cv.score) >= 50 ? '#eab308' : '#ef4444', marginTop: '2px' }}>
                  {selectedCVForDetail.cv.score !== undefined ? `${selectedCVForDetail.cv.score}/100` : 'N/A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, var(--bg-card))', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-light, var(--border))' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                  Phân loại AI
                </span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>
                  {selectedCVForDetail.cv.category || 'Chưa phân loại'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-subtle, var(--bg-card))', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-light, var(--border))' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                  Trạng thái Kanban
                </span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>
                  {getCVColumnLabel(
                    boardsByListId[selectedCVForDetail.listId]?.stagesMap || {},
                    selectedCVForDetail.cv.status,
                  ) || selectedCVForDetail.cv.status}
                </div>
              </div>
            </div>

            {/* AI Detailed Assessment Content Container */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px' }}>🤖</span>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  Mô tả AI chấm điểm & nhận xét chi tiết CV
                </h4>
              </div>
              <div
                className="pl-no-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  padding: '16px 18px',
                  backgroundColor: 'var(--bg-subtle, var(--bg-card))',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light, var(--border))',
                  color: 'var(--text)',
                }}
              >
                {renderFormattedReason(selectedCVForDetail.cv.reason || '')}
              </div>
            </div>
          </div>
        </div>
      )}

      {inviteModalOpen && selectedCVForInvite && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              width: '850px', 
              maxWidth: '95%', 
              backgroundColor: 'var(--bg-card, #fff)', 
              borderRadius: '12px', 
              padding: '24px', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10000
            }}
          >
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Gửi thư mời phỏng vấn</h3>
              <button 
                onClick={() => setInviteModalOpen(false)} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)', padding: '4px' }}
                title="Đóng"
              >
                ✕
              </button>
             </div>

             <RoomMailAccountSummary app={app} roomId={roomId} active={inviteModalOpen} />

             {inviteTemplateLoading && (
              <p role="status" style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Đang tải mẫu email phỏng vấn…
              </p>
            )}
            {!inviteTemplateLoading && (inviteTemplateError || !activeInviteTemplate) && (
              <div role="alert" style={{ margin: '0 0 16px', color: '#dc2626', fontSize: '13px' }}>
                <p style={{ margin: 0 }}>
                  {inviteTemplateError || 'Không tìm thấy mẫu email phỏng vấn đang sử dụng.'}
                </p>
                <p style={{ margin: '4px 0 0' }}>Vào Email → Mẫu email để sửa hoặc chọn mẫu.</p>
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Left Column: Form Fields */}
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Tên ứng viên</label>
                  <input type="text" className="pl-input" value={inviteCandidateName} onChange={e => setInviteCandidateName(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Email ứng viên</label>
                  <input type="email" className="pl-input" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Ví dụ: ungvien@gmail.com" style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Tên vị trí</label>
                  <input type="text" className="pl-input" value={invitePosition} onChange={e => setInvitePosition(e.target.value)} placeholder="Nhập tên vị trí" style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Tên công ty</label>
                  <input type="text" className="pl-input" value={inviteCompany} onChange={e => setInviteCompany(e.target.value)} placeholder="Nhập tên công ty" style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Thời gian phỏng vấn</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      className="pl-input" 
                      readOnly 
                      placeholder="dd/mm/yyyy"
                      value={inviteDate ? inviteDate.split('-').reverse().join('/') : ''} 
                      style={{ width: '100%', paddingRight: '40px', cursor: 'pointer', backgroundColor: 'var(--bg-subtle)' }} 
                    />
                    <div style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#156FF5', display: 'flex', alignItems: 'center' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                    </div>
                    <input 
                      type="date"
                      ref={inviteDateRef}
                      value={inviteDate}
                      onChange={e => setInviteDate(e.target.value)}
                      onClick={(e) => {
                        try { e.currentTarget.showPicker(); } catch (err) {}
                      }}
                      style={{ 
                        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                        opacity: 0, cursor: 'pointer' 
                      }} 
                    />
                  </div>
                </div>
              </div>
              
              {/* Right Column: Preview */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Tiêu đề (Cập nhật tự động)</label>
                  <input type="text" className="pl-input" value={inviteSubject} onChange={e => setInviteSubject(e.target.value)} style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Nội dung thư mời (Cập nhật tự động)</label>
                  <textarea className="pl-input" style={{ width: '100%', flex: 1, minHeight: '260px', resize: 'vertical' }} value={inviteEmailBody} onChange={e => setInviteEmailBody(e.target.value)} />
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              {inviteTemplateSendReady && inviteValidationError && (
                <p role="alert" style={{ margin: 0, marginRight: 'auto', alignSelf: 'center', color: '#dc2626', fontSize: '12px' }}>
                  {inviteValidationError}
                </p>
              )}
              <button className="hr-btn" onClick={() => {
                showInviteToast('Đã tải nội dung email!');
              }}>Tải email về</button>
              <button 
                className="hr-btn hr-btn-primary" 
                disabled={!inviteTemplateSendReady || Boolean(inviteValidationError)}
                style={{ backgroundColor: '#156FF5', color: '#fff', borderColor: '#156FF5' }}
                onClick={handleSendInviteEmail}
              >
                Gửi email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sits outside the modal: most of its messages arrive after the modal has closed. */}
      {inviteToast && (
        <div className={`cv-invite-toast is-${inviteToast.type}`} role="status" aria-live="polite">
          <span className="cv-invite-toast-dot" />
          <span>{inviteToast.message}</span>
        </div>
      )}
    </div>
    </>
  );
}
