export interface CompanyPreviewState {
  documentId: string | null;
  requestId: number;
  loading: boolean;
  text: string | null;
  blob: Blob | null;
  error: string | null;
}

export function createCompanyPreviewState(): CompanyPreviewState {
  return {
    documentId: null,
    requestId: 0,
    loading: false,
    text: null,
    blob: null,
    error: null,
  };
}

export function beginCompanyPreview(
  state: CompanyPreviewState,
  documentId: string,
): { state: CompanyPreviewState; requestId: number } {
  const requestId = state.requestId + 1;
  return {
    requestId,
    state: {
      documentId,
      requestId,
      loading: true,
      text: null,
      blob: null,
      error: null,
    },
  };
}

export function settleCompanyPreview(
  state: CompanyPreviewState,
  requestId: number,
  result: { text?: string; blob?: Blob; error?: string },
): CompanyPreviewState {
  if (state.requestId !== requestId || !state.documentId) return state;
  return {
    ...state,
    loading: false,
    text: result.text ?? null,
    blob: result.blob ?? null,
    error: result.error ?? null,
  };
}

export function closeCompanyPreview(state: CompanyPreviewState): CompanyPreviewState {
  return {
    documentId: null,
    requestId: state.requestId + 1,
    loading: false,
    text: null,
    blob: null,
    error: null,
  };
}
