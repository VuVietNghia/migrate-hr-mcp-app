import { useState, type FormEvent } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { ensureFolderPath, restCall, createOrUpdateFile } from './privos-rest';

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
    const aiMsg = [...list].reverse().find((message: any) => message.type === 'ai');
    if (!aiMsg) continue;
    if (['completed', 'failed', 'cancelled'].includes(aiMsg.status || '')) {
      if (aiMsg.status !== 'completed') throw new Error(`AI dừng với trạng thái ${aiMsg.status}.`);
      return aiMsg.content || '';
    }
  }
  throw new Error('AI polling timeout.');
}

export default function CompanyHome() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  
  const [website, setWebsite] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  const [isProcessingWebsite, setIsProcessingWebsite] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  
  const [websiteStatus, setWebsiteStatus] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  
  const [docStatus, setDocStatus] = useState('');
  const [docError, setDocError] = useState('');

  const handleCrawlWebsite = async (e: FormEvent) => {
    e.preventDefault();
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
      
      setWebsiteStatus(`Đã lưu dữ liệu vào RoomFiles/hr-miniapp/company/${fileName}`);
      setWebsite('');
    } catch (err: any) {
      setWebsiteError(err?.message || 'Không thể đọc website.');
      setWebsiteStatus('');
    } finally {
      setIsProcessingWebsite(false);
    }
  };

  const handleUploadDocs = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomId || selectedFiles.length === 0 || isUploadingDocs) return;
    
    setIsUploadingDocs(true);
    setDocStatus('Đang tải lên tài liệu...');
    setDocError('');
    
    try {
      const folderId = await ensureFolderPath(app, roomId, ['hr-miniapp', 'company']);
      for (const file of selectedFiles) {
        const dataUrl = await readAsDataUri(file);
        await app.uploadFile({
          channelId: roomId,
          fileName: file.name,
          base64Data: dataUrl,
          mimeType: file.type || 'application/octet-stream',
          duplicateAction: 'replace',
          ...(folderId ? { folderId } : {})
        });
      }
      
      setDocStatus(`Đã tải lên ${selectedFiles.length} tài liệu vào RoomFiles/hr-miniapp/company.`);
      setSelectedFiles([]);
    } catch (err: any) {
      setDocError(err?.message || 'Không thể tải lên tài liệu.');
      setDocStatus('');
    } finally {
      setIsUploadingDocs(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes hr-spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <main className="hr-terminal-ui" style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px', background: 'transparent' }}>
      <div className="hr-header-block" style={{ borderBottom: 'none', marginBottom: '16px' }}>
        <div className="header-content">
          <h1 className="hr-title">Dữ liệu Công ty</h1>
          <p className="hr-subtitle">
            Cung cấp thông tin về công ty cho AI bằng cách nhập link website hoặc tải lên tài liệu. 
            Các dữ liệu này sẽ được lưu trong <code style={{ background: 'var(--bg-hover, #F2F3F5)', padding: '2px 6px', borderRadius: '4px' }}>RoomFiles/hr-miniapp/company</code> để AI đọc được ở các lần sau.
          </p>
        </div>
      </div>

      <div className="hr-form-panel">
        <h2 className="hr-form-title">1. Thu thập dữ liệu từ Website</h2>
        <form onSubmit={handleCrawlWebsite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="hr-label">Link website công ty</label>
            <input 
              type="url" 
              className="hr-input"
              required 
              value={website} 
              onChange={(e) => setWebsite(e.target.value)} 
              placeholder="https://company.com" 
            />
          </div>
          <div>
            <button 
              type="submit" 
              className="hr-btn hr-btn-accent"
              disabled={isProcessingWebsite || !website.trim()}
            >
              {isProcessingWebsite ? 'Đang xử lý...' : 'Đọc & Lưu dữ liệu'}
            </button>
          </div>
          {websiteStatus && (
            <div 
              className={`hr-status-banner ${isProcessingWebsite ? '' : 'hr-status-success'}`} 
              style={isProcessingWebsite ? { background: 'rgba(217, 119, 6, 0.1)', color: '#D97706', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: 0 } : { marginBottom: 0 }}
            >
              {isProcessingWebsite ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'hr-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
              ) : '✓'} {websiteStatus}
            </div>
          )}
          {websiteError && (
            <div className="hr-status-banner hr-status-error" style={{ marginBottom: 0 }}>
              ✗ {websiteError}
            </div>
          )}
        </form>
      </div>

      <div className="hr-form-panel">
        <h2 className="hr-form-title">2. Tải lên tài liệu</h2>
        <form onSubmit={handleUploadDocs} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="hr-label">Chọn tài liệu (PDF, Word, Text, v.v.)</label>
            <input 
              type="file" 
              multiple 
              accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx" 
              onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
              className="hr-input"
              style={{ padding: '12px', border: '2px dashed var(--border, #E4E7EA)', background: 'var(--bg-hover, #F2F3F5)', cursor: 'pointer' }}
            />
          </div>
          
          {selectedFiles.length > 0 && (
            <div style={{ background: 'var(--bg, #F7F8FA)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-light, #EBECEF)' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text, #1F2329)' }}>Đã chọn {selectedFiles.length} tệp:</p>
              <ul style={{ paddingLeft: '20px', color: 'var(--text-muted, #6C737A)', margin: 0, fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {selectedFiles.map(f => <li key={f.name}>{f.name}</li>)}
              </ul>
            </div>
          )}
          
          <div>
            <button 
              type="submit" 
              className="hr-btn hr-btn-accent"
              disabled={isUploadingDocs || selectedFiles.length === 0}
            >
              {isUploadingDocs ? 'Đang tải lên...' : 'Tải lên tài liệu'}
            </button>
          </div>
          
          {docStatus && (
            <div 
              className={`hr-status-banner ${isUploadingDocs ? '' : 'hr-status-success'}`} 
              style={isUploadingDocs ? { background: 'rgba(217, 119, 6, 0.1)', color: '#D97706', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: 0 } : { marginBottom: 0 }}
            >
              {isUploadingDocs ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'hr-spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
              ) : '✓'} {docStatus}
            </div>
          )}
          {docError && (
            <div className="hr-status-banner hr-status-error" style={{ marginBottom: 0 }}>
              ✗ {docError}
            </div>
          )}
        </form>
      </div>
    </main>
    </>
  );
}
