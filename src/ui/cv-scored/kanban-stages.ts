export type CVKanbanColumn = {
  status: string;
  label: string;
  color: string;
};

const NEW_LIST_COLUMNS: CVKanbanColumn[] = [
  { status: '02_Loai_CV', label: 'Loại', color: '#ef4444' },
  { status: '03_Tiem_Nang', label: 'Tiềm năng', color: '#22c55e' },
  { status: '05_Moi_Phong_Van', label: 'Mời phỏng vấn', color: '#eab308' },
  { status: '06_Sai_JD', label: 'Sai JD', color: '#f59e0b' },
  { status: '07_Chua_Phong_Van', label: 'Chưa phỏng vấn', color: '#06b6d4' },
  { status: '08_Da_Phong_Van', label: 'Đã phỏng vấn', color: '#ec4899' },
  { status: '09_CV_Cu', label: 'CV cũ', color: '#9ca3af' },
];

const LEGACY_LIST_COLUMNS: CVKanbanColumn[] = [
  ...NEW_LIST_COLUMNS.slice(0, 4),
  { status: '07_CV_Cu', label: 'CV cũ', color: '#9ca3af' },
];

export function getCVColumnsForStages(stagesMap: Record<string, string>): CVKanbanColumn[] {
  return Object.values(stagesMap).includes('09_CV_Cu')
    ? NEW_LIST_COLUMNS
    : LEGACY_LIST_COLUMNS;
}

export function getInterviewPendingStageId(stagesMap: Record<string, string>): string | undefined {
  return Object.keys(stagesMap).find((stageId) => stagesMap[stageId] === '07_Chua_Phong_Van');
}

export function getCVColumnLabel(stagesMap: Record<string, string>, status: string): string | undefined {
  return getCVColumnsForStages(stagesMap).find((column) => column.status === status)?.label;
}

export function canShowInviteMailButton(status: string, isInviteSent: boolean): boolean {
  return status === '05_Moi_Phong_Van' || (status === '07_Chua_Phong_Van' && isInviteSent);
}
