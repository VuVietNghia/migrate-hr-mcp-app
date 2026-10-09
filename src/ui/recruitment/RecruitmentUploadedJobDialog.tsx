import { ApartmentOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';

import { JDDocumentPreview } from '../jd-document/JDDocumentPreview';
import { StudioDialog, StudioInlineState } from '../studio/StudioPrimitives';
import type { UploadedRecruitmentJob } from './recruitment-uploaded-jobs';

interface RecruitmentUploadedJobDialogProps {
  job: UploadedRecruitmentJob | null;
  text?: string;
  blob?: Blob | null;
  loading: boolean;
  error: string;
  isDownloading: boolean;
  downloadError: string;
  onClose: () => void;
  onDownload: (job: UploadedRecruitmentJob) => void;
  onEditWithAI: (job: UploadedRecruitmentJob) => void;
  onUseInPipeline: (job: UploadedRecruitmentJob) => void;
}

export function RecruitmentUploadedJobDialog(props: RecruitmentUploadedJobDialogProps) {
  const { job } = props;
  if (!job) return null;
  return (
    <StudioDialog
      open
      title={job.fileName}
      onClose={props.onClose}
      className="recruitment-job-dialog recruitment-uploaded-job-dialog"
      actions={<>
        <button type="button" className="studio-button studio-button--secondary" onClick={() => props.onDownload(job)} disabled={props.isDownloading}>
          <DownloadOutlined /> {props.isDownloading ? 'Đang tải…' : 'Tải JD'}
        </button>
        {job.format === 'markdown' ? (
          <button type="button" className="studio-button studio-button--secondary" onClick={() => props.onEditWithAI(job)}>Chỉnh với AI</button>
        ) : null}
        <button type="button" className="studio-button studio-button--primary" onClick={() => props.onUseInPipeline(job)}>Dùng để sàng lọc CV</button>
      </>}
    >
      <div className="recruitment-uploaded-job__meta">
        <span><ApartmentOutlined /> {job.departmentLabel}</span>
        <span><FileTextOutlined /> {job.format === 'markdown' ? 'Markdown' : job.format === 'word' ? 'Word' : 'PDF'}</span>
      </div>
      <JDDocumentPreview fileName={job.fileName} text={props.text} blob={props.blob} loading={props.loading} error={props.error} />
      {props.downloadError ? <StudioInlineState tone="danger">{props.downloadError}</StudioInlineState> : null}
    </StudioDialog>
  );
}
