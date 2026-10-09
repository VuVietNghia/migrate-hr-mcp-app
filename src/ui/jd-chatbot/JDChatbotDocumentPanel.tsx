import { CompanyMarkdownPreview } from '../company/CompanyMarkdownPreview';
import {
  buildJDChangeRows,
  JD_DOCUMENT_MODES,
  type JDDocumentMode,
} from '../jd-chatbot-view-model';
import { StudioInlineState } from '../studio/StudioPrimitives';

type SaveMessage = { type: 'success' | 'error'; text: string } | null;

export interface JDChatbotDocumentPanelProps {
  mode: JDDocumentMode;
  onModeChange: (mode: JDDocumentMode) => void;
  fileName: string | null;
  draft: string;
  saved: string;
  loading: boolean;
  loadError: string | null;
  isSaving: boolean;
  saveMessage: SaveMessage;
  onDraftChange: (value: string) => void;
  onOpenLibrary: () => void;
  onRestore: () => void;
  onSave: () => void;
}

function getDocumentStatus(fileName: string | null, draft: string, saved: string, loading: boolean) {
  if (loading) return 'Đang tải';
  if (!fileName) return draft ? 'Bản nháp' : 'Chưa có nội dung';
  return draft === saved ? 'Đã lưu' : 'Có thay đổi chưa lưu';
}

export function JDChatbotDocumentPanel({
  mode,
  onModeChange,
  fileName,
  draft,
  saved,
  loading,
  loadError,
  isSaving,
  saveMessage,
  onDraftChange,
  onOpenLibrary,
  onRestore,
  onSave,
}: JDChatbotDocumentPanelProps) {
  const changed = draft !== saved;
  const canSave = Boolean(fileName && draft.trim() && changed && !loading && !isSaving);
  const rows = mode === 'changes' ? buildJDChangeRows(saved, draft) : [];
  const hasChangedRows = rows.some((row) => row.changed);

  return (
    <section className="jd-studio-document-card" aria-label="Nội dung JD">
      <header className="jd-studio-document-toolbar">
        <span className="jd-studio-format-badge">MD</span>
        <div className="jd-studio-document-heading">
          <h2>{fileName || 'Bản mô tả công việc mới'}</h2>
          <span>{getDocumentStatus(fileName, draft, saved, loading)}</span>
        </div>
      </header>

      <div className="jd-studio-document-controls">
        <div className="jd-studio-document-tabs" aria-label="Chế độ nội dung JD">
          {JD_DOCUMENT_MODES.map((item) => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onModeChange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <span className="jd-studio-character-count">{draft.length.toLocaleString('vi-VN')} ký tự</span>
      </div>

      <div className="jd-studio-document-body">
        {loading ? (
          <div className="jd-studio-document-state" role="status">Đang tải nội dung JD…</div>
        ) : loadError ? (
          <StudioInlineState tone="danger">{loadError}</StudioInlineState>
        ) : !draft ? (
          <div className="jd-studio-document-empty">
            <span className="jd-studio-empty-icon" aria-hidden="true">✦</span>
            <h3>JD tiếp theo bắt đầu từ đây.</h3>
            <p>Chọn một JD có sẵn hoặc trao đổi với trợ lý để tạo bản mô tả mới.</p>
            <button type="button" className="studio-button studio-button--small" onClick={onOpenLibrary}>Mở thư viện JD</button>
          </div>
        ) : mode === 'manual' ? (
          <textarea
            className="jd-studio-manual-editor"
            aria-label="Chỉnh sửa nội dung JD"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            disabled={loading || isSaving}
          />
        ) : mode === 'changes' ? (
          <div className="jd-studio-change-view">
            <StudioInlineState tone="success">Các dòng được thêm hoặc thay đổi có nền xanh.</StudioInlineState>
            {!hasChangedRows ? <p className="jd-studio-no-changes">Nội dung hiện tại khớp với bản đã lưu.</p> : null}
            <pre aria-label="Các thay đổi trong JD">
              {rows.map((row) => (
                <span key={row.index} className={`jd-studio-change-row${row.changed ? ' is-changed' : ''}`}>
                  {row.text || '\u00a0'}
                  {'\n'}
                </span>
              ))}
            </pre>
          </div>
        ) : (
          <CompanyMarkdownPreview content={draft} />
        )}
      </div>

      {saveMessage ? (
        <StudioInlineState tone={saveMessage.type === 'success' ? 'success' : 'danger'}>{saveMessage.text}</StudioInlineState>
      ) : null}

      <footer className="jd-studio-document-footer">
        <button type="button" className="studio-button" onClick={onRestore} disabled={!fileName || !changed || loading || isSaving}>
          Khôi phục chỉnh sửa
        </button>
        <button type="button" className="studio-button studio-button--primary" onClick={onSave} disabled={!canSave}>
          {isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </footer>
    </section>
  );
}
