import { StudioPageHeader } from './studio/StudioPrimitives';

type JDChatbotHeaderProps = {
  busy: boolean;
  canSave: boolean;
  isSaving: boolean;
  onOpenLibrary: () => void;
  onCreateNew: () => void;
  onSave: () => void;
};

export function JDChatbotHeader({
  busy,
  canSave,
  isSaving,
  onOpenLibrary,
  onCreateNew,
  onSave,
}: JDChatbotHeaderProps) {
  return (
    <StudioPageHeader
      className="jd-studio-page-header"
      eyebrow="TUYỂN DỤNG"
      title="Trợ lý JD"
      description="Soạn và chỉnh sửa mô tả công việc cùng AI."
      actions={<>
        <button type="button" className="studio-button" onClick={onOpenLibrary} disabled={busy}>
          Thư viện JD
        </button>
        <button type="button" className="studio-button" onClick={onCreateNew} disabled={busy}>
          Tạo mới
        </button>
        <button
          type="button"
          className="studio-button studio-button--primary"
          onClick={onSave}
          disabled={!canSave || busy || isSaving}
        >
          {isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </>}
    />
  );
}
