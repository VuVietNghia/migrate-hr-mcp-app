import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import {
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  GlobalOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { ensureFolderPath, restCall, createOrUpdateFile } from './privos-rest';
import {
  CompanyDocumentRepository,
  classifyCompanyDocument,
  describeCompanyDocumentFormat,
  filterCompanyDocuments,
  getCompanyDocumentCapabilities,
  type CompanyDocument,
  type CompanyDocumentKind,
} from './company/company-documents';
import {
  beginCompanyPreview,
  closeCompanyPreview,
  createCompanyPreviewState,
  settleCompanyPreview,
  type CompanyPreviewState,
} from './company/company-preview-state';
import { CompanyDocxPreview } from './company/CompanyDocxPreview';
import {
  StudioCard,
  StudioDialog,
  StudioInlineState,
  StudioPage,
  StudioPageHeader,
} from './studio/StudioPrimitives';

const ACCEPTED_DOCUMENTS = '.pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.json,.png,.jpg,.jpeg,.webp';

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function getHostName(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'website'; }
}

async function askCrawlAgent(app: ReturnType<typeof usePrivosApp>, roomId: string, prompt: string): Promise<string> {
  const sent = await restCall<any>(app, 'POST', 'ai-messages.send', {
    body: { entityType: 'room-chat', entityId: roomId, roomId, flowChatId: roomId, content: prompt },
    timeoutMs: 60000,
  });
  const sessionId = sent.sessionId;
  const aiMessageId = sent.aiMessage?._id;
  if (!sessionId || !aiMessageId) throw new Error('Không tạo được phiên AI.');
  await restCall(app, 'POST', 'ai-messages.startGeneration', { body: { messageId: aiMessageId }, timeoutMs: 60000 });

  for (let i = 0; i < 90; i++) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    const res = await restCall<any>(app, 'GET', 'ai-messages.list', { query: { sessionId, count: 20 }, timeoutMs: 60000 });
    const list = Array.isArray(res?.messages) ? res.messages : [];
    const aiMsg = list.find((message: any) => message?._id === aiMessageId);
    if (!aiMsg) continue;
    if (['completed', 'failed', 'cancelled'].includes(aiMsg.status || '')) {
      if (aiMsg.status !== 'completed') throw new Error(`AI dừng với trạng thái ${aiMsg.status}.`);
      return aiMsg.content || '';
    }
  }
  throw new Error('AI polling timeout.');
}

function formatBytes(size?: number) {
  if (size === undefined) return 'Chưa có dung lượng';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

function formatDocumentDate(value?: string) {
  if (!value) return 'Chưa có thời gian';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa có thời gian'
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function DocumentIcon({ kind }: { kind: CompanyDocumentKind }) {
  if (kind === 'image') return <FileImageOutlined aria-hidden />;
  if (kind === 'pdf') return <FilePdfOutlined aria-hidden />;
  if (kind === 'text') return <FileTextOutlined aria-hidden />;
  return <FileOutlined aria-hidden />;
}

function mergeSelectedFiles(current: readonly File[], incoming: readonly File[]) {
  const files = new Map(current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
  for (const file of incoming) files.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  return [...files.values()];
}

export default function CompanyHome() {
  const app = usePrivosApp();
  const { roomId, roomName } = usePrivosContext();
  const repository = useMemo(() => new CompanyDocumentRepository(app, roomId), [app, roomId]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [website, setWebsite] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingWebsite, setIsProcessingWebsite] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [websiteStatus, setWebsiteStatus] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  const [docStatus, setDocStatus] = useState('');
  const [docError, setDocError] = useState('');

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState('');
  const [query, setQuery] = useState('');

  const [preview, setPreviewState] = useState<CompanyPreviewState>(() => createCompanyPreviewState());
  const previewRef = useRef(preview);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const selectedDocument = documents.find((file) => file.id === preview.documentId);

  const setPreview = (next: CompanyPreviewState) => {
    previewRef.current = next;
    setPreviewState(next);
  };

  useEffect(() => {
    if (!preview.blob || !selectedDocument) {
      setPreviewObjectUrl(null);
      return;
    }
    const kind = classifyCompanyDocument(selectedDocument);
    if (kind !== 'image' && kind !== 'pdf') {
      setPreviewObjectUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(preview.blob);
    setPreviewObjectUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.blob, selectedDocument]);

  const loadDocuments = useCallback(async () => {
    if (!roomId) {
      setDocuments([]);
      setDocumentsLoading(false);
      return;
    }
    setDocumentsLoading(true);
    setDocumentsError('');
    try {
      setDocuments(await repository.list());
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Không thể đọc thư viện tài liệu.');
    } finally {
      setDocumentsLoading(false);
    }
  }, [repository, roomId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleCrawlWebsite = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomId || !website.trim() || isProcessingWebsite) return;

    setIsProcessingWebsite(true);
    setWebsiteStatus('Đang gửi website cho AI đọc...');
    setWebsiteError('');

    try {
      const prompt = `[SYSTEM AUTOMATION] EXECUTE NOW. DO NOT ASK FOLLOW-UP QUESTIONS.\nYou are a crawler agent for an HR mini app. Read this official company website: ${website}\n\nSummarize the company's information in detail in Markdown format. Include sections such as Overview, Industry, Products/Services, Culture, Contact, etc. if available.\nDo not wrap your response in markdown code blocks, just output the raw markdown text.`;
      const markdownContent = await askCrawlAgent(app, roomId, prompt);
      setWebsiteStatus('Đang lưu kết quả...');
      const fileName = `${getHostName(website)}-data.md`;
      await createOrUpdateFile(app, `${roomId}/hr-miniapp/company/${fileName}`, markdownContent);
      setWebsiteStatus(`Đã lưu ${fileName} vào thư viện tài liệu.`);
      setWebsite('');
      await loadDocuments();
    } catch (error) {
      setWebsiteError(error instanceof Error ? error.message : 'Không thể đọc website.');
      setWebsiteStatus('');
    } finally {
      setIsProcessingWebsite(false);
    }
  };

  const handleUploadDocs = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomId || selectedFiles.length === 0 || isUploadingDocs) return;

    setIsUploadingDocs(true);
    setDocStatus('Đang tải lên tài liệu...');
    setDocError('');

    try {
      const folderId = await ensureFolderPath(app, roomId, ['hr-miniapp', 'company']);
      for (const file of selectedFiles) {
        await app.uploadFile({
          channelId: roomId,
          fileName: file.name,
          base64Data: await readAsDataUri(file),
          mimeType: file.type || 'application/octet-stream',
          duplicateAction: 'replace',
          ...(folderId ? { folderId } : {}),
        });
      }
      setDocStatus(`Đã tải lên ${selectedFiles.length} tài liệu.`);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (error) {
      setDocError(error instanceof Error ? error.message : 'Không thể tải lên tài liệu.');
      setDocStatus('');
    } finally {
      setIsUploadingDocs(false);
    }
  };

  const addFiles = (incoming: FileList | readonly File[]) => {
    setSelectedFiles((current) => mergeSelectedFiles(current, Array.from(incoming)));
    setDocError('');
    setDocStatus('');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  const openPreview = async (file: CompanyDocument) => {
    const request = beginCompanyPreview(previewRef.current, file.id);
    setPreview(request.state);
    try {
      if (classifyCompanyDocument(file) === 'text') {
        const text = await repository.readText(file);
        setPreview(settleCompanyPreview(previewRef.current, request.requestId, { text }));
      } else {
        const { blob } = await repository.readBlob(file);
        setPreview(settleCompanyPreview(previewRef.current, request.requestId, { blob }));
      }
    } catch (error) {
      setPreview(settleCompanyPreview(previewRef.current, request.requestId, {
        error: error instanceof Error ? error.message : 'Không thể đọc tài liệu.',
      }));
    }
  };

  const downloadDocument = async (file: CompanyDocument) => {
    if (downloadingDocumentId) return;
    setDownloadingDocumentId(file.id);
    setDownloadError('');
    try {
      const { blob, fileName } = await repository.readBlob(file);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Không thể tải tài liệu.');
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const visibleDocuments = filterCompanyDocuments(documents, query);
  const roomDisplayName = roomName.trim() || 'Không gian nhân sự';

  return (
    <StudioPage className="company-studio-page">
      <StudioPageHeader
        eyebrow="Không gian làm việc"
        title="Dữ liệu công ty"
        description="Quản lý nguồn thông tin chung để các luồng AI và đội ngũ nhân sự luôn dùng đúng bối cảnh."
      />

      <section className="company-hero" aria-labelledby="company-hero-title">
        <div className="company-hero__copy">
          <span className="studio-eyebrow">{roomDisplayName}</span>
          <h2 id="company-hero-title">Thông tin rõ ràng. Công việc liền mạch.</h2>
          <p>Website và tài liệu tại đây trở thành nguồn dữ liệu dùng chung cho tuyển dụng, đánh giá CV và soạn thảo.</p>
          <span className="company-hero__meta">RoomFiles / hr-miniapp / company · {documents.length} tài liệu</span>
        </div>
        <div className="company-knowledge" aria-hidden="true">
          <span className="company-knowledge__orbit company-knowledge__orbit--outer" />
          <span className="company-knowledge__orbit company-knowledge__orbit--inner" />
          <span className="company-knowledge__center">CV<small>KNOWLEDGE</small></span>
          <span className="company-knowledge__node company-knowledge__node--website"><GlobalOutlined /> Website</span>
          <span className="company-knowledge__node company-knowledge__node--docs"><FileTextOutlined /> Tài liệu</span>
          <span className="company-knowledge__node company-knowledge__node--team"><InboxOutlined /> Room Files</span>
        </div>
      </section>

      <div className="company-source-grid">
        <StudioCard
          className="company-source-card"
          title={<><span className="company-step">01</span> Thu thập từ Website</>}
          description="AI đọc website chính thức và lưu bản tóm tắt Markdown vào Room Files."
        >
          <form className="company-form" onSubmit={handleCrawlWebsite}>
            <label className="company-field" htmlFor="company-website">
              <span>Link website công ty</span>
              <span className="company-url-input">
                <GlobalOutlined aria-hidden />
                <input
                  id="company-website"
                  type="url"
                  required
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://company.com"
                  disabled={isProcessingWebsite}
                />
              </span>
            </label>
            <button type="submit" className="studio-button studio-button--primary" disabled={isProcessingWebsite || !website.trim()}>
              <GlobalOutlined aria-hidden />
              {isProcessingWebsite ? 'Đang đọc website...' : 'Đọc & lưu dữ liệu'}
            </button>
            {websiteStatus ? <StudioInlineState tone={isProcessingWebsite ? 'warning' : 'success'}>{websiteStatus}</StudioInlineState> : null}
            {websiteError ? <StudioInlineState tone="danger">{websiteError}</StudioInlineState> : null}
          </form>
        </StudioCard>

        <StudioCard
          className="company-source-card"
          title={<><span className="company-step">02</span> Tải lên tài liệu</>}
          description="Bổ sung PDF, Word, Markdown hoặc hình ảnh dùng trong các luồng nhân sự."
        >
          <form className="company-form" onSubmit={handleUploadDocs}>
            <div
              className={`company-dropzone${isDragging ? ' company-dropzone--dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
              onDrop={handleDrop}
            >
              <InboxOutlined aria-hidden />
              <strong>Kéo & thả tài liệu vào đây</strong>
              <span>hoặc</span>
              <button type="button" className="company-dropzone__link" onClick={() => fileInputRef.current?.click()} disabled={isUploadingDocs}>
                chọn tệp từ thiết bị
              </button>
              <small>PDF, Word, Text, Markdown, PowerPoint và hình ảnh</small>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept={ACCEPTED_DOCUMENTS}
                aria-label="Chọn tài liệu công ty"
                onChange={handleFileChange}
              />
            </div>
            {selectedFiles.length ? (
              <ul className="company-selected-files" aria-label={`${selectedFiles.length} tệp đã chọn`}>
                {selectedFiles.map((file) => (
                  <li key={`${file.name}:${file.size}:${file.lastModified}`}>
                    <FileOutlined aria-hidden />
                    <span className='company-selected-file__details'>
                      <strong>{file.name}</strong>
                      <small>{formatBytes(file.size)}</small>
                    </span>
                    <button type="button" aria-label={`Bỏ ${file.name}`} onClick={() => setSelectedFiles((files) => files.filter((item) => item !== file))}>×</button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="submit" className="studio-button studio-button--primary" disabled={isUploadingDocs || selectedFiles.length === 0}>
              <UploadOutlined aria-hidden />
              {isUploadingDocs ? 'Đang tải lên...' : `Tải lên${selectedFiles.length ? ` ${selectedFiles.length} tệp` : ''}`}
            </button>
            {docStatus ? <StudioInlineState tone={isUploadingDocs ? 'warning' : 'success'}>{docStatus}</StudioInlineState> : null}
            {docError ? <StudioInlineState tone="danger">{docError}</StudioInlineState> : null}
          </form>
        </StudioCard>
      </div>

      <StudioCard
        className="company-library"
        title={<>Thư viện tài liệu <span className="company-document-count">{documents.length} tài liệu</span></>}
        description="Tài liệu hiện có trong Room, sắp xếp theo thời điểm cập nhật mới nhất."
        actions={
          <label className="company-search">
            <SearchOutlined aria-hidden />
            <span className="studio-sr-only">Tìm tài liệu</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tài liệu" />
          </label>
        }
      >
        {documentsLoading ? <StudioInlineState tone="info">Đang tải thư viện tài liệu...</StudioInlineState> : null}
        {documentsError ? (
          <StudioInlineState tone="danger" title="Không thể tải thư viện">
            <span>{documentsError}</span>
            <button type="button" className="studio-button studio-button--small" onClick={() => void loadDocuments()}>
              <ReloadOutlined aria-hidden /> Thử lại
            </button>
          </StudioInlineState>
        ) : null}
        {downloadError ? <StudioInlineState tone='danger'>{downloadError}</StudioInlineState> : null}
        {!documentsLoading && !documentsError && visibleDocuments.length === 0 ? (
          <div className="company-empty-library">
            <FileTextOutlined aria-hidden />
            <h3>{documents.length ? 'Không tìm thấy tài liệu' : 'Chưa có tài liệu công ty'}</h3>
            <p>{documents.length ? 'Thử một từ khóa khác.' : 'Đọc website hoặc tải tài liệu lên để tạo nguồn dữ liệu dùng chung.'}</p>
          </div>
        ) : null}
        {!documentsError && visibleDocuments.length > 0 ? (
          <div className="company-table-wrap">
            <table className="company-document-table">
              <thead><tr><th>Tài liệu</th><th>Loại</th><th>Dung lượng</th><th>Cập nhật</th><th><span className="studio-sr-only">Thao tác</span></th></tr></thead>
              <tbody>
                {visibleDocuments.map((file) => {
                  const kind = classifyCompanyDocument(file);
                  const format = describeCompanyDocumentFormat(file);
                  const capability = getCompanyDocumentCapabilities(file);
                  return (
                    <tr key={file.id}>
                      <td>
                        <span className={'company-file-icon company-file-icon--' + kind + ' company-file-icon--' + format.id}><DocumentIcon kind={kind} /></span>
                        <span>
                          <strong>{file.name}</strong>
                          <small className={'company-file-format company-file-format--' + format.id}>{format.label}</small>
                        </span>
                      </td>
                      <td><span className={'company-file-format company-file-format--' + format.id}>{format.label}</span></td>
                      <td>{formatBytes(file.size)}</td>
                      <td>{formatDocumentDate(file.updatedAt ?? file.createdAt)}</td>
                      <td>
                        <div className="company-document-actions">
                          {capability.canPreview ? <button type="button" className="studio-icon-button" aria-label={`Xem ${file.name}`} onClick={() => void openPreview(file)}><EyeOutlined aria-hidden /></button> : null}
                          {capability.canDownload ? (
                            <button
                              type='button'
                              className='studio-icon-button'
                              aria-label={downloadingDocumentId === file.id ? `Đang tải ${file.name}` : `Tải ${file.name}`}
                              disabled={Boolean(downloadingDocumentId)}
                              onClick={() => void downloadDocument(file)}
                            >
                              <DownloadOutlined aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </StudioCard>

      <StudioDialog
        className='company-document-dialog'
        open={Boolean(selectedDocument)}
        title={selectedDocument?.name || 'Xem tài liệu'}
        onClose={() => setPreview(closeCompanyPreview(previewRef.current))}
        actions={selectedDocument ? (
          <>
            <button type="button" className="studio-button" onClick={() => setPreview(closeCompanyPreview(previewRef.current))}>Đóng</button>
            <button
              type='button'
              className='studio-button studio-button--primary'
              disabled={Boolean(downloadingDocumentId)}
              onClick={() => void downloadDocument(selectedDocument)}
            >
              <DownloadOutlined aria-hidden />
              {downloadingDocumentId === selectedDocument.id ? 'Đang tải...' : 'Tải xuống'}
            </button>
          </>
        ) : undefined}
      >
        {preview.loading ? <StudioInlineState tone="info">Đang đọc tài liệu...</StudioInlineState> : null}
        {downloadError ? <StudioInlineState tone='danger'>{downloadError}</StudioInlineState> : null}
        {preview.error && selectedDocument ? (
          <StudioInlineState tone="danger" title="Không thể mở tài liệu">
            <span>{preview.error}</span>
            <button type="button" className="studio-button studio-button--small" onClick={() => void openPreview(selectedDocument)}><ReloadOutlined aria-hidden /> Thử lại</button>
          </StudioInlineState>
        ) : null}
        {!preview.loading && !preview.error && selectedDocument ? (
          classifyCompanyDocument(selectedDocument) === 'text' ? <pre className="company-text-preview">{preview.text}</pre>
            : describeCompanyDocumentFormat(selectedDocument).id === 'word' && preview.blob ? <CompanyDocxPreview blob={preview.blob} />
              : classifyCompanyDocument(selectedDocument) === 'image' && previewObjectUrl ? <img className="company-image-preview" src={previewObjectUrl} alt={selectedDocument.name} />
                : classifyCompanyDocument(selectedDocument) === 'pdf' && previewObjectUrl ? <iframe className="company-pdf-preview" src={previewObjectUrl} title={selectedDocument.name} />
                  : <StudioInlineState>Không có bản xem trước cho định dạng này.</StudioInlineState>
        ) : null}
      </StudioDialog>
    </StudioPage>
  );
}
