type JDChatbotHeaderProps = {
  busy: boolean;
  onOpenLibrary: () => void;
  onCreateNew: () => void;
};

export function JDChatbotHeader({ busy, onOpenLibrary, onCreateNew }: JDChatbotHeaderProps) {
  return (
    <header className="jd-chatbot-page-header">
      <div>
        <h1>Chỉnh sửa JD</h1>
        <p>Soạn, xem và tinh chỉnh JD cùng AI.</p>
      </div>
      <div className="jd-chatbot-header-actions">
        <button
          className="jd-chatbot-library-trigger"
          onClick={onOpenLibrary}
          disabled={busy}
        >
          Danh sách JD
        </button>
        <button
          className="jd-chatbot-preview-badge"
          onClick={onCreateNew}
          disabled={busy}
        >
          Tạo JD mới
        </button>
      </div>
    </header>
  );
}
