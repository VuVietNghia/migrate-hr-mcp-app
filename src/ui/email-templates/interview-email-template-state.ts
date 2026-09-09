import type { InterviewEmailTemplateDocument } from './interview-email-template';
import type {
  IInterviewEmailTemplateRepository,
  InterviewEmailTemplateSnapshot,
} from './interview-email-template-repository';

export interface TemplateDraftFields {
  name: string;
  subject: string;
  body: string;
}

export interface TemplateDraftIdentity extends TemplateDraftFields {
  id: string;
  fileId: string;
  fileName: string;
}

export type TemplatePanelView =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'detail'; fileId: string; fileName: string };

export type TemplatePanelMutation = 'save' | 'use' | 'delete';
export type TemplatePanelLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TemplatePanelState {
  snapshot: InterviewEmailTemplateSnapshot | null;
  view: TemplatePanelView;
  draft: TemplateDraftIdentity;
  working: TemplatePanelMutation | null;
  error: string | null;
  validationError: string | null;
  loadStatus: TemplatePanelLoadStatus;
  loadGeneration: number;
  mutationGeneration: number;
  pendingMutation: {
    kind: TemplatePanelMutation;
    previousSnapshot: InterviewEmailTemplateSnapshot | null;
  } | null;
}

export type TemplateMutationResult =
  | { snapshot: InterviewEmailTemplateSnapshot }
  | { error: string };

export type TemplatePanelLoadResult =
  | { snapshot: InterviewEmailTemplateSnapshot }
  | { error: string };

function createBlankDraft(): TemplateDraftIdentity {
  return { id: '', fileId: '', fileName: '', name: '', subject: '', body: '' };
}

function toDraft(template: InterviewEmailTemplateDocument): TemplateDraftIdentity {
  return {
    id: template.id,
    fileId: template.fileId,
    fileName: template.fileName,
    name: template.name,
    subject: template.subject,
    body: template.body,
  };
}

export function createTemplatePanelState(snapshot: InterviewEmailTemplateSnapshot | null = null): TemplatePanelState {
  return {
    snapshot,
    view: { kind: 'list' },
    draft: createBlankDraft(),
    working: null,
    error: null,
    validationError: null,
    loadStatus: snapshot ? 'ready' : 'idle',
    loadGeneration: 0,
    mutationGeneration: 0,
    pendingMutation: null,
  };
}

export function openTemplatePanelCreate(state: TemplatePanelState): TemplatePanelState {
  if (state.working) return state;
  return { ...state, view: { kind: 'create' }, draft: createBlankDraft(), error: null, validationError: null };
}

export function openTemplatePanelDetail(
  state: TemplatePanelState,
  template: InterviewEmailTemplateDocument,
): TemplatePanelState {
  if (state.working) return state;
  return {
    ...state,
    view: { kind: 'detail', fileId: template.fileId, fileName: template.fileName },
    draft: toDraft(template),
    error: null,
    validationError: null,
  };
}

export function updateTemplatePanelDraft(
  state: TemplatePanelState,
  field: keyof TemplateDraftIdentity,
  value: string,
): TemplatePanelState {
  if (state.working) return state;
  return { ...state, draft: { ...state.draft, [field]: value }, error: null, validationError: null };
}

export function beginTemplatePanelMutation(
  state: TemplatePanelState,
  kind: TemplatePanelMutation,
  generation = state.mutationGeneration + 1,
): TemplatePanelState {
  if (state.working || state.loadStatus !== 'ready') return state;
  return {
    ...state,
    working: kind,
    error: null,
    mutationGeneration: generation,
    pendingMutation: { kind, previousSnapshot: state.snapshot },
  };
}

export function invalidateTemplatePanelMutations(state: TemplatePanelState): TemplatePanelState {
  return {
    ...state,
    working: null,
    pendingMutation: null,
    mutationGeneration: state.mutationGeneration + 1,
  };
}

export function beginTemplatePanelLoad(
  state: TemplatePanelState,
  generation = state.loadGeneration + 1,
): TemplatePanelState {
  const invalidated = invalidateTemplatePanelMutations(state);
  return {
    ...invalidated,
    loadStatus: 'loading',
    loadGeneration: generation,
    error: null,
  };
}

export function settleTemplatePanelLoad(
  state: TemplatePanelState,
  generation: number,
  result: TemplatePanelLoadResult,
): TemplatePanelState {
  if (state.loadStatus !== 'loading' || generation !== state.loadGeneration) return state;
  if ('error' in result) {
    return { ...state, loadStatus: 'error', error: result.error };
  }
  return {
    ...state,
    snapshot: result.snapshot,
    loadStatus: 'ready',
    error: null,
  };
}

function areTemplateSnapshotsEqual(
  left: InterviewEmailTemplateSnapshot | null,
  right: InterviewEmailTemplateSnapshot,
): boolean {
  if (!left || left.activeTemplateId !== right.activeTemplateId || left.templates.length !== right.templates.length) {
    return false;
  }
  return left.templates.every((template, index) => {
    const other = right.templates[index];
    return template.id === other.id
      && template.fileId === other.fileId
      && template.fileName === other.fileName
      && template.name === other.name
      && template.subject === other.subject
      && template.body === other.body
      && template.validationError === other.validationError;
  });
}

export function reconcileTemplatePanelSnapshot(
  state: TemplatePanelState,
  snapshot: InterviewEmailTemplateSnapshot,
): TemplatePanelState {
  if (state.working) return state;
  if (areTemplateSnapshotsEqual(state.snapshot, snapshot)) {
    const openedTemplateIsMissing = state.view.kind === 'detail'
      && !findTemplateByFileIdentity(snapshot.templates, state.view);
    return state.error && !openedTemplateIsMissing ? { ...state, error: null } : state;
  }

  const refreshed = { ...state, snapshot, loadStatus: 'ready' as const, error: null };
  if (state.view.kind !== 'detail') return refreshed;

  const previousTemplate = state.snapshot
    ? findTemplateByFileIdentity(state.snapshot.templates, state.view)
    : undefined;
  const nextTemplate = findTemplateByFileIdentity(snapshot.templates, state.view);
  const draftIsDirty = previousTemplate
    ? isTemplateDraftDirty(state.draft, toDraft(previousTemplate))
    : true;
  if (!nextTemplate) {
    if (draftIsDirty) {
      return {
        ...refreshed,
        error: 'Mẫu email nguồn đã bị xóa khỏi Room Files. Bản nháp chưa lưu vẫn được giữ lại.',
      };
    }
    return { ...refreshed, view: { kind: 'list' }, draft: createBlankDraft() };
  }

  return draftIsDirty ? refreshed : {
    ...refreshed,
    view: { kind: 'detail', fileId: nextTemplate.fileId, fileName: nextTemplate.fileName },
    draft: toDraft(nextTemplate),
  };
}

export function settleTemplatePanelMutation(
  state: TemplatePanelState,
  generation: number,
  result: TemplateMutationResult,
): TemplatePanelState {
  if (generation !== state.mutationGeneration || !state.pendingMutation) return state;
  if ('error' in result) {
    return { ...state, working: null, pendingMutation: null, error: result.error };
  }

  const { kind, previousSnapshot } = state.pendingMutation;
  const nextSnapshot = result.snapshot;
  const settled: TemplatePanelState = {
    ...state,
    snapshot: nextSnapshot,
    working: null,
    pendingMutation: null,
    error: null,
  };

  if (kind === 'delete') {
    return { ...settled, view: { kind: 'list' }, draft: createBlankDraft() };
  }
  if (kind !== 'save') return settled;

  const saved = state.view.kind === 'create'
    ? findCreatedTemplate(previousSnapshot, nextSnapshot)
    : state.view.kind === 'detail'
      ? findTemplateByFileIdentity(nextSnapshot.templates, state.view)
      : undefined;
  return saved
    ? { ...settled, view: { kind: 'detail', fileId: saved.fileId, fileName: saved.fileName }, draft: toDraft(saved) }
    : settled;
}

export function findTemplateByFileIdentity(
  templates: InterviewEmailTemplateDocument[],
  identity: { fileId: string; fileName: string },
): InterviewEmailTemplateDocument | undefined {
  return templates.find(template => template.fileName === identity.fileName)
    ?? templates.find(template => template.fileId === identity.fileId);
}

export function findCreatedTemplate(
  previousSnapshot: InterviewEmailTemplateSnapshot | null,
  nextSnapshot: InterviewEmailTemplateSnapshot,
): InterviewEmailTemplateDocument | undefined {
  if (!previousSnapshot) return undefined;
  const previousFileNames = new Set(previousSnapshot.templates.map(template => template.fileName));
  const previousFileIds = new Set(previousSnapshot.templates.map(template => template.fileId));
  return nextSnapshot.templates.find(template => (
    !previousFileNames.has(template.fileName)
    && (!template.fileId || !previousFileIds.has(template.fileId))
  ));
}

type TemplatePanelRepository = Pick<IInterviewEmailTemplateRepository,
  'ensureInitialized' | 'createTemplate' | 'saveTemplate' | 'setActiveTemplate' | 'deleteTemplate'>;

export async function loadTemplatePanelSnapshot(
  repository: TemplatePanelRepository | null,
  active: boolean,
  category: 'cv_scored' | 'lifecycle',
): Promise<InterviewEmailTemplateSnapshot | null> {
  if (!active || category !== 'cv_scored') return null;
  if (!repository) throw new Error('Interview email template repository is unavailable');
  return repository.ensureInitialized();
}

export async function executeTemplatePanelMutation(
  repository: TemplatePanelRepository,
  state: TemplatePanelState,
): Promise<TemplateMutationResult> {
  const mutation = state.pendingMutation;
  if (!mutation) throw new Error('Template mutation is not pending');

  if (mutation.kind === 'save') {
    if (state.view.kind === 'create') {
      return { snapshot: await repository.createTemplate({
        name: state.draft.name.trim(),
        subject: state.draft.subject,
        body: state.draft.body,
      }) };
    }
    if (state.view.kind === 'detail') {
      return { snapshot: await repository.saveTemplate(state.draft.fileName, {
        id: state.draft.id,
        name: state.draft.name.trim(),
        subject: state.draft.subject,
        body: state.draft.body,
      }) };
    }
    throw new Error('Cannot save a template from the list view');
  }

  if (mutation.kind === 'use') {
    return { snapshot: await repository.setActiveTemplate(state.draft.id) };
  }
  return { snapshot: await repository.deleteTemplate({
    fileId: state.draft.fileId,
    fileName: state.draft.fileName,
  }) };
}

export function canCreateInterviewTemplate(
  active: boolean,
  sourceFilter: 'all' | 'cv_scored' | 'lifecycle',
  hasRepository: boolean,
  templateReady: boolean,
): boolean {
  return active && sourceFilter === 'cv_scored' && hasRepository && templateReady;
}

function normalizeTemplateSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function filterInterviewEmailTemplatesByName(
  templates: InterviewEmailTemplateDocument[],
  query: string,
): InterviewEmailTemplateDocument[] {
  const normalizedQuery = normalizeTemplateSearchText(query);
  if (!normalizedQuery) return templates;
  return templates.filter(template => normalizeTemplateSearchText(template.name).includes(normalizedQuery));
}

export interface TemplateUseButtonPresentation {
  label: string;
  disabled: boolean;
  className: string;
}

export function getTemplateUseButtonPresentation(
  active: boolean,
  canUse: boolean,
  applying: boolean,
): TemplateUseButtonPresentation {
  if (active) {
    return {
      label: 'Đang sử dụng',
      disabled: true,
      className: 'email-action-btn is-current-template',
    };
  }
  return {
    label: applying ? 'Đang áp dụng…' : 'Sử dụng mẫu',
    disabled: !canUse,
    className: 'email-action-btn',
  };
}

export function canDeleteTemplate(
  template: InterviewEmailTemplateDocument,
  snapshot: InterviewEmailTemplateSnapshot,
): boolean {
  if (snapshot.activeTemplateId === template.id) return false;
  const validTemplateCount = snapshot.templates.filter(item => item.validationError === null).length;
  return template.validationError !== null || validTemplateCount > 1;
}

export function getInterviewEmailTemplateRowKey(template: InterviewEmailTemplateDocument): string {
  return template.fileId || template.fileName;
}

export function getTemplatePanelMode(category: 'cv_scored' | 'lifecycle'): 'templates' | 'lifecycle-empty' {
  return category === 'lifecycle' ? 'lifecycle-empty' : 'templates';
}

export function getEmailMailboxContentMode(
  filter: 'all' | 'sent' | 'failed' | 'templates',
  sourceFilter: 'all' | 'cv_scored' | 'lifecycle',
  hasRepository: boolean,
): 'history' | 'interview-templates' | 'lifecycle-empty' | 'template-unavailable' {
  if (filter !== 'templates') return 'history';
  if (sourceFilter === 'lifecycle') return 'lifecycle-empty';
  return hasRepository ? 'interview-templates' : 'template-unavailable';
}

export interface TemplateTokenInsertion {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function insertTemplateTokenAtSelection(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  token: string,
): TemplateTokenInsertion {
  const start = Math.max(0, Math.min(value.length, selectionStart ?? value.length));
  const end = Math.max(0, Math.min(value.length, selectionEnd ?? start));
  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);
  const nextValue = `${value.slice(0, rangeStart)}${token}${value.slice(rangeEnd)}`;
  const nextSelection = rangeStart + token.length;

  return { value: nextValue, selectionStart: nextSelection, selectionEnd: nextSelection };
}

export function getTemplateDraftValidationError(draft: TemplateDraftFields): string | null {
  if (!draft.name.trim()) return 'Tên mẫu không được để trống.';
  if (!draft.subject.trim()) return 'Tiêu đề không được để trống.';
  if (!draft.body.trim()) return 'Nội dung không được để trống.';
  return null;
}

export function isTemplateDraftDirty(
  draft: TemplateDraftIdentity,
  saved: TemplateDraftIdentity,
): boolean {
  return draft.name !== saved.name || draft.subject !== saved.subject || draft.body !== saved.body;
}
