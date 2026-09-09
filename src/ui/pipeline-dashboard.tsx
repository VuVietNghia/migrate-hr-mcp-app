import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { PipelineService, CVFile, ProcessingStatus } from './pipeline-service';
import { MarkdownPathContextBuilder } from './cv-context-builder';
import { getCvPipelineDisplayReason } from './cv-pipeline-display-reason';
import { createOrUpdateFile, getFileContent } from './privos-rest';
import { usePolling } from './hooks/usePolling';

// Dependency Injection Interface
// Swap implementation easily in the future (e.g. mock for testing)
export interface IPipelineService {
  fetchAvailableFiles(): Promise<CVFile[]>;
  uploadCV(file: File): Promise<CVFile>;
  uploadJD?(file: File): Promise<CVFile>;
  processCV(
    cv: CVFile,
    updateStatus: (s: Partial<ProcessingStatus>) => void,
    jdContent: string,
    jdName: string,
    onLog?: (msg: string) => void
  ): Promise<void>;
  getMarkdownContent(normalizedName: string): Promise<string>;
  ensureTemplatesExist?(forceReset?: boolean): Promise<void>;
  fetchAvailableJDs?(onLog?: (msg: string) => void): Promise<CVFile[]>;
  askAI?(prompt: string, fileName?: string, fileId?: string, onLog?: (msg: string) => void, customFlowChatId?: string): Promise<{ text: string }>;
  createKanbanBatchViaAI?(
    results: Array<{ originalName: string; normalizedName?: string; score?: number; category?: string; reason?: string }>,
    jdName: string,
    onLog?: (msg: string) => void
  ): Promise<void>;
}

interface PipelineDashboardProps {
  serviceFactory?: (app: ReturnType<typeof usePrivosApp>, roomId: string) => IPipelineService;
  /** True only while this tab is the visible one — polling is gated on it. */
  active?: boolean;
}

type JDFormState = {
  position: string;
  department: string;
  location: string;
  workTime: string;
  jobDescription: string;
  experience: string;
  technicalSkills: string;
  softSkills: string;
  education: string;
  salary: string;
  benefits: string;
  workEnvironment: string;
  applyEmail: string;
  emailSubject: string;
};

const emptyJDForm: JDFormState = {
  position: '',
  department: '',
  location: '',
  workTime: '',
  jobDescription: '',
  experience: '',
  technicalSkills: '',
  softSkills: '',
  education: '',
  salary: '',
  benefits: '',
  workEnvironment: '',
  applyEmail: '',
  emailSubject: '',
};



const hasJDFormValue = (form: JDFormState) =>
  Object.values(form).some(value => value.trim().length > 0);

const haveSameFiles = (current: CVFile[], next: CVFile[]) =>
  current.length === next.length
  && current.every((file, index) => file._id === next[index]?._id && file.name === next[index]?.name);

const buildJDPromptFromForm = (form: JDFormState) => {
  const unknown = 'Kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
  return `
Th\u00f4ng tin tuy\u1ec3n d\u1ee5ng:

1. Th\u00f4ng tin chung
- V\u1ecb tr\u00ed: ${form.position || unknown}
- Ph\u00f2ng ban: ${form.department || unknown}
- \u0110\u1ecba \u0111i\u1ec3m l\u00e0m vi\u1ec7c: ${form.location || unknown}
- Th\u1eddi gian l\u00e0m vi\u1ec7c: ${form.workTime || unknown}

2. M\u00f4 t\u1ea3 c\u00f4ng vi\u1ec7c
${form.jobDescription || unknown}

3. Y\u00eau c\u1ea7u \u1ee9ng vi\u00ean
- Kinh nghi\u1ec7m: ${form.experience || unknown}
- K\u1ef9 n\u0103ng chuy\u00ean m\u00f4n: ${form.technicalSkills || unknown}
- K\u1ef9 n\u0103ng m\u1ec1m: ${form.softSkills || unknown}
- H\u1ecdc v\u1ea5n: ${form.education || unknown}

4. Quy\u1ec1n l\u1ee3i
- M\u1ee9c l\u01b0\u01a1ng: ${form.salary || unknown}
- Ph\u00fac l\u1ee3i: ${form.benefits || unknown}
- M\u00f4i tr\u01b0\u1eddng l\u00e0m vi\u1ec7c: ${form.workEnvironment || unknown}

5. C\u00e1ch th\u1ee9c \u1ee9ng tuy\u1ec3n
- Email nh\u1eadn CV: ${form.applyEmail || unknown}
- Ti\u00eau \u0111\u1ec1 email: ${form.emailSubject || unknown}
`.trim();
};


// Sub-components

function StatusBadge({ category }: { category: string }) {
  const isPass = category === "DAT" || category === "\u0110\u1ea0T";
  const isWarn = category === "CAN NHAC" || category === "C\u00c2N NH\u1eaeC";
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '3px 10px', borderRadius: 'var(--radius-sm)',
    fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
    backgroundColor: isPass ? 'var(--success-bg)' : isWarn ? 'var(--status-warn-bg)' : 'var(--status-fail-bg)',
    color: isPass ? 'var(--status-pass)' : isWarn ? 'var(--status-warn)' : 'var(--status-fail)',
  };
  return <span style={style}>{isPass ? '\u2713' : isWarn ? '\u25cf' : '\u2717'} {category}</span>;
}

function ProcessingBadge({ status }: { status: ProcessingStatus['status'] }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: '\u0110ang ch\u1edd', color: 'var(--text-faint)' },
    renaming: { label: '\u0110ang x\u1eed l\u00fd\u2026', color: 'var(--accent)' },
    scoring: { label: 'Ch\u1ea5m \u0111i\u1ec3m\u2026', color: 'var(--accent-warm)' },
    completed: { label: 'Ho\u00e0n th\u00e0nh', color: 'var(--status-pass)' },
    error: { label: 'L\u1ed7i', color: 'var(--status-fail)' },
  };
  const { label, color } = map[status] ?? { label: status, color: 'var(--text-muted)' };
  return <span style={{ fontSize: '12px', color, fontWeight: 500 }}>{label}</span>;
}

interface BatchProgress {
  total: number;
  processed: number;
  failed: ProcessingStatus[];
  active?: ProcessingStatus;
}

function getBatchProgress(
  batchFileIds: string[],
  statuses: Record<string, ProcessingStatus>,
): BatchProgress {
  const batchStatuses = batchFileIds
    .map(fileId => statuses[fileId])
    .filter((status): status is ProcessingStatus => Boolean(status));
  const failed = batchStatuses.filter(status => status.status === 'error');
  const processed = batchStatuses.filter(
    status => status.status === 'completed' || status.status === 'error',
  ).length;
  const active = batchStatuses.find(
    status => status.status === 'uploading' || status.status === 'renaming' || status.status === 'scoring',
  );

  return { total: batchFileIds.length, processed, failed, active };
}

function PipelineProgressCard({ progress, isProcessing }: { progress: BatchProgress; isProcessing: boolean }) {
  const percentage = progress.total === 0 ? 0 : Math.round((progress.processed / progress.total) * 100);
  const latestError = progress.failed[progress.failed.length - 1];
  const isStopped = !isProcessing && progress.processed < progress.total;
  const statusText = progress.active
    ? `Đang chấm: ${progress.active.originalName}`
    : isProcessing
      ? percentage === 100 ? 'Đang lưu kết quả chấm CV...' : 'Đang chuẩn bị chấm CV...'
      : progress.total === 0
        ? 'Sẵn sàng chấm CV'
        : isStopped
          ? 'Batch đã dừng trước khi xử lý hết CV.'
          : progress.failed.length > 0
            ? 'Hoàn thành với lỗi cần kiểm tra.'
            : 'Đã hoàn thành chấm CV.';

  return (
    <div className="pl-card" style={{ padding: '16px' }} aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <p className="pl-label" style={{ margin: 0 }}>Tiến trình chấm CV</p>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {progress.processed}/{progress.total} CV · {percentage}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.processed}
        aria-label="Tiến trình chấm CV"
        style={{ height: '8px', overflow: 'hidden', marginTop: '12px', borderRadius: '999px', background: 'var(--border-light)' }}
      >
        <div
          style={{
            width: `${percentage}%`, height: '100%', borderRadius: 'inherit', transition: 'width 0.25s ease',
            background: progress.failed.length > 0 && percentage === 100 ? 'var(--status-warn)' : 'var(--accent)',
          }}
        />
      </div>

      <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>{statusText}</p>
      {latestError && (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--status-fail)' }}>
          {progress.failed.length} CV lỗi · {latestError.originalName}: {latestError.errorMsg || 'Không thể hoàn tất chấm CV.'}
        </p>
      )}
    </div>
  );
}

function CVResultCard({ s }: { s: ProcessingStatus }) {
  const [isOpen, setIsOpen] = useState(false);
  const displayReason = s.reason ? getCvPipelineDisplayReason(s.reason) : '';
  const hasDetails = !!(displayReason || s.errorMsg);

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'var(--shadow-card)',
      transition: 'box-shadow 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{ flex: 1, minWidth: 0, cursor: hasDetails ? 'pointer' : 'default' }}
          onClick={() => hasDetails && setIsOpen(!isOpen)}
          title={hasDetails ? "Nh\u1ea5n \u0111\u1ec3 xem chi ti\u1ebft" : ""}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.normalizedName || s.originalName}
            </p>
            {hasDetails && (
              <span style={{
                fontSize: '9px', color: 'var(--text-faint)',
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s', display: 'inline-block'
              }}>{'\u25bc'}</span>
            )}
          </div>
          {s.normalizedName && (
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.originalName}
            </p>
          )}
        </div>
        <ProcessingBadge status={s.status} />
      </div>

      {s.category && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <StatusBadge category={s.category} />
          {s.score !== undefined && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.score}/100</span>
          )}
        </div>
      )}

      {isOpen && hasDetails && (
        <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', animation: 'pl-in 0.2s ease' }}>
          {displayReason && (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {displayReason}
            </p>
          )}
          {s.errorMsg && (
            <p style={{ margin: displayReason ? '8px 0 0' : 0, fontSize: '12px', color: 'var(--status-fail)', lineHeight: 1.5 }}>
              {'\u26a0'} {s.errorMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function renderInlineStyles(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} style={{ fontWeight: 700, color: 'var(--text)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: '12px',
            background: 'rgba(21,111,245,0.08)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: 'var(--accent)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderFormattedMarkdown(mdText: string) {
  if (!mdText) return null;
  const lines = mdText.split('\n');
  return (
    <div
      className="pl-markdown-body"
      style={{
        fontSize: '13.5px',
        lineHeight: '1.7',
        color: 'var(--text)',
        fontFamily: "'Inter', 'DM Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('# ')) {
          return (
            <h1
              key={idx}
              style={{
                fontSize: '18px',
                fontWeight: 700,
                margin: '16px 0 8px 0',
                color: 'var(--accent)',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: '6px',
              }}
            >
              {renderInlineStyles(trimmed.slice(2))}
            </h1>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h2
              key={idx}
              style={{
                fontSize: '15.5px',
                fontWeight: 700,
                margin: '14px 0 6px 0',
                color: 'var(--text)',
                letterSpacing: '-0.1px',
              }}
            >
              {renderInlineStyles(trimmed.slice(3))}
            </h2>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={idx}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                margin: '12px 0 4px 0',
                color: 'var(--text)',
              }}
            >
              {renderInlineStyles(trimmed.slice(4))}
            </h3>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                margin: '4px 0 4px 8px',
              }}
            >
              <span style={{ color: 'var(--accent)', fontSize: '14px', lineHeight: '1.4', flexShrink: 0 }}>•</span>
              <span>{renderInlineStyles(trimmed.slice(2))}</span>
            </div>
          );
        }

        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                margin: '4px 0 4px 8px',
              }}
            >
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '13px', flexShrink: 0 }}>
                {numMatch[1]}.
              </span>
              <span>{renderInlineStyles(numMatch[2])}</span>
            </div>
          );
        }

        if (!trimmed) {
          return <div key={idx} style={{ height: '8px' }} />;
        }

        return (
          <p key={idx} style={{ margin: '4px 0' }}>
            {renderInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

// Main Component

export default function PipelineDashboard({ serviceFactory, active = false }: PipelineDashboardProps = {}) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [files, setFiles] = useState<CVFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, ProcessingStatus>>({});
  const [activeBatchFileIds, setActiveBatchFileIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [jdContent, setJdContent] = useState('');
  const [jdName, setJdName] = useState('');
  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [jdLoadingContent, setJdLoadingContent] = useState(false);
  const [isEditingJd, setIsEditingJd] = useState(false);
  const [jdEditDraft, setJdEditDraft] = useState('');
  const [isSavingJd, setIsSavingJd] = useState(false);
  const [availableJDs, setAvailableJDs] = useState<CVFile[]>([]);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdDropdownOpen, setJdDropdownOpen] = useState(false);
  const [jdPrompt, setJdPrompt] = useState('');
  const [jdFormOpen, setJdFormOpen] = useState(false);
  const [jdForm, setJdForm] = useState<JDFormState>(emptyJDForm);
  const [useCompanyInfo, setUseCompanyInfo] = useState(false);
  const [isGeneratingJD, setIsGeneratingJD] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const jdDropdownRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<IPipelineService | null>(null);

  const loadJdContent = async (name: string, fileId?: string) => {
    if (!name) return '';
    setJdLoadingContent(true);
    try {
      const baseName = name.split('/').pop()?.split('\\').pop() || name;
      const targetFile = availableJDs.find(f => f.name === name || f.name === baseName || (fileId && f._id === fileId));

      // Method 1: Download directly via presigned downloadUrl if available on CVFile
      if (targetFile?.downloadUrl) {
        try {
          const resp = await fetch(targetFile.downloadUrl);
          if (resp.ok) {
            const text = await resp.text();
            if (text && text.trim()) {
              setJdContent(text);
              return text;
            }
          }
        } catch (e) {
          console.warn('[JD Load] Fetch targetFile.downloadUrl failed:', e);
        }
      }

      // Method 2: Call privos.files.get to retrieve file details & downloadUrl
      const resolvedFileId = fileId || targetFile?._id;
      if (resolvedFileId) {
        try {
          const getRes: any = await app.callServerTool({
            name: 'mcpapp.files.get',
            arguments: { fileId: resolvedFileId }
          });
          let url: string | undefined = getRes?.downloadUrl;
          if (!url && getRes?.content?.[0]?.text) {
            try {
              const parsed = JSON.parse(getRes.content[0].text);
              url = parsed?.downloadUrl;
            } catch (e) {}
          }
          if (url) {
            const resp = await fetch(url);
            if (resp.ok) {
              const text = await resp.text();
              if (text && text.trim()) {
                setJdContent(text);
                return text;
              }
            }
          }
        } catch (e) {
          console.warn('[JD Load] privos.files.get failed:', e);
        }
      }

      // Method 3: Call privos.files.search to search file by name in channel
      try {
        const searchRes: any = await app.callServerTool({
          name: 'mcpapp.files.search',
          arguments: { channelId: roomId, query: baseName }
        });
        let searchList: any[] = [];
        if (searchRes?.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(searchRes.content[0].text);
            searchList = Array.isArray(parsed) ? parsed : (parsed?.files || []);
          } catch (e) {}
        } else {
          searchList = Array.isArray(searchRes) ? searchRes : (searchRes?.files || []);
        }
        const matched = searchList.find((f: any) => f.name === baseName || f.name === name);
        if (matched?.downloadUrl) {
          const resp = await fetch(matched.downloadUrl);
          if (resp.ok) {
            const text = await resp.text();
            if (text && text.trim()) {
              setJdContent(text);
              return text;
            }
          }
        }
      } catch (e) {
        console.warn('[JD Load] privos.files.search failed:', e);
      }

      // Method 4: Fallback to getMarkdownContent in PipelineService
      if (serviceRef.current) {
        const fetched = await serviceRef.current.getMarkdownContent(baseName);
        if (fetched && fetched.trim()) {
          setJdContent(fetched);
          return fetched;
        }
      }

      // Method 5: Fallback to getFileContent via REST API
      const pathsToTry = [
        `${roomId}/hr-miniapp/jds/${baseName}`,
        `hr-miniapp/jds/${baseName}`,
        `${roomId}/hr-miniapp/jds/${name}`,
        `hr-miniapp/jds/${name}`,
      ];
      for (const p of pathsToTry) {
        try {
          const res = await getFileContent(app, p);
          if (res && res.trim()) {
            setJdContent(res);
            return res;
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      console.error('Lỗi khi nạp nội dung JD:', err);
    } finally {
      setJdLoadingContent(false);
    }
    return '';
  };

  const handleOpenJdModal = async () => {
    if (!jdName) return;
    setIsEditingJd(false);
    setJdModalOpen(true);
    if (!jdContent || jdContent.startsWith('Selected JD:')) {
      const text = await loadJdContent(jdName);
      setJdEditDraft(text || '');
    } else {
      setJdEditDraft(jdContent);
    }
  };

  const handleSaveJdContent = async () => {
    if (!jdName || !jdEditDraft.trim() || !app || !roomId) return;
    setIsSavingJd(true);
    try {
      const fullPath = `${roomId}/hr-miniapp/jds/${jdName}`;
      await createOrUpdateFile(app, fullPath, jdEditDraft);
      setJdContent(jdEditDraft);
      setIsEditingJd(false);
      showToast(`Đã lưu thay đổi vào file RoomFiles/hr-miniapp/jds/${jdName}`, 'success');
      addLog(`[JD Editor] Đã cập nhật file JD: hr-miniapp/jds/${jdName}`);
    } catch (err: any) {
      console.error('Lỗi khi lưu file JD:', err);
      showToast(`Lỗi khi lưu file JD: ${err.message || err}`, 'error');
      addLog(`[LỖI] Không thể lưu file JD: ${err.message || err}`);
    } finally {
      setIsSavingJd(false);
    }
  };

  const handleDownloadJd = () => {
    if (!jdContent || !jdName) return;
    const blob = new Blob([jdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', jdName.endsWith('.md') ? jdName : `${jdName}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  // Note: localStorage is forbidden in Privos sandboxed iframe without allow-same-origin.
  // So we only keep it in memory for the current session.
  useEffect(() => {
    // Cannot use localStorage here
  }, []);

  useEffect(() => {
    if (!app || !roomId) return;
    serviceRef.current = serviceFactory
      ? serviceFactory(app, roomId)
      : new PipelineService(app, roomId, new MarkdownPathContextBuilder());

    const initPipeline = async () => {
      setJdLoading(true);
      try {
        await serviceRef.current?.ensureTemplatesExist?.(false);
        await loadFiles();
        await loadJDs();
      } finally {
        setJdLoading(false);
      }
    };

    initPipeline().catch(console.error);
  }, [app, roomId]);

  const loadJDs = async (): Promise<CVFile[]> => {
    if (!serviceRef.current?.fetchAvailableJDs) return [];
    setJdLoading(true);
    try {
      const jds = await serviceRef.current.fetchAvailableJDs(addLog);
      setAvailableJDs(jds);
      return jds;
    } catch (err) {
      console.error('Loi tai danh sach JD:', err);
      return [];
    } finally {
      setJdLoading(false);
    }
  };

  useEffect(() => {
    if (!jdFormOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [jdFormOpen]);

  useEffect(() => {
    if (!jdDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!jdDropdownRef.current?.contains(event.target as Node)) {
        setJdDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [jdDropdownOpen]);

  const addLog = useCallback((msg: string) => {
    console.info(`[CV Pipeline] ${msg}`);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const loadFiles = async () => {
    if (!serviceRef.current) return;
    setLoading(true);
    try { setFiles(await serviceRef.current.fetchAvailableFiles()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const reconcileSelectedFiles = useCallback(async () => {
    if (!serviceRef.current || processing) return;

    const [currentFiles, currentJDs] = await Promise.all([
      serviceRef.current.fetchAvailableFiles(),
      serviceRef.current.fetchAvailableJDs?.() ?? Promise.resolve([]),
    ]);

    setFiles(previous => haveSameFiles(previous, currentFiles) ? previous : currentFiles);
    setAvailableJDs(previous => haveSameFiles(previous, currentJDs) ? previous : currentJDs);

    const currentFileIds = new Set(currentFiles.map(file => file._id));
    const removedCVIds = [...selectedIds].filter(id => !currentFileIds.has(id));
    if (removedCVIds.length > 0) {
      setSelectedIds(previous => new Set([...previous].filter(id => currentFileIds.has(id))));
      const removedNames = files
        .filter(file => removedCVIds.includes(file._id))
        .map(file => file.name);
      const label = removedNames.length > 0 ? removedNames.join(', ') : `${removedCVIds.length} CV`;
      addLog(`[CẢNH BÁO] CV đã chọn không còn trong Room Files: ${label}. Đã bỏ khỏi danh sách chấm.`);
      showToast('Một hoặc nhiều CV đã chọn đã bị xóa. Hệ thống đã bỏ lựa chọn.', 'error');
    }

    if (jdName && !currentJDs.some(jd => jd.name === jdName)) {
      setJdName('');
      setJdContent('');
      setJdEditDraft('');
      setJdModalOpen(false);
      addLog(`[CẢNH BÁO] JD "${jdName}" không còn trong Room Files. Vui lòng chọn lại JD trước khi chấm.`);
      showToast('JD đã chọn đã bị xóa. Vui lòng chọn lại JD.', 'error');
    }
  }, [addLog, files, jdName, processing, selectedIds, showToast]);

  usePolling(reconcileSelectedFiles, {
    enabled: active && !processing && (selectedIds.size > 0 || Boolean(jdName)),
    interval: 3000,
    immediate: false,
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleUploadCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0 || !serviceRef.current) return;

    setLoading(true);
    try {
      const uploadPromises = Array.from(uploadedFiles).map(async (file) => {
        try {
          await serviceRef.current!.uploadCV(file);
          addLog(`\u0110\u00e3 t\u1ea3i l\u00ean: ${file.name}`);
          return file.name;
        } catch {
          addLog(`L\u1ed7i t\u1ea3i l\u00ean: ${file.name}`);
          return null;
        }
      });

      const uploadedNames = (await Promise.all(uploadPromises)).filter(Boolean);

      const list = await serviceRef.current.fetchAvailableFiles();
      setFiles(list);

      const newIds = list
        .filter(f => uploadedNames.includes(f.name))
        .map(f => f._id);

      if (newIds.length > 0) {
        setSelectedIds(prev => {
          const s = new Set(prev);
          newIds.forEach(id => s.add(id));
          return s;
        });
      }
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleUploadJD = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !serviceRef.current?.uploadJD) return;

    setLoading(true);
    try {
      const res = await serviceRef.current.uploadJD(file);
      addLog(`\u0110\u00e3 t\u1ea3i l\u00ean JD: ${res.name}`);
      await loadJDs(); // Refresh dropdown
      if (res._id) {
        await handleSelectJD(res._id); // Auto select new JD
      }
    } catch (err: any) {
      alert('L\u1ed7i t\u1ea3i l\u00ean JD: ' + err.message);
      addLog(`L\u1ed7i t\u1ea3i l\u00ean JD: ${err.message}`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleSelectJD = async (fileId: string, jdList: CVFile[] = availableJDs) => {
    if (!fileId) {
      setJdContent('');
      setJdName('');
      setJdModalOpen(false);
      return;
    }
    const jdFile = jdList.find(f => f._id === fileId);
    if (!jdFile) return;
    setJdName(jdFile.name);
    await loadJdContent(jdFile.name, jdFile._id);
  };

  const handleGenerateJD = async () => {
    if (!jdPrompt.trim() || !serviceRef.current?.askAI) return;
    const beforeJDNames = new Set(availableJDs.map(jd => jd.name));
    setIsGeneratingJD(true);
    setJdFormOpen(false);
    addLog(`\u0110ang g\u1eedi y\u00eau c\u1ea7u t\u1ea1o JD cho AI...`);
    try {
      // Prompt starts with @Files so askAI will not wrap it in extractor directives.
      // The JD generator skill needs to run as an automation workflow that writes a file.
      const fullPrompt = `@Files:${roomId}/hr-miniapp/skills/jd-generator-skill.md
[SYSTEM AUTOMATION] EXECUTE NOW. DO NOT ASK FOLLOW-UP QUESTIONS.
Read the skill file above and run the full JD generation workflow.
${useCompanyInfo 
  ? '\nLƯU Ý QUAN TRỌNG: Hãy tìm và đọc các tài liệu trong thư mục "hr-miniapp/company" (Dữ liệu công ty). Dựa vào đó, hãy tự động thêm một phần "Thông tin công ty" vào trong JD và tóm tắt ngắn gọn các thông tin chính về công ty.\n' 
  : '\nLƯU Ý QUAN TRỌNG: TUYỆT ĐỐI KHÔNG thêm thông tin công ty vào JD (Kể cả khi template JD có phần công ty, hãy bỏ qua hoặc để trống).\n'}
User JD request:
${jdPrompt}

REQUIRED:
1. Save a .md file directly into Room Files path "hr-miniapp/jds/" (TUYỆT ĐỐI KHÔNG lưu vào sandbox container, KHÔNG thêm tiền tố RoomFiles/ hay room ID vào đường dẫn).
2. The filename MUST start with "JD_AI_" (VD: JD_AI_DataAnalyst.md). If it exists, append a number suffix (VD: JD_AI_DataAnalyst_1.md).
3. Only report completion after the file has been saved.
4. Return the saved path in <saved_file>JD_AI_TenViTri.md</saved_file>.
5. Return full JD markdown content in <jd_content>...</jd_content>.`;

      addLog(`\u0110\u00e3 g\u1eedi y\u00eau c\u1ea7u. \u0110ang ch\u1edd AI ph\u00e2n t\u00edch v\u00e0 t\u1ea1o JD (c\u00f3 th\u1ec3 m\u1ea5t 30-60s)...`);

      const res = await serviceRef.current.askAI(fullPrompt, undefined, undefined, addLog);

      if (res && res.text) {
        addLog(`AI \u0111\u00e3 ph\u1ea3n h\u1ed3i. \u0110ang ki\u1ec3m tra file JD m\u1edbi trong th\u01b0 m\u1ee5c jds...`);

        let refreshedJDs: CVFile[] = [];
        let createdJD: CVFile | undefined;

        for (let attempt = 1; attempt <= 5; attempt++) {
          refreshedJDs = await loadJDs();
          createdJD = refreshedJDs.find(jd => !beforeJDNames.has(jd.name));
          if (createdJD) break;

          if (attempt < 5) {
            addLog(`Ch\u01b0a th\u1ea5y file JD m\u1edbi trong danh s\u00e1ch. Th\u1eed t\u1ea3i l\u1ea1i l\u1ea7n ${attempt + 1}/5...`);
            await new Promise(resolve => window.setTimeout(resolve, 2000));
          }
        }
        
        // Self-healing: Nếu AI chưa kịp ghi ra đĩa hoặc lưu vào sandbox, tự động lưu nội dung JD vào Room Files
        if (!createdJD) {
          let extractedJD = '';
          const jdMatch = res.text.match(/<jd_content>\s*([\s\S]*?)\s*<\/jd_content>/i);
          if (jdMatch && jdMatch[1]) {
            extractedJD = jdMatch[1].trim();
          } else if (res.text.includes('# ') && res.text.includes('Mô tả')) {
            extractedJD = res.text.replace(/<saved_file>[\s\S]*?<\/saved_file>/gi, '').trim();
          }

          let jdFileName = '';
          const fileMatch = res.text.match(/<saved_file>\s*([\s\S]*?)\s*<\/saved_file>/i);
          if (fileMatch && fileMatch[1]) {
            jdFileName = fileMatch[1].trim().split('/').pop() || '';
          }
          if (!jdFileName || !jdFileName.endsWith('.md')) {
            let positionName = jdForm.position;
            if (!positionName || positionName.trim() === '') {
              const match = jdPrompt.match(/- V\u1ecb tr\u00ed:\s*([^\n]+)/i);
              if (match && match[1] && match[1].trim() !== 'Kh\u00f4ng x\u00e1c \u0111\u1ecbnh') {
                positionName = match[1].trim();
              }
            }
            if (!positionName || positionName.trim() === '') {
              positionName = 'NewPosition';
            }
            
            // Normalize Vietnamese and remove special characters
            let cleanTitle = positionName
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .replace(/[^a-zA-Z0-9]/g, '');
              
            jdFileName = `JD_AI_${cleanTitle || 'NewPosition'}.md`;
          }

          if (extractedJD && app) {
            addLog(`[Self-Healing] Đang tự động lưu file JD vào Room Files: hr-miniapp/jds/${jdFileName}...`);
            try {
              await createOrUpdateFile(app, `${roomId}/hr-miniapp/jds/${jdFileName}`, extractedJD);
              refreshedJDs = await loadJDs();
              createdJD = refreshedJDs.find(jd => jd.name === jdFileName || !beforeJDNames.has(jd.name));
              if (createdJD) {
                addLog(`[Self-Healing] Đã lưu thành công file JD: ${jdFileName}`);
              }
            } catch (saveErr: any) {
              console.warn('[Self-Healing] Lỗi ghi fallback JD file:', saveErr);
            }
          }
        }

        if (createdJD) {
          addLog(`AI đã tạo JD mới: ${createdJD.name}`);
          setJdPrompt('');
          setJdForm(emptyJDForm);
          setJdFormOpen(false);
          await handleSelectJD(createdJD._id, refreshedJDs);
          showToast(`AI đã tạo xong JD mới: ${createdJD.name}`);
        } else {
          addLog(`AI đã phản hồi nhưng chưa thấy file JD mới trong thư mục jds.`);
          showToast('AI đã phản hồi nhưng chưa thấy JD mới trong danh sách. Vui lòng kiểm tra log hoặc bấm làm mới JD.', 'error');
        }
      } else {
        addLog(`AI \u0111\u00e3 x\u1eed l\u00fd nh\u01b0ng kh\u00f4ng nh\u1eadn \u0111\u01b0\u1ee3c k\u1ebft qu\u1ea3 text.`);
        showToast('AI ph\u1ea3n h\u1ed3i ch\u1eadm ho\u1eb7c c\u00f3 l\u1ed7i. Vui l\u00f2ng ki\u1ec3m tra l\u1ea1i.', 'error');
      }
    } catch (err: any) {
      showToast('L\u1ed7i g\u1eedi y\u00eau c\u1ea7u: ' + err.message, 'error');
    } finally {
      setIsGeneratingJD(false);
    }
  };

  const startPipeline = async () => {
    if (!serviceRef.current || selectedIds.size === 0) return;
    if (!jdContent) { alert('Vui l\u00f2ng t\u1ea3i l\u00ean file JD tr\u01b0\u1edbc khi b\u1eaft \u0111\u1ea7u.'); return; }
    setProcessing(true);
    addLog('\u2014 Pipeline b\u1eaft \u0111\u1ea7u \u2014');
    const filesToProcess = files.filter(f => selectedIds.has(f._id));
    setActiveBatchFileIds(filesToProcess.map(file => file._id));
    setStatuses(prev => ({
      ...prev,
      ...Object.fromEntries(filesToProcess.map(f => [f._id, { fileId: f._id, originalName: f.name, status: 'pending' as const }]))
    }));

    const resultsForKanban: Array<{ originalName: string; normalizedName?: string; score?: number; category?: string; reason?: string; email?: string; sdt?: string; phone?: string }> = [];

    const checkScoringFiles = async (cv: CVFile): Promise<'available' | 'cv-deleted' | 'jd-deleted'> => {
      try {
        const [currentFiles, currentJds] = await Promise.all([
          serviceRef.current!.fetchAvailableFiles(),
          serviceRef.current!.fetchAvailableJDs?.() ?? Promise.resolve([]),
        ]);

        if (!currentJds.some(jd => jd.name === jdName)) return 'jd-deleted';
        if (!currentFiles.some(file => file._id === cv._id)) return 'cv-deleted';
        return 'available';
      } catch (err: any) {
        addLog(`[Cảnh báo] Không thể kiểm tra trạng thái CV/JD: ${err.message || err}`);
        return 'available';
      }
    };

    for (const cv of filesToProcess) {
      const beforeStatus = await checkScoringFiles(cv);
      if (beforeStatus === 'jd-deleted') {
        addLog(`[CẢNH BÁO] JD "${jdName}" đã bị xóa khỏi Room Files. Dừng batch chấm CV.`);
        break;
      }
      if (beforeStatus === 'cv-deleted') {
        addLog(`[CẢNH BÁO] CV "${cv.name}" đã bị xóa khỏi Room Files. Bỏ qua CV này.`);
        setStatuses(prev => ({
          ...prev,
          [cv._id]: { ...prev[cv._id], status: 'error', errorMsg: 'CV đã bị xóa khỏi Room Files.' }
        }));
        setSelectedIds(prev => { const next = new Set(prev); next.delete(cv._id); return next; });
        continue;
      }

      addLog(`\u0110ang x\u1eed l\u00fd: ${cv.name}`);
      let currentStatus: any = { originalName: cv.name };
      
      await serviceRef.current.processCV(
        cv,
        update => {
          setStatuses(prev => ({ ...prev, [cv._id]: { ...prev[cv._id], ...update } }));
          currentStatus = { ...currentStatus, ...update };
        },
        jdContent, jdName, addLog
      );

      const afterStatus = await checkScoringFiles(cv);
      if (afterStatus === 'jd-deleted') {
        addLog(`[CẢNH BÁO] JD "${jdName}" đã bị xóa trong lúc chấm "${cv.name}". Dừng batch chấm CV.`);
        break;
      }
      if (afterStatus === 'cv-deleted') {
        addLog(`[CẢNH BÁO] CV "${cv.name}" đã bị xóa trong lúc chấm. Bỏ qua kết quả CV này.`);
        setSelectedIds(prev => { const next = new Set(prev); next.delete(cv._id); return next; });
        continue;
      }

      if (currentStatus.status === 'completed') {
        resultsForKanban.push(currentStatus);
      } else {
        addLog(`[CẢNH BÁO] Không lưu kết quả "${cv.name}": ${currentStatus.errorMsg || 'AI không hoàn tất chấm CV.'}`);
      }
      setSelectedIds(prev => { const n = new Set(prev); n.delete(cv._id); return n; });
      addLog(currentStatus.status === 'completed' ? `Xong: ${cv.name}` : `Dừng xử lý: ${cv.name}`);
    }

    if (serviceRef.current.createKanbanBatchViaAI && resultsForKanban.length > 0) {
      addLog(`Bắt đầu tạo List Kanban và lưu kết quả ${resultsForKanban.length} CV...`);
      try {
        await serviceRef.current.createKanbanBatchViaAI(resultsForKanban, jdName, addLog);
        
        // Log thống kê thông tin liên hệ trích xuất được
        const missingContacts = resultsForKanban.filter(r => !r.email && !(r.sdt || r.phone));
        if (missingContacts.length > 0) {
          addLog(`[Cảnh báo] Có ${missingContacts.length}/${resultsForKanban.length} CV không đọc được Email/SĐT: ${missingContacts.map(c => c.originalName).join(', ')}`);
        } else {
          addLog(`[Thành công] Đã trích xuất thành công Email/SĐT cho ${resultsForKanban.length} CV!`);
        }
      } catch (err: any) {
        addLog(`Lỗi tạo Kanban: ${err.message}`);
      }
    }

    setProcessing(false);
    addLog('\u2014 Pipeline k\u1ebft th\u00fac \u2014');
    await loadFiles();
    showToast('\u0110\u00e3 ch\u1ea5m \u0111i\u1ec3m xong v\u00e0 l\u01b0u k\u1ebft qu\u1ea3 v\u00e0o list.');
  };


  const resultList = Object.values(statuses);
  const batchProgress = getBatchProgress(activeBatchFileIds, statuses);
  const defaultJDs = availableJDs.filter(jd => jd.name.startsWith('JD_') && !jd.name.startsWith('JD_AI_'));
  const aiGeneratedJDs = availableJDs.filter(jd => !jd.name.startsWith('JD_') || jd.name.startsWith('JD_AI_'));
  const selectedJD = availableJDs.find(jd => jd.name === jdName);
  const jdDropdownLabel = jdLoading ? "Vui l\u00f2ng ch\u1edd JD \u0111ang t\u1ea3i l\u00ean" : selectedJD?.name || "Ch\u1ecdn JD";
  const isJDFormReady = hasJDFormValue(jdForm);

  const updateJDFormField = (field: keyof JDFormState, value: string) => {
    const nextForm = { ...jdForm, [field]: value };
    setJdForm(nextForm);
    setJdPrompt(buildJDPromptFromForm(nextForm));
  };

  const renderJDFormField = (
    field: keyof JDFormState,
    label: string,
    placeholder: string,
    multiline = false,
    wide = false,
    options?: string[]
  ) => {
    const listId = options ? `list-${field}` : undefined;
    return (
    <label className={`pl-form-field${wide ? ' pl-span-2' : ''}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          className="pl-textarea"
          value={jdForm[field]}
          onChange={(e) => updateJDFormField(field, e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <>
          <input
            className="pl-input"
            value={jdForm[field]}
            onChange={(e) => updateJDFormField(field, e.target.value)}
            placeholder={placeholder}
            list={listId}
          />
          {options && (
            <datalist id={listId}>
              {options.map((opt, i) => (
                <option key={i} value={opt} />
              ))}
            </datalist>
          )}
        </>
      )}
    </label>
    );
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');

        .pl-root * { box-sizing: border-box; }
        .pl-root { font-family: 'DM Sans', system-ui, sans-serif; }

        .pl-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 20px;
          box-shadow: var(--shadow-card);
          animation: pl-in 0.2s ease;
        }
        .pl-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.07em;
          text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px;
        }
        .pl-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-card);
          color: var(--text); font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;
          transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        }
        .pl-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--text-muted); }
        .pl-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .pl-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
        .pl-btn-primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: 0 0 0 3px rgba(21,111,245,.2); }
        .pl-select-wrap { position: relative; flex: 1; min-width: 0; }
        .pl-select-wrap::after {
          content: '\\2304'; position: absolute; right: 12px; top: 50%; transform: translateY(-52%);
          pointer-events: none; color: var(--text-muted); font-size: 14px; line-height: 1;
        }
        .pl-select {
          width: 100%; height: 38px; appearance: none; -webkit-appearance: none;
          padding: 8px 34px 8px 12px; border: 1px solid var(--border);
          border-radius: 12px; background: var(--bg-card); color: var(--text);
          font-family: 'DM Sans', system-ui, sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; outline: none; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .pl-select:hover { background: var(--bg-hover); border-color: var(--text-muted); }
        .pl-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(21,111,245,.12); }
        .pl-dropdown-button {
          width: 100%; height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px;
          background: var(--bg-card); color: var(--text); font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px; font-weight: 500; cursor: pointer; text-align: left;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .pl-dropdown-button:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--text-muted); }
        .pl-dropdown-button.open { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(21,111,245,.12); }
        .pl-dropdown-button:disabled { opacity: 0.6; cursor: wait; }
        .pl-dropdown-button span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pl-dropdown-caret { color: var(--text-muted); flex-shrink: 0; transition: transform 0.15s; }
        .pl-dropdown-button.open .pl-dropdown-caret { transform: rotate(180deg); }
        .pl-dropdown-menu {
          position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 40;
          max-height: 260px; overflow-y: auto; padding: 8px;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 18px 44px rgba(0,0,0,.18); animation: pl-in 0.16s ease;
        }
        .pl-dropdown-group + .pl-dropdown-group { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); }
        .pl-dropdown-group p { margin: 2px 6px 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
        .pl-dropdown-item {
          width: 100%; display: block; padding: 9px 10px; border: 0; border-radius: 10px;
          background: transparent; color: var(--text); font: inherit; font-size: 13px; text-align: left;
          cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pl-dropdown-item:hover { background: var(--bg-hover); }
        .pl-dropdown-item.selected { background: rgba(21,111,245,.08); color: var(--accent); font-weight: 600; }
        .pl-dropdown-menu { scrollbar-width: none; -ms-overflow-style: none; }
        .pl-dropdown-menu::-webkit-scrollbar { width: 0; height: 0; display: none; }

        .pl-jd-link-btn {
          margin-left: 8px;
          padding: 2px 8px;
          border: 1px solid rgba(21,111,245,0.25);
          border-radius: 12px;
          background: rgba(21,111,245,0.06);
          color: var(--accent);
          font-weight: 500;
          font-size: 12px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;
        }
        .pl-jd-link-btn:hover {
          background: rgba(21,111,245,0.14) !important;
          border-color: var(--accent) !important;
          box-shadow: 0 2px 8px rgba(21,111,245,0.18);
        }

        .pl-no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .pl-no-scrollbar::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }


        .pl-toast {
          position: fixed; top: 20px; right: 24px; z-index: 1300;
          display: flex; align-items: center; gap: 10px; max-width: min(420px, calc(100vw - 48px));
          padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border);
          background: var(--bg-card); color: var(--text); box-shadow: 0 16px 48px rgba(0,0,0,.22);
          font-size: 13px; font-weight: 500; line-height: 1.45; animation: pl-toast-in 0.2s ease;
        }
        .pl-toast.success { border-color: rgba(22, 163, 74, .28); }
        .pl-toast.error { border-color: rgba(220, 38, 38, .32); }
        .pl-toast-dot { width: 9px; height: 9px; border-radius: 999px; flex-shrink: 0; background: var(--status-pass); }
        .pl-toast.error .pl-toast-dot { background: var(--status-fail); }

        .pl-page-grid { display: flex; flex-direction: column; gap: 18px; }
        .pl-top-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: stretch; }
        .pl-top-grid > .pl-card { height: 100%; }
        .pl-modal-backdrop {
          position: fixed; inset: 0; z-index: 1000; padding: 32px 20px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(15, 23, 42, 0.58); backdrop-filter: blur(2px);
        }
        .pl-modal {
          width: min(920px, 100%); max-height: calc(100vh - 64px); overflow-y: auto; overscroll-behavior: contain;
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 20px; box-shadow: 0 24px 80px rgba(0,0,0,.28);
          animation: pl-modal-in 0.18s ease;
        }
        .pl-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
        .pl-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-light); }
        .pl-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .pl-form-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .pl-span-2 { grid-column: 1 / -1; }
        .pl-input, .pl-textarea {
          width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg-card); color: var(--text); font: inherit; font-size: 13px;
          padding: 9px 10px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pl-textarea { min-height: 82px; resize: vertical; line-height: 1.5; }
        .pl-input:focus, .pl-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(21,111,245,.12); }
        .pl-results-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; }
        .pl-cv-list {
          width: 100%; max-height: 180px; overflow-y: auto; padding: 8px;
          border: 1px solid var(--border); border-radius: 14px; background: var(--bg-card);
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .pl-cv-list::-webkit-scrollbar { width: 0; height: 0; display: none; }
        .pl-cv-empty { margin: 0; padding: 11px 10px; font-size: 13px; color: var(--text-faint); }
        .pl-file-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: var(--radius-sm);
          border: 1px solid transparent; background: transparent; cursor: pointer;
          font-size: 13px; color: var(--text); margin-bottom: 6px;
          transition: background 0.15s, border-color 0.15s; user-select: none;
        }
        .pl-file-item:hover { background: var(--bg-hover); border-color: transparent; }
        .pl-file-item.sel { background: rgba(21,111,245,.06); border-color: var(--accent); color: var(--accent); }
        .pl-check { width: 14px; height: 14px; flex-shrink: 0; border: 1.5px solid var(--border); border-radius: 3px; transition: background 0.15s, border-color 0.15s; }
        .pl-file-item.sel .pl-check { background: var(--accent); border-color: var(--accent); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-5' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-size: 10px; background-position: center; background-repeat: no-repeat; }

        @keyframes pl-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pl-modal-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes pl-toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 920px) {
          .pl-top-grid, .pl-form-grid { grid-template-columns: 1fr; }
          .pl-modal-backdrop { padding: 16px 12px; align-items: flex-start; }
          .pl-modal { max-height: calc(100vh - 32px); padding: 16px; }
          .pl-modal-header, .pl-modal-actions { flex-direction: column; align-items: stretch; }
          .pl-toast { top: 12px; right: 12px; left: 12px; max-width: none; }
          .pl-span-2 { grid-column: auto; }
        }
        @media (prefers-reduced-motion: reduce) { .pl-card { animation: none; } }
      `}</style>

      <div className="pl-root" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: '28px 24px' }}>

        {/* Header */}
        <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
              CV Pipeline
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span>{'X\u1eed l\u00fd & ch\u1ea5m \u0111i\u1ec3m CV t\u1ef1 \u0111\u1ed9ng'}</span>
              {jdName && (
                <button
                  type="button"
                  onClick={handleOpenJdModal}
                  className="pl-jd-link-btn"
                  title={`Xem n\u1ed9i dung file RoomFiles/hr-miniapp/jds/${jdName}`}
                >
                  <span style={{ fontSize: '11px' }}>{'\u00b7'}</span>
                  <span>{jdName}</span>
                  <span style={{ fontSize: '11px', opacity: 0.85 }}>📄 Xem JD</span>
                </button>
              )}
            </p>
          </div>
        </header>

        {/* Pipeline Layout */}
        <div className="pl-page-grid">

          {/* Top row: JD + CV Queue */}
          <div className="pl-top-grid">
            {/* JD Card */}
            <div className="pl-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p className="pl-label" style={{ margin: 0 }}>{"01 \u00b7 Job Description"}</p>
                {jdContent && <span style={{ fontSize: '12px', color: 'var(--status-pass)', fontWeight: 500 }}>{'\u2713 \u0110\u00e3 n\u1ea1p'}</span>}
              </div>

              {/* JD Selection */}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, margin: '0 0 6px 0' }}>{'Ch\u1ecdn JD c\u00f3 s\u1eb5n'}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div className="pl-select-wrap" ref={jdDropdownRef}>
                    <button
                      type="button"
                      className={`pl-dropdown-button${jdDropdownOpen ? ' open' : ''}`}
                      onClick={() => !jdLoading && setJdDropdownOpen(open => !open)}
                      disabled={jdLoading}
                    >
                      <span>{jdDropdownLabel}</span>
                      <span className="pl-dropdown-caret">{"\u2304"}</span>
                    </button>

                    {jdDropdownOpen && (
                      <div className="pl-dropdown-menu">
                        {defaultJDs.length > 0 && (
                          <div className="pl-dropdown-group">
                            <p>{'JD tuy\u1ec3n d\u1ee5ng'}</p>
                            {defaultJDs.map(jd => (
                              <button
                                key={jd._id}
                                type="button"
                                className={`pl-dropdown-item${jd.name === jdName ? ' selected' : ''}`}
                                onClick={() => { handleSelectJD(jd._id); setJdDropdownOpen(false); }}
                              >
                                {jd.name}
                              </button>
                            ))}
                          </div>
                        )}

                        {aiGeneratedJDs.length > 0 && (
                          <div className="pl-dropdown-group">
                            <p>{'JD AI t\u1ea1o'}</p>
                            {aiGeneratedJDs.map(jd => (
                              <button
                                key={jd._id}
                                type="button"
                                className={`pl-dropdown-item${jd.name === jdName ? ' selected' : ''}`}
                                onClick={() => { handleSelectJD(jd._id); setJdDropdownOpen(false); }}
                              >
                                {jd.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* JD AI Generator */}
              <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                <button
                  className="pl-btn pl-btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setJdFormOpen(true)}
                  disabled={isGeneratingJD}
                >
                  {isGeneratingJD ? 'Đang tạo...' : <><span>{'\u2728'}</span> {'Tạo bằng form'}</>}
                </button>
              </div>
              {/* JD Upload Fallback */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px dashed var(--border-light)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{'Ho\u1eb7c t\u1ea3i file t\u1eeb m\u00e1y t\u00ednh:'}</span>
                <input type="file" id="jd-upload" style={{ display: 'none' }} onChange={handleUploadJD} accept=".md,.txt" />
                <button className="pl-btn" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => document.getElementById('jd-upload')?.click()} disabled={processing}>
                  {'\u2191 Upload'}
                </button>
              </div>
            </div>

            {/* CV Queue Card */}
            <div className="pl-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p className="pl-label" style={{ margin: 0 }}>{"02 \u00b7 H\u00e0ng ch\u1edd CV"}</p>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {files.length} CV {'\u00b7'} {'ch\u1ecdn'} {selectedIds.size}
                </span>
              </div>

              <input type="file" id="cv-upload" style={{ display: 'none' }} multiple onChange={handleUploadCV} accept=".pdf,.doc,.docx,.jpg,.png" />

              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, margin: '0 0 6px 0' }}>{'CV \u0111\u00e3 upload'}</p>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div className="pl-cv-list">
                    {loading
                      ? <p className="pl-cv-empty" style={{ color: 'var(--text-muted)' }}>{'Vui l\u00f2ng ch\u1edd CV t\u1ea3i l\u00ean'}</p>
                      : files.length === 0
                        ? <p className="pl-cv-empty">{"Kh\u00f4ng c\u00f3 file n\u00e0o"}</p>
                        : files.map(f => (
                          <div key={f._id} className={`pl-file-item${selectedIds.has(f._id) ? ' sel' : ''}`}
                            onClick={() => !processing && handleToggleSelect(f._id)} title={f.name}>
                            <span className="pl-check" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <button className="pl-btn pl-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                  onClick={startPipeline} disabled={selectedIds.size === 0 || processing || !jdContent}>
                  {processing ? '\u27f3 \u0110ang x\u1eed l\u00fd\u2026' : `Ch\u1ea5m \u0111i\u1ec3m (${selectedIds.size})`}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '12px', borderTop: '1px dashed var(--border-light)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{'Ho\u1eb7c t\u1ea3i CV t\u1eeb m\u00e1y t\u00ednh:'}</span>
                <button className="pl-btn" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => document.getElementById('cv-upload')?.click()} disabled={loading || processing}>
                  {'\u2191 Upload'}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="pl-card" style={{ padding: '18px 20px', minHeight: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <p className="pl-label" style={{ margin: 0 }}>{"03 \u00b7 K\u1ebft qu\u1ea3 ch\u1ea5m"}</p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {resultList.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{resultList.length} CV</span>}
              </div>
            </div>
            {resultList.length === 0
              ? (
                <div style={{ minHeight: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-faint)' }}>
                    {'Ch\u01b0a c\u00f3 k\u1ebft qu\u1ea3 \u2014 ch\u1ecdn CV v\u00e0 ch\u1ea1y ch\u1ea5m \u0111i\u1ec3m'}
                  </p>
                </div>
              )
              : (
                <div className="pl-results-list">
                  {resultList.map(s => <CVResultCard key={s.fileId} s={s} />)}
                </div>
              )
            }
          </div>

          <PipelineProgressCard progress={batchProgress} isProcessing={processing} />

        </div>

        {toast && (
          <div className={`pl-toast ${toast.type}`} role="status" aria-live="polite">
            <span className="pl-toast-dot" />
            <span>{toast.message}</span>
          </div>
        )}

        {jdFormOpen && (
          <div
            className="pl-modal-backdrop"
            onClick={() => !isGeneratingJD && setJdFormOpen(false)}
          >
            <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pl-modal-header">
                <div>
                  <p className="pl-label" style={{ margin: 0 }}>{"T\u1ea1o JD b\u1eb1ng AI"}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {'\u0110i\u1ec1n c\u00e1c th\u00f4ng tin ch\u00ednh theo m\u1eabu JD \u0111\u1ec3 AI t\u1ea1o file tuy\u1ec3n d\u1ee5ng ho\u00e0n ch\u1ec9nh.'}
                  </p>
                </div>
                <button
                  className="pl-btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => setJdFormOpen(false)}
                  disabled={isGeneratingJD}
                  aria-label={"\u0110\u00f3ng form t\u1ea1o JD"}
                >
                  {'\u2715'}
                </button>
              </div>

              <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-light)', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
                  <input 
                    type="checkbox" 
                    checked={useCompanyInfo}
                    onChange={(e) => setUseCompanyInfo(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                  />
                  Thêm thông tin Công ty vào JD
                </label>
              </div>

              <div className="pl-form-grid">
                <p className="pl-label pl-span-2" style={{ margin: '2px 0 0' }}>{"Th\u00f4ng tin chung"}</p>
                {renderJDFormField('position', 'V\u1ecb tr\u00ed', 'VD: L\u1eadp tr\u00ecnh vi\u00ean Mini App', false, false, ['L\u1eadp tr\u00ecnh vi\u00ean Front-end', 'L\u1eadp tr\u00ecnh vi\u00ean Back-end', 'L\u1eadp tr\u00ecnh vi\u00ean Mobile', 'Data Analyst', 'Chuy\u00ean vi\u00ean Nh\u00e2n s\u1ef1', 'Chuy\u00ean vi\u00ean Marketing'])}
                {renderJDFormField('department', 'Ph\u00f2ng ban', 'VD: Khoa h\u1ecdc D\u1eef li\u1ec7u & HTTT', false, false, ['Kh\u1ed1i C\u00f4ng ngh\u1ec7', 'Kh\u1ed1i Kinh doanh', 'Ph\u00f2ng Marketing', 'Ph\u00f2ng Nh\u00e2n s\u1ef1', 'Ph\u00f2ng K\u1ebf to\u00e1n'])}
                {renderJDFormField('location', '\u0110\u1ecba \u0111i\u1ec3m l\u00e0m vi\u1ec7c', 'VD: H\u00e0 N\u1ed9i / Remote / Hybrid', false, false, ['H\u00e0 N\u1ed9i', 'TP. H\u1ed3 Ch\u00ed Minh', '\u0110\u00e0 N\u1eb5ng', 'Remote', 'Hybrid'])}
                {renderJDFormField('workTime', 'Th\u1eddi gian l\u00e0m vi\u1ec7c', 'VD: Full-time ho\u1eb7c Part-time', false, false, ['Full-time', 'Part-time', 'Th\u1ef1c t\u1eadp sinh (Intern)', 'C\u1ed9ng t\u00e1c vi\u00ean (CTV)'])}

                <p className="pl-label pl-span-2" style={{ margin: '4px 0 0' }}>{"M\u00f4 t\u1ea3 c\u00f4ng vi\u1ec7c"}</p>
                {renderJDFormField('jobDescription', 'M\u00f4 t\u1ea3 c\u00f4ng vi\u1ec7c', 'Nh\u1eadp c\u00e1c \u0111\u1ea7u vi\u1ec7c ch\u00ednh, m\u1ed7i d\u00f2ng m\u1ed9t \u00fd...', true, true)}

                <p className="pl-label pl-span-2" style={{ margin: '4px 0 0' }}>{"Y\u00eau c\u1ea7u \u1ee9ng vi\u00ean"}</p>
                {renderJDFormField('experience', 'Kinh nghi\u1ec7m', 'VD: 01 n\u0103m kinh nghi\u1ec7m', false, false, ['Kh\u00f4ng y\u00eau c\u1ea7u kinh nghi\u1ec7m', 'D\u01b0\u1edbi 1 n\u0103m kinh nghi\u1ec7m', '1-2 n\u0103m kinh nghi\u1ec7m', '3-5 n\u0103m kinh nghi\u1ec7m', 'Tr\u00ean 5 n\u0103m kinh nghi\u1ec7m'])}
                {renderJDFormField('education', 'H\u1ecdc v\u1ea5n', 'VD: T\u1ed1t nghi\u1ec7p ng\u00e0nh CNTT', false, false, ['Kh\u00f4ng y\u00eau c\u1ea7u b\u1eb1ng c\u1ea5p', 'T\u1ed1t nghi\u1ec7p Cao \u0111\u1eb3ng tr\u1edf l\u00ean', 'T\u1ed1t nghi\u1ec7p \u0110\u1ea1i h\u1ecdc tr\u1edf l\u00ean', 'T\u1ed1t nghi\u1ec7p \u0110\u1ea1i h\u1ecdc chuy\u00ean ng\u00e0nh CNTT', '\u0110ang l\u00e0 sinh vi\u00ean n\u0103m 3, n\u0103m 4'])}
                {renderJDFormField('technicalSkills', 'K\u1ef9 n\u0103ng chuy\u00ean m\u00f4n', 'VD: React, TypeScript, Mini App...', true, true)}
                {renderJDFormField('softSkills', 'K\u1ef9 n\u0103ng m\u1ec1m', 'VD: Ch\u1ee7 \u0111\u1ed9ng, giao ti\u1ebfp t\u1ed1t...', true, true)}

                <p className="pl-label pl-span-2" style={{ margin: '4px 0 0' }}>{"Quy\u1ec1n l\u1ee3i"}</p>
                {renderJDFormField('salary', 'M\u1ee9c l\u01b0\u01a1ng', 'VD: 15.000.000 VN\u0110/th\u00e1ng', false, false, ['Th\u1ecfa thu\u1eadn theo n\u0103ng l\u1ef1c', '10.000.000 - 15.000.000 VN\u0110', '15.000.000 - 20.000.000 VN\u0110', '20.000.000 - 30.000.000 VN\u0110', 'C\u1ea1nh tranh tr\u00ean th\u1ecb tr\u01b0\u1eddng'])}
                {renderJDFormField('benefits', 'Ph\u00fac l\u1ee3i', 'VD: Th\u01b0\u1edfng d\u1ef1 \u00e1n, BHXH...', true)}
                {renderJDFormField('workEnvironment', 'M\u00f4i tr\u01b0\u1eddng l\u00e0m vi\u1ec7c', 'VD: Tr\u1ebb, linh ho\u1ea1t, s\u1ea3n ph\u1ea9m th\u1ef1c t\u1ebf...', true, true)}

                <p className="pl-label pl-span-2" style={{ margin: '4px 0 0' }}>{"C\u00e1ch th\u1ee9c \u1ee9ng tuy\u1ec3n"}</p>
                {renderJDFormField('applyEmail', 'Email nh\u1eadn CV', 'VD: hr@company.vn')}
                {renderJDFormField('emailSubject', 'Ti\u00eau \u0111\u1ec1 email', 'VD: V\u1ecb tr\u00ed - [H\u1ecd v\u00e0 t\u00ean]')}
              </div>

              <div className="pl-modal-actions">
                <button
                  className="pl-btn"
                  onClick={() => { setJdForm(emptyJDForm); setJdPrompt(''); }}
                  disabled={isGeneratingJD || !isJDFormReady}
                >
                  {'X\u00f3a form'}
                </button>
                <button
                  className="pl-btn pl-btn-primary"
                  onClick={handleGenerateJD}
                  disabled={isGeneratingJD || !isJDFormReady}
                >
                  {isGeneratingJD ? '\u0110ang g\u1eedi y\u00eau c\u1ea7u...' : 'G\u1eedi AI t\u1ea1o JD'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* JD Content Modal Popup */}
        {jdModalOpen && (
          <div className="pl-modal-backdrop" onClick={() => setJdModalOpen(false)}>
            <div
              className="pl-modal"
              style={{ maxWidth: '820px', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="pl-modal-header"
                style={{
                  flexShrink: 0,
                  borderBottom: '1px solid var(--border-light)',
                  paddingBottom: '14px',
                  marginBottom: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>📄</span>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                        {jdName}
                      </h3>
                    </div>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                    RoomFiles/hr-miniapp/jds/{jdName}
                  </p>
                </div>
                <button
                  type="button"
                  className="pl-btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => {
                    setIsEditingJd(false);
                    setJdModalOpen(false);
                  }}
                  aria-label="Đóng modal"
                >
                  ✕
                </button>
              </div>

              <div
                className="pl-no-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  padding: isEditingJd ? '14px' : '20px 22px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {isEditingJd ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                        📝 Chế độ chỉnh sửa Markdown
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Hỗ trợ định dạng Markdown (H1, H2, Bold, List...)
                      </span>
                    </div>
                    <textarea
                      className="pl-textarea pl-no-scrollbar"
                      value={jdEditDraft}
                      onChange={(e) => setJdEditDraft(e.target.value)}
                      disabled={isSavingJd}
                      style={{
                        flex: 1,
                        minHeight: '380px',
                        width: '100%',
                        fontFamily: 'DM Mono, monospace',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--accent)',
                        background: 'var(--bg-card)',
                        color: 'var(--text)',
                        resize: 'vertical',
                        outline: 'none',
                        boxShadow: '0 0 0 3px rgba(21,111,245,0.12)',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                      }}
                      placeholder="Nhập nội dung JD (định dạng Markdown)..."
                    />
                  </div>
                ) : jdLoadingContent ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>
                    Đang tải nội dung file JD...
                  </p>
                ) : jdContent && !jdContent.startsWith('Selected JD:') ? (
                  renderFormattedMarkdown(jdContent)
                ) : (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>
                    Chưa nạp được nội dung file JD từ RoomFiles/hr-miniapp/jds/{jdName}.
                  </p>
                )}
              </div>

              <div
                className="pl-modal-actions"
                style={{
                  flexShrink: 0,
                  marginTop: '14px',
                  paddingTop: '12px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                {isEditingJd ? (
                  <>
                    <button
                      type="button"
                      className="pl-btn"
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
                      className="pl-btn pl-btn-primary"
                      onClick={handleSaveJdContent}
                      disabled={isSavingJd || !jdEditDraft.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>💾</span>
                      <span>{isSavingJd ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="pl-btn"
                      onClick={handleDownloadJd}
                      disabled={!jdContent || jdContent.startsWith('Selected JD:')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderColor: 'var(--accent)',
                        color: 'var(--accent)',
                        fontWeight: 600,
                      }}
                    >
                      <span>📥</span>
                      <span>Tải về JD (.md)</span>
                    </button>
                    <button
                      type="button"
                      className="pl-btn pl-btn-primary"
                      onClick={() => setJdModalOpen(false)}
                    >
                      Đóng
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
