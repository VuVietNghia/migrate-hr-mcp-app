import React, { useState } from 'react';
import { EmployeeProfile } from '../types';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { useEmployeeEmailTemplateProvider } from '../di/EmployeeEmailTemplateContext';
import { isValidEmailAddress } from '../../utils/email-validation';

interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: EmployeeProfile;
}

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

export function EmailComposerModal({ isOpen, onClose, profile }: EmailComposerModalProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const templateProvider = useEmployeeEmailTemplateProvider();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tmplId = e.target.value;
    setSelectedTemplate(tmplId);
    
    const tmpl = templateProvider.getTemplateById(tmplId);
    if (tmpl) {
      const draft = tmpl.createDraft(profile);
      setSubject(draft.subject);
      setContent(draft.content);
    } else {
      setSubject('');
      setContent('');
    }
  };

  const handleSendMail = async () => {
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
    try {
      await app.callServerTool({
        name: 'hrm.mail.send',
        arguments: buildLifecycleMailArguments({ roomId, profile, subject, content }),
      });

      alert(`Đã gửi email thành công tới ${targetEmail}!`);
      onClose();
    } catch (err: any) {
      alert('Lỗi gửi mail: ' + (err.message || err));
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
        
        <div style={{ padding: 20, display: 'flex', gap: 24, flex: 1 }}>
          {/* Cột trái: Các trường nhập liệu cơ bản */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Mẫu thư (Template):</label>
              <select 
                value={selectedTemplate} 
                onChange={handleTemplateChange} 
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none' }}
              >
                <option value="">-- Chọn mẫu thư --</option>
                {templateProvider.getTemplates().map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
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
          <button onClick={handleSendMail} disabled={isSending} className="hr-btn hr-btn-accent">
            {isSending ? 'Đang gửi...' : 'Gửi Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
