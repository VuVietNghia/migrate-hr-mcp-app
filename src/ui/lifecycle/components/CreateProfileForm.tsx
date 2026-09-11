import React, { useState } from 'react';
import { EmployeeProfile, PassedCandidate } from '../types';

interface CreateProfileFormProps {
  onSubmit: (data: Omit<EmployeeProfile, '_id' | 'status'> & { attachedFileObj?: any }) => Promise<void>;
  onCancel: () => void;
  passedCandidates?: PassedCandidate[];
  isLoadingCandidates?: boolean;
}

const PHONE_REGEX = /^\+?[0-9\s\-().]{8,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDepartmentForPosition(position: string): string {
  const pos = position.toLowerCase();
  if (pos.includes('dev') || pos.includes('test') || pos.includes('design')) return 'IT';
  if (pos.includes('sale') || pos.includes('kinh doanh')) return 'Business';
  if (pos.includes('market')) return 'Marketing';
  if (pos.includes('hr') || pos.includes('admin') || pos.includes('product')) return 'Back-office';
  return 'IT';
}

export function CreateProfileForm({
  onSubmit,
  onCancel,
  passedCandidates = [],
  isLoadingCandidates = false,
}: CreateProfileFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    position: 'Developer',
    department: 'IT',
    startDate: new Date().toISOString().split('T')[0]
  });

  const fillMockData = () => {
    setFormData({
      name: 'Trần Văn ' + Math.floor(Math.random() * 1000),
      phone: '09' + Math.floor(10000000 + Math.random() * 90000000),
      email: `tv${Math.floor(Math.random() * 1000)}@example.com`,
      position: 'Developer',
      department: 'IT',
      startDate: new Date().toISOString().split('T')[0]
    });
  };

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedCandidate = passedCandidates.find(c => c._id === selectedCandidateId);

  const handleSelectCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    if (!candidateId) return;

    const candidate = passedCandidates.find(c => c._id === candidateId);
    if (!candidate) return;

    const matchedPosition = candidate.position || formData.position;
    const matchedDepartment = getDepartmentForPosition(matchedPosition);

    setFormData(prev => ({
      ...prev,
      name: candidate.name,
      position: matchedPosition,
      department: matchedDepartment
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = formData.name.trim();
    const trimmedPhone = formData.phone.trim();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName) {
      setError('Vui lòng nhập Họ và Tên nhân sự.');
      return;
    }
    if (!trimmedPhone) {
      setError('Vui lòng nhập Số điện thoại liên hệ.');
      return;
    }
    if (!PHONE_REGEX.test(trimmedPhone)) {
      setError('Số điện thoại không hợp lệ (hỗ trợ số di động, cố định hoặc quốc tế có +).');
      return;
    }
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setError('Email không đúng định dạng (VD: an.nguyen@company.com).');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      await onSubmit({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        position: formData.position,
        department: formData.department,
        startDate: formData.startDate,
        sourceCandidateId: selectedCandidate?._id
      });
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi lưu hồ sơ.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hr-form-panel">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="hr-form-title" style={{ margin: 0 }}>Thêm Hồ Sơ Nhân Sự Mới</h3>
          <button 
            type="button" 
            className="hr-btn hr-btn-subtle" 
            onClick={onCancel}
            title="Đóng form"
          >
            ✕
          </button>
        </div>
        
        {error && (
          <div className="hr-status-banner hr-status-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Quick Selection from Passed Screening Candidates */}
        <div style={{
          marginBottom: 20,
          padding: '12px 16px',
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: 8
        }}>
          <label className="hr-label" style={{ color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✨</span> Chọn nhanh từ ứng viên phỏng vấn / nhận việc (Stage 05+) ({passedCandidates.length} ứng viên)
          </label>
          <select
            className="hr-input"
            value={selectedCandidateId}
            onChange={(e) => handleSelectCandidate(e.target.value)}
            disabled={isSubmitting || isLoadingCandidates}
            style={{ marginTop: 6 }}
          >
            <option value="">-- Chọn ứng viên từ vòng phỏng vấn (05_Moi_Phong_Van trở đi) --</option>
            {passedCandidates.map((c) => (
              <option key={c._id} value={c._id}>
                👤 {c.name} {c.score !== undefined ? `(${c.score}đ)` : ''} — Đợt: {c.listName} {c.position ? `[${c.position}]` : ''}
              </option>
            ))}
          </select>

          {selectedCandidate && (
            <div style={{
              marginTop: 10,
              fontSize: '0.8rem',
              color: 'var(--text-muted, #64748b)',
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              <span>📌 Đợt: <strong>{selectedCandidate.listName}</strong></span>
              {selectedCandidate.score !== undefined && (
                <span>⭐ Điểm: <strong>{selectedCandidate.score}/100</strong></span>
              )}
              {selectedCandidate.stageName && (
                <span>🏷️ Cột: <strong>{selectedCandidate.stageName}</strong></span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div>
            <label className="hr-label">Họ và Tên <span style={{ color: '#EC0D2A' }}>*</span></label>
            <input 
              className="hr-input" 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              placeholder="VD: Nguyễn Văn A" 
              autoFocus 
              disabled={isSubmitting} 
            />
          </div>

          <div>
            <label className="hr-label">Số điện thoại <span style={{ color: '#EC0D2A' }}>*</span></label>
            <input 
              className="hr-input" 
              type="tel" 
              name="phone" 
              value={formData.phone} 
              onChange={handleChange} 
              placeholder="VD: 0901 234 567" 
              disabled={isSubmitting} 
            />
          </div>

          <div>
            <label className="hr-label">Email công việc</label>
            <input 
              className="hr-input" 
              type="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              placeholder="VD: an.nguyen@company.com" 
              disabled={isSubmitting} 
            />
          </div>

          <div>
            <label className="hr-label">Vị trí công việc</label>
            <select 
              className="hr-input" 
              name="position" 
              value={formData.position} 
              onChange={handleChange} 
              disabled={isSubmitting}
            >
              <option value="Developer">Developer</option>
              <option value="Tester">Tester / QA</option>
              <option value="Designer">UI/UX Designer</option>
              <option value="Product Manager">Product Manager</option>
              <option value="HR">HR Specialist</option>
              <option value="Sales">Sales Executive</option>
              <option value="Marketing">Marketing Specialist</option>
            </select>
          </div>

          <div>
            <label className="hr-label">Phòng ban</label>
            <select 
              className="hr-input" 
              name="department" 
              value={formData.department} 
              onChange={handleChange} 
              disabled={isSubmitting}
            >
              <option value="IT">Kỹ thuật (IT / R&D)</option>
              <option value="Business">Kinh doanh (Business / Sales)</option>
              <option value="Marketing">Truyền thông (Marketing)</option>
              <option value="Back-office">Khối văn phòng (HR / Admin)</option>
            </select>
          </div>

          <div>
            <label className="hr-label">Ngày bắt đầu làm việc</label>
            <input 
              className="hr-input" 
              type="date" 
              name="startDate" 
              value={formData.startDate} 
              onChange={handleChange} 
              disabled={isSubmitting} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="hr-btn" onClick={fillMockData} disabled={isSubmitting}>
            Mock Data
          </button>
          <button type="button" className="hr-btn" onClick={onCancel} disabled={isSubmitting}>
            Hủy bỏ
          </button>
          <button type="submit" className="hr-btn hr-btn-accent" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu hồ sơ...' : 'Tạo hồ sơ nhân sự'}
          </button>
        </div>
      </form>
    </div>
  );
}
