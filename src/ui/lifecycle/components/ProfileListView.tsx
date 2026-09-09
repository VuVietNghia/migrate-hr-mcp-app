import { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { getInitials, calculateTimelineInfo } from '../utils';
import { EmailComposerModal } from './EmailComposerModal';

interface ProfileListViewProps {
  profiles: EmployeeProfile[];
  isLoading: boolean;
  onMoveProfile?: (profileId: string, newStatus: string) => void;
}

export function ProfileListView({ profiles, isLoading, onMoveProfile }: ProfileListViewProps) {
  const [copiedField, setCopiedField] = useState<{ id: string; field: string } | null>(null);
  const [emailProfile, setEmailProfile] = useState<EmployeeProfile | null>(null);
  const { roomId } = usePrivosContext();

  const copyToClipboard = (id: string, text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField({ id, field });
    setTimeout(() => setCopiedField(null), 1800);
  };

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

  if (isLoading) {
    return (
      <div className="kanban-loading">
        <div className="spinner"></div>
        <p>Đang tải danh sách hồ sơ nhân sự...</p>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="hr-table-card" style={{ padding: '36px', textAlign: 'center' }}>
        <p className="empty-state">Không tìm thấy hồ sơ nhân sự nào phù hợp bộ lọc.</p>
      </div>
    );
  }

  return (
    <div className="hr-table-card">
      <table className="hr-table">
        <thead>
          <tr>
            <th style={{ width: '22%' }}>Nhân sự</th>
            <th style={{ width: '16%' }}>Vị trí & Phòng ban</th>
            <th style={{ width: '20%' }}>Trạng thái & Lộ trình</th>
            <th style={{ width: '22%' }}>Liên hệ (SĐT / Email)</th>
            <th style={{ width: '20%', textAlign: 'right' }}>Thao tác luân chuyển</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(profile => {
            const initials = getInitials(profile.name);
            const timeline = calculateTimelineInfo(profile.status, profile.startDate);
            const colDef = KANBAN_COLUMNS.find(c => c.status === profile.status);
            const currentIndex = KANBAN_COLUMNS.findIndex(c => c.status === profile.status);
            const nextColumn = currentIndex >= 0 && currentIndex < KANBAN_COLUMNS.length - 1
              ? KANBAN_COLUMNS[currentIndex + 1]
              : null;

            return (
              <tr key={profile._id}>
                {/* Name & Avatar */}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="profile-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{profile.name}</div>
                      {profile.startDate && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Ngày vào: {profile.startDate}
                        </div>
                      )}
                      {profile.attachedFileObj && (
                        <div style={{ marginTop: '4px' }}>
                          <a 
                            href={getFileUrl(profile)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title={getFileName(profile) || 'Xem tài liệu'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            {getFileName(profile)}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Position & Dept */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                    <span className="position-badge">{profile.position || 'Nhân sự'}</span>
                    <span className="dept-badge">{profile.department || 'Chưa phân bổ'}</span>
                  </div>
                </td>

                {/* Status & Timeline */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                    <span 
                      className="hr-status-pill"
                      style={{
                        background: colDef ? `${colDef.color}15` : 'var(--bg-hover)',
                        color: colDef?.color || 'var(--text)',
                        border: `1px solid ${colDef ? `${colDef.color}40` : 'var(--border)'}`,
                        fontWeight: 600
                      }}
                    >
                      {profile.status}
                    </span>
                    {timeline && (
                      <span 
                        className={
                          timeline.type === 'probation' 
                            ? `badge-probation ${timeline.isUrgent ? 'badge-probation-warning' : ''}`
                            : timeline.type === 'resigned'
                            ? 'badge-resigned'
                            : 'badge-tenure'
                        }
                      >
                        {timeline.type === 'probation' ? (timeline.isUrgent ? '⚠️ ' : '⏳ ') : timeline.type === 'resigned' ? '🛑 ' : '🎖️ '}
                        {timeline.text}
                      </span>
                    )}
                  </div>
                </td>

                {/* Contact */}
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {profile.phone ? (
                      <div className="detail-row">
                        <span className="detail-icon">📞</span>
                        <a 
                          href={`tel:${profile.phone}`} 
                          style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
                          title="Bấm để gọi"
                        >
                          {profile.phone}
                        </a>
                        <button
                          type="button"
                          className="hr-icon-btn"
                          onClick={() => copyToClipboard(profile._id, profile.phone!, 'phone')}
                          title="Sao chép SĐT"
                          style={{ padding: '1px 5px', fontSize: '0.7rem' }}
                        >
                          {copiedField?.id === profile._id && copiedField?.field === 'phone' ? '✓ Đã chép' : '📋'}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chưa có SĐT</span>
                    )}

                    {profile.email && (
                      <div className="detail-row">
                        <span className="detail-icon">✉️</span>
                        <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={profile.email}>
                          {profile.email}
                        </span>
                        <button
                          type="button"
                          className="hr-icon-btn"
                          onClick={() => copyToClipboard(profile._id, profile.email!, 'email')}
                          title="Sao chép Email"
                          style={{ padding: '1px 5px', fontSize: '0.7rem' }}
                        >
                          {copiedField?.id === profile._id && copiedField?.field === 'email' ? '✓ Đã chép' : '📋'}
                        </button>
                        <button
                          type="button"
                          className="hr-icon-btn"
                          onClick={() => setEmailProfile(profile)}
                          title="Gửi Email"
                          style={{ padding: '1px 5px', fontSize: '0.7rem', marginLeft: '4px' }}
                        >
                          ✉️
                        </button>
                      </div>
                    )}
                  </div>
                </td>

                {/* Action buttons */}
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {nextColumn && onMoveProfile && (
                      <button
                        type="button"
                        className="hr-btn-mini hr-btn-mini-accent"
                        onClick={() => onMoveProfile(profile._id, nextColumn.status)}
                        title={`Chuyển sang [${nextColumn.status}]`}
                      >
                        → {nextColumn.status}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {emailProfile && (
        <EmailComposerModal 
          isOpen={true} 
          onClose={() => setEmailProfile(null)} 
          profile={emailProfile} 
        />
      )}
    </div>
  );
}
