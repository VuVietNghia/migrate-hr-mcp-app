import type { AppTab } from './studio-navigation';

export interface StudioJDReference {
  fileId: string;
  fileName: string;
}

export interface StudioNavigationIntent {
  sequence: number;
  target: AppTab;
  jd?: StudioJDReference;
}

export function nextStudioNavigationIntent(
  previous: StudioNavigationIntent | null,
  target: AppTab,
  context?: Pick<StudioNavigationIntent, 'jd'>,
): StudioNavigationIntent {
  return {
    sequence: (previous?.sequence ?? 0) + 1,
    target,
    ...(context?.jd ? { jd: context.jd } : {}),
  };
}

export function resolveIntentJD<T extends { _id: string; name: string }>(
  intent: StudioNavigationIntent | null,
  target: AppTab,
  files: readonly T[],
): T | undefined {
  if (!intent?.jd || intent.target !== target) return undefined;
  return files.find((file) => file._id === intent.jd?.fileId)
    ?? files.find((file) => file.name === intent.jd?.fileName);
}
