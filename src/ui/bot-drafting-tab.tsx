import React, { useState, useCallback, useMemo } from 'react';
import { usePrivosApp, usePrivosContext, type McpApp } from '@privos_ai/app-react';
import {
  IDraftingTemplateProvider,
  BuiltinTemplateProvider,
  CompanyContextProvider,
  buildDraftingRouterPrompt,
  buildDraftingAIPrompt,
  buildGenericDraftingAIPrompt
} from './drafting-templates';
import type { DraftingTemplate, ICompanyContextProvider } from './drafting/types';
import { PipelineService } from './pipeline-service';
import { MarkdownPathContextBuilder } from './cv-context-builder';
import { createOrUpdateFile } from './privos-rest';
import { DocxExportService } from './docx-export-service';
import './hr-premium-styles.css';
import './bot-drafting.css';

export interface BotDraftingTabProps {
  app?: McpApp | null;
  roomId?: string | null;
  onLog?: (msg: string) => void;
  pipelineService?: PipelineService | null;
  templateProvider?: IDraftingTemplateProvider | null;
  companyContextProvider?: ICompanyContextProvider | null;
}

export default function BotDraftingTab(props: BotDraftingTabProps) {
  const contextApp = usePrivosApp();
  const contextRoomInfo = usePrivosContext();

  const app = props.app !== undefined ? props.app : contextApp;
  const roomId = props.roomId !== undefined ? props.roomId : (contextRoomInfo?.roomId ?? null);
  const onLog = useCallback((msg: string) => {
    if (props.onLog) {
      props.onLog(msg);
    } else {
      console.log(`[BotDrafting] ${msg}`);
    }
  }, [props.onLog]);

  const pipelineService = useMemo(() => {
    if (props.pipelineService !== undefined) return props.pipelineService;
    if (app && roomId) return new PipelineService(app, roomId, new MarkdownPathContextBuilder());
    return null;
  }, [props.pipelineService, app, roomId]);

  const templateProvider = useMemo(() => {
    if (props.templateProvider) return props.templateProvider;
    return new BuiltinTemplateProvider();
  }, [props.templateProvider]);

  const companyContextProvider = useMemo(() => {
    if (props.companyContextProvider !== undefined) return props.companyContextProvider;
    if (app && roomId) return new CompanyContextProvider(app, roomId);
    return null;
  }, [props.companyContextProvider, app, roomId]);

  const templates = useMemo(() => templateProvider.getTemplates(), [templateProvider]);

  // UI States
  const [viewMode, setViewMode] = useState<'a4' | 'raw'>('a4');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [documentContent, setDocumentContent] = useState<string>('');
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [pollingStatus, setPollingStatus] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal States
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    map.set('all', 'Tất cả');
    templates.forEach(t => map.set(t.category, t.categoryLabel));
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return templates;
    return templates.filter(t => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  const handleSelectTemplate = useCallback((template: DraftingTemplate) => {
    setUserPrompt(`Soạn thảo mẫu: ${template.title}\n\nYêu cầu bổ sung của tôi: `);
    setIsTemplateModalOpen(false);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // AI Pipeline Execution
  const handleAiAction = async () => {
    if (!userPrompt.trim() || isGenerating) return;

    if (!pipelineService || !app || !roomId || !companyContextProvider) {
      showToast('Chưa kết nối PrivOS. Vui lòng mở trong ứng dụng PrivOS.');
      return;
    }

    setIsGenerating(true);
    onLog(`[AI DRAFTING] Bắt đầu xử lý pipeline 2 bước với prompt: "${userPrompt}"`);

    try {
      const companyContext = await companyContextProvider.getContext();

      // BƯỚC 1: Phân loại ý định
      setPollingStatus('Bước 1/2: Đang phân loại yêu cầu...');
      const routerPrompt = buildDraftingRouterPrompt(templates, userPrompt);
      const routerResponse = await pipelineService.askAI(routerPrompt, undefined, undefined, onLog);
      const routerText = routerResponse?.text ?? '';
      
      const routerMatch = routerText.match(/<router_result>\s*([\s\S]*?)\s*<\/router_result>/i);
      const templateId = routerMatch ? routerMatch[1].trim() : 'unknown';
      onLog(`[AI DRAFTING] Kết quả phân loại: ${templateId}`);

      // BƯỚC 2: Sinh văn bản
      let generatorPrompt = '';
      const matchedTemplate = templates.find(t => t.id === templateId);

      if (matchedTemplate) {
        setPollingStatus(`Bước 2/2: Đang soạn thảo theo mẫu "${matchedTemplate.title}"...`);
        generatorPrompt = buildDraftingAIPrompt(matchedTemplate, {}, 'custom', userPrompt, documentContent, companyContext);
      } else {
        setPollingStatus('Bước 2/2: Đang soạn thảo văn bản tự do...');
        generatorPrompt = buildGenericDraftingAIPrompt(userPrompt, documentContent, companyContext);
      }
      
      const aiResponse = await pipelineService.askAI(generatorPrompt, undefined, undefined, onLog);
      let text = aiResponse?.text ?? '';

      // Extract content from <drafting_content> tag if present
      const contentMatch = text.match(/<drafting_content>\s*([\s\S]*?)\s*<\/drafting_content>/i);
      let finalMarkdown = contentMatch ? contentMatch[1].trim() : text.trim();

      // Clean AI artifacts
      finalMarkdown = finalMarkdown.replace(/—/g, ' - ');

      if (finalMarkdown) {
        setDocumentContent(finalMarkdown);
        setPollingStatus('Hoàn tất!');
        showToast('AI đã hoàn tất soạn thảo văn bản!');
      } else {
        setPollingStatus('Không nhận được nội dung từ AI');
        showToast('AI không trả về nội dung hợp lệ.');
      }
    } catch (err: any) {
      console.error('Lỗi khi gọi AI soạn thảo:', err);
      onLog(`[LỖI] ${err.message || err}`);
      setPollingStatus('Gặp lỗi khi xử lý AI');
      showToast(`Lỗi: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiAction();
    }
  };

  // Export & Action Handlers
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(documentContent);
      showToast('Đã sao chép nội dung văn bản vào bộ nhớ tạm!');
    } catch (e) {
      console.error(e);
      showToast('Không thể sao chép văn bản.');
    }
  };

  const handleDownloadMd = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `VanBan_${dateStr}.md`;
    const blob = new Blob([documentContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Đã tải xuống file "${filename}" thành công!`);
  };

  const handleDownloadDocx = async () => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `VanBan_${dateStr}.docx`;
      await DocxExportService.downloadDocx(filename, documentContent);
      showToast(`Đã xuất file Word "${filename}" chuẩn Nghị định 30 thành công!`);
    } catch (err: any) {
      console.error('Lỗi khi xuất Word .docx:', err);
      showToast(`Lỗi khi tạo file Word: ${err.message || err}`);
    }
  };

  const handleSaveToPrivos = async () => {
    if (!app || !roomId) {
      showToast('Chưa kết nối PrivOS để lưu file vào Room.');
      return;
    }

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `VanBan_${dateStr}.md`;
      const targetPath = `${roomId}/hr-miniapp/van-ban/${filename}`;
      await createOrUpdateFile(app, targetPath, documentContent);
      showToast(`Đã lưu tài liệu vào Room PrivOS: ${targetPath}`);
      onLog(`[LƯU FILE] Thành công lưu "${targetPath}" vào phòng.`);
    } catch (err: any) {
      console.error('Lỗi lưu file PrivOS:', err);
      showToast(`Lỗi khi lưu vào Room: ${err.message || err}`);
    }
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 130));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 70));
  const handleZoomReset = () => setZoomLevel(100);

  // Professional A4 Parser according to NĐ 30/2020/NĐ-CP Standard
  const renderFormattedA4 = (markdown: string) => {
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const formatInline = (text: string): string => {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    };

    const flushTable = (keyPrefix: string) => {
      if (tableBuffer.length === 0) return;
      const rows = tableBuffer.map(r => r.split('|').slice(1, -1).map(c => c.trim()));
      const isHeader2Col = rows.length >= 2 && rows[0].length === 2 && rows[1].every(c => /^:?-+:?$/.test(c));

      if (isHeader2Col) {
        const leftCell = rows[0][0];
        const rightCell = rows[0][1];

        elements.push(
          <div key={`header-table-${keyPrefix}`} className="a4-header-grid">
            <div className="a4-header-col-left">
              <div className="a4-org-block" dangerouslySetInnerHTML={{ __html: formatInline(leftCell) }} />
              <div className="a4-line-dec a4-line-org" />
            </div>
            <div className="a4-header-col-right">
              <div className="a4-motto-block" dangerouslySetInnerHTML={{ __html: formatInline(rightCell) }} />
              <div className="a4-line-dec a4-line-motto" />
            </div>
          </div>
        );
      } else {
        elements.push(
          <table key={`table-${keyPrefix}`} className="a4-table">
            <tbody>
              {rows.map((row, rIdx) => {
                if (rIdx === 1 && row.every(c => /^:?-+:?$/.test(c))) return null;
                const isHead = rIdx === 0;
                return (
                  <tr key={`tr-${rIdx}`}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${cIdx}`} className={isHead ? 'a4-th' : 'a4-td'} dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }
      tableBuffer = [];
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        tableBuffer.push(trimmed);
        i++;
        continue;
      } else if (tableBuffer.length > 0) {
        flushTable(`table-${i}`);
      }

      if (!trimmed) {
        elements.push(<div key={`empty-${i}`} style={{ height: '6px' }} />);
        i++;
        continue;
      }

      if (trimmed.startsWith('# ')) {
        elements.push(<h1 key={`h1-${i}`} className="a4-heading-1" dangerouslySetInnerHTML={{ __html: formatInline(trimmed.replace('# ', '')) }} />);
        i++;
      } else if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
        const subText = trimmed.replace(/^#{2,3}\s+/, '');
        const isSubject = DocxExportService.isSubjectLine(subText);
        elements.push(
          <React.Fragment key={`sub-${i}`}>
            <h3 className={isSubject ? 'a4-subject-heading' : 'a4-heading-3'} dangerouslySetInnerHTML={{ __html: formatInline(subText) }} />
            {isSubject && <div className="a4-line-dec a4-line-subject" />}
          </React.Fragment>
        );
        i++;
      } else if (trimmed === '---' || trimmed === '***') {
        elements.push(<hr key={`hr-${i}`} className="a4-divider" />);
        i++;
      } else if (DocxExportService.isLegalBasisLine(trimmed)) {
        const rawLegalLines: string[] = [];
        const startIndex = i;
        while (i < lines.length && DocxExportService.isLegalBasisLine(lines[i].trim())) {
          rawLegalLines.push(lines[i].trim());
          i++;
        }
        const normalizedLegalLines = DocxExportService.normalizeLegalBases(rawLegalLines);
        normalizedLegalLines.forEach((legalText, lIdx) => {
          elements.push(
            <p key={`legal-${startIndex}-${lIdx}`} className="a4-legal-basis">
              <em dangerouslySetInnerHTML={{ __html: formatInline(legalText) }} />
            </p>
          );
        });
      } else if (/^[a-z]\)\s+/.test(trimmed)) {
        elements.push(<p key={`sec-${i}`} className="a4-sub-section" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />);
        i++;
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(<p key={`bullet-${i}`} className="a4-bullet-item" dangerouslySetInnerHTML={{ __html: `• ${formatInline(trimmed.replace(/^[-*]\s+/, ''))}` }} />);
        i++;
      } else if (trimmed === './.') {
        elements.push(<p key={`end-${i}`} className="a4-end-mark"><strong>./.</strong></p>);
        i++;
      } else {
        elements.push(<p key={`p-${i}`} className="a4-paragraph" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />);
        i++;
      }
    }

    if (tableBuffer.length > 0) flushTable(`table-final`);
    return elements;
  };

  return (
    <div className="hr-terminal-ui bot-drafting-ui">
      {toastMessage && (
        <div className="bot-toast-message">
          <span>{toastMessage.includes('Lỗi') ? '❌' : '✅'}</span>
          {toastMessage}
        </div>
      )}

      <header className="hr-header-block">
        <div className="header-content">
          <h2 className="hr-title">Bot Soạn Thảo</h2>
          <p className="hr-subtitle">Trợ lý AI tự động nhận diện yêu cầu, chọn biểu mẫu và soạn thảo văn bản chuẩn Nghị định 30.</p>
        </div>
        <div className="header-actions">
           <button type="button" className="hr-btn hr-btn-accent" onClick={handleDownloadDocx}>
             <span>💾</span> Xuất Word (.docx)
           </button>
           <button type="button" className="hr-btn" onClick={handleSaveToPrivos}>
             <span>☁️</span> Lưu PrivOS Room
           </button>
        </div>
      </header>

      <div className="bot-minimal-container">
        {/* Chat / Prompt Panel */}
        <section className="bot-chat-panel">
           <div className="bot-chat-header">
             <h3>Giao tiếp với AI</h3>
             <span className="bot-chat-subtitle">Ngầm hiểu {templates.length} mẫu văn bản</span>
           </div>
           
           <div className="bot-chat-body">
             <div className="bot-chat-instructions">
               <p><strong>Hướng dẫn:</strong> Nhập yêu cầu soạn thảo của bạn hoặc chọn nhanh từ các mẫu có sẵn.</p>
               <button 
                 className="hr-btn hr-btn-accent" 
                 style={{ marginTop: '8px' }}
                 onClick={() => setIsTemplateModalOpen(true)}
                 disabled={isGenerating}
               >
                 📚 Xem thư viện mẫu văn bản ({templates.length} mẫu)
               </button>
             </div>
             
             <textarea 
               className="bot-chat-textarea" 
               placeholder="Nhập yêu cầu soạn thảo của bạn tại đây... (Nhấn Enter để gửi)"
               value={userPrompt}
               onChange={(e) => setUserPrompt(e.target.value)}
               onKeyDown={handleKeyDown}
               disabled={isGenerating}
             />
             
             {isGenerating && (
               <div className="bot-chat-loading">
                  <div className="spinner"></div>
                  <span>{pollingStatus}</span>
               </div>
             )}
             
             <button 
               className="hr-btn hr-btn-accent bot-chat-send-btn"
               onClick={handleAiAction}
               disabled={isGenerating || !userPrompt.trim()}
             >
               {isGenerating ? 'Đang xử lý...' : 'Gửi yêu cầu soạn thảo'}
             </button>
           </div>
        </section>

        {/* Preview Panel */}
        <section className="bot-preview-panel">
          <div className="bot-preview-toolbar">
            <div className="bot-preview-tabs">
              <button
                type="button"
                className={`bot-preview-tab-btn ${viewMode === 'a4' ? 'active' : ''}`}
                onClick={() => setViewMode('a4')}
              >
                📄 Bản in A4 chuẩn
              </button>
              <button
                type="button"
                className={`bot-preview-tab-btn ${viewMode === 'raw' ? 'active' : ''}`}
                onClick={() => setViewMode('raw')}
              >
                📝 Soạn thảo Markdown
              </button>
            </div>

            {viewMode === 'a4' && (
              <div className="bot-zoom-controls">
                <button type="button" className="bot-zoom-btn" onClick={handleZoomOut} title="Thu nhỏ">-</button>
                <span onClick={handleZoomReset} style={{ cursor: 'pointer' }} title="Đặt về 100%">{zoomLevel}%</span>
                <button type="button" className="bot-zoom-btn" onClick={handleZoomIn} title="Phóng to">+</button>
              </div>
            )}

            <div className="bot-action-buttons">
              <button type="button" className="hr-btn" onClick={handleCopy} title="Sao chép nội dung">📋 Copy</button>
              {/* Tạm ẩn: PrivOS sandbox có thể chặn hộp thoại in của trình duyệt. */}
              <button type="button" className="hr-btn" onClick={handleDownloadMd} title="Tải file .md">📥 .md</button>
            </div>
          </div>

          <div className="bot-preview-content">
            {!documentContent ? (
              <div className="bot-empty-state">
                <div className="bot-empty-icon">📄</div>
                <p>Chưa có văn bản nào được soạn thảo.</p>
                <p className="bot-empty-sub">Hãy nhập yêu cầu ở khung bên trái để AI bắt đầu tạo tài liệu.</p>
              </div>
            ) : viewMode === 'a4' ? (
              <div className="bot-a4-sheet-container">
                <article
                  className="bot-a4-paper"
                  style={{
                    zoom: zoomLevel !== 100 ? zoomLevel / 100 : undefined
                  } as any}
                >
                  {renderFormattedA4(documentContent)}
                </article>
              </div>
            ) : (
              <textarea
                className="bot-raw-editor"
                value={documentContent}
                onChange={(e) => setDocumentContent(e.target.value)}
                placeholder="Nội dung văn bản định dạng Markdown..."
              />
            )}
          </div>
        </section>
      </div>

      {documentContent && (
        <article className="bot-a4-paper bot-print-paper">
          {renderFormattedA4(documentContent)}
        </article>
      )}

      {isTemplateModalOpen && (
        <div className="bot-template-modal-overlay" onClick={() => setIsTemplateModalOpen(false)}>
          <div className="bot-template-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="bot-template-modal-header">
              <h3>📚 Thư viện Mẫu văn bản</h3>
              <button className="bot-template-close-btn" onClick={() => setIsTemplateModalOpen(false)}>×</button>
            </div>
            <div className="bot-template-modal-body">
              <aside className="bot-template-sidebar">
                {categories.map(c => (
                  <button 
                    key={c.id}
                    className={`bot-template-category-btn ${selectedCategory === c.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </aside>
              <main className="bot-template-grid-container">
                <div className="bot-template-grid">
                  {filteredTemplates.map(t => (
                    <div key={t.id} className="bot-template-card" onClick={() => handleSelectTemplate(t)}>
                      <div className="bot-template-card-header">
                        <span className="bot-template-card-icon">{t.icon}</span>
                        <h4 className="bot-template-card-title">{t.title}</h4>
                      </div>
                      <p className="bot-template-card-desc">{t.description}</p>
                    </div>
                  ))}
                </div>
              </main>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
