export interface EmployeeProfile {
  _id: string;
  name: string;
  status: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  startDate?: string;
  sourceCandidateId?: string;
  attachedFileObj?: any;
  /** Bóc từ `[fileId:...]` trong description của item. */
  attachedFileId?: string;
  /** Bóc từ `[fileUrl:...]` trong description của item. */
  attachedFileUrl?: string;
  /** Description thô của item, giữ lại để lúc sửa không xoá mất phần chữ mà app không sở hữu. */
  rawDescription?: string;
}

export interface KanbanColumnDef {
  status: string;
  label: string;
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { status: 'Mới nhận việc', label: 'Đang chờ hoàn thiện hồ sơ', color: '#f59e0b' },
  { status: 'Đang thử việc', label: 'Đang thử việc', color: '#3b82f6' },
  { status: 'Chính thức', label: 'Nhân viên chính thức', color: '#10b981' },
  { status: 'Nghỉ việc', label: 'Đã nghỉ việc', color: '#ef4444' },
];

export interface PassedCandidate {
  _id: string;
  name: string;
  listName: string;
  listId: string;
  score?: number;
  category?: string;
  stageName?: string;
  reason?: string;
  position?: string;
  email?: string;
  phone?: string;
}

/** Các trường của một hồ sơ được đồng bộ ngược từ file Markdown vào item trong list. */
export interface UpdateProfileFieldsInput {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  startDate?: string;
  sourceCandidateId?: string;
  attachedFileId?: string;
  attachedFileUrl?: string;
  /** File object lưu trong custom field DOCUMENT. */
  attachedFileObj?: unknown;
  /** Description hiện tại của item; phần chữ không phải marker trong đó được giữ nguyên. */
  existingDescription?: string;
}

export interface ILifecycleService {
  loadProfiles(roomId: string): Promise<EmployeeProfile[]>;
  loadPassedCandidates(roomId: string): Promise<PassedCandidate[]>;
  createProfile(roomId: string, data: Omit<EmployeeProfile, '_id' | 'status'> & { attachedFileObj?: any }): Promise<EmployeeProfile>;
  updateProfileStatus(roomId: string, profileId: string, newStatus: string): Promise<void>;
  updateProfileFields(roomId: string, profileId: string, data: UpdateProfileFieldsInput): Promise<void>;
}
