import {
  renderInterviewEmailTemplate,
  type InterviewEmailTemplateDocument,
  type InterviewEmailTemplateVariables,
  type RenderedInterviewEmailTemplate,
} from '../email-templates/interview-email-template';
import type { IInterviewEmailTemplateRepository } from '../email-templates/interview-email-template-repository';

export type ActiveTemplateRepository = Pick<IInterviewEmailTemplateRepository,
  'ensureInitialized' | 'getActiveTemplate'>;

export interface InviteTemplateLoadState {
  activeTemplate: InterviewEmailTemplateDocument | null;
  loadedRepository: ActiveTemplateRepository | null;
  loading: boolean;
  error: string | null;
}

export function createInviteTemplateLoadState(): InviteTemplateLoadState {
  return {
    activeTemplate: null,
    loadedRepository: null,
    loading: false,
    error: null,
  };
}

export async function loadActiveInviteTemplate(
  repository: ActiveTemplateRepository,
  isCurrent: () => boolean,
  updateState: (state: InviteTemplateLoadState) => void,
): Promise<void> {
  updateState({ activeTemplate: null, loadedRepository: null, loading: true, error: null });
  try {
    await repository.ensureInitialized();
    const activeTemplate = await repository.getActiveTemplate();
    if (isCurrent()) {
      updateState({ activeTemplate, loadedRepository: repository, loading: false, error: null });
    }
  } catch (error) {
    if (isCurrent()) {
      updateState({
        activeTemplate: null,
        loadedRepository: null,
        loading: false,
        error: `Không thể tải mẫu email phỏng vấn: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export function renderActiveInviteTemplate(
  template: InterviewEmailTemplateDocument,
  variables: InterviewEmailTemplateVariables,
): RenderedInterviewEmailTemplate {
  return renderInterviewEmailTemplate(template, variables);
}

export function canSendInviteWithTemplate(
  state: InviteTemplateLoadState,
  currentRepository: ActiveTemplateRepository | null,
): boolean {
  return !state.loading
    && state.error === null
    && state.activeTemplate !== null
    && state.loadedRepository === currentRepository;
}
