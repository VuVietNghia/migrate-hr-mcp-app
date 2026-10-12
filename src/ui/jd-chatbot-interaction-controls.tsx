import type { RecruitmentDepartment } from './recruitment-departments';

type JDChatbotDepartmentSelectProps = {
  busy: boolean;
  departments: RecruitmentDepartment[];
  value: string;
  onChange: (value: string) => void;
};

export function JDChatbotDepartmentSelect({
  busy,
  departments,
  value,
  onChange,
}: JDChatbotDepartmentSelectProps) {
  return (
    <label className="jd-chatbot-department-select">
      <span>Phòng ban <strong aria-hidden="true">*</strong></span>
      <select
        aria-label="Phòng ban của JD"
        required
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Chọn phòng ban</option>
        {departments.map((department) => (
          <option key={department.key} value={department.key}>{department.label}</option>
        ))}
      </select>
    </label>
  );
}

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
  canSend?: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function JDChatbotComposer({
  busy,
  canSend = true,
  input,
  onInputChange,
  onSend,
}: JDChatbotComposerProps) {
  return (
    <div className="jd-chatbot-composer">
      <input
        type="text"
        className="jd-chatbot-chat-input"
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!busy && canSend && input.trim()) onSend();
          }
        }}
        placeholder="Nhập yêu cầu tạo hoặc chỉnh sửa JD…"
        disabled={busy}
      />
      <button
        type="button"
        aria-label="Gửi yêu cầu"
        onClick={onSend}
        disabled={busy || !canSend || !input.trim()}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M10 16V4m0 0L5.5 8.5M10 4l4.5 4.5" />
        </svg>
      </button>
    </div>
  );
}
