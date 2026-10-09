import type { FormEvent } from 'react';
import {
  ApartmentOutlined,
  ClockCircleOutlined,
  DollarCircleOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';

import type { RecruitmentDepartment } from '../recruitment-departments';
import { StudioDialog, StudioInlineState } from '../studio/StudioPrimitives';
import type { StructuredRecruitmentJob, RecruitmentJobDraft } from './recruitment-jobs';

interface RecruitmentJobFormDialogProps {
  open: boolean;
  draft: RecruitmentJobDraft;
  departments: RecruitmentDepartment[];
  departmentKey: string;
  isSaving: boolean;
  saveError: string;
  onDepartmentChange: (departmentKey: string) => void;
  onDraftChange: (draft: RecruitmentJobDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

export function RecruitmentJobFormDialog({
  open,
  draft,
  departments,
  departmentKey,
  isSaving,
  saveError,
  onDepartmentChange,
  onDraftChange,
  onSubmit,
  onClose,
}: RecruitmentJobFormDialogProps) {
  const update = (field: keyof RecruitmentJobDraft, value: string) => {
    onDraftChange({ ...draft, [field]: value });
  };

  return (
    <StudioDialog
      open={open}
      title="Tạo JD mới"
      onClose={onClose}
      className="recruitment-job-dialog recruitment-job-form-dialog"
    >
      <form className="recruitment-job-form" onSubmit={onSubmit}>
        <div className="recruitment-job-form__grid">
          <label className="recruitment-job-form__wide">
            <span>Phòng ban *</span>
            <select name="departmentKey" value={departmentKey} onChange={(event) => onDepartmentChange(event.target.value)} required>
              <option value="">Chọn phòng ban</option>
              {departments.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label><span>Vị trí tuyển dụng *</span><input name="title" list="recruitment-title-options" value={draft.title} onChange={(event) => update('title', event.target.value)} required /></label>
          <label><span>Thời gian làm việc *</span><input name="employmentType" list="recruitment-employment-type-options" value={draft.employmentType} onChange={(event) => update('employmentType', event.target.value)} placeholder="Full-time" required /></label>
          <label><span>Mức lương *</span><input name="salary" list="recruitment-salary-options" value={draft.salary} onChange={(event) => update('salary', event.target.value)} required /></label>
          <label><span>Địa điểm làm việc</span><input name="location" list="recruitment-location-options" value={draft.location} onChange={(event) => update('location', event.target.value)} /></label>
          <label className="recruitment-job-form__wide"><span>Mô tả ngắn *</span><textarea name="summary" value={draft.summary} onChange={(event) => update('summary', event.target.value)} required /></label>
          <label className="recruitment-job-form__wide"><span>Mô tả công việc</span><textarea name="description" value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="Mỗi dòng là một đầu việc" /></label>
          <label><span>Kinh nghiệm</span><input name="experience" list="recruitment-experience-options" value={draft.experience} onChange={(event) => update('experience', event.target.value)} /></label>
          <label><span>Học vấn</span><input name="education" list="recruitment-education-options" value={draft.education} onChange={(event) => update('education', event.target.value)} /></label>
          <label className="recruitment-job-form__wide"><span>Kỹ năng chuyên môn *</span><textarea name="professionalSkills" value={draft.professionalSkills} onChange={(event) => update('professionalSkills', event.target.value)} required /></label>
          <label className="recruitment-job-form__wide"><span>Kỹ năng mềm</span><textarea name="softSkills" value={draft.softSkills} onChange={(event) => update('softSkills', event.target.value)} /></label>
          <label className="recruitment-job-form__wide"><span>Quyền lợi</span><textarea name="benefits" value={draft.benefits} onChange={(event) => update('benefits', event.target.value)} /></label>
          <label><span>Email nhận CV</span><input name="contactEmail" type="email" value={draft.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} /></label>
          <label><span>Tiêu đề email</span><input name="emailSubject" value={draft.emailSubject} onChange={(event) => update('emailSubject', event.target.value)} /></label>
          <datalist id="recruitment-title-options">
            <option value="Lập trình viên Front-end" />
            <option value="Lập trình viên Back-end" />
            <option value="Lập trình viên Mobile" />
            <option value="Data Analyst" />
            <option value="Chuyên viên Nhân sự" />
            <option value="Chuyên viên Marketing" />
          </datalist>
          <datalist id="recruitment-employment-type-options">
            <option value="Full-time" />
            <option value="Part-time" />
            <option value="Thực tập sinh (Intern)" />
            <option value="Cộng tác viên (CTV)" />
          </datalist>
          <datalist id="recruitment-salary-options">
            <option value="Thỏa thuận theo năng lực" />
            <option value="10.000.000 - 15.000.000 VNĐ" />
            <option value="15.000.000 - 20.000.000 VNĐ" />
            <option value="20.000.000 - 30.000.000 VNĐ" />
            <option value="Cạnh tranh trên thị trường" />
          </datalist>
          <datalist id="recruitment-location-options">
            <option value="Hà Nội" />
            <option value="TP. Hồ Chí Minh" />
            <option value="Đà Nẵng" />
            <option value="Remote" />
            <option value="Hybrid" />
          </datalist>
          <datalist id="recruitment-experience-options">
            <option value="Không yêu cầu kinh nghiệm" />
            <option value="Dưới 1 năm kinh nghiệm" />
            <option value="1-2 năm kinh nghiệm" />
            <option value="3-5 năm kinh nghiệm" />
            <option value="Trên 5 năm kinh nghiệm" />
          </datalist>
          <datalist id="recruitment-education-options">
            <option value="Không yêu cầu bằng cấp" />
            <option value="Tốt nghiệp Cao đẳng trở lên" />
            <option value="Tốt nghiệp Đại học trở lên" />
            <option value="Tốt nghiệp Đại học chuyên ngành CNTT" />
            <option value="Đang là sinh viên năm 3, năm 4" />
          </datalist>
        </div>
        {saveError ? <StudioInlineState tone="danger">{saveError}</StudioInlineState> : null}
        <div className="recruitment-job-form__actions">
          <button type="button" className="studio-button studio-button--secondary" onClick={onClose} disabled={isSaving}>Hủy</button>
          <button type="submit" className="studio-button studio-button--primary" disabled={isSaving || !departmentKey}>{isSaving ? 'Đang lưu…' : 'Lưu JD'}</button>
        </div>
      </form>
    </StudioDialog>
  );
}

interface RecruitmentJobDetailDialogProps {
  job: StructuredRecruitmentJob | null;
  isDownloading: boolean;
  downloadError: string;
  onClose: () => void;
  onDownload: (job: StructuredRecruitmentJob) => void;
  onEditWithAI: (job: StructuredRecruitmentJob) => void;
  onUseInPipeline: (job: StructuredRecruitmentJob) => void;
}

function LineList({ value }: { value: string }) {
  const items = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (items.length === 0) return <p>Chưa cập nhật</p>;
  return <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
}

export function RecruitmentJobDetailDialog({
  job,
  isDownloading,
  downloadError,
  onClose,
  onDownload,
  onEditWithAI,
  onUseInPipeline,
}: RecruitmentJobDetailDialogProps) {
  if (!job) return null;
  return (
    <StudioDialog
      open
      title={job.title}
      onClose={onClose}
      className="recruitment-job-dialog recruitment-job-detail-dialog"
      actions={<>
        <button
          type="button"
          className="studio-button studio-button--secondary"
          onClick={() => onDownload(job)}
          disabled={isDownloading}
        >
          <DownloadOutlined /> {isDownloading ? 'Đang tải…' : 'Tải JD'}
        </button>
        <button type="button" className="studio-button studio-button--secondary" onClick={() => onEditWithAI(job)}>Chỉnh với AI</button>
        <button type="button" className="studio-button studio-button--primary" onClick={() => onUseInPipeline(job)}>Dùng để sàng lọc CV</button>
      </>}
    >
      <div className="recruitment-job-detail__meta" aria-label="Thông tin chính của JD">
        <span className="recruitment-job-detail__pill recruitment-job-detail__pill--department"><ApartmentOutlined /> {job.departmentLabel}</span>
        <span className="recruitment-job-detail__pill recruitment-job-detail__pill--employment"><ClockCircleOutlined /> {job.employmentType}</span>
        <span className="recruitment-job-detail__pill recruitment-job-detail__pill--salary"><DollarCircleOutlined /> {job.salary}</span>
      </div>
      <div className="recruitment-job-detail__location"><EnvironmentOutlined /><span>{job.location}</span></div>
      <article className="recruitment-job-detail__document">
        <h3><strong>TUYỂN DỤNG:</strong> {job.title}</h3>
        <dl className="recruitment-job-detail__facts">
          <div><dt>Phòng ban:</dt><dd>{job.departmentLabel}</dd></div>
          <div><dt>Địa điểm:</dt><dd>{job.location}</dd></div>
          <div><dt>Hình thức:</dt><dd>{job.employmentType}</dd></div>
          <div><dt>Mức lương:</dt><dd>{job.salary}</dd></div>
        </dl>
        <section><h3>Tổng quan</h3><p>{job.summary || 'Chưa cập nhật'}</p></section>
        <section><h3>Mô tả công việc</h3><LineList value={job.description} /></section>
        <section><h3>Yêu cầu</h3><LineList value={job.requirements} /></section>
        <section><h3>Quyền lợi</h3><LineList value={job.benefits} /></section>
        <section>
          <h3>Ứng tuyển</h3>
          <dl className="recruitment-job-detail__application">
            <div><dt>Email nhận CV</dt><dd>{job.contactEmail || 'Chưa cập nhật'}</dd></div>
            <div><dt>Tiêu đề email</dt><dd>{job.emailSubject || 'Chưa cập nhật'}</dd></div>
          </dl>
        </section>
      </article>
      <p className="recruitment-job-detail__filename">Tệp nguồn: {job.fileName}</p>
      {downloadError ? <StudioInlineState tone="danger">{downloadError}</StudioInlineState> : null}
    </StudioDialog>
  );
}
