import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';

import { MarkdownPathContextBuilder } from './cv-context-builder';
import { CompanyDocumentRepository } from './company/company-documents';
import { createOrUpdateFile, readRoomFileText } from './privos-rest';
import { PipelineService } from './pipeline-service';
import {
  RecruitmentDepartmentForm,
  RecruitmentDepartmentRenameForm,
} from './recruitment-department-form';
import {
  AppDbRecruitmentDepartmentStore,
  DEFAULT_RECRUITMENT_DEPARTMENTS,
  createRecruitmentRoomOperation,
  isRecruitmentDepartmentRenameable,
  mergeRecruitmentDepartments,
  type RecruitmentDepartment,
} from './recruitment-departments';
import {
  RecruitmentJobDetailDialog,
  RecruitmentJobFormDialog,
} from './recruitment/RecruitmentJobDialogs';
import { RecruitmentJobUploadDialog } from './recruitment/RecruitmentJobUploadDialog';
import { RecruitmentUploadedJobDialog } from './recruitment/RecruitmentUploadedJobDialog';
import {
  EMPTY_RECRUITMENT_JOB_DRAFT,
  buildRecruitmentJobDocument,
  filterRecruitmentJobs,
  getInitialJobDepartmentKey,
  getRecruitmentEmptyState,
  paginateRecruitmentJobs,
  parseRecruitmentJob,
  type RecruitmentJob,
  type RecruitmentJobDraft,
  type StructuredRecruitmentJob,
} from './recruitment/recruitment-jobs';
import { AppDbRecruitmentJobFileRepository } from './recruitment/recruitment-job-file-repository';
import {
  RecruitmentJobMetadataSaveError,
  submitRecruitmentJobUpload,
  type UploadedRecruitmentFileRef,
} from './recruitment/recruitment-job-upload';
import { mergeRecruitmentJobs } from './recruitment/recruitment-uploaded-jobs';
import { readRecruitmentJobDownload } from './recruitment/recruitment-job-download';
import { loadEvaluatedCandidateCount } from './recruitment/recruitment-metrics';
import {
  StudioInlineState,
  StudioMetricCard,
  StudioPage,
  StudioPageHeader,
  StudioSearchInput,
} from './studio/StudioPrimitives';
import type { AppTab } from './studio/studio-navigation';
import type { StudioNavigationIntent } from './studio/studio-navigation-intent';

interface RecruitmentPanelProps {
  active: boolean;
  onNavigate: (target: AppTab, context?: Pick<StudioNavigationIntent, 'jd'>) => void;
}

type DepartmentFilter = 'all' | string;

const DEFAULT_DEPARTMENTS = DEFAULT_RECRUITMENT_DEPARTMENTS.map((item) => ({ ...item }));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function recruitmentJobNavigationContext(job: RecruitmentJob): Pick<StudioNavigationIntent, 'jd'> {
  return { jd: { fileId: job.fileId, fileName: job.fileName } };
}

export function resolveJobDetailAfterTabActivityChange(
  active: boolean,
  selectedJob: RecruitmentJob | null,
): RecruitmentJob | null {
  return active ? selectedJob : null;
}

export function shouldApplyRecruitmentPreviewResult(
  requestId: number,
  currentRequestId: number,
  roomOperationCurrent: boolean,
): boolean {
  return roomOperationCurrent && requestId === currentRequestId;
}

interface RecruitmentJobPagerProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

export function RecruitmentJobPager({ page, pageCount, onPageChange }: RecruitmentJobPagerProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className="recruitment-studio-pagination" aria-label="Phân trang vị trí tuyển dụng">
      <button
        type="button"
        className="studio-icon-button"
        aria-label="Trang trước"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
      >
        <LeftOutlined />
      </button>
      <span aria-live="polite">Trang {page + 1} / {pageCount}</span>
      <button
        type="button"
        className="studio-icon-button"
        aria-label="Trang sau"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        <RightOutlined />
      </button>
    </nav>
  );
}

export function RecruitmentJobCard({ job, onOpen }: { job: RecruitmentJob; onOpen: (job: RecruitmentJob) => void }) {
  if (job.kind === 'uploaded') {
    const format = job.format === 'markdown' ? 'Markdown' : job.format === 'word' ? 'Word' : 'PDF';
    return (
      <article className="recruitment-studio-job-card recruitment-studio-job-card--uploaded">
        <span className="recruitment-studio-job-card__department">{job.departmentLabel}</span>
        <h3>{job.fileName}</h3>
        <p>JD được người dùng tải lên từ máy</p>
        <div className="recruitment-studio-job-card__meta"><span><FileTextOutlined /> {format}</span></div>
        <button type="button" onClick={() => onOpen(job)}>Xem chi tiết <ArrowRightOutlined /></button>
      </article>
    );
  }
  return (
    <article className="recruitment-studio-job-card">
      <span className="recruitment-studio-job-card__department">{job.departmentLabel}</span>
      <h3>{job.title}</h3>
      <p>{job.summary || 'Chưa có mô tả ngắn cho vị trí này.'}</p>
      <div className="recruitment-studio-job-card__location"><EnvironmentOutlined /> {job.location}</div>
      <div className="recruitment-studio-job-card__meta">
        <span><ClockCircleOutlined /> {job.employmentType}</span>
        <strong>{job.salary}</strong>
      </div>
      <button type="button" onClick={() => onOpen(job)}>Xem chi tiết <ArrowRightOutlined /></button>
    </article>
  );
}

export default function RecruitmentPanel({ active, onNavigate }: RecruitmentPanelProps) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const roomContextRef = useRef({ app, roomId });
  const roomOperationRef = useRef<ReturnType<typeof createRecruitmentRoomOperation> | null>(null);
  const previewRequestRef = useRef(0);
  roomContextRef.current = { app, roomId };

  const [departments, setDepartments] = useState<RecruitmentDepartment[]>(DEFAULT_DEPARTMENTS);
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  const [jobs, setJobs] = useState<RecruitmentJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<RecruitmentJob | null>(null);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [downloadJDError, setDownloadJDError] = useState('');
  const [query, setQuery] = useState('');
  const [jobPage, setJobPage] = useState(0);
  const [isMobileJobGrid, setIsMobileJobGrid] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 720px)').matches
  ));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadSequence, setReloadSequence] = useState(0);

  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [candidateMetricLoading, setCandidateMetricLoading] = useState(true);
  const [candidateMetricError, setCandidateMetricError] = useState('');

  const [showJobForm, setShowJobForm] = useState(false);
  const [draft, setDraft] = useState<RecruitmentJobDraft>(EMPTY_RECRUITMENT_JOB_DRAFT);
  const [jobDepartmentKey, setJobDepartmentKey] = useState('');
  const [isSavingJD, setIsSavingJD] = useState(false);
  const [saveJDError, setSaveJDError] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDepartmentKey, setUploadDepartmentKey] = useState('');
  const [isUploadingJD, setIsUploadingJD] = useState(false);
  const [uploadJDError, setUploadJDError] = useState('');
  const [uploadedFileRef, setUploadedFileRef] = useState<UploadedRecruitmentFileRef | undefined>();
  const [uploadCreatedAt, setUploadCreatedAt] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [isSavingDepartment, setIsSavingDepartment] = useState(false);
  const [departmentError, setDepartmentError] = useState('');

  const [showRenameDepartmentForm, setShowRenameDepartmentForm] = useState(false);
  const [renamedDepartmentName, setRenamedDepartmentName] = useState('');
  const [isRenamingDepartment, setIsRenamingDepartment] = useState(false);
  const [renameDepartmentError, setRenameDepartmentError] = useState('');

  useEffect(() => {
    if (active) return;
    previewRequestRef.current += 1;
    setSelectedJob((current) => resolveJobDetailAfterTabActivityChange(active, current));
    setDownloadJDError('');
  }, [active]);

  useEffect(() => {
    setDepartments(DEFAULT_DEPARTMENTS);
    setDepartment('all');
    setJobs([]);
    setSelectedJob(null);
    setDownloadingJobId(null);
    setDownloadJDError('');
    setQuery('');
    setJobPage(0);
    setLoadError('');
    setCandidateCount(null);
    setCandidateMetricError('');
    setShowJobForm(false);
    setDraft(EMPTY_RECRUITMENT_JOB_DRAFT);
    setJobDepartmentKey('');
    setShowUploadDialog(false);
    setUploadFile(null);
    setUploadDepartmentKey('');
    setIsUploadingJD(false);
    setUploadJDError('');
    setUploadedFileRef(undefined);
    setUploadCreatedAt('');
    setPreviewText('');
    setPreviewBlob(null);
    setPreviewLoading(false);
    setPreviewError('');
    setShowDepartmentForm(false);
    setDepartmentName('');
    setDepartmentError('');
    setShowRenameDepartmentForm(false);
    setRenamedDepartmentName('');
    setRenameDepartmentError('');
  }, [app, roomId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const syncViewport = () => setIsMobileJobGrid(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    roomOperationRef.current = null;
    if (!app || !roomId) {
      setIsLoading(false);
      setCandidateMetricLoading(false);
      return;
    }

    const operation = createRecruitmentRoomOperation(app, roomId);
    roomOperationRef.current = operation;
    setIsLoading(true);
    setLoadError('');
    setCandidateMetricLoading(true);
    setCandidateMetricError('');

    void loadEvaluatedCandidateCount(app, roomId)
      .then((count) => {
        if (!operation.isCurrent(roomContextRef.current)) return;
        setCandidateCount(count);
      })
      .catch((error: unknown) => {
        console.error('Failed to load evaluated candidate metric', error);
        if (!operation.isCurrent(roomContextRef.current)) return;
        setCandidateCount(null);
        setCandidateMetricError('Không tải được dữ liệu ứng viên');
      })
      .finally(() => {
        if (operation.isCurrent(roomContextRef.current)) setCandidateMetricLoading(false);
      });

    const loadRecruitment = async () => {
      try {
        const service = new PipelineService(app, roomId, new MarkdownPathContextBuilder());
        const departmentStore = new AppDbRecruitmentDepartmentStore(app, roomId);
        const metadataRepository = new AppDbRecruitmentJobFileRepository(app, roomId);
        const [files, storedDepartments, uploadedMetadata] = await Promise.all([
          service.fetchAvailableJDs(),
          departmentStore.list().catch((error: unknown) => {
            console.error('Failed to load recruitment departments from App Database', error);
            if (operation.isCurrent(roomContextRef.current)) {
              setDepartmentError('Không tải được các phòng ban đã lưu; JD trong Room vẫn được hiển thị.');
            }
            return [];
          }),
          metadataRepository.list(),
        ]);

        const uploadedIds = new Set(uploadedMetadata.map((item) => item.fileId));
        const parsedJobs = (await Promise.all(files.map(async (file) => {
          if (uploadedIds.has(file._id)) return null;
          if (!/^JD_(?!AI_)/i.test(file.name)) return null;
          try {
            const content = await readRoomFileText(app, { _id: file._id, downloadUrl: file.downloadUrl });
            return content ? parseRecruitmentJob(file, content) : null;
          } catch (error) {
            console.warn(`[Recruitment] Không đọc được JD ${file.name}:`, error);
            return null;
          }
        }))).filter((job): job is StructuredRecruitmentJob => job !== null);

        const mergedDepartments = mergeRecruitmentDepartments(
          storedDepartments,
          parsedJobs.map((job) => ({ key: job.departmentKey, label: job.departmentLabel })),
        );
        if (!operation.isCurrent(roomContextRef.current)) return;
        setDepartments(mergedDepartments);
        setJobs(mergeRecruitmentJobs(files, parsedJobs, uploadedMetadata, mergedDepartments));
      } catch (error) {
        console.error('Failed to load recruitment data', error);
        if (operation.isCurrent(roomContextRef.current)) {
          setLoadError(`Không thể tải danh sách JD: ${errorMessage(error)}`);
        }
      } finally {
        if (operation.isCurrent(roomContextRef.current)) setIsLoading(false);
      }
    };

    void loadRecruitment();
    return () => {
      operation.cancel();
      if (roomOperationRef.current === operation) roomOperationRef.current = null;
    };
  }, [app, roomId, reloadSequence]);

  const countsByDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of jobs) counts.set(job.departmentKey, (counts.get(job.departmentKey) ?? 0) + 1);
    return counts;
  }, [jobs]);

  const visibleJobs = useMemo(
    () => filterRecruitmentJobs(jobs, department, query),
    [department, jobs, query],
  );

  const paginatedJobs = useMemo(
    () => paginateRecruitmentJobs(visibleJobs, jobPage, isMobileJobGrid),
    [isMobileJobGrid, jobPage, visibleJobs],
  );

  useEffect(() => {
    setJobPage(0);
  }, [department, isMobileJobGrid, jobs, query]);

  const selectDepartment = (key: DepartmentFilter) => {
    previewRequestRef.current += 1;
    setDepartment(key);
    setSelectedJob(null);
    setDownloadJDError('');
    setShowRenameDepartmentForm(false);
    setRenamedDepartmentName('');
    setRenameDepartmentError('');
  };

  const openJobForm = () => {
    if (departments.length === 0) return;
    setJobDepartmentKey(getInitialJobDepartmentKey(department));
    setSelectedJob(null);
    setSaveJDError('');
    setShowJobForm(true);
  };

  const openJobDetail = async (job: RecruitmentJob) => {
    const previewRequestId = ++previewRequestRef.current;
    setDownloadJDError('');
    setSelectedJob(job);
    setPreviewText('');
    setPreviewBlob(null);
    setPreviewError('');
    if (job.kind !== 'uploaded') return;
    if (!app || !roomId) {
      setPreviewError('Không thể xem JD vì chưa kết nối PrivOS.');
      return;
    }
    const operation = roomOperationRef.current;
    const previewIsCurrent = () => shouldApplyRecruitmentPreviewResult(
      previewRequestId,
      previewRequestRef.current,
      Boolean(operation?.isCurrent(roomContextRef.current)),
    );
    setPreviewLoading(true);
    try {
      if (job.format === 'markdown') {
        const text = await readRoomFileText(app, { _id: job.fileId, downloadUrl: job.downloadUrl });
        if (previewIsCurrent()) setPreviewText(text);
      } else {
        const { blob } = await new CompanyDocumentRepository(app, roomId).readBlob({
          id: job.fileId,
          name: job.fileName,
          downloadUrl: job.downloadUrl,
        });
        if (previewIsCurrent()) setPreviewBlob(blob);
      }
    } catch (error) {
      if (previewIsCurrent()) setPreviewError(`Không thể xem trước JD: ${errorMessage(error)}`);
    } finally {
      if (previewIsCurrent()) setPreviewLoading(false);
    }
  };

  const downloadJob = async (job: RecruitmentJob) => {
    if (downloadingJobId) return;
    if (!app) {
      setDownloadJDError('Không thể tải JD vì chưa kết nối PrivOS.');
      return;
    }

    const operation = roomOperationRef.current;
    setDownloadingJobId(job.fileId);
    setDownloadJDError('');
    try {
      const downloaded = job.kind === 'uploaded' && job.format !== 'markdown' && roomId
        ? await new CompanyDocumentRepository(app, roomId).readBlob({ id: job.fileId, name: job.fileName, downloadUrl: job.downloadUrl })
        : await readRecruitmentJobDownload(app, job);
      if (!operation?.isCurrent(roomContextRef.current)) return;
      const url = URL.createObjectURL(downloaded.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = downloaded.fileName;
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      if (operation?.isCurrent(roomContextRef.current)) {
        setDownloadJDError(`Không thể tải JD: ${errorMessage(error)}`);
      }
    } finally {
      if (operation?.isCurrent(roomContextRef.current)) setDownloadingJobId(null);
    }
  };

  const submitUploadedJob = async () => {
    if (isUploadingJD || !uploadFile || !uploadDepartmentKey || !app || !roomId) return;
    const operation = roomOperationRef.current;
    if (!operation?.isCurrent(roomContextRef.current)) return;
    if (!departments.some((item) => item.key === uploadDepartmentKey)) {
      setUploadJDError('Phòng ban đã chọn không còn tồn tại. Vui lòng chọn lại.');
      return;
    }
    setIsUploadingJD(true);
    setUploadJDError('');
    const createdAt = uploadCreatedAt || new Date().toISOString();
    if (!uploadCreatedAt) setUploadCreatedAt(createdAt);
    try {
      const service = new PipelineService(app, roomId, new MarkdownPathContextBuilder());
      await submitRecruitmentJobUpload({
        file: uploadFile,
        departmentKey: uploadDepartmentKey,
        createdAt,
        uploadedFile: uploadedFileRef,
      }, {
        upload: (file) => service.uploadJD(file),
        listFiles: () => service.fetchAvailableJDs(),
        upsert: (metadata) => new AppDbRecruitmentJobFileRepository(app, roomId).upsert(metadata),
      });
      if (!operation.isCurrent(roomContextRef.current)) return;
      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadDepartmentKey('');
      setUploadedFileRef(undefined);
      setUploadCreatedAt('');
      setReloadSequence((value) => value + 1);
    } catch (error) {
      if (!operation.isCurrent(roomContextRef.current)) return;
      if (error instanceof RecruitmentJobMetadataSaveError) setUploadedFileRef(error.file);
      setUploadJDError(errorMessage(error));
    } finally {
      if (operation.isCurrent(roomContextRef.current)) setIsUploadingJD(false);
    }
  };

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingJD) return;
    if (!draft.title.trim() || !draft.summary.trim() || !draft.employmentType.trim()
      || !draft.salary.trim() || !draft.professionalSkills.trim()) return;
    if (!app || !roomId || !jobDepartmentKey) {
      setSaveJDError('Không thể lưu JD vì chưa kết nối Room hoặc chưa chọn phòng ban.');
      return;
    }

    const targetDepartment = departments.find((item) => item.key === jobDepartmentKey);
    if (!targetDepartment) {
      setSaveJDError('Phòng ban đã chọn không còn tồn tại.');
      return;
    }

    const generated = buildRecruitmentJobDocument(draft, targetDepartment, new Date().toISOString());
    setIsSavingJD(true);
    setSaveJDError('');
    try {
      await createOrUpdateFile(app, `${roomId}/hr-miniapp/jds/${generated.fileName}`, generated.content);
      if (!roomOperationRef.current?.isCurrent(roomContextRef.current)) return;
      setDraft(EMPTY_RECRUITMENT_JOB_DRAFT);
      setJobDepartmentKey('');
      setShowJobForm(false);
      setReloadSequence((value) => value + 1);
    } catch (error) {
      console.error('Failed to save JD to Room Files', error);
      if (roomOperationRef.current?.isCurrent(roomContextRef.current)) {
        setSaveJDError(`Không thể lưu JD vào Room Files: ${errorMessage(error)}`);
      }
    } finally {
      if (roomOperationRef.current?.isCurrent(roomContextRef.current)) setIsSavingJD(false);
    }
  };

  const submitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingDepartment || !departmentName.trim() || !app || !roomId) return;
    const operation = roomOperationRef.current;
    if (!operation?.isCurrent(roomContextRef.current)) return;

    setIsSavingDepartment(true);
    setDepartmentError('');
    try {
      const saved = await new AppDbRecruitmentDepartmentStore(app, roomId)
        .create(departmentName, departments.length);
      if (!operation.isCurrent(roomContextRef.current)) return;
      setDepartments((current) => current.some((item) => item.key === saved.key)
        ? current
        : [...current, saved]);
      setDepartment(saved.key);
      setSelectedJob(null);
      setDepartmentName('');
      setShowDepartmentForm(false);
    } catch (error) {
      console.error('Failed to save recruitment department', error);
      if (operation.isCurrent(roomContextRef.current)) {
        setDepartmentError(`Không thể lưu phòng ban vào Room: ${errorMessage(error)}`);
      }
    } finally {
      if (operation.isCurrent(roomContextRef.current)) setIsSavingDepartment(false);
    }
  };

  const submitDepartmentRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRenamingDepartment || !renamedDepartmentName.trim() || !app || !roomId || department === 'all') return;
    if (!isRecruitmentDepartmentRenameable(department)) {
      setRenameDepartmentError('Phòng ban mặc định không thể đổi tên.');
      return;
    }
    const operation = roomOperationRef.current;
    if (!operation?.isCurrent(roomContextRef.current)) return;

    setIsRenamingDepartment(true);
    setRenameDepartmentError('');
    try {
      const order = Math.max(0, departments.findIndex((item) => item.key === department));
      const saved = await new AppDbRecruitmentDepartmentStore(app, roomId)
        .rename(department, renamedDepartmentName, order);
      if (!operation.isCurrent(roomContextRef.current)) return;
      setDepartments((current) => current.map((item) => item.key === saved.key ? saved : item));
      setRenamedDepartmentName('');
      setShowRenameDepartmentForm(false);
    } catch (error) {
      console.error('Failed to rename recruitment department', error);
      if (operation.isCurrent(roomContextRef.current)) {
        setRenameDepartmentError(`Không thể đổi tên phòng ban: ${errorMessage(error)}`);
      }
    } finally {
      if (operation.isCurrent(roomContextRef.current)) setIsRenamingDepartment(false);
    }
  };

  const activeDepartment = department === 'all'
    ? null
    : departments.find((item) => item.key === department) ?? null;
  const departmentJobCount = department === 'all'
    ? jobs.length
    : countsByDepartment.get(department) ?? 0;
  const emptyState = getRecruitmentEmptyState({
    totalJobCount: jobs.length,
    departmentJobCount,
    hasQuery: Boolean(query.trim()),
  });

  return (
    <StudioPage className="recruitment-studio-page">
      <StudioPageHeader
        eyebrow="TUYỂN DỤNG"
        title="Vị trí tuyển dụng"
        description="Tổ chức phòng ban và quản lý mô tả công việc trong Room của bạn."
        actions={(
          <>
            <button type="button" className="studio-button studio-button--secondary recruitment-studio-header-action" onClick={() => setShowDepartmentForm(true)}>
              <ApartmentOutlined /> Phòng ban
            </button>
            <button
              type="button"
              className="studio-button studio-button--secondary recruitment-studio-header-action"
              onClick={() => {
                setUploadDepartmentKey(getInitialJobDepartmentKey(department));
                setUploadJDError('');
                setShowUploadDialog(true);
              }}
              disabled={departments.length === 0}
            >
              <UploadOutlined /> Tải JD
            </button>
            <button type="button" className="studio-button studio-button--primary recruitment-studio-header-action" onClick={openJobForm} disabled={departments.length === 0}>
              <PlusOutlined /> Tạo JD thủ công
            </button>
          </>
        )}
      />

      <section className="recruitment-studio-metrics" aria-label="Tổng quan tuyển dụng">
        <StudioMetricCard label="Vị trí đang tuyển" value={jobs.length} description="JD trong Room" icon={<FileTextOutlined />} />
        <StudioMetricCard label="Phòng ban" value={departments.length} description="Đang quản lý" icon={<ApartmentOutlined />} />
        <StudioMetricCard
          label="Ứng viên đã đánh giá"
          value={candidateCount}
          description="Từ các đợt sàng lọc"
          icon={<TeamOutlined />}
          loading={candidateMetricLoading}
          error={candidateMetricError || undefined}
        />
      </section>

      {showDepartmentForm ? (
        <RecruitmentDepartmentForm
          departmentName={departmentName}
          errorMessage={departmentError}
          isLoading={isLoading}
          isSaving={isSavingDepartment}
          onNameChange={setDepartmentName}
          onSubmit={submitDepartment}
          onCancel={() => {
            setDepartmentName('');
            setDepartmentError('');
            setShowDepartmentForm(false);
          }}
        />
      ) : null}

      <section className="recruitment-studio-layout">
        <aside className="recruitment-studio-departments" aria-label="Lọc theo phòng ban">
          <div className="recruitment-studio-departments__heading">
            <span>Phòng ban</span>
            <button type="button" className="studio-icon-button" aria-label="Thêm phòng ban" onClick={() => setShowDepartmentForm(true)}><PlusOutlined /></button>
          </div>
          <div className="recruitment-studio-department-list" role="tablist" aria-label="Phòng ban tuyển dụng">
            <button type="button" role="tab" aria-selected={department === 'all'} className={department === 'all' ? 'is-active' : undefined} onClick={() => selectDepartment('all')}>
              <span>Tất cả vị trí</span><strong>{jobs.length}</strong>
            </button>
            {departments.map((item) => (
              <div className="recruitment-studio-department-row" key={item.key}>
                <button type="button" role="tab" aria-selected={department === item.key} className={department === item.key ? 'is-active' : undefined} onClick={() => selectDepartment(item.key)}>
                  <span>{item.label}</span><strong>{countsByDepartment.get(item.key) ?? 0}</strong>
                </button>
                {isRecruitmentDepartmentRenameable(item.key) ? (
                  <button
                    type="button"
                    className="recruitment-studio-department-edit"
                    aria-label={`Đổi tên phòng ban ${item.label}`}
                    onClick={() => {
                      selectDepartment(item.key);
                      setRenamedDepartmentName('');
                      setRenameDepartmentError('');
                      setShowRenameDepartmentForm(true);
                    }}
                  ><EditOutlined /></button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="recruitment-studio-ai-card">
            <BulbOutlined />
            <strong>Cần một JD mới?</strong>
            <p>Trao đổi với trợ lý để soạn mô tả công việc nhanh hơn.</p>
            <button type="button" onClick={() => onNavigate('chatbotJD')}>Soạn cùng AI <ArrowRightOutlined /></button>
          </div>
        </aside>

        <div className="recruitment-studio-content">
          <div className="recruitment-studio-toolbar">
            <div>
              <h2>{activeDepartment?.label ?? 'Tất cả vị trí'}</h2>
              <span>{visibleJobs.length} vị trí</span>
            </div>
            <StudioSearchInput
              label="Tìm vị trí tuyển dụng"
              icon={<SearchOutlined />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm vị trí tuyển dụng"
              wrapperClassName="recruitment-studio-search"
            />
          </div>

          {loadError ? (
            <StudioInlineState tone="danger" title="Không tải được dữ liệu tuyển dụng">
              <p>{loadError}</p>
              <button type="button" className="studio-button studio-button--secondary" onClick={() => setReloadSequence((value) => value + 1)}>Thử lại</button>
            </StudioInlineState>
          ) : isLoading ? (
            <div className="recruitment-studio-loading" role="status">Đang tải vị trí tuyển dụng…</div>
          ) : visibleJobs.length > 0 ? (
            <>
              <div className="recruitment-studio-job-grid">
                {paginatedJobs.jobs.map((job) => (
                  <RecruitmentJobCard key={job.fileId} job={job} onOpen={(selected) => void openJobDetail(selected)} />
                ))}
              </div>
              <RecruitmentJobPager
                page={paginatedJobs.page}
                pageCount={paginatedJobs.pageCount}
                onPageChange={setJobPage}
              />
            </>
          ) : (
            <div className="recruitment-studio-empty">
              <FileTextOutlined />
              <h3>{emptyState.title}</h3>
              <p>{emptyState.description}</p>
              {emptyState.showCreateAction ? <button type="button" className="studio-button studio-button--primary" onClick={openJobForm}>Tạo JD thủ công</button> : null}
            </div>
          )}
        </div>
      </section>

      <RecruitmentJobFormDialog
        open={showJobForm}
        draft={draft}
        departments={departments}
        departmentKey={jobDepartmentKey}
        isSaving={isSavingJD}
        saveError={saveJDError}
        onDepartmentChange={setJobDepartmentKey}
        onDraftChange={setDraft}
        onSubmit={submitJob}
        onClose={() => {
          if (!isSavingJD) {
            setShowJobForm(false);
            setSaveJDError('');
            setJobDepartmentKey('');
          }
        }}
      />
      <RecruitmentJobUploadDialog
        open={showUploadDialog}
        file={uploadFile}
        departmentKey={uploadDepartmentKey}
        departments={departments}
        error={uploadJDError}
        isSaving={isUploadingJD}
        uploadedFile={uploadedFileRef}
        onFileChange={(file) => {
          setUploadFile(file);
          setUploadedFileRef(undefined);
          setUploadCreatedAt('');
          setUploadJDError('');
        }}
        onDepartmentChange={setUploadDepartmentKey}
        onSubmit={() => void submitUploadedJob()}
        onClose={() => {
          if (isUploadingJD) return;
          setShowUploadDialog(false);
          setUploadFile(null);
          setUploadDepartmentKey('');
          setUploadJDError('');
          setUploadedFileRef(undefined);
          setUploadCreatedAt('');
        }}
      />
      <RecruitmentJobDetailDialog
        job={selectedJob?.kind === 'structured' ? selectedJob : null}
        isDownloading={Boolean(selectedJob && downloadingJobId === selectedJob.fileId)}
        downloadError={downloadJDError}
        onClose={() => {
          previewRequestRef.current += 1;
          setSelectedJob(null);
          setDownloadJDError('');
        }}
        onDownload={(job) => void downloadJob(job)}
        onEditWithAI={(job) => onNavigate('chatbotJD', recruitmentJobNavigationContext(job))}
        onUseInPipeline={(job) => onNavigate('pipeline', recruitmentJobNavigationContext(job))}
      />
      <RecruitmentUploadedJobDialog
        job={selectedJob?.kind === 'uploaded' ? selectedJob : null}
        text={previewText}
        blob={previewBlob}
        loading={previewLoading}
        error={previewError}
        isDownloading={Boolean(selectedJob && downloadingJobId === selectedJob.fileId)}
        downloadError={downloadJDError}
        onClose={() => {
          previewRequestRef.current += 1;
          setSelectedJob(null);
          setPreviewText('');
          setPreviewBlob(null);
          setPreviewError('');
          setDownloadJDError('');
        }}
        onDownload={(job) => void downloadJob(job)}
        onEditWithAI={(job) => onNavigate('chatbotJD', recruitmentJobNavigationContext(job))}
        onUseInPipeline={(job) => onNavigate('pipeline', recruitmentJobNavigationContext(job))}
      />
      {showRenameDepartmentForm && activeDepartment ? (
        <RecruitmentDepartmentRenameForm
          currentDepartmentName={activeDepartment.label}
          departmentName={renamedDepartmentName}
          errorMessage={renameDepartmentError}
          isSaving={isRenamingDepartment}
          onNameChange={setRenamedDepartmentName}
          onSubmit={submitDepartmentRename}
          onCancel={() => {
            setRenamedDepartmentName('');
            setRenameDepartmentError('');
            setShowRenameDepartmentForm(false);
          }}
        />
      ) : null}
    </StudioPage>
  );
}
