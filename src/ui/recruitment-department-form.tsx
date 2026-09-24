import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';

interface RecruitmentDepartmentFormProps {
  departmentName: string;
  isLoading: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RecruitmentDepartmentForm({
  departmentName,
  isLoading,
  isSaving,
  onCancel,
  onNameChange,
  onSubmit,
}: RecruitmentDepartmentFormProps) {
  return (
    <form className="recruitment-department-form" onSubmit={onSubmit}>
      <input
        aria-label="Tên phòng ban"
        value={departmentName}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Nhập tên phòng ban"
        maxLength={100}
        autoFocus
        required
      />
      <button
        type="submit"
        className="recruitment-department-submit"
        disabled={isLoading || isSaving || !departmentName.trim()}
      >
        {isSaving ? 'Đang lưu…' : 'Lưu phòng ban'}
      </button>
      <button type="button" onClick={onCancel} disabled={isSaving}>
        Hủy
      </button>
    </form>
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
  const requestClose = () => {
    if (!isSaving) onCancel();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') requestClose();
  };

  return (
    <div
      className="recruitment-department-modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <section
        className="recruitment-department-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-department-title"
      >
        <header className="recruitment-department-modal-heading">
          <div>
            <span>PHÒNG BAN</span>
            <h3 id="rename-department-title">Đổi tên phòng ban</h3>
          </div>
          <button type="button" onClick={requestClose} disabled={isSaving} aria-label="Đóng modal đổi tên">×</button>
        </header>

        <form className="recruitment-department-rename-form" onSubmit={onSubmit}>
          <p className="recruitment-department-current-name">
            <span>Tên hiện tại</span>
            <strong>{currentDepartmentName}</strong>
          </p>
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
          {errorMessage && <p className="recruitment-department-modal-error" role="alert">{errorMessage}</p>}
          <div className="recruitment-department-modal-actions">
            <button type="button" onClick={requestClose} disabled={isSaving}>Hủy</button>
            <button type="submit" disabled={isSaving || !departmentName.trim()}>
              {isSaving ? 'Đang lưu…' : 'Lưu tên'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
