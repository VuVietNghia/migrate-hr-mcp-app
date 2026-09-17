import React, { useEffect, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import employeeTemplateRaw from '../../data/employee_template.md?raw';
import { EmployeeProfile } from '../types';
import { useLifecycleService } from '../di/LifecycleContext';
import { EmployeeMdDocument, parseEmployeeMd, renderEmployeeMd } from '../employee-md-document';
import {
  EmployeeMdFileRef,
  canWriteEmployeeMd,
  describeFileError,
  readEmployeeMdText,
  resolveEmployeeMdFileRef,
} from '../services/employee-md-file';
import { saveEmployeeMd } from '../services/employee-md-save';
import { DEPARTMENT_OPTIONS, POSITION_OPTIONS, ProfileFormOption, withCurrentOption } from '../profile-form-options';
import { findEmployeeDocError } from '../profile-validation';

interface EditProfileModalProps {
  profile: EmployeeProfile;
  onClose: () => void;
}

interface FieldDef {
  key: keyof EmployeeMdDocument;
  label: string;
  type?: 'text' | 'date' | 'select';
  /** Chỉ dùng khi `type` là `select`. */
  options?: ReadonlyArray<ProfileFormOption>;
  fullWidth?: boolean;
}

/**
 * `imageLink`, `localId` và `createDate` cố tình không có ở đây: hai cái sau là danh
 * tính của hồ sơ, cái đầu là dòng mô tả ảnh do luồng tạo sinh ra. Cả ba được mang
 * nguyên văn từ file gốc sang bản ghi mới.
 */
const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: '1. Thông tin chung',
    fields: [
      { key: 'fullName', label: 'Họ và Tên' },
      { key: 'position', label: 'Vị trí công việc', type: 'select', options: POSITION_OPTIONS },
      { key: 'department', label: 'Phòng ban', type: 'select', options: DEPARTMENT_OPTIONS },
      { key: 'startDate', label: 'Ngày bắt đầu làm việc', type: 'date' },
    ],
  },
  {
    title: '2. Liên hệ',
    fields: [
      { key: 'phone', label: 'Số điện thoại' },
      { key: 'email', label: 'Email công việc' },
      { key: 'telegram', label: 'Telegram' },
      { key: 'emergency', label: 'Liên hệ khẩn cấp' },
    ],
  },
  {
    title: '3. Thông tin cá nhân',
    fields: [
      { key: 'dob', label: 'Ngày sinh', type: 'date' },
      { key: 'idNumber', label: 'Số CMND/CCCD' },
      { key: 'idDate', label: 'Ngày cấp', type: 'date' },
      { key: 'idPlace', label: 'Nơi cấp' },
      { key: 'permAddress', label: 'Địa chỉ thường trú', fullWidth: true },
      { key: 'curAddress', label: 'Chỗ ở hiện tại', fullWidth: true },
    ],
  },
  {
    title: '4. Tài chính và phương tiện',
    fields: [
      { key: 'bankAccount', label: 'Số tài khoản ngân hàng' },
      { key: 'bankName', label: 'Tên ngân hàng / Chi nhánh' },
      { key: 'taxCode', label: 'Mã số thuế (PIT)' },
      { key: 'socialInsurance', label: 'Số sổ BHXH' },
      { key: 'vehicleType', label: 'Loại xe' },
      { key: 'vehiclePlate', label: 'Biển số xe' },
    ],
  },
];

export function EditProfileModal({ profile, onClose }: EditProfileModalProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const service = useLifecycleService();

  // LifecycleDashboard poll 3 giây một lần và trao xuống một object profile MỚI mỗi khi
  // dữ liệu của profile đó đổi (kể cả ngay sau khi modal này lưu, hoặc khi người khác sửa
  // thẻ). Vì vậy effect load file bên dưới chỉ khoá theo `profile._id` và đọc profile qua
  // `profileRef`: chạy lại theo object mới sẽ đọc lại file và ghi đè state đang gõ dở.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const [fileRef, setFileRef] = useState<EmployeeMdFileRef | null>(null);
  const [doc, setDoc] = useState<EmployeeMdDocument | null>(null);
  const [missingLabels, setMissingLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!app) {
        setLoadError('Chưa kết nối được với PrivOS App.');
        setIsLoading(false);
        return;
      }

      const ref = resolveEmployeeMdFileRef(profileRef.current);
      if (!ref) {
        setLoadError('Hồ sơ này chưa có file Markdown đính kèm nên không sửa được bằng form.');
        setIsLoading(false);
        return;
      }
      if (!canWriteEmployeeMd(ref)) {
        setLoadError('Hồ sơ này chỉ liên kết tới file qua đường dẫn tải về, không có id file nên không ghi lại được bằng form.');
        setIsLoading(false);
        return;
      }

      try {
        const text = await readEmployeeMdText(app, ref);
        const parsed = parseEmployeeMd(text);
        if (!isMounted) return;

        // Form này render lại TOÀN BỘ file từ template khi lưu. Mở form trên một file
        // không đọc được nghĩa là bấm lưu sẽ xoá sạch nội dung của nó, nên từ chối mở.
        if (!parsed) {
          setLoadError(
            'File đính kèm không theo mẫu hồ sơ nhân sự nên không sửa được bằng form. '
            + 'Mở file trực tiếp trong Room để xem hoặc sửa tay.',
          );
          setIsLoading(false);
          return;
        }

        setFileRef(ref);
        setDoc(parsed.doc);
        setMissingLabels(parsed.missingLabels);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(describeFileError(error));
        setIsLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [app, profile._id]);

  const handleChange = (key: keyof EmployeeMdDocument, value: string) => {
    setDoc(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!app || !roomId || !doc || !fileRef || isSaving) return;

    setSaveError('');
    setSaveNotice('');
    setIsSaved(false);

    const inputError = findEmployeeDocError(doc);
    if (inputError) {
      setSaveError(inputError);
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveEmployeeMd({
        app,
        roomId,
        ref: fileRef,
        content: renderEmployeeMd(doc, employeeTemplateRaw),
        syncItem: () => service.updateProfileFields(roomId, profile._id, {
          name: doc.fullName.trim(),
          phone: doc.phone.trim(),
          email: doc.email.trim(),
          position: doc.position.trim(),
          department: doc.department.trim(),
          startDate: doc.startDate.trim(),
          sourceCandidateId: profile.sourceCandidateId,
          attachedFileId: fileRef.fileId,
          attachedFileUrl: fileRef.downloadUrl,
          attachedFileObj: profileRef.current.attachedFileObj,
          existingDescription: profileRef.current.rawDescription,
        }),
      });

      if (result.status === 'saved') {
        setIsSaved(true);
      } else if (result.status === 'saved-item-stale') {
        setSaveNotice(
          `Đã lưu file hồ sơ, nhưng chưa cập nhật được thẻ trên bảng: ${result.detail}. `
          + 'Nội dung bạn vừa nhập đã an toàn trong file; bấm lưu lại để đồng bộ thẻ.',
        );
      }
    } catch (error) {
      setSaveError(describeFileError(error));
    } finally {
      setIsSaving(false);
    }
  };

  // Đóng modal giữa lúc đang lưu sẽ unmount form và nuốt mất lỗi lưu (nếu có) mà
  // người dùng không bao giờ thấy được, nên chặn cả backdrop lẫn nút Đóng ở header.
  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
        display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        className="hr-form-panel"
        style={{ width: '100%', maxWidth: 860, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="hr-form-title" style={{ margin: 0 }}>Sửa hồ sơ: {profile.name}</h3>
          <button type="button" className="hr-btn hr-btn-subtle" onClick={handleClose} disabled={isSaving} title="Đóng form">
            Đóng
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40 }}>
            <div className="spinner"></div>
            <p style={{ marginTop: 16 }}>Đang đọc file hồ sơ...</p>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="hr-status-banner hr-status-error">
            <span>{loadError}</span>
          </div>
        )}

        {!isLoading && !loadError && doc && (
          <form onSubmit={handleSubmit}>
            {isSaved && (
              <div className="hr-status-banner hr-status-success">
                <span>Đã lưu hồ sơ.</span>
              </div>
            )}

            {saveNotice && (
              <div className="hr-status-banner hr-status-error">
                <span>{saveNotice}</span>
              </div>
            )}

            {saveError && (
              <div className="hr-status-banner hr-status-error">
                <span>{saveError}</span>
              </div>
            )}

            {missingLabels.length > 0 && (
              <div className="hr-status-banner hr-status-error">
                <span>
                  Không đọc được các mục sau trong file: {missingLabels.join(', ')}.
                  Bấm lưu sẽ ghi giá trị trong form đè lên chúng, nên hãy kiểm tra lại trước khi lưu.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Mã nhân sự: <strong>{doc.localId || 'không có'}</strong></span>
              <span>Ngày tạo hồ sơ: <strong>{doc.createDate || 'không có'}</strong></span>
            </div>

            {SECTIONS.map(section => (
              <div key={section.title}>
                <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, fontSize: '1.1rem' }}>
                  {section.title}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
                  {section.fields.map(field => (
                    <div key={field.key} style={field.fullWidth ? { gridColumn: '1 / -1' } : undefined}>
                      <label className="hr-label">{field.label}</label>
                      {field.type === 'select' ? (
                        <select
                          className="hr-input"
                          value={doc[field.key]}
                          onChange={(event) => handleChange(field.key, event.target.value)}
                          disabled={isSaving}
                        >
                          {/* Không có dòng trống thì trình duyệt hiện option đầu tiên, và lưu
                              sẽ âm thầm ghi giá trị đó thay cho giá trị rỗng trong file. */}
                          {!doc[field.key] && <option value="">-- Chọn --</option>}
                          {withCurrentOption(field.options ?? [], doc[field.key]).map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="hr-input"
                          type={field.type === 'date' ? 'date' : 'text'}
                          value={doc[field.key]}
                          onChange={(event) => handleChange(field.key, event.target.value)}
                          disabled={isSaving}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="hr-btn" onClick={handleClose} disabled={isSaving}>
                Đóng
              </button>
              <button type="submit" className="hr-btn hr-btn-accent" disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
