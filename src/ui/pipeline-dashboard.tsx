import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { PipelineService, type CVFile, type ProcessingStatus, type SavedScreeningBoard } from './pipeline-service';
import { MarkdownPathContextBuilder } from './cv-context-builder';
import { createOrUpdateFile, describeFeatureError, readRoomFileText } from './privos-rest';
import { readParsedDocumentText } from './parsed-cv-text';
import { CompanyDocumentRepository, type CompanyDocument } from './company/company-documents';
import { usePolling } from './hooks/usePolling';
import { resolveIntentJD, type StudioNavigationIntent } from './studio/studio-navigation-intent';
import {
  StudioDialog,
  StudioPage,
  StudioToast,
} from './studio/StudioPrimitives';
import {
  PipelineCVQueue,
  PipelineFlowStrip,
  PipelineJDPanel,
  PipelineJDPreview,
  PipelinePageHeader,
  PipelineProgressPanel,
  PipelineResultsPanel,
} from './pipeline/PipelineStudioSections';
import {
  getPipelineBatchProgress,
  toggleAllQueueFiles,
  type PipelineRunOutcome,
} from './pipeline/pipeline-view-model';

type JdLoadStatus = 'idle' | 'loading' | 'success' | 'error';
type ToastState = { message: string; type: 'success' | 'error' };

const JD_NEEDS_PARSER = /\.(pdf|docx?|rtf|odt)$/i;
const JD_BINARY_PREVIEW = /\.(pdf|docx)$/i;
const JD_EDITABLE_TEXT = /\.(md|markdown|txt)$/i;
const JD_SOURCE_FOLDER = ['hr-miniapp', 'jds'];

const asCompanyDocument = (file: CVFile): CompanyDocument => ({
  id: file._id,
  name: file.name,
  size: file.size,
  downloadUrl: file.downloadUrl,
});

export interface IPipelineService {
  fetchAvailableFiles(): Promise<CVFile[]>;
  uploadCV(file: File): Promise<CVFile>;
  uploadJD?(file: File): Promise<CVFile>;
  deleteFile?(fileId: string): Promise<void>;
  processCV(
    cv: CVFile,
    updateStatus: (status: Partial<ProcessingStatus>) => void,
    jdContent: string,
    jdName: string,
    onLog?: (message: string) => void,
  ): Promise<void>;
  getMarkdownContent(normalizedName: string): Promise<string>;
  ensureTemplatesExist?(forceReset?: boolean): Promise<void>;
  fetchAvailableJDs?(onLog?: (message: string) => void): Promise<CVFile[]>;
  createKanbanBatchViaAI?(
    results: Array<{
      originalName: string;
      normalizedName?: string;
      score?: number;
      category?: string;
      reason?: string;
    }>,
    jdName: string,
    onLog?: (message: string) => void,
  ): Promise<SavedScreeningBoard | undefined>;
}

interface PipelineDashboardProps {
  serviceFactory?: (app: ReturnType<typeof usePrivosApp>, roomId: string) => IPipelineService;
  active?: boolean;
  navigationIntent?: StudioNavigationIntent | null;
  onNavigate?: (
    tab: 'cvScored',
    context?: Pick<StudioNavigationIntent, 'screening'>,
  ) => void;
}

const haveSameFiles = (current: CVFile[], next: CVFile[]) =>
  current.length === next.length
  && current.every((file, index) => file._id === next[index]?._id && file.name === next[index]?.name);

export default function PipelineDashboard({
  serviceFactory,
  active = false,
  navigationIntent = null,
  onNavigate,
}: PipelineDashboardProps = {}) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const jdDocumentRepository = useMemo(() => new CompanyDocumentRepository(app, roomId), [app, roomId]);
  const serviceRef = useRef<IPipelineService | null>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const deleteArmTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const jdLoadRequestRef = useRef(0);
  const jdPreviewRequestRef = useRef(0);
  const handledNavigationSequenceRef = useRef(0);
  const stopAfterCurrentRef = useRef(false);

  const [files, setFiles] = useState<CVFile[]>([]);
  const [availableJDs, setAvailableJDs] = useState<CVFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, ProcessingStatus>>({});
  const [activeBatchFileIds, setActiveBatchFileIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [jdLoading, setJdLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [jdName, setJdName] = useState('');
  const [jdContent, setJdContent] = useState('');
  const [jdLoadStatus, setJdLoadStatus] = useState<JdLoadStatus>('idle');
  const [jdLoadError, setJdLoadError] = useState('');
  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [jdLoadingContent, setJdLoadingContent] = useState(false);
  const [jdPreviewBlob, setJdPreviewBlob] = useState<Blob | null>(null);
  const [jdPreviewLoading, setJdPreviewLoading] = useState(false);
  const [jdPreviewError, setJdPreviewError] = useState('');
  const [downloadingJd, setDownloadingJd] = useState(false);
  const [isEditingJd, setIsEditingJd] = useState(false);
  const [jdEditDraft, setJdEditDraft] = useState('');
  const [isSavingJd, setIsSavingJd] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [batchOutcome, setBatchOutcome] = useState<PipelineRunOutcome>('idle');
  const [savedResultCount, setSavedResultCount] = useState(0);
  const [savedCandidateBoard, setSavedCandidateBoard] = useState<SavedScreeningBoard | null>(null);

  const addLog = useCallback((message: string) => {
    console.info(`[CV Pipeline] ${message}`);
  }, []);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (deleteArmTimerRef.current) window.clearTimeout(deleteArmTimerRef.current);
  }, []);

  const loadFiles = async () => {
    if (!serviceRef.current) return;
    setLoading(true);
    try {
      setFiles(await serviceRef.current.fetchAvailableFiles());
    } catch (err) {
      console.error(err);
      const reason = err instanceof Error ? err.message : String(err);
      addLog(`[LỖI] KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch CV: ${reason}`);
      showToast(`Không tải được danh sách CV: ${reason}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadJDs = async (): Promise<CVFile[]> => {
    if (!serviceRef.current?.fetchAvailableJDs) return [];
    setJdLoading(true);
    try {
      const jds = await serviceRef.current.fetchAvailableJDs(addLog);
      setAvailableJDs(jds);
      return jds;
    } catch (err) {
      console.error('Lỗi tải danh sách JD:', err);
      showToast('Không tải được danh sách JD.', 'error');
      return [];
    } finally {
      setJdLoading(false);
    }
  };

  const loadJdContent = async (name: string, fileId?: string) => {
    if (!name) return '';
    const requestId = ++jdLoadRequestRef.current;
    const isCurrent = () => requestId === jdLoadRequestRef.current;
    setJdLoadingContent(true);
    setJdLoadStatus('loading');
    setJdLoadError('');
    let lastError: unknown;
    try {
      const baseName = name.split('/').pop()?.split('\\').pop() || name;
      const targetFile = availableJDs.find(file =>
        file.name === name || file.name === baseName || (fileId && file._id === fileId));
      const resolvedId = fileId || targetFile?._id;
      const useParser = JD_NEEDS_PARSER.test(targetFile?.name || baseName) && Boolean(resolvedId && roomId);
      let text = '';
      try {
        text = useParser
          ? await readParsedDocumentText(
            app,
            roomId,
            { _id: resolvedId as string, name: targetFile?.name || baseName },
            'JD',
            JD_SOURCE_FOLDER,
          )
          : await readRoomFileText(app, { _id: resolvedId, downloadUrl: targetFile?.downloadUrl });
      } catch (err) {
        lastError = err;
      }
      if (!isCurrent()) return text;
      if (text.trim()) {
        setJdContent(text);
        setJdEditDraft(text);
        setJdLoadStatus('success');
        return text;
      }
      const message = lastError
        ? describeFeatureError(lastError, 'Không đọc được file JD.')
        : 'File JD trống.';
      setJdContent('');
      setJdLoadStatus('error');
      setJdLoadError(message);
      addLog(`[LỖI] Không tải được nội dung JD ${name}: ${message}`);
      return '';
    } finally {
      if (isCurrent()) setJdLoadingContent(false);
    }
  };

  const handleSelectJD = async (fileId: string, jdList: CVFile[] = availableJDs) => {
    jdPreviewRequestRef.current += 1;
    setJdPreviewBlob(null);
    setJdPreviewError('');
    setJdPreviewLoading(false);
    if (!fileId) {
      jdLoadRequestRef.current += 1;
      setJdName('');
      setJdContent('');
      setJdLoadStatus('idle');
      setJdModalOpen(false);
      return;
    }
    const selected = jdList.find(file => file._id === fileId);
    if (!selected) return;
    setJdName(selected.name);
    setJdContent('');
    await loadJdContent(selected.name, selected._id);
  };

  const handleOpenJdModal = async () => {
    if (!jdName) return;
    const selected = availableJDs.find(file => file.name === jdName);
    setIsEditingJd(false);
    setJdModalOpen(true);

    const contentPromise = jdContent
      ? Promise.resolve(jdContent)
      : loadJdContent(jdName, selected?._id);
    if (!selected || !JD_BINARY_PREVIEW.test(selected.name)) {
      await contentPromise;
      return;
    }

    const requestId = ++jdPreviewRequestRef.current;
    setJdPreviewLoading(true);
    setJdPreviewError('');
    setJdPreviewBlob(null);
    try {
      const [{ blob }] = await Promise.all([
        jdDocumentRepository.readBlob(asCompanyDocument(selected)),
        contentPromise,
      ]);
      if (requestId === jdPreviewRequestRef.current) setJdPreviewBlob(blob);
    } catch (error) {
      if (requestId === jdPreviewRequestRef.current) {
        setJdPreviewError(describeFeatureError(error, 'Không dựng được bản xem trước JD.'));
      }
    } finally {
      if (requestId === jdPreviewRequestRef.current) setJdPreviewLoading(false);
    }
  };

  const handleSaveJdContent = async () => {
    if (!jdName || !jdEditDraft.trim() || !app || !roomId) return;
    setIsSavingJd(true);
    try {
      await createOrUpdateFile(app, `${roomId}/hr-miniapp/jds/${jdName}`, jdEditDraft);
      setJdContent(jdEditDraft);
      setJdLoadStatus('success');
      setIsEditingJd(false);
      showToast(`Đã lưu thay đổi vào ${jdName}`);
    } catch (err) {
      showToast(`Không thể lưu JD: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setIsSavingJd(false);
    }
  };

  const handleDownloadJd = async () => {
    const selected = availableJDs.find(file => file.name === jdName);
    if (!selected || downloadingJd) return;
    setDownloadingJd(true);
    try {
      const { blob, fileName } = await jdDocumentRepository.readBlob(asCompanyDocument(selected));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(describeFeatureError(error, 'Không tải xuống được JD.'), 'error');
    } finally {
      setDownloadingJd(false);
    }
  };

  useEffect(() => {
    if (!app || !roomId) return;
    serviceRef.current = serviceFactory
      ? serviceFactory(app, roomId)
      : new PipelineService(app, roomId, new MarkdownPathContextBuilder());
    const initialize = async () => {
      setJdLoading(true);
      try {
        await serviceRef.current?.ensureTemplatesExist?.(false);
        await Promise.all([loadFiles(), loadJDs()]);
      } finally {
        setJdLoading(false);
      }
    };
    void initialize();
  }, [app, roomId, serviceFactory]);

  const reconcileSelectedFiles = useCallback(async () => {
    if (!serviceRef.current || processing) return;
    const [currentFiles, currentJDs] = await Promise.all([
      serviceRef.current.fetchAvailableFiles(),
      serviceRef.current.fetchAvailableJDs?.() ?? Promise.resolve([]),
    ]);
    setFiles(previous => haveSameFiles(previous, currentFiles) ? previous : currentFiles);
    setAvailableJDs(previous => haveSameFiles(previous, currentJDs) ? previous : currentJDs);

    const currentFileIds = new Set(currentFiles.map(file => file._id));
    const removedIds = [...selectedIds].filter(id => !currentFileIds.has(id));
    if (removedIds.length > 0) {
      setSelectedIds(previous => new Set([...previous].filter(id => currentFileIds.has(id))));
      showToast('Một hoặc nhiều CV đã chọn đã bị xóa. Hệ thống đã bỏ lựa chọn.', 'error');
    }
    if (jdName && !currentJDs.some(jd => jd.name === jdName)) {
      jdLoadRequestRef.current += 1;
      jdPreviewRequestRef.current += 1;
      setJdName('');
      setJdContent('');
      setJdLoadStatus('idle');
      setJdPreviewBlob(null);
      setJdPreviewError('');
      setJdPreviewLoading(false);
      setJdModalOpen(false);
      showToast('JD đã chọn đã bị xóa. Vui lòng chọn lại JD.', 'error');
    }
  }, [jdName, processing, selectedIds, showToast]);

  usePolling(reconcileSelectedFiles, {
    enabled: active && !processing && Boolean(app && roomId),
    interval: 3000,
    immediate: false,
  });

  useEffect(() => {
    if (!active || !navigationIntent || navigationIntent.target !== 'pipeline') return;
    if (handledNavigationSequenceRef.current >= navigationIntent.sequence) return;
    handledNavigationSequenceRef.current = navigationIntent.sequence;
    const applyIntent = async () => {
      const currentJDs = await loadJDs();
      const target = resolveIntentJD(navigationIntent, 'pipeline', currentJDs);
      if (!target) {
        showToast('JD không còn tồn tại hoặc bạn không có quyền đọc. Hãy chọn lại JD.', 'error');
        return;
      }
      await handleSelectJD(target._id, currentJDs);
    };
    void applyIntent();
  }, [active, navigationIntent?.sequence]);

  const handleUploadCV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles?.length || !serviceRef.current) return;
    setLoading(true);
    try {
      const uploadedNames = (await Promise.all(Array.from(uploadedFiles).map(async file => {
        try {
          await serviceRef.current!.uploadCV(file);
          addLog(`Đã tải lên: ${file.name}`);
          return file.name;
        } catch (err) {
          addLog(`[LỖI] Không tải được ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      }))).filter((name): name is string => Boolean(name));
      const list = await serviceRef.current.fetchAvailableFiles();
      setFiles(list);
      const newIds = list.filter(file => uploadedNames.includes(file.name)).map(file => file._id);
      setSelectedIds(previous => new Set([...previous, ...newIds]));
      if (uploadedNames.length > 0) showToast(`Đã tải ${uploadedNames.length} CV.`);
    } catch (err) {
      console.error(err);
      showToast(`Đã tải lên nhưng không làm mới được danh sách CV: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleUploadJD = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !serviceRef.current?.uploadJD) return;
    setJdLoading(true);
    try {
      const uploaded = await serviceRef.current.uploadJD(file);
      const refreshed = await loadJDs();
      const selected = refreshed.find(jd => jd._id === uploaded._id || jd.name === uploaded.name);
      if (selected) await handleSelectJD(selected._id, refreshed);
      showToast(`Đã tải JD: ${uploaded.name}`);
    } catch (err) {
      showToast(`Lỗi tải JD: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setJdLoading(false);
      event.target.value = '';
    }
  };

  const armDeleteCV = useCallback((fileId: string) => {
    if (deleteArmTimerRef.current) window.clearTimeout(deleteArmTimerRef.current);
    setPendingDeleteId(fileId);
    deleteArmTimerRef.current = window.setTimeout(() => setPendingDeleteId(null), 4000);
  }, []);

  const handleDeleteCV = useCallback(async (file: CVFile) => {
    const service = serviceRef.current;
    if (!service || processing || deletingId) return;
    if (!service.deleteFile) {
      showToast('Dịch vụ này không hỗ trợ xóa file.', 'error');
      return;
    }
    if (deleteArmTimerRef.current) window.clearTimeout(deleteArmTimerRef.current);
    setPendingDeleteId(null);
    setDeletingId(file._id);
    try {
      await service.deleteFile(file._id);
      setFiles(previous => previous.filter(item => item._id !== file._id));
      setSelectedIds(previous => {
        const next = new Set(previous);
        next.delete(file._id);
        return next;
      });
      showToast(`Đã xóa “${file.name}”`);
    } catch (err) {
      showToast(`Không xóa được “${file.name}”: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setDeletingId(null);
    }
  }, [deletingId, processing, showToast]);

  const requestSafeStop = () => {
    stopAfterCurrentRef.current = true;
    setBatchOutcome('stop-requested');
    addLog('Đã yêu cầu dừng sau CV hiện tại.');
  };

  const startPipeline = async () => {
    const service = serviceRef.current;
    if (!service || selectedIds.size === 0) return;
    if (!jdContent) {
      showToast('Vui lòng chọn và tải nội dung JD trước khi bắt đầu.', 'error');
      return;
    }

    const filesToProcess = files.filter(file => selectedIds.has(file._id));
    const resultsForKanban: ProcessingStatus[] = [];
    let failedCount = 0;
    let interrupted = false;
    let saveError: string | null = null;
    stopAfterCurrentRef.current = false;
    setSavedResultCount(0);
    setSavedCandidateBoard(null);
    setBatchOutcome('running');
    setProcessing(true);
    setActiveBatchFileIds(filesToProcess.map(file => file._id));
    setStatuses(previous => ({
      ...previous,
      ...Object.fromEntries(filesToProcess.map(file => [file._id, {
        fileId: file._id,
        originalName: file.name,
        status: 'pending' as const,
      }])),
    }));

    const checkSourceFiles = async (cv: CVFile): Promise<'available' | 'cv-deleted' | 'jd-deleted'> => {
      try {
        const [currentFiles, currentJDs] = await Promise.all([
          service.fetchAvailableFiles(),
          service.fetchAvailableJDs?.() ?? Promise.resolve([]),
        ]);
        if (!currentJDs.some(jd => jd.name === jdName)) return 'jd-deleted';
        if (!currentFiles.some(file => file._id === cv._id)) return 'cv-deleted';
        return 'available';
      } catch (err) {
        addLog(`[Cảnh báo] Không kiểm tra được trạng thái CV/JD: ${err instanceof Error ? err.message : String(err)}`);
        return 'available';
      }
    };

    try {
      for (const cv of filesToProcess) {
        const before = await checkSourceFiles(cv);
        if (before === 'jd-deleted') {
          interrupted = true;
          addLog(`[CẢNH BÁO] JD “${jdName}” đã bị xóa. Dừng batch.`);
          break;
        }
        if (before === 'cv-deleted') {
          failedCount += 1;
          setStatuses(previous => ({
            ...previous,
            [cv._id]: { fileId: cv._id, originalName: cv.name, status: 'error', errorMsg: 'CV đã bị xóa khỏi Room Files.' },
          }));
          setSelectedIds(previous => {
            const next = new Set(previous);
            next.delete(cv._id);
            return next;
          });
          if (stopAfterCurrentRef.current) break;
          continue;
        }

        // The stop request can arrive while the source preflight above is in flight.
        // Re-check at the CV boundary so the next CV never starts after that request.
        if (stopAfterCurrentRef.current) break;

        let currentStatus: ProcessingStatus = { fileId: cv._id, originalName: cv.name, status: 'pending' };
        try {
          await service.processCV(
            cv,
            update => {
              currentStatus = { ...currentStatus, ...update };
              setStatuses(previous => ({ ...previous, [cv._id]: { ...previous[cv._id], ...update } }));
            },
            jdContent,
            jdName,
            addLog,
          );
        } catch (err) {
          currentStatus = {
            ...currentStatus,
            status: 'error',
            errorMsg: err instanceof Error ? err.message : String(err),
          };
          setStatuses(previous => ({ ...previous, [cv._id]: currentStatus }));
        }

        const after = await checkSourceFiles(cv);
        if (after === 'jd-deleted') {
          interrupted = true;
          addLog(`[CẢNH BÁO] JD “${jdName}” đã bị xóa trong lúc chấm. Dừng batch.`);
          break;
        }
        if (after === 'cv-deleted') {
          currentStatus = { ...currentStatus, status: 'error', errorMsg: 'CV đã bị xóa trong lúc chấm.' };
          setStatuses(previous => ({ ...previous, [cv._id]: currentStatus }));
        }

        if (currentStatus.status === 'completed' && after !== 'cv-deleted') resultsForKanban.push(currentStatus);
        else failedCount += 1;
        setSelectedIds(previous => {
          const next = new Set(previous);
          next.delete(cv._id);
          return next;
        });

        if (stopAfterCurrentRef.current) break;
      }

      if (resultsForKanban.length > 0 && service.createKanbanBatchViaAI) {
        try {
          const savedBoard = await service.createKanbanBatchViaAI(resultsForKanban, jdName, addLog);
          if (!savedBoard) throw new Error('Không lấy được bảng ứng viên sau khi lưu.');
          setSavedCandidateBoard(savedBoard);
          setSavedResultCount(resultsForKanban.length);
        } catch (err) {
          saveError = err instanceof Error ? err.message : String(err);
        }
      }

      if (saveError) {
        setBatchOutcome('save-error');
        showToast(`Đã chấm xong nhưng không lưu được vào bảng ứng viên: ${saveError}`, 'error');
      } else if (interrupted) {
        setBatchOutcome('interrupted');
        showToast('Batch đã dừng vì dữ liệu nguồn thay đổi.', 'error');
      } else if (stopAfterCurrentRef.current) {
        setBatchOutcome('stopped');
        showToast(resultsForKanban.length > 0
          ? `Đã dừng an toàn và lưu ${resultsForKanban.length} kết quả.`
          : 'Đã dừng an toàn trước CV kế tiếp.');
      } else if (failedCount > 0) {
        setBatchOutcome('completed-with-errors');
        showToast(`Đã hoàn tất, có ${failedCount} CV lỗi.`, 'error');
      } else {
        setBatchOutcome('completed');
        showToast('Đã chấm điểm và lưu kết quả vào bảng ứng viên.');
      }
    } finally {
      setProcessing(false);
      stopAfterCurrentRef.current = false;
      await loadFiles();
    }
  };

  const selectedJD = availableJDs.find(jd => jd.name === jdName);
  const isBinaryJd = JD_BINARY_PREVIEW.test(selectedJD?.name || jdName);
  const isEditableJd = JD_EDITABLE_TEXT.test(selectedJD?.name || jdName);
  const resultList = Object.values(statuses);
  const batchProgress = getPipelineBatchProgress(activeBatchFileIds, statuses);
  const selectedVisibleCount = files.filter(file => selectedIds.has(file._id)).length;
  const canStart = selectedVisibleCount > 0 && Boolean(jdContent) && !processing;

  return (
    <StudioPage className="pipeline-studio-page">
      <PipelinePageHeader />
      <PipelineFlowStrip
        jdReady={Boolean(jdContent)}
        selectedCount={selectedVisibleCount}
        completedCount={batchProgress.completed}
      />

      <div className="pipeline-studio-grid">
        <PipelineJDPanel
          jds={availableJDs}
          selectedName={jdName}
          loadStatus={jdLoadStatus}
          loadError={jdLoadError}
          loading={jdLoading}
          disabled={processing}
          fileInputRef={jdInputRef}
          onSelect={fileId => void handleSelectJD(fileId)}
          onOpenSelected={() => void handleOpenJdModal()}
          onUpload={event => void handleUploadJD(event)}
          onRetry={() => { if (selectedJD) void loadJdContent(selectedJD.name, selectedJD._id); }}
        />
        <PipelineCVQueue
          files={files}
          selectedIds={selectedIds}
          loading={loading}
          processing={processing}
          deletingId={deletingId}
          pendingDeleteId={pendingDeleteId}
          fileInputRef={cvInputRef}
          canStart={canStart}
          onToggleFile={fileId => setSelectedIds(previous => {
            const next = new Set(previous);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
          })}
          onToggleAll={selected => setSelectedIds(previous => toggleAllQueueFiles(files, previous, selected))}
          onArmDelete={armDeleteCV}
          onDelete={file => void handleDeleteCV(file)}
          onUpload={event => void handleUploadCV(event)}
          onStart={() => void startPipeline()}
        />
      </div>

      <div className="pipeline-studio-lower">
        <PipelineProgressPanel
          progress={batchProgress}
          outcome={batchOutcome}
          savedResultCount={savedResultCount}
          onStop={requestSafeStop}
          onOpenCandidates={() => savedCandidateBoard && onNavigate?.('cvScored', { screening: savedCandidateBoard })}
        />
        <PipelineResultsPanel statuses={resultList} />
      </div>

      {toast ? (
        <StudioToast tone={toast.type === 'error' ? 'danger' : 'success'}>
          {toast.message}
        </StudioToast>
      ) : null}

      <StudioDialog
        className="pipeline-studio-dialog company-document-dialog"
        open={jdModalOpen}
        title={jdName || 'Job Description'}
        onClose={() => {
          setIsEditingJd(false);
          setJdModalOpen(false);
        }}
        actions={isEditingJd ? (
          <>
            <button
              type="button"
              className="studio-button studio-button--secondary"
              onClick={() => {
                setIsEditingJd(false);
                setJdEditDraft(jdContent);
              }}
              disabled={isSavingJd}
            >
              Hủy
            </button>
            <button
              type="button"
              className="studio-button studio-button--primary"
              onClick={() => void handleSaveJdContent()}
              disabled={isSavingJd || !jdEditDraft.trim()}
            >
              {isSavingJd ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="studio-button studio-button--secondary"
              onClick={() => void handleDownloadJd()}
              disabled={!selectedJD || downloadingJd}
            >
              {downloadingJd ? 'Đang tải…' : 'Tải xuống'}
            </button>
            {isEditableJd ? (
              <button
                type="button"
                className="studio-button studio-button--secondary"
                onClick={() => {
                  setJdEditDraft(jdContent);
                  setIsEditingJd(true);
                }}
                disabled={!jdContent}
              >
                Chỉnh sửa
              </button>
            ) : null}
            <button type="button" className="studio-button studio-button--primary" onClick={() => setJdModalOpen(false)}>
              Đóng
            </button>
          </>
        )}
      >
        <p className="pipeline-studio-dialog__path">RoomFiles/hr-miniapp/jds/{jdName}</p>
        {isEditingJd ? (
          <textarea
            className="pipeline-studio-dialog__editor"
            value={jdEditDraft}
            onChange={event => setJdEditDraft(event.target.value)}
            disabled={isSavingJd}
            aria-label="Nội dung JD"
          />
        ) : (
          <PipelineJDPreview
            fileName={selectedJD?.name || jdName}
            text={jdContent}
            blob={jdPreviewBlob}
            loading={isBinaryJd ? jdPreviewLoading : jdLoadingContent}
            error={isBinaryJd ? jdPreviewError : jdLoadStatus === 'error' ? jdLoadError : ''}
          />
        )}
      </StudioDialog>
    </StudioPage>
  );
}
