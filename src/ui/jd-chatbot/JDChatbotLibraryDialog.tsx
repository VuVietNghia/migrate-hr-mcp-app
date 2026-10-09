import type { CVFile } from '../pipeline-service';
import { StudioDialog, StudioSearchInput } from '../studio/StudioPrimitives';

export interface JDChatbotLibraryDialogProps {
  open: boolean;
  files: CVFile[];
  selectedId: string | null;
  searchValue: string;
  refreshing: boolean;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onSelect: (file: CVFile) => void;
}

export function JDChatbotLibraryDialog({
  open,
  files,
  selectedId,
  searchValue,
  refreshing,
  onClose,
  onSearchChange,
  onRefresh,
  onSelect,
}: JDChatbotLibraryDialogProps) {
  return (
    <StudioDialog
      open={open}
      title="Thư viện JD"
      onClose={onClose}
      className="jd-studio-library-dialog"
      actions={(
        <button type="button" className="studio-button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Đang làm mới…' : 'Làm mới'}
        </button>
      )}
    >
      <StudioSearchInput
        label="Tìm JD"
        placeholder="Tìm theo tên JD"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="jd-studio-library-list">
        {files.length ? files.map((file) => (
          <button
            type="button"
            key={file._id}
            className="jd-studio-library-item"
            aria-current={selectedId === file._id || undefined}
            onClick={() => onSelect(file)}
          >
            <span className="jd-studio-format-badge">MD</span>
            <span>{file.name}</span>
          </button>
        )) : (
          <p className="jd-studio-library-empty">Không tìm thấy JD Markdown phù hợp.</p>
        )}
      </div>
    </StudioDialog>
  );
}
