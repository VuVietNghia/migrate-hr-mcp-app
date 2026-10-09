import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { FileAddOutlined, UploadOutlined } from '@ant-design/icons';

import type { RecruitmentDepartment } from '../recruitment-departments';
import { StudioDialog, StudioInlineState } from '../studio/StudioPrimitives';
import type { UploadedRecruitmentFileRef } from './recruitment-job-upload';
import { getRecruitmentJobFormat, validateRecruitmentJobFiles } from './recruitment-uploaded-jobs';

interface RecruitmentJobUploadDialogProps {
  open: boolean;
  file: File | null;
  departmentKey: string;
  departments: RecruitmentDepartment[];
  error: string;
  isSaving: boolean;
  uploadedFile?: UploadedRecruitmentFileRef;
  onFileChange: (file: File | null) => void;
  onDepartmentChange: (departmentKey: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function formatLabel(fileName: string): string {
  const format = getRecruitmentJobFormat(fileName);
  return format === 'markdown' ? 'Markdown' : format === 'word' ? 'Word' : format === 'pdf' ? 'PDF' : 'Không hỗ trợ';
}

export function RecruitmentJobUploadDialog(props: RecruitmentJobUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const validationError = props.file ? validateRecruitmentJobFiles([props.file]) : null;
  const departmentExists = props.departments.some((department) => department.key === props.departmentKey);
  const canSubmit = Boolean(props.file && departmentExists && !validationError && !props.isSaving);
  const chooseDroppedFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    const error = validateRecruitmentJobFiles(files);
    setSelectionError(error ?? '');
    props.onFileChange(error ? null : files[0]);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSubmit) props.onSubmit();
  };

  return (
    <StudioDialog
      open={props.open}
      title="Tải JD từ máy"
      onClose={() => { if (!props.isSaving) props.onClose(); }}
      className="recruitment-job-dialog recruitment-job-upload-dialog"
    >
      <form className="recruitment-job-upload" onSubmit={submit}>
        <input
          ref={inputRef}
          className="studio-sr-only"
          type="file"
          accept=".md,.docx,.pdf"
          onChange={(event) => {
            setSelectionError('');
            props.onFileChange(event.target.files?.[0] ?? null);
          }}
        />
        <div
          className={`recruitment-job-upload__dropzone${dragging ? ' is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={chooseDroppedFile}
        >
          <UploadOutlined aria-hidden="true" />
          <strong>Kéo thả JD vào đây</strong>
          <span>hoặc bấm để chọn một file .md, .docx, .pdf</span>
        </div>
        {props.file ? (
          <div className="recruitment-job-upload__file"><FileAddOutlined /><span><strong>{props.file.name}</strong><small>{formatLabel(props.file.name)}</small></span></div>
        ) : null}
        <label className="recruitment-job-upload__department">
          <span>Phòng ban *</span>
          <select value={props.departmentKey} onChange={(event) => props.onDepartmentChange(event.target.value)} required>
            <option value="">Chọn phòng ban</option>
            {props.departments.map((department) => <option key={department.key} value={department.key}>{department.label}</option>)}
          </select>
        </label>
        {props.uploadedFile ? <StudioInlineState tone="info">File đã được tải lên. Chỉ cần thử lưu phòng ban lại.</StudioInlineState> : null}
        {selectionError || validationError || props.error ? <StudioInlineState tone="danger">{selectionError || validationError || props.error}</StudioInlineState> : null}
        <div className="recruitment-job-upload__actions">
          <button type="button" className="studio-button studio-button--secondary" onClick={props.onClose} disabled={props.isSaving}>Hủy</button>
          <button type="submit" className="studio-button studio-button--primary" disabled={!canSubmit}>
            {props.isSaving ? 'Đang lưu…' : props.uploadedFile ? 'Thử lưu phòng ban lại' : 'Tải JD lên'}
          </button>
        </div>
      </form>
    </StudioDialog>
  );
}
