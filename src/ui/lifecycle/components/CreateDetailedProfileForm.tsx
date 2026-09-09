import React, { useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { EmployeeProfile, PassedCandidate } from '../types';
import { ensureFolderPath, createOrUpdateFile } from '../../privos-rest';
import employeeTemplateRaw from '../../data/employee_template.md?raw';

interface CreateDetailedProfileFormProps {
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

export function CreateDetailedProfileForm({
  onSubmit,
  onCancel,
  passedCandidates = [],
  isLoadingCandidates = false,
}: CreateDetailedProfileFormProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    position: 'Developer',
    department: 'IT',
    onboardingDate: new Date().toISOString().split('T')[0],
    dob: '',
    idNumber: '',
    idIssueDate: '',
    idIssuePlace: '',
    permanentAddress: '',
    currentAddress: '',
    vehiclePlate: '',
    vehicleType: '',
    socialInsurance: '',
    taxCode: '',
    bankAccount: '',
    bankName: '',
    momoWallet: '',
    telegram: '',
    emergencyContact: '',
  });

  const [idPhoto, setIdPhoto] = useState<{ base64: string; filename: string; mimeType: string } | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');

  const fillMockData = () => {
    setFormData({
      fullName: 'Nguyễn Văn ' + Math.floor(Math.random() * 1000),
      email: `nv${Math.floor(Math.random() * 1000)}@example.com`,
      phone: '09' + Math.floor(10000000 + Math.random() * 90000000),
      position: 'Developer',
      department: 'IT',
      onboardingDate: new Date().toISOString().split('T')[0],
      dob: '1995-05-15',
      idNumber: '001095' + Math.floor(100000 + Math.random() * 900000),
      idIssueDate: '2020-01-01',
      idIssuePlace: 'Cục cảnh sát QLHC',
      permanentAddress: '123 Đường ABC, Phường XYZ, Quận 1, TP.HCM',
      currentAddress: '456 Đường DEF, Phường GHI, Quận 3, TP.HCM',
      vehiclePlate: '59P1-123.45',
      vehicleType: 'Honda Airblade',
      socialInsurance: '1234567890',
      taxCode: '8392134589',
      bankAccount: '1903456789',
      bankName: 'Techcombank',
      momoWallet: '0987654321',
      telegram: '@mockuser',
      emergencyContact: 'Vợ - 0988888888',
    });
  };
  const [errorMsg, setErrorMsg] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

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
      fullName: candidate.name,
      email: candidate.email || prev.email,
      phone: candidate.phone || prev.phone,
      position: matchedPosition,
      department: matchedDepartment
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Vui lòng chọn ảnh dưới 5MB để tránh lag.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setIdPhoto({
            base64: event.target.result.toString(),
            filename: file.name,
            mimeType: file.type || 'image/jpeg'
          });
          setErrorMsg('');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app || !roomId) {
      setErrorMsg('Chưa kết nối được với PrivOS App hoặc không lấy được Room ID.');
      return;
    }

    setErrorMsg('');

    const trimmedName = formData.fullName.trim();
    const trimmedPhone = formData.phone.trim();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập Họ và Tên nhân sự.');
      return;
    }
    if (!trimmedPhone) {
      setErrorMsg('Vui lòng nhập Số điện thoại liên hệ.');
      return;
    }
    if (!PHONE_REGEX.test(trimmedPhone)) {
      setErrorMsg('Số điện thoại không hợp lệ (hỗ trợ số di động, cố định hoặc quốc tế có +).');
      return;
    }
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Email không đúng định dạng (VD: an.nguyen@company.com).');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const normalizedName = trimmedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd');
      const safeName = normalizedName.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
      const safeDept = formData.department.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');

      // 1. Ensure employee specific folder exists
      const folderId = await ensureFolderPath(app, roomId, ['hr-miniapp', 'employees', safeDept, safeName]);
      if (!folderId) throw new Error('Không thể tạo hoặc truy cập thư mục của nhân sự này.');

      // 2. Upload photo if present
      if (idPhoto) {
        addLog(`Bắt đầu upload ảnh: ${idPhoto.filename} (Kích thước gốc ước tính: ${Math.round(idPhoto.base64.length * 0.75 / 1024)} KB)`);
        
        try {
          await Promise.race([
            app.uploadFile({
              channelId: roomId,
              fileName: idPhoto.filename,
              folderId: folderId,
              base64Data: idPhoto.base64,
              mimeType: idPhoto.mimeType
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout sau 15 giây khi tải ảnh lên')), 15000))
          ]);
          
          addLog(`Upload ảnh thành công vào thư mục của ${safeName}.`);
        } catch (uploadErr: any) {
          addLog(`LỖI UPLOAD ẢNH: ${uploadErr.message}`);
          throw uploadErr; // Ném ra ngoài để dừng quá trình tạo hồ sơ
        }
      }
      
      addLog(`Hoàn tất bước ảnh. Bắt đầu tạo file Markdown...`);

      // 3. Generate Markdown content
      let mdContent = employeeTemplateRaw;
      mdContent = mdContent.replace('[LOCAL_ID]', `NV${Date.now().toString().slice(-6)}`);
      mdContent = mdContent.replace('[CREATE_DATE]', new Date().toLocaleDateString('vi-VN'));
      mdContent = mdContent.replace('[FULL_NAME]', trimmedName);
      mdContent = mdContent.replace('[POSITION]', formData.position);
      mdContent = mdContent.replace('[DEPARTMENT]', formData.department);
      mdContent = mdContent.replace('[START_DATE]', formData.onboardingDate);
      mdContent = mdContent.replace('[PHONE]', trimmedPhone);
      mdContent = mdContent.replace('[EMAIL]', trimmedEmail);
      mdContent = mdContent.replace('[TELEGRAM]', formData.telegram);
      mdContent = mdContent.replace('[EMERGENCY]', formData.emergencyContact);
      mdContent = mdContent.replace('[DOB]', formData.dob);
      mdContent = mdContent.replace('[ID_NUMBER]', formData.idNumber);
      mdContent = mdContent.replace('[ID_DATE]', formData.idIssueDate);
      mdContent = mdContent.replace('[ID_PLACE]', formData.idIssuePlace);
      mdContent = mdContent.replace('[PERM_ADDRESS]', formData.permanentAddress);
      mdContent = mdContent.replace('[CUR_ADDRESS]', formData.currentAddress);
      mdContent = mdContent.replace('[BANK_ACCOUNT]', formData.bankAccount);
      mdContent = mdContent.replace('[BANK_NAME]', formData.bankName);
      mdContent = mdContent.replace('[TAX_CODE]', formData.taxCode);
      mdContent = mdContent.replace('[SOCIAL_INSURANCE]', formData.socialInsurance);
      mdContent = mdContent.replace('[VEHICLE_TYPE]', formData.vehicleType);
      mdContent = mdContent.replace('[VEHICLE_PLATE]', formData.vehiclePlate);
      
      let imgLinkStr = idPhoto ? `*Ảnh thẻ và các tài liệu liên quan được lưu trữ cùng thư mục với hồ sơ này.*` : '*Chưa có ảnh đính kèm*';
      mdContent = mdContent.replace('[IMAGE_LINK]', imgLinkStr);

      // 4. Upload Markdown file locally (hr-miniapp local folder)
      const mdFileName = `${new Date().toISOString().split('T')[0]}_PROFILE_${safeName}.md`;
      const mdFilePath = `hr-miniapp/employees/${safeDept}/${safeName}/${mdFileName}`;
      
      const uploadRes: any = await createOrUpdateFile(app, `${roomId}/${mdFilePath}`, mdContent);
      const fileObj = uploadRes.file || (uploadRes.message && uploadRes.message.file) || uploadRes;
      addLog(`Tạo file Markdown thành công. Đang lưu database...`);

      await onSubmit({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        position: formData.position || 'Unknown',
        department: formData.department || 'Unknown',
        startDate: formData.onboardingDate || new Date().toISOString().split('T')[0],
        sourceCandidateId: selectedCandidate?._id,
        attachedFileObj: fileObj
      });

      setIsSuccess(true);
      addLog(`Hoàn tất toàn bộ quy trình! Bạn có thể xem log hoặc đóng form.`);
    } catch (err: any) {
      addLog(`LỖI TỔNG: ${err.message}`);
      console.error('Error in form submission:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra khi tạo hồ sơ. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="hr-form-panel">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="hr-form-title" style={{ margin: 0 }}>Thêm Hồ Sơ Nhân Sự Chi Tiết</h3>
          <button
            type="button"
            className="hr-btn hr-btn-subtle"
            onClick={onCancel}
            title="Đóng form"
          >
            ✕
          </button>
        </div>

        {isSuccess && (
          <div className="hr-status-banner hr-status-success">
            <span>✅</span>
            <span>Hồ sơ đã được lưu thành công!</span>
          </div>
        )}

        {errorMsg && (
          <div className="hr-status-banner hr-status-error">
            <span>⚠️</span>
            <span>{errorMsg}</span>
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
            disabled={isSubmitting || isLoadingCandidates || isSuccess}
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

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', fontSize: '1.1rem' }}>1. Thông tin cá nhân</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="hr-label">Họ và Tên <span style={{ color: '#EC0D2A' }}>*</span></label>
            <input className="hr-input" required type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="VD: Nguyễn Văn A" autoFocus disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Vị trí công việc <span style={{ color: '#EC0D2A' }}>*</span></label>
            <select className="hr-input" name="position" value={formData.position} onChange={handleChange} disabled={isSubmitting || isSuccess}>
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
            <select className="hr-input" name="department" value={formData.department} onChange={handleChange} disabled={isSubmitting || isSuccess}>
              <option value="IT">Kỹ thuật (IT / R&D)</option>
              <option value="Business">Kinh doanh (Business / Sales)</option>
              <option value="Marketing">Truyền thông (Marketing)</option>
              <option value="Back-office">Khối văn phòng (HR / Admin)</option>
            </select>
          </div>
          <div>
            <label className="hr-label">Ngày bắt đầu làm việc</label>
            <input className="hr-input" type="date" name="onboardingDate" value={formData.onboardingDate} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Ngày sinh</label>
            <input className="hr-input" type="date" name="dob" value={formData.dob} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Số điện thoại <span style={{ color: '#EC0D2A' }}>*</span></label>
            <input className="hr-input" required type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="VD: 0901 234 567" disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Email công việc <span style={{ color: '#EC0D2A' }}>*</span></label>
            <input className="hr-input" required type="email" name="email" value={formData.email} onChange={handleChange} placeholder="VD: an.nguyen@company.com" disabled={isSubmitting || isSuccess} />
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', fontSize: '1.1rem' }}>2. Thông tin giấy tờ (CMND/CCCD)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="hr-label">Số CMND/CCCD</label>
            <input className="hr-input" type="text" name="idNumber" value={formData.idNumber} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Ngày cấp</label>
            <input className="hr-input" type="date" name="idIssueDate" value={formData.idIssueDate} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="hr-label">Nơi cấp</label>
            <input className="hr-input" type="text" name="idIssuePlace" value={formData.idIssuePlace} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="hr-label">Địa chỉ thường trú</label>
            <input className="hr-input" type="text" name="permanentAddress" value={formData.permanentAddress} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="hr-label">Chỗ ở hiện tại</label>
            <input className="hr-input" type="text" name="currentAddress" value={formData.currentAddress} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="hr-label">Upload Ảnh CMND / Ảnh thẻ (Max 5MB)</label>
            <input id="idPhotoInput" type="file" accept="image/*" onChange={handleFileChange} style={{ marginTop: '8px', display: 'block', fontSize: '14px' }} disabled={isSubmitting || isSuccess} />
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', fontSize: '1.1rem' }}>3. Tài chính & Phương tiện</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="hr-label">Mã số thuế (PIT)</label>
            <input className="hr-input" type="text" name="taxCode" value={formData.taxCode} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Số Sổ BHXH</label>
            <input className="hr-input" type="text" name="socialInsurance" value={formData.socialInsurance} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Số tài khoản ngân hàng</label>
            <input className="hr-input" type="text" name="bankAccount" value={formData.bankAccount} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Tên Ngân hàng / Chi nhánh</label>
            <input className="hr-input" type="text" name="bankName" value={formData.bankName} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Loại xe</label>
            <input className="hr-input" type="text" name="vehicleType" value={formData.vehicleType} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Biển số xe</label>
            <input className="hr-input" type="text" name="vehiclePlate" value={formData.vehiclePlate} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', fontSize: '1.1rem' }}>4. Liên hệ khác</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="hr-label">Telegram</label>
            <input className="hr-input" type="text" name="telegram" value={formData.telegram} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
          <div>
            <label className="hr-label">Liên hệ khẩn cấp</label>
            <input className="hr-input" type="text" name="emergencyContact" value={formData.emergencyContact} onChange={handleChange} disabled={isSubmitting || isSuccess} />
          </div>
        </div>
        
        {debugLog.length > 0 && (
          <div className="debug-log-container" style={{
            marginTop: '15px', padding: '10px', backgroundColor: '#1e1e1e', color: '#00ff00', 
            borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto'
          }}>
            <strong>Ghi chú tiến trình (Debug log):</strong>
            {debugLog.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {isSuccess ? (
            <button type="button" className="hr-btn hr-btn-accent" onClick={onCancel}>
              Đóng form
            </button>
          ) : (
            <>
              <button type="button" className="hr-btn" onClick={fillMockData} disabled={isSubmitting}>
                Mock Data
              </button>
              <button type="button" className="hr-btn" onClick={onCancel} disabled={isSubmitting}>
                Hủy bỏ
              </button>
              <button type="submit" className="hr-btn hr-btn-accent" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu hồ sơ...' : 'Tạo hồ sơ nhân sự'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
