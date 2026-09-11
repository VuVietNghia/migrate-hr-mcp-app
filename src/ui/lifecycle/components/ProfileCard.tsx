import React, { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';

interface ProfileCardProps {
  profile: EmployeeProfile;
  onMoveProfile?: (profileId: string, newStatus: string) => void;
}

export function ProfileCard({ profile, onMoveProfile }: ProfileCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
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
                    ⏳ {timeline.text}
                  </span>
                ) : timeline.type === 'resigned' ? (
                  <span className="badge-resigned" title="Trạng thái nghỉ việc">
                    🛑 {timeline.text}
                  </span>
                ) : (
                  <span className="badge-tenure" title="Thâm niên làm việc">
                    🎖️ {timeline.text}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="drag-handle" title="Kéo thả thẻ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="5" r="1"/>
            <circle cx="9" cy="12" r="1"/>
            <circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="5" r="1"/>
            <circle cx="15" cy="12" r="1"/>
            <circle cx="15" cy="19" r="1"/>
          </svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </span>
                <span>{profile.phone}</span>
              </div>
              <div className="hr-action-group">
                <button 
                  type="button" 
                  className={`hr-icon-btn ${copiedField === 'phone' ? 'copied' : ''}`}
                  onClick={(e) => copyToClipboard(profile.phone!, 'phone', e)}
                  title="Sao chép SĐT"
                >
                  {copiedField === 'phone' ? 'Đã chép' : 'Chép'}
                </button>
                <a 
                  href={`tel:${profile.phone}`} 
                  className="hr-icon-btn" 
                  title="Gọi ngay"
                  onClick={(e) => e.stopPropagation()}
                >
                  Gọi
                </a>
              </div>
            </div>
          )}
          {profile.email && (
            <div className="detail-row" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, marginRight: '6px' }}>
                <span className="detail-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
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
                  title="Sao chép Email"
                >
                  {copiedField === 'email' ? 'Đã chép' : 'Chép'}
                </button>
                <button 
                  type="button"
                  className="hr-icon-btn" 
                  title="Gửi Email"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEmailModalOpen(true);
                  }}
                >
                  Gửi
                </button>
              </div>
            </div>
          )}
          {profile.attachedFileObj && (
            <div className="detail-row" style={{ marginTop: '4px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <span className="detail-icon" style={{ color: 'var(--accent)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
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
              ← {prevColumn.status}
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
              {nextColumn.status} →
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
    </>
  );
}
