import { useCallback, useEffect, useRef, useState } from 'react';

import { usePolling } from '../hooks/usePolling';
import type { IInterviewEmailTemplateRepository } from './interview-email-template-repository';
import type { InterviewEmailTemplateDocument } from './interview-email-template';
import { InterviewEmailTemplateLoadError } from './InterviewEmailTemplateLoadError';
import {
  beginTemplatePanelLoad,
  beginTemplatePanelMutation,
  canDeleteTemplate,
  createTemplatePanelState,
  executeTemplatePanelMutation,
  filterInterviewEmailTemplatesByName,
  findTemplateByFileIdentity,
  getTemplateUseButtonPresentation,
  getInterviewEmailTemplateRowKey,
  getTemplateDraftValidationError,
  getTemplatePanelMode,
  insertTemplateTokenAtSelection,
  isTemplateDraftDirty,
  openTemplatePanelCreate,
  openTemplatePanelDetail,
  reconcileTemplatePanelSnapshot,
  settleTemplatePanelMutation,
  settleTemplatePanelLoad,
  updateTemplatePanelDraft,
  type TemplatePanelState,
} from './interview-email-template-state';
import './interview-email-template.css';

export interface InterviewEmailTemplatePanelProps {
  repository: IInterviewEmailTemplateRepository;
  category: 'cv_scored' | 'lifecycle';
  active: boolean;
  createRequest: number;
  query: string;
  onCountChange(count: number): void;
  onReadyChange(ready: boolean): void;
}

type EditableField = 'subject' | 'body';

const VARIABLES = [
  { token: '{{ten_ung_vien}}', label: 'Tên ứng viên' },
  { token: '{{email_ung_vien}}', label: 'Email ứng viên' },
  { token: '{{vi_tri}}', label: 'Vị trí' },
  { token: '{{cong_ty}}', label: 'Công ty' },
  { token: '{{thoi_gian_phong_van}}', label: 'Thời gian phỏng vấn' },
] as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toPreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function InterviewEmailTemplatePanel({
  repository,
  category,
  active,
  createRequest,
  query,
  onCountChange,
  onReadyChange,
}: InterviewEmailTemplatePanelProps) {
  const panelRef = useRef<TemplatePanelState>(createTemplatePanelState());
  const [panel, setPanel] = useState<TemplatePanelState>(panelRef.current);
  const [focusedField, setFocusedField] = useState<EditableField | null>(null);
  const handledCreateRequest = useRef(createRequest);
  const operationGenerationRef = useRef(0);
  const repositoryRef = useRef(repository);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const updatePanel = useCallback((updater: (current: TemplatePanelState) => TemplatePanelState) => {
    const next = updater(panelRef.current);
    panelRef.current = next;
    setPanel(next);
    return next;
  }, []);

  useEffect(() => {
    if (repositoryRef.current === repository) return;
    repositoryRef.current = repository;
    operationGenerationRef.current += 1;
    refreshInFlightRef.current = null;
    updatePanel(() => createTemplatePanelState());
    onReadyChange(false);
  }, [onReadyChange, repository, updatePanel]);

  const refreshTemplates = useCallback((): Promise<void> => {
    if (!active || category !== 'cv_scored') return Promise.resolve();
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    if (panelRef.current.working) return Promise.resolve();

    const initialLoad = panelRef.current.snapshot === null;
    const loadGeneration = ++operationGenerationRef.current;
    if (initialLoad) {
      onReadyChange(false);
      updatePanel(current => beginTemplatePanelLoad(current, loadGeneration));
    }

    const request = Promise.resolve()
      .then(() => initialLoad ? repository.ensureInitialized() : repository.listTemplates())
      .then(nextSnapshot => {
        if (loadGeneration !== operationGenerationRef.current) return;
        updatePanel(current => initialLoad
          ? settleTemplatePanelLoad(current, loadGeneration, { snapshot: nextSnapshot })
          : reconcileTemplatePanelSnapshot(current, nextSnapshot));
        onCountChange(nextSnapshot.templates.length);
        onReadyChange(true);
      })
      .catch(loadError => {
        if (loadGeneration !== operationGenerationRef.current) return;
        if (initialLoad) {
          updatePanel(current => settleTemplatePanelLoad(current, loadGeneration, {
            error: `Không thể tải mẫu email: ${getErrorMessage(loadError)}`,
          }));
          onReadyChange(false);
          return;
        }
        updatePanel(current => ({
          ...current,
          error: `Không thể cập nhật mẫu email: ${getErrorMessage(loadError)}`,
        }));
      })
      .finally(() => {
        if (refreshInFlightRef.current === request) refreshInFlightRef.current = null;
      });
    refreshInFlightRef.current = request;
    return request;
  }, [active, category, onCountChange, onReadyChange, repository, updatePanel]);

  usePolling(refreshTemplates, {
    enabled: active && category === 'cv_scored',
    interval: 3000,
    immediate: true,
  });

  useEffect(() => () => {
    operationGenerationRef.current += 1;
    refreshInFlightRef.current = null;
  }, []);

  useEffect(() => {
    if (handledCreateRequest.current === createRequest) return;
    if (!active || category !== 'cv_scored' || panel.working || panel.loadStatus !== 'ready') return;
    handledCreateRequest.current = createRequest;
    updatePanel(openTemplatePanelCreate);
    setFocusedField(null);
  }, [active, category, createRequest, panel.loadStatus, panel.working, updatePanel]);

  if (getTemplatePanelMode(category) === 'lifecycle-empty') {
    return <div className="interview-template-panel interview-template-empty">Chưa có mẫu email nhân sự</div>;
  }

  const detailIdentity = panel.view.kind === 'detail' ? panel.view : null;
  const snapshot = panel.snapshot;
  const activeTemplateId = snapshot?.activeTemplateId ?? null;
  const loading = panel.loadStatus === 'loading';
  const mutationsLocked = panel.loadStatus !== 'ready' || panel.working !== null;
  const savedTemplate = detailIdentity
    ? findTemplateByFileIdentity(snapshot?.templates ?? [], detailIdentity) ?? null
    : null;
  const dirty = savedTemplate ? isTemplateDraftDirty(panel.draft, {
    id: savedTemplate.id,
    fileId: savedTemplate.fileId,
    fileName: savedTemplate.fileName,
    name: savedTemplate.name,
    subject: savedTemplate.subject,
    body: savedTemplate.body,
  }) : false;
  const draftError = getTemplateDraftValidationError(panel.draft);
  const canDelete = Boolean(savedTemplate && snapshot && canDeleteTemplate(savedTemplate, snapshot));
  const isCurrentTemplate = Boolean(savedTemplate && snapshot?.activeTemplateId === savedTemplate.id);
  const canUse = Boolean(savedTemplate)
    && !isCurrentTemplate
    && !savedTemplate?.validationError
    && !draftError
    && !dirty
    && !mutationsLocked;
  const useButton = getTemplateUseButtonPresentation(
    isCurrentTemplate,
    canUse,
    panel.working === 'use',
  );
  const visibleTemplates = filterInterviewEmailTemplatesByName(snapshot?.templates ?? [], query);

  const updateDraft = (field: keyof typeof panel.draft, value: string) => {
    updatePanel(current => updateTemplatePanelDraft(current, field, value));
  };

  const openDetail = (template: InterviewEmailTemplateDocument) => {
    updatePanel(current => openTemplatePanelDetail(current, template));
    setFocusedField(null);
  };

  const save = async (): Promise<boolean> => {
    const nextValidationError = getTemplateDraftValidationError(panelRef.current.draft);
    if (nextValidationError) {
      updatePanel(current => ({ ...current, validationError: nextValidationError }));
      return false;
    }

    const operationGeneration = ++operationGenerationRef.current;
    const pending = updatePanel(current => beginTemplatePanelMutation(current, 'save', operationGeneration));
    if (pending.working !== 'save') return false;
    try {
      const result = await executeTemplatePanelMutation(repository, pending);
      if (operationGeneration !== operationGenerationRef.current) return false;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, result));
      if ('snapshot' in result) onCountChange(result.snapshot.templates.length);
      return true;
    } catch (saveError) {
      if (operationGeneration !== operationGenerationRef.current) return false;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, { error: `Không thể lưu mẫu email: ${getErrorMessage(saveError)}` }));
      return false;
    }
  };

  const useTemplate = async () => {
    if (!savedTemplate || !canUse) return;
    const operationGeneration = ++operationGenerationRef.current;
    const pending = updatePanel(current => beginTemplatePanelMutation(current, 'use', operationGeneration));
    if (pending.working !== 'use') return;
    try {
      const result = await executeTemplatePanelMutation(repository, pending);
      if (operationGeneration !== operationGenerationRef.current) return;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, result));
      if ('snapshot' in result) onCountChange(result.snapshot.templates.length);
    } catch (useError) {
      if (operationGeneration !== operationGenerationRef.current) return;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, { error: `Không thể dùng mẫu email: ${getErrorMessage(useError)}` }));
    }
  };

  const deleteTemplate = async () => {
    if (!savedTemplate || !canDelete || !window.confirm(`Xóa mẫu email “${savedTemplate.name}”?`)) return;
    const operationGeneration = ++operationGenerationRef.current;
    const pending = updatePanel(current => beginTemplatePanelMutation(current, 'delete', operationGeneration));
    if (pending.working !== 'delete') return;
    try {
      const result = await executeTemplatePanelMutation(repository, pending);
      if (operationGeneration !== operationGenerationRef.current) return;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, result));
      if ('snapshot' in result) onCountChange(result.snapshot.templates.length);
    } catch (deleteError) {
      if (operationGeneration !== operationGenerationRef.current) return;
      updatePanel(current => settleTemplatePanelMutation(current, operationGeneration, { error: `Không thể xóa mẫu email: ${getErrorMessage(deleteError)}` }));
    }
  };

  const insertVariable = (token: string) => {
    if (!focusedField || panel.working) return;
    const input = focusedField === 'subject' ? subjectRef.current : bodyRef.current;
    if (!input) return;
    const result = insertTemplateTokenAtSelection(panel.draft[focusedField], input.selectionStart, input.selectionEnd, token);
    updateDraft(focusedField, result.value);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  if (panel.view.kind === 'list') {
    return (
      <div className="interview-template-panel" aria-label="Danh sách mẫu email phỏng vấn">
        <div className="interview-template-panel-header"><h2>Mẫu email phỏng vấn</h2></div>
        {loading && !snapshot && <div className="interview-template-empty">Đang tải mẫu email…</div>}
        {panel.loadStatus === 'error' ? (
          <InterviewEmailTemplateLoadError
            message={panel.error || 'Không thể tải mẫu email'}
            onRetry={() => { void refreshTemplates(); }}
          />
        ) : panel.error && <p className="interview-template-inline-error" role="alert">{panel.error}</p>}
        {visibleTemplates.map(template => (
          <button type="button" key={getInterviewEmailTemplateRowKey(template)} className={activeTemplateId === template.id ? 'interview-template-row is-active' : 'interview-template-row'} onClick={() => openDetail(template)}>
            <span className="interview-template-row-copy">
              <strong>{template.name || 'Mẫu email chưa đặt tên'}</strong>
              <span>{template.subject || 'Chưa có tiêu đề'}</span>
              <small>{toPreview(template.body) || 'Chưa có nội dung'}</small>
              {template.validationError && <em>{template.validationError}</em>}
            </span>
            {activeTemplateId === template.id && <span className="interview-template-badge">Đang sử dụng</span>}
          </button>
        ))}
        {!loading && snapshot?.templates.length === 0 && <div className="interview-template-empty">Chưa có mẫu email phỏng vấn</div>}
        {!loading && Boolean(snapshot?.templates.length) && visibleTemplates.length === 0 && <div className="interview-template-empty">Không tìm thấy mẫu email phù hợp</div>}
      </div>
    );
  }

  return (
    <section className="interview-template-panel interview-template-detail" aria-label="Chỉnh sửa mẫu email phỏng vấn">
      <div className="interview-template-detail-header">
        <button type="button" className="email-action-btn" disabled={panel.working !== null} onClick={() => updatePanel(current => current.working ? current : { ...current, view: { kind: 'list' } })}>Quay lại</button>
        <h2>{panel.view.kind === 'create' ? 'Tạo mẫu email' : 'Chi tiết mẫu email'}</h2>
      </div>

      <label className="interview-template-field"><span>Tên mẫu</span><input disabled={panel.working !== null} value={panel.draft.name} onChange={event => updateDraft('name', event.target.value)} /></label>
      <label className="interview-template-field"><span>Tiêu đề</span><input ref={subjectRef} disabled={panel.working !== null} value={panel.draft.subject} onFocus={() => setFocusedField('subject')} onChange={event => updateDraft('subject', event.target.value)} /></label>
      <label className="interview-template-field"><span>Nội dung</span><textarea ref={bodyRef} disabled={panel.working !== null} rows={12} value={panel.draft.body} onFocus={() => setFocusedField('body')} onChange={event => updateDraft('body', event.target.value)} /></label>

      <div className="interview-template-variables" aria-label="Biến email">
        <span>Chèn biến vào {focusedField === 'subject' ? 'tiêu đề' : focusedField === 'body' ? 'nội dung' : 'trường đang chọn'}:</span>
        {VARIABLES.map(variable => <button type="button" key={variable.token} className="email-action-btn" disabled={!focusedField || panel.working !== null} onClick={() => insertVariable(variable.token)}>{variable.label}</button>)}
      </div>

      {panel.loadStatus === 'error' ? (
        <InterviewEmailTemplateLoadError
          message={panel.error || 'Không thể tải mẫu email'}
          onRetry={() => { void refreshTemplates(); }}
        />
      ) : (panel.validationError || panel.error) && (
        <p className="interview-template-inline-error" role="alert">{panel.validationError || panel.error}</p>
      )}
      {savedTemplate?.validationError && <p className="interview-template-inline-error" role="status">Mẫu hiện tại: {savedTemplate.validationError}</p>}
      {dirty && <p className="interview-template-dirty">Bạn có thay đổi chưa lưu.</p>}

      <div className="interview-template-actions">
        <button type="button" className="email-action-btn is-primary" disabled={mutationsLocked} onClick={() => { void save(); }}>{panel.working === 'save' ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
        {panel.view.kind === 'detail' && <button type="button" className={useButton.className} disabled={useButton.disabled} onClick={() => { void useTemplate(); }}>{useButton.label}</button>}
        {panel.view.kind === 'detail' && canDelete && <button type="button" className="email-action-btn is-danger" disabled={mutationsLocked} onClick={() => { void deleteTemplate(); }}>{panel.working === 'delete' ? 'Đang xóa…' : 'Xóa mẫu'}</button>}
      </div>
    </section>
  );
}
