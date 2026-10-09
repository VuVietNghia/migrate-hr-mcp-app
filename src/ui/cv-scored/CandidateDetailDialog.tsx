import { CloseOutlined, CopyOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons';
import type { CandidateApplication } from './candidate-model';
import type { CandidateEvaluationDocument } from './candidate-evaluation';
import { CandidateStudioSelect } from './CandidateStudioSelect';
import { displayCandidatePosition } from './candidate-view-model';

export interface CandidateDetailDialogProps {
  open: boolean;
  candidate: CandidateApplication | null;
  stageOptions: Array<{ value: string; label: string }>;
  evaluation: CandidateEvaluationDocument | null;
  evaluationLoading: boolean;
  evaluationError: string | null;
  onClose: () => void;
  onStageChange: (status: string) => void;
  onInvite: () => void;
  onOpenEmployeeCreate: () => void;
  onDownload: () => void;
}

const displayName = (name: string) => name.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}_CV_/, '').replace(/-[a-f0-9]{6}$/i, '').replace(/_/g, ' ');
const initials = (name: string) => displayName(name).split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();

export function CandidateDetailDialog(props: CandidateDetailDialogProps) {
  const candidate = props.candidate;
  if (!props.open || !candidate) return null;
  const employeeAllowed = candidate.status === '05_Moi_Phong_Van' || candidate.status === '08_Da_Phong_Van';
  return (
    <div className='candidate-detail-backdrop' role='presentation' onMouseDown={props.onClose}>
      <section className='candidate-detail-dialog' role='dialog' aria-modal='true' aria-label='Hồ sơ ứng viên' onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className='studio-eyebrow'>HR WORKSPACE</span><h2>Hồ sơ ứng viên</h2></div><button type='button' onClick={props.onClose} aria-label='Đóng'><CloseOutlined /></button></header>
        <div className='candidate-detail-summary'>
          <span className='candidate-studio-avatar'>{initials(candidate.name)}</span>
          <div className='candidate-detail-summary__identity'><h3>{displayName(candidate.name)}</h3><p className='candidate-detail-position'>{displayCandidatePosition(candidate)}</p>{candidate.recruitmentPeriod ? <small className='candidate-detail-period'>{candidate.recruitmentPeriod}</small> : null}</div>
          <strong>{candidate.score ?? '—'}<small>/100 điểm</small></strong>
        </div>
        <div className='candidate-detail-badges'><span className='candidate-studio-badge is-info'>• {candidate.category || 'Chưa phân loại'}</span>{candidate.departmentLabel ? <span className='candidate-studio-badge candidate-detail-department'>{candidate.departmentLabel}</span> : null}<span className='candidate-studio-badge is-neutral'>{candidate.status}</span></div>
        <div className='candidate-detail-grid'>
          <div className='candidate-detail-main'>
            <section className='candidate-detail-status'>
              <label>Trạng thái tuyển dụng<CandidateStudioSelect ariaLabel="Trạng thái tuyển dụng" value={candidate.status} groupLabel="Trạng thái tuyển dụng" options={props.stageOptions} onChange={props.onStageChange} /></label>
            </section>
            <section className='candidate-detail-contact-grid' aria-label='Liên hệ ứng viên'>
              <div><dt>Email</dt><dd><span>{candidate.email || 'Chưa có'}</span>{candidate.email ? <button type='button' aria-label='Sao chép email' onClick={() => void navigator.clipboard?.writeText(candidate.email || '')}><CopyOutlined /></button> : null}</dd></div>
              <div><dt>Điện thoại</dt><dd><span>{candidate.sdt || 'Chưa có'}</span>{candidate.sdt ? <button type='button' aria-label='Sao chép số điện thoại' onClick={() => void navigator.clipboard?.writeText(candidate.sdt || '')}><CopyOutlined /></button> : null}</dd></div>
            </section>
            <section className='candidate-detail-reason-panel'>
              <span className='studio-eyebrow'>ĐÁNH GIÁ</span>
              <p className='candidate-detail-reason'>{candidate.reason || 'Chưa có nhận xét đánh giá.'}</p>
            </section>
            <div className='candidate-detail-actions'>
              <button type='button' onClick={props.onInvite}><MailOutlined /> Gửi email phỏng vấn</button>
              {employeeAllowed ? <button type='button' onClick={props.onOpenEmployeeCreate}><TeamOutlined /> Tạo hồ sơ nhân sự</button> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
