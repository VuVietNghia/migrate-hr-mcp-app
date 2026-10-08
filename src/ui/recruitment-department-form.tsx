import type { FormEvent } from 'react';

import { StudioDialog, StudioInlineState } from './studio/StudioPrimitives';

interface RecruitmentDepartmentFormProps {
  departmentName: string;
  errorMessage: string;
  isLoading: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RecruitmentDepartmentForm({
  departmentName,
  errorMessage,
  isLoading,
  isSaving,
  onCancel,
  onNameChange,
  onSubmit,
}: RecruitmentDepartmentFormProps) {
  return (
    <StudioDialog open title="Tạo phòng ban" onClose={() => { if (!isSaving) onCancel(); }} className="recruitment-department-dialog">
      <form className="recruitment-department-form" onSubmit={onSubmit}>
        <label>
          <span>Tên phòng ban</span>
          <input
            aria-label="Tên phòng ban"
            value={departmentName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nhập tên phòng ban"
            maxLength={100}
            autoFocus
            required
          />
        </label>
        {errorMessage ? <StudioInlineState tone="danger">{errorMessage}</StudioInlineState> : null}
        <div className="recruitment-department-dialog__actions">
          <button type="button" className="studio-button studio-button--secondary" onClick={onCancel} disabled={isSaving}>Hủy</button>
          <button type="submit" className="studio-button studio-button--primary" disabled={isLoading || isSaving || !departmentName.trim()}>
            {isSaving ? 'Đang lưu…' : 'Lưu phòng ban'}
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}

interface RecruitmentDepartmentRenameFormProps {
  currentDepartmentName: string;
  departmentName: string;
  errorMessage: string;
  isSaving: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RecruitmentDepartmentRenameForm({
  currentDepartmentName,
  departmentName,
  errorMessage,
  isSaving,
  onCancel,
  onNameChange,
  onSubmit,
}: RecruitmentDepartmentRenameFormProps) {
  return (
    <StudioDialog open title="Đổi tên phòng ban" onClose={() => { if (!isSaving) onCancel(); }} className="recruitment-department-dialog">
      <form className="recruitment-department-form" onSubmit={onSubmit}>
        <label>
          <span>Tên hiện tại</span>
          <input
            aria-label="Tên phòng ban hiện tại"
            value={currentDepartmentName}
            readOnly
          />
        </label>
        <label>
          <span>Tên mới</span>
          <input
            aria-label="Tên phòng ban mới"
            value={departmentName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nhập tên phòng ban mới"
            maxLength={100}
            autoFocus
            required
          />
        </label>
        {errorMessage ? <StudioInlineState tone="danger">{errorMessage}</StudioInlineState> : null}
        <div className="recruitment-department-dialog__actions">
          <button type="button" className="studio-button studio-button--secondary" onClick={onCancel} disabled={isSaving}>Hủy</button>
          <button type="submit" className="studio-button studio-button--primary" disabled={isSaving || !departmentName.trim()}>
            {isSaving ? 'Đang lưu…' : 'Lưu tên'}
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}
