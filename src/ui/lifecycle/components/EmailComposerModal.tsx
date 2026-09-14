import { useEffect, useState } from 'react';
import { EmployeeProfile } from '../types';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { UserSessionTrackedMail } from '../../email-history/user-session-tracked-mail';
import { useEmployeeEmailTemplateRepository } from '../di/EmployeeEmailTemplateContext';
import { isValidEmailAddress } from '../../utils/email-validation';
import {
  canSendInviteWithTemplate,
  createInviteTemplateLoadState,
  loadActiveInviteTemplate,
  type InviteTemplateLoadState,
} from '../../cv-scored/invite-template-state';
import {
  renderEmployeeEmailTemplate,
  type EmployeeEmailTemplateVariables,
} from '../../email-templates/employee-email-template';

interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
}

const STATUS_COLORS = {
  success: { color: '#065f46', backgroundColor: '#d1fae5', border: '1px solid #34d399' },
  warning: { color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fbbf24' },
  error: { color: '#991b1b', backgroundColor: '#fee2e2', border: '1px solid #f87171' },
} as const;

export function buildLifecycleMailArguments({
  roomId,
  profile,
  subject,
  content,
}: {
  roomId: string;
  profile: Pick<EmployeeProfile, 'name' | 'email'>;
  subject: string;
  content: string;
}) {
  return {
    toName: profile.name || 'Nhân viên',
    toEmail: profile.email?.trim() || '',
    subject,
    htmlContent: content.replace(/\n/g, '<br/>'),
    roomId,
    source: 'lifecycle' as const,
  };
}

export function toEmployeeTemplateVariables(profile: EmployeeProfile): EmployeeEmailTemplateVariables {
  return {
    employeeName: profile.name || '',
    employeeEmail: profile.email || '',
    position: profile.position || '',
    department: profile.department || '',
    startDate: profile.startDate || '',
  };
}

export function EmailComposerModal({ isOpen, onClose, profile }: EmailComposerModalProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const templateRepository = useEmployeeEmailTemplateRepository();
  const [templateState, setTemplateState] = useState<InviteTemplateLoadState>(createInviteTemplateLoadState);
  const [subject, setSubject] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Profile lists are re-polled into fresh objects; keying on the values keeps the user's edits.
  const variablesKey = JSON.stringify(toEmployeeTemplateVariables(profile));

  // The template is picked in Email → Mẫu email → Nhân sự; each opening renders the active one once,
  // after which subject and body stay freely editable.
  useEffect(() => {
    setTemplateState(createInviteTemplateLoadState());
    setSubject('');
    setContent('');
    if (!isOpen) return;

    let current = true;
    void loadActiveInviteTemplate(templateRepository, () => current, state => {
      setTemplateState(state);
      if (state.activeTemplate) {
        const variables = JSON.parse(variablesKey) as EmployeeEmailTemplateVariables;
        const rendered = renderEmployeeEmailTemplate(state.activeTemplate, variables);
        setSubject(rendered.subject);
        setContent(rendered.body);
      }
    }, 'nhân sự');
    return () => { current = false; };
  }, [isOpen, templateRepository, variablesKey]);

  if (!isOpen) return null;

  const templateReady = canSendInviteWithTemplate(templateState, templateRepository);
  const activeTemplateName = templateState.loading
    ? 'Đang tải mẫu email…'
    : templateState.activeTemplate?.name || 'Chưa có mẫu đang sử dụng';

  const handleSendMail = async () => {
    if (!templateReady) return;
    if (!subject.trim() || !content.trim()) {
      alert('Vui lòng nhập tiêu đề và nội dung thư');
      return;
    }

    const targetEmail = profile.email?.trim() || '';
    if (!isValidEmailAddress(targetEmail)) {
      alert('Hồ sơ nhân sự chưa có email hợp lệ. Vui lòng cập nhật email trước khi gửi.');
      return;
    }
    if (!roomId) {
      alert('Không xác định được Room để lưu lịch sử email.');
      return;
    }

    setIsSending(true);
    setStatusMessage(null);
    try {
      const { logged } = await new UserSessionTrackedMail(app).send(
        buildLifecycleMailArguments({ roomId, profile, subject, content }),
      );
      const sentUnlogged = !logged;
      const message = sentUnlogged
        ? `Đã gửi email tới ${targetEmail}. Lưu ý: chưa lưu được vào lịch sử email, không cần gửi lại.`
        : `Đã gửi email thành công tới ${targetEmail}!`;

      // alert() bị chặn im lặng trong iframe sandbox (opaque origin) của mini-app này,
      // nên banner trong modal mới là nguồn thông báo chính; alert() chỉ là best-effort.
      setStatusMessage({ type: sentUnlogged ? 'warning' : 'success', text: message });
      try {
        alert(message);
      } catch {
        // ignore: xem comment ở trên.
      }
      setTimeout(onClose, sentUnlogged ? 2500 : 1200);
    } catch (err: any) {
      const message = 'Lỗi gửi mail: ' + (err.message || err);
      setStatusMessage({ type: 'error', text: message });
      try {
        alert(message);
      } catch {
        // ignore: xem comment ở trên.
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bot-template-modal-overlay">
      <div className="bot-template-modal-content" style={{ width: 800, height: 'auto', minHeight: 450, display: 'flex', flexDirection: 'column' }}>
        <div className="bot-template-modal-header">
          <h3>✉️ Gửi Email cho {profile.name}</h3>
          <button className="bot-template-close-btn" onClick={onClose}>×</button>
        </div>
        {!templateState.loading && (templateState.error || !templateState.activeTemplate) && (
          <div role="alert" style={{ margin: '16px 20px 0', color: '#dc2626', fontSize: '13px' }}>
            <p style={{ margin: 0 }}>{templateState.error || 'Không tìm thấy mẫu email nhân sự đang sử dụng.'}</p>
            <p style={{ margin: '4px 0 0' }}>Vào Email → Mẫu email → Nhân sự để sửa hoặc chọn mẫu.</p>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: '0.875rem',
              ...STATUS_COLORS[statusMessage.type],
            }}
          >
            {statusMessage.text}
          </div>
        )}

        <div style={{ padding: 20, display: 'flex', gap: 24, flex: 1 }}>
          {/* Cột trái: Các trường nhập liệu cơ bản */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Mẫu thư (Template):</label>
              <input
                type="text"
                value={activeTemplateName}
                readOnly
                title="Đổi mẫu tại Email → Mẫu email → Nhân sự"
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Người nhận:</label>
              <input 
                type="text" 
                value={profile.email || 'Chưa có email'} 
                disabled 
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }} 
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Tiêu đề:</label>
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                placeholder="Nhập tiêu đề thư..."
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none' }} 
              />
            </div>
          </div>

          {/* Cột phải: Nội dung thư */}
          <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Nội dung:</label>
            <textarea 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              placeholder="Nhập nội dung..."
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none', resize: 'none', flex: 1, fontFamily: 'inherit' }} 
            />
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-table-head)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} disabled={isSending} className="hr-btn">Hủy</button>
          <button onClick={handleSendMail} disabled={isSending || !templateReady} className="hr-btn hr-btn-accent">
            {isSending ? 'Đang gửi...' : 'Gửi Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
