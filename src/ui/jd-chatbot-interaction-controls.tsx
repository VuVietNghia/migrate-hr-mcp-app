type JDChatbotCompanyOptionProps = {
  busy: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function JDChatbotCompanyOption({ busy, checked, onChange }: JDChatbotCompanyOptionProps) {
  return (
    <label className={`jd-chatbot-company-option${busy ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={busy}
      />
      Thêm thông tin công ty vào JD
    </label>
  );
}

type JDChatbotComposerProps = {
  busy: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function JDChatbotComposer({ busy, input, onInputChange, onSend }: JDChatbotComposerProps) {
  return (
    <div className="jd-chatbot-composer">
      <input
        className="jd-chatbot-chat-input"
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && onSend()}
        placeholder="Nhập yêu cầu tạo hoặc chỉnh sửa JD…"
        disabled={busy}
      />
      <button onClick={onSend} disabled={busy || !input.trim()}>Gửi</button>
    </div>
  );
}

type JDChatbotEditButtonProps = {
  busy: boolean;
  editing: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function JDChatbotEditButton({ busy, editing, disabled, onClick }: JDChatbotEditButtonProps) {
  const label = editing ? 'Thoát chỉnh sửa JD' : 'Sửa JD thủ công';
  const content = editing ? 'Thoát' : '✎';

  if (busy) {
    return (
      <span
        className={`jd-chatbot-edit-icon${editing ? ' is-exit' : ''}`}
        aria-label={label}
        title={editing ? 'Thoát chỉnh sửa' : 'Sửa JD thủ công'}
        aria-disabled="true"
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`jd-chatbot-edit-icon${editing ? ' is-exit' : ''}`}
      aria-label={label}
      title={editing ? 'Thoát chỉnh sửa' : 'Sửa JD thủ công'}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}
