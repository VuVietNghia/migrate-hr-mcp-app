import React, { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import {
  CheckOutlined,
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  HolderOutlined,
  HourglassOutlined,
  LeftOutlined,
  MailOutlined,
  PhoneOutlined,
  RightOutlined,
  SendOutlined,
  StopOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';
import { EditProfileModal } from './EditProfileModal';
import { canWriteEmployeeMd, resolveEmployeeMdFileRef } from '../services/employee-md-file';

interface ProfileCardProps {
  profile: EmployeeProfile;
  onMoveProfile?: (profileId: string, newStatus: string) => void;
}

export function ProfileCard({ profile, onMoveProfile }: ProfileCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // Không có file Markdown thì không có gì để đọc vào form, nên khoá nút thay vì mở
  // một form trống — lưu form trống sẽ ghi đè sạch file.
  const canEditMd = canWriteEmployeeMd(resolveEmployeeMdFileRef(profile));
  const { roomId } = usePrivosContext();

  const getFileUrl = (p: EmployeeProfile) => {
    const obj = p.attachedFileObj;
    if (!obj) {
      if ((p as any).attachedFileId) return `/group/${roomId}/file-viewer/${(p as any).attachedFileId}`;
      if ((p as any).attachedFileUrl && (p as any).attachedFileUrl !== 'null') return (p as any).attachedFileUrl;
      return '#';
    }
    
    if (typeof obj === 'string') {
      if (obj.startsWith('http') || obj.startsWith('/')) return obj;
      return `/group/${roomId}/file-viewer/${obj}`;
    }
    
    // Prioritize ID-based URL for cross-machine compatibility
    const id = obj._id || obj.id;
    if (id) {
      return `/group/${roomId}/file-viewer/${id}`;
    }
    
    // Fallback to machine-specific URLs (may not work across machines)
    const url = obj.url || obj.downloadUrl || obj.link || obj.fileUrl;
    if (url) return url;
    
    return '#';
  };

  const getFileName = (p: EmployeeProfile) => {
    const obj = p.attachedFileObj;
    if (!obj) return 'Hồ sơ đính kèm';
    if (typeof obj === 'string') return 'Tài liệu đính kèm';
    const name = obj.name || obj.title || obj.fileName || 'Hồ sơ đính kèm';
    return name.length > 25 ? name.substring(0, 25) + '...' : name;
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', profile._id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const copyToClipboard = (text: string, field: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const currentIndex = KANBAN_COLUMNS.findIndex(col => col.status === profile.status);
  const nextColumn = currentIndex >= 0 && currentIndex < KANBAN_COLUMNS.length - 1 
    ? KANBAN_COLUMNS[currentIndex + 1] 
    : null;
  const prevColumn = currentIndex > 0 
    ? KANBAN_COLUMNS[currentIndex - 1] 
    : null;

  const initials = getInitials(profile.name);
  const timeline = calculateTimelineInfo(profile.status, profile.startDate);

  return (
    <>
      <div 
        className={`hr-card ${isDragging ? 'is-dragging' : ''}`}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        title="Kéo thẻ để chuyển trạng thái nhân sự"
      >
      <div className="profile-card-header">
        <div className="profile-name-row">
          <div className="profile-avatar">{initials}</div>
          <div>
            <span className="profile-name">{profile.name}</span>
            {timeline && (
              <div style={{ marginTop: '2px' }}>
                {timeline.type === 'probation' ? (
                  <span className={`badge-probation ${timeline.isUrgent ? 'badge-probation-warning' : ''}`} title="Thời hạn thử việc">
                    <HourglassOutlined /> {timeline.text}
                  </span>
                ) : timeline.type === 'resigned' ? (
                  <span className="badge-resigned" title="Trạng thái nghỉ việc">
                    <StopOutlined /> {timeline.text}
                  </span>
                ) : (
                  <span className="badge-tenure" title="Thâm niên làm việc">
                    <TrophyOutlined /> {timeline.text}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="drag-handle" title="Kéo thả thẻ">
          <HolderOutlined />
        </div>
      </div>

      <div className="profile-badge-row">
        {profile.position && <span className="position-badge">{profile.position}</span>}
        {profile.department && <span className="dept-badge">{profile.department}</span>}
      </div>
      
      {(profile.phone || profile.email || profile.attachedFileObj) && (
        <div className="profile-details">
          {profile.phone && (
            <div className="detail-row" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="detail-icon">
                  <PhoneOutlined />
                </span>
                <span>{profile.phone}</span>
              </div>
              <div className="hr-action-group">
                <button 
                  type="button" 
                  className={`hr-icon-btn ${copiedField === 'phone' ? 'copied' : ''}`}
                  onClick={(e) => copyToClipboard(profile.phone!, 'phone', e)}
                  title={copiedField === 'phone' ? 'Đã chép SĐT' : 'Sao chép SĐT'}
                  aria-label={copiedField === 'phone' ? 'Đã chép SĐT' : 'Sao chép SĐT'}
                >
                  {copiedField === 'phone' ? <CheckOutlined /> : <CopyOutlined />}
                </button>
              </div>
            </div>
          )}
          {profile.email && (
            <div className="detail-row" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, marginRight: '6px' }}>
                <span className="detail-icon">
                  <MailOutlined />
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={profile.email}>
                  {profile.email}
                </span>
              </div>
              <div className="hr-action-group">
                <button 
                  type="button" 
                  className={`hr-icon-btn ${copiedField === 'email' ? 'copied' : ''}`}
                  onClick={(e) => copyToClipboard(profile.email!, 'email', e)}
                  title={copiedField === 'email' ? 'Đã chép Email' : 'Sao chép Email'}
                  aria-label={copiedField === 'email' ? 'Đã chép Email' : 'Sao chép Email'}
                >
                  {copiedField === 'email' ? <CheckOutlined /> : <CopyOutlined />}
                </button>
                <button
                  type="button"
                  className="hr-icon-btn"
                  title="Gửi Email"
                  aria-label="Gửi Email"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEmailModalOpen(true);
                  }}
                >
                  <SendOutlined />
                </button>
              </div>
            </div>
          )}
          {profile.attachedFileObj && (
            <div className="detail-row" style={{ marginTop: '4px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <span className="detail-icon" style={{ color: 'var(--accent)' }}>
                  <FileTextOutlined />
                </span>
                <a 
                  href={getFileUrl(profile)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500 }}
                  title={getFileName(profile) || 'Xem tài liệu'}
                  onClick={(e) => e.stopPropagation()}
                >
                  {getFileName(profile)}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {canEditMd && (
        <div className="detail-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="hr-icon-btn"
            title="Sửa thông tin trong file hồ sơ"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditModalOpen(true);
            }}
          >
            <EditOutlined /> Sửa
          </button>
        </div>
      )}

      {onMoveProfile && (prevColumn || nextColumn) && (
        <div className="hr-card-quick-actions">
          {prevColumn && (
            <button 
              type="button"
              className="hr-btn-mini" 
              title={`Chuyển lùi: ${prevColumn.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onMoveProfile(profile._id, prevColumn.status);
              }}
            >
              <LeftOutlined /> {prevColumn.status}
            </button>
          )}
          {nextColumn && (
            <button 
              type="button"
              className="hr-btn-mini hr-btn-mini-accent" 
              title={`Chuyển tiếp: ${nextColumn.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onMoveProfile(profile._id, nextColumn.status);
              }}
            >
              {nextColumn.status} <RightOutlined />
            </button>
          )}
        </div>
      )}
    </div>

    <EmailComposerModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        profile={profile}
      />

    {isEditModalOpen && (
      <EditProfileModal profile={profile} onClose={() => setIsEditModalOpen(false)} />
    )}
    </>
  );
}
