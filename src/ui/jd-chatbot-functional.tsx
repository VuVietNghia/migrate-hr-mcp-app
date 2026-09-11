import { useEffect, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { PipelineService, CVFile } from './pipeline-service';
import { MarkdownPathContextBuilder } from './cv-context-builder';
import { createOrUpdateFile, getFileContent } from './privos-rest';
import { buildCompactJDChatHistory } from './jd-chat-history';
import { JDChatbotHeader } from './jd-chatbot-header';
import { JDChatbotCompanyOption, JDChatbotComposer, JDChatbotEditButton } from './jd-chatbot-interaction-controls';

type Message = { role: 'user' | 'ai'; content: string };
const hello: Message = { role: 'ai', content: 'Chào bạn! Tôi là trợ lí AI giúp bạn tạo và chỉnh sửa JD. Bạn cần tôi giúp gì ạ?' };

function extractJDPositionName(text: string, content: string) {
  const positionTag = text.match(/<position_name>\s*([\s\S]*?)\s*<\/position_name>/i)?.[1]?.trim();
  const contentPosition = content.match(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:vị trí|chức danh)(?:\*\*)?\s*:?\s*(?:\*\*)?\s*([^\n]+)/im)?.[1]?.trim();
  const savedName = text.match(/<saved_file>\s*([\s\S]*?)\s*<\/saved_file>/i)?.[1]?.trim().split('/').pop();
  return positionTag || contentPosition || savedName;
}

function formatGeneratedJDName(name?: string) {
  if (!name?.trim()) return undefined;
  const position = name.replace(/^JD_AI_/i, '').replace(/^JD\s*[-–—:]?\s*/i, '').replace(/\.md$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').split(/[^a-zA-Z0-9]+/).filter(Boolean).map(word => {
    const lower = word.toLowerCase();
    if (['ai', 'hr', 'it', 'ui', 'ux'].includes(lower)) return lower.toUpperCase();
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  }).join('');
  return position && !/^newposition$/i.test(position) ? `JD_AI_${position}.md` : undefined;
}

function renderChatMessage(content: string) {
  const hasJD = /<jd_content>[\s\S]*?<\/jd_content>/i.test(content);
  const clean = content.replace(/<jd_content>[\s\S]*?<\/jd_content>/gi, '').replace(/<saved_file>[\s\S]*?<\/saved_file>/gi, '').replace(/<position_name>[\s\S]*?<\/position_name>/gi, '').trim();
  const finalMessage = 'Nội dung JD mới được hiển thị ở bên phải màn hình, bạn có muốn chỉnh sửa thêm không? Hãy nói cho tôi biết nhé.';
  const reply = clean ? `${clean}\n\n${finalMessage}` : finalMessage;
  const parts = (hasJD ? reply : clean).split(/(\*\*.*?\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

function getChangedJDLineIndexes(saved: string, updated: string) {
  const before = saved.split('\n'); const after = updated.split('\n');
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) for (let j = after.length - 1; j >= 0; j--) table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const unchanged = new Set<number>(); let i = 0; let j = 0;
  while (i < before.length && j < after.length) { if (before[i] === after[j]) { unchanged.add(j); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++; }
  return new Set(after.map((_, index) => index).filter(index => !unchanged.has(index)));
}

function renderJDMarkdown(content: string, changedLines: Set<number>) {
  return content.split('\n').map((line, index) => {
    const text = line.trim();
    const changedClass = changedLines.has(index) ? 'jd-chatbot-changed-line' : undefined;
    if (text.startsWith('# ')) return <h1 className={changedClass} key={index}>{text.slice(2)}</h1>;
    if (text.startsWith('## ')) return <h2 className={changedClass} key={index}>{text.slice(3)}</h2>;
    if (text.startsWith('### ')) return <h3 className={changedClass} key={index}>{text.slice(4)}</h3>;
    if (text.startsWith('- ') || text.startsWith('* ')) return <div className={`jd-chatbot-markdown-list ${changedClass || ''}`} key={index}><span>•</span>{text.slice(2)}</div>;
    return text ? <p className={changedClass} key={index}>{text}</p> : <div key={index} className={`jd-chatbot-markdown-space ${changedClass || ''}`} />;
  });
}

async function loadJDContent(app: any, roomId: string, jd: CVFile): Promise<string> {
  const canonicalContent = await getFileContent(app, `${roomId}/hr-miniapp/jds/${jd.name}`);
  if (canonicalContent.trim()) return canonicalContent;

  if (jd.downloadUrl) {
    try {
      const response = await fetch(jd.downloadUrl);
      if (response.ok) {
        const content = await response.text();
        if (content.trim()) return content;
      }
    } catch (error) {
      console.warn('[JD Chatbot] Không tải được từ downloadUrl:', error);
    }
  }

  return '';
}

export default function JDChatbotFunctional() {
  const app = usePrivosApp(); const { roomId } = usePrivosContext(); const service = useRef<PipelineService>();
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const jdLoadRequestRef = useRef(0);
  const [jds, setJds] = useState<CVFile[]>([]); const [selected, setSelected] = useState<CVFile | null>(null);
  const [draft, setDraft] = useState(''); const [saved, setSaved] = useState(''); const [changedJDLines, setChangedJDLines] = useState<Set<number>>(new Set()); const [messages, setMessages] = useState<Message[]>([hello]);
  const [input, setInput] = useState(''); const [open, setOpen] = useState(false); const [librarySearch, setLibrarySearch] = useState(''); const [busy, setBusy] = useState(false); const [editing, setEditing] = useState(false); const [exitConfirmOpen, setExitConfirmOpen] = useState(false); const [jdLoading, setJDLoading] = useState(false); const [jdLoadError, setJDLoadError] = useState<string | null>(null); const [isSaving, setIsSaving] = useState(false); const [includeCompany, setIncludeCompany] = useState(false); const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const refresh = async () => { if (!service.current) return []; const files = await service.current.fetchAvailableJDs(); setJds(files); return files; };
  useEffect(() => { service.current = new PipelineService(app, roomId, new MarkdownPathContextBuilder()); refresh().catch(console.error); }, [app, roomId]);
  useEffect(() => { if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { if (draft === saved) setChangedJDLines(new Set()); }, [draft, saved]);
  const choose = async (jd: CVFile) => { const requestId = ++jdLoadRequestRef.current; setSelected(jd); setOpen(false); setMessages([hello]); setEditing(false); setExitConfirmOpen(false); setDraft(''); setSaved(''); setJDLoadError(null); setJDLoading(true); try { const content = await loadJDContent(app, roomId, jd); if (requestId !== jdLoadRequestRef.current) return; if (!content.trim()) { setJDLoadError('Không thể tải nội dung JD. Vui lòng chọn lại JD hoặc thử lại sau.'); return; } setDraft(content); setSaved(content); } catch (error) { if (requestId !== jdLoadRequestRef.current) return; setJDLoadError(`Không thể tải nội dung JD: ${error instanceof Error ? error.message : String(error)}`); } finally { if (requestId === jdLoadRequestRef.current) setJDLoading(false); } };
  const save = async (content: string, name = selected?.name) => { if (!content.trim() || !name || isSaving) return; setIsSaving(true); setSaveMessage(null); try { await createOrUpdateFile(app, `${roomId}/hr-miniapp/jds/${name}`, content); const files = await refresh(); setSelected(files.find(jd => jd.name === name) || selected); setSaved(content); setEditing(false); setSaveMessage({ type: 'success', text: '✓ Đã lưu thay đổi.' }); window.setTimeout(() => setSaveMessage(null), 2000); } catch (error) { setSaveMessage({ type: 'error', text: `Không thể lưu JD: ${error instanceof Error ? error.message : String(error)}` }); } finally { setIsSaving(false); } };
  const send = async () => { if (!input.trim() || !service.current || busy) return; const next = [...messages, { role: 'user' as const, content: input }]; setMessages(next); setInput(''); setBusy(true); const history = buildCompactJDChatHistory(next); const existing = selected ? `\nJD đang chỉnh sửa, giữ tên <saved_file>${selected.name}</saved_file>:\n${draft}` : ''; const companyInstruction = includeCompany ? '\nKhi tạo JD trong lượt này, bắt buộc đọc Room Files/hr-miniapp/company, thêm mục “Thông tin công ty” ngắn gọn và điều chỉnh yêu cầu tuyển dụng phù hợp với công ty.' : '\nKhông thêm thông tin công ty vào JD.'; const editInstruction = selected ? '\nQUY TẮC CHỈNH SỬA: Khi người dùng nói “thêm”, “bổ sung”, “cộng thêm” hoặc “mở rộng”, phải giữ nguyên toàn bộ thông tin cũ và chỉ thêm thông tin mới vào đúng mục; tuyệt đối không xóa giá trị cũ. Ví dụ, thêm địa điểm Hà Nội vào địa điểm hiện có phải giữ cả địa điểm cũ và Hà Nội. Chỉ được xóa hoặc thay thế khi người dùng nói rõ “xóa”, “bỏ”, “thay”, hoặc “đổi từ ... thành ...”. Mọi nội dung không được yêu cầu thay đổi phải giữ nguyên.' : ''; const prompt = `[SYSTEM AUTOMATION] Bạn là AI Chatbot tuyển dụng. Hỏi đến khi đủ Vị trí, Địa điểm, Mức lương, Yêu cầu/kinh nghiệm; thiếu thì không tạo JD. Khi đủ trả JD trong <jd_content>...</jd_content>, không dùng công cụ hay lưu file. Trước các thẻ nội bộ, trả lời 1-2 câu tự nhiên theo ngữ cảnh, nêu ngắn gọn điều bạn đã tạo hoặc chỉnh sửa. Trình bày JD chi tiết vừa phải: làm rõ mục tiêu, trách nhiệm chính, yêu cầu, kỹ năng, quyền lợi và cách ứng tuyển; tránh lan man, lặp ý hoặc bịa thông tin. Bắt buộc trả đúng tên vị trí, không thêm “Tin tuyển dụng” hoặc nội dung JD, trong <position_name>...</position_name>. Trả tên theo mẫu JD_AI_TenVietHoa.md trong <saved_file>...</saved_file>; giao diện chỉ lưu vào hr-miniapp/jds.${companyInstruction}${editInstruction}${existing}\nLịch sử:\n${history}\nAI:`; try { const result = await service.current.askAI(prompt, undefined, undefined, undefined, `jd-chat-${Date.now()}`); const text = result?.text || 'Không nhận được phản hồi từ AI.'; setMessages(previous => [...previous, { role: 'ai', content: text }]); const content = text.match(/<jd_content>\s*([\s\S]*?)\s*<\/jd_content>/i)?.[1]?.trim(); const positionName = extractJDPositionName(text, content || ''); if (!selected && content) { const generatedName = formatGeneratedJDName(positionName); setDraft(content); setChangedJDLines(new Set()); setEditing(false); if (generatedName) await save(content, generatedName); else setSaveMessage({ type: 'error', text: 'Chưa nhận được tên vị trí hợp lệ nên JD chưa được lưu.' }); } else if (content) { setDraft(content); setChangedJDLines(getChangedJDLineIndexes(saved, content)); setEditing(false); } } catch (error) { setMessages(previous => [...previous, { role: 'ai', content: `Lỗi gửi AI: ${String(error)}` }]); } finally { setBusy(false); } };
  const fresh = () => { jdLoadRequestRef.current++; setSelected(null); setDraft(''); setSaved(''); setJDLoading(false); setJDLoadError(null); setMessages([hello]); setEditing(false); setExitConfirmOpen(false); setOpen(false); };
  const visibleJDs = jds.filter(jd => jd.name.toLowerCase().includes(librarySearch.trim().toLowerCase()));
  return <main className="jd-chatbot-page">
    <JDChatbotHeader busy={busy} onOpenLibrary={() => setOpen(true)} onCreateNew={fresh} />
    <div className="jd-chatbot-workspace"><section className="jd-chatbot-conversation jd-chatbot-panel"><div className="jd-chatbot-panel-heading"><div><span className="jd-chatbot-panel-kicker">Trợ lý AI</span><h2>Chat chỉnh sửa JD</h2></div><span className="jd-chatbot-context">{selected ? 'Chỉnh sửa JD' : 'Tạo JD mới'}</span></div><div ref={chatMessagesRef} className="jd-chatbot-messages">{messages.map((message, index) => <div key={index} className={`jd-chatbot-message ${message.role}`}><p>{message.role === 'ai' ? renderChatMessage(message.content) : message.content}</p></div>)}{busy && <div className="jd-chatbot-message ai"><p>AI đang suy nghĩ ...</p></div>}</div><JDChatbotCompanyOption busy={busy} checked={includeCompany} onChange={setIncludeCompany} /><JDChatbotComposer busy={busy} input={input} onInputChange={setInput} onSend={send} /></section>
    <section className="jd-chatbot-preview jd-chatbot-panel"><div className="jd-chatbot-panel-heading"><div><div className="jd-chatbot-document-title"><span className="jd-chatbot-panel-kicker">Nội dung JD</span><JDChatbotEditButton busy={busy} editing={editing} disabled={!draft || isSaving || jdLoading} onClick={() => { if (editing) { if (draft === saved) { setEditing(false); return; } setExitConfirmOpen(true); return; } setEditing(true); }} /></div><h2>{selected?.name || 'JD mới'}</h2></div><span className="jd-chatbot-draft-state">{jdLoading ? 'Đang tải' : draft === saved ? 'Đã lưu' : 'Chưa lưu'}</span></div><article className="jd-chatbot-document">{jdLoading ? <p className="jd-chatbot-empty-document">Đang tải nội dung JD…</p> : jdLoadError ? <p className="jd-chatbot-empty-document">{jdLoadError}</p> : editing ? <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Nội dung JD sẽ hiển thị tại đây…"/> : draft ? renderJDMarkdown(draft, changedJDLines) : <p className="jd-chatbot-empty-document">Nội dung jd sẽ được hiển thị ở đây.</p>}</article>{saveMessage && <p className={`jd-chatbot-save-message ${saveMessage.type}`}>{saveMessage.text}</p>}<div className="jd-chatbot-preview-actions"><button className="jd-chatbot-restore-action" onClick={() => { setDraft(saved); setMessages([hello]); setEditing(false); setSaveMessage(null); }} disabled={!selected || isSaving || draft === saved || jdLoading}>Khôi phục chỉnh sửa</button><button className="jd-chatbot-primary-action" onClick={() => save(draft)} disabled={!selected || isSaving || jdLoading || !draft.trim() || draft === saved}>{isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></section></div>
    {open && <div className="jd-chatbot-drawer-backdrop" onClick={() => setOpen(false)}><aside className="jd-chatbot-drawer" onClick={event => event.stopPropagation()}><div className="jd-chatbot-panel-heading"><h2>Danh sách JD</h2><div className="jd-chatbot-drawer-actions"><button className="jd-chatbot-drawer-refresh" onClick={() => refresh().then(() => setLibrarySearch('')).catch(console.error)}>Làm mới</button><button className="jd-chatbot-drawer-close" onClick={() => setOpen(false)}>×</button></div></div><input className="jd-chatbot-search" value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} placeholder="Tìm theo tên JD"/><div className="jd-chatbot-file-list">{visibleJDs.map(j => <button key={j._id} className={`jd-chatbot-file ${selected?._id === j._id ? 'active' : ''}`} onClick={() => choose(j)}><strong>{j.name}</strong></button>)}</div></aside></div>}
    {exitConfirmOpen && <div className="modal-overlay" onClick={() => setExitConfirmOpen(false)}><div className="modal-content" onClick={event => event.stopPropagation()}><p className="modal-title">Chỉnh sửa chưa lưu</p><p className="modal-text">Bạn có muốn thoát khỏi chế độ chỉnh sửa không? Các thay đổi hiện tại sẽ chưa được lưu vào file JD.</p><div className="modal-actions"><button className="btn-confirm-delete-modal" onClick={() => { setDraft(saved); setExitConfirmOpen(false); setEditing(false); }}>Thoát</button><button className="btn-cancel-modal" onClick={() => setExitConfirmOpen(false)}>Tiếp tục chỉnh sửa</button></div></div></div>}
  </main>;
}
