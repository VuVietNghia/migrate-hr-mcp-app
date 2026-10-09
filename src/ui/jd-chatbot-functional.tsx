import { useEffect, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { MarkdownPathContextBuilder } from './cv-context-builder';
import { buildCompactJDChatHistory } from './jd-chat-history';
import { JDChatbotDocumentPanel } from './jd-chatbot/JDChatbotDocumentPanel';
import { JDChatbotLibraryDialog } from './jd-chatbot/JDChatbotLibraryDialog';
import { applyJDDepartment, prepareCreatedJD } from './jd-chatbot-department';
import { JDChatbotHeader } from './jd-chatbot-header';
import {
  JDChatbotCompanyOption,
  JDChatbotComposer,
  JDChatbotDepartmentSelect,
} from './jd-chatbot-interaction-controls';
import { buildJDChatbotPrompt } from './jd-chatbot-prompt';
import { interpretJDAIResponse, type JDDocumentMode } from './jd-chatbot-view-model';
import { PipelineService, type CVFile } from './pipeline-service';
import { createOrUpdateFile, describeFeatureError, readRoomFileText } from './privos-rest';
import {
  AppDbRecruitmentDepartmentStore,
  DEFAULT_RECRUITMENT_DEPARTMENTS,
  mergeRecruitmentDepartments,
  resolveJdDepartment,
  type RecruitmentDepartment,
} from './recruitment-departments';
import {
  resolveIntentJD,
  type StudioNavigationIntent,
} from './studio/studio-navigation-intent';

type Message = { role: 'user' | 'ai'; content: string };

const hello: Message = {
  role: 'ai',
  content: 'Chào bạn! Tôi là trợ lí AI giúp bạn tạo và chỉnh sửa JD. Bạn cần tôi giúp gì ạ?',
};
const EDITABLE_JD_FILE = /\.md$/i;

function extractJDPositionName(text: string, content: string) {
  const positionTag = text.match(/<position_name>\s*([\s\S]*?)\s*<\/position_name>/i)?.[1]?.trim();
  const contentPosition = content.match(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:vị trí|chức danh)(?:\*\*)?\s*:?\s*(?:\*\*)?\s*([^\n]+)/im)?.[1]?.trim();
  const savedName = text.match(/<saved_file>\s*([\s\S]*?)\s*<\/saved_file>/i)?.[1]?.trim().split('/').pop();
  return positionTag || contentPosition || savedName;
}

function formatGeneratedJDName(name?: string) {
  if (!name?.trim()) return undefined;
  const position = name
    .replace(/^JD_AI_/i, '')
    .replace(/^JD\s*[-–—:]?\s*/i, '')
    .replace(/\.md$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (['ai', 'hr', 'it', 'ui', 'ux'].includes(lower)) return lower.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join('');
  return position && !/^newposition$/i.test(position) ? `JD_AI_${position}.md` : undefined;
}

function renderChatMessage(content: string) {
  const parts = interpretJDAIResponse(content, false).chatText.split(/(\*\*.*?\*\*)/g);
  return <>{parts.map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  ))}</>;
}

interface JDChatbotFunctionalProps {
  navigationIntent?: StudioNavigationIntent | null;
}

export default function JDChatbotFunctional({ navigationIntent = null }: JDChatbotFunctionalProps = {}) {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const service = useRef<PipelineService>();
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const jdLoadRequestRef = useRef(0);
  const operationSequenceRef = useRef(0);
  const handledNavigationSequenceRef = useRef(0);
  const isSavingRef = useRef(false);
  const roomContextRef = useRef({ app, roomId });
  roomContextRef.current = { app, roomId };
  const [jds, setJds] = useState<CVFile[]>([]);
  const [selected, setSelected] = useState<CVFile | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [documentMode, setDocumentMode] = useState<JDDocumentMode>('preview');
  const [messages, setMessages] = useState<Message[]>([hello]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryRefreshing, setLibraryRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jdLoading, setJDLoading] = useState(false);
  const [jdLoadError, setJDLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [includeCompany, setIncludeCompany] = useState(false);
  const [departments, setDepartments] = useState<RecruitmentDepartment[]>(
    () => DEFAULT_RECRUITMENT_DEPARTMENTS.map((department) => ({ ...department })),
  );
  const [departmentKey, setDepartmentKey] = useState('');
  const [documentDepartment, setDocumentDepartment] = useState<Pick<RecruitmentDepartment, 'key' | 'label'> | null>(null);
  const [pendingSaveName, setPendingSaveName] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isOperationCurrent = (operationId: number, targetApp: typeof app, targetRoomId: string) => (
    operationId === operationSequenceRef.current
    && roomContextRef.current.app === targetApp
    && roomContextRef.current.roomId === targetRoomId
  );

  const refresh = async (
    targetService: PipelineService,
    operationId: number,
    targetApp: typeof app,
    targetRoomId: string,
  ) => {
    const files = (await targetService.fetchAvailableJDs()).filter((jd) => EDITABLE_JD_FILE.test(jd.name));
    if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return [];
    setJds(files);
    return files;
  };

  useEffect(() => {
    let active = true;
    const operationId = ++operationSequenceRef.current;
    const currentService = new PipelineService(app, roomId, new MarkdownPathContextBuilder());
    service.current = currentService;
    jdLoadRequestRef.current += 1;
    isSavingRef.current = false;
    setJds([]);
    setSelected(null);
    setDraft('');
    setSaved('');
    setDocumentMode('preview');
    setMessages([hello]);
    setInput('');
    setOpen(false);
    setLibraryRefreshing(false);
    setBusy(false);
    setJDLoading(false);
    setJDLoadError(null);
    setIsSaving(false);
    setIncludeCompany(false);
    setDepartmentKey('');
    setDocumentDepartment(null);
    setPendingSaveName(null);
    setSaveMessage(null);
    setDepartments(DEFAULT_RECRUITMENT_DEPARTMENTS.map((department) => ({ ...department })));
    refresh(currentService, operationId, app, roomId).catch((error) => {
      if (isOperationCurrent(operationId, app, roomId)) console.error(error);
    });
    new AppDbRecruitmentDepartmentStore(app, roomId).list()
      .then((stored) => {
        if (active && roomContextRef.current.app === app && roomContextRef.current.roomId === roomId) {
          setDepartments(mergeRecruitmentDepartments(stored, []));
        }
      })
      .catch((error) => {
        if (!active || roomContextRef.current.app !== app || roomContextRef.current.roomId !== roomId) return;
        console.error('Failed to load recruitment departments for JD assistant', error);
      });
    return () => {
      active = false;
      operationSequenceRef.current += 1;
    };
  }, [app, roomId]);

  useEffect(() => {
    if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
  }, [messages, busy]);

  const choose = async (jd: CVFile) => {
    const requestId = ++jdLoadRequestRef.current;
    const operationId = ++operationSequenceRef.current;
    const targetApp = app;
    const targetRoomId = roomId;
    isSavingRef.current = false;
    setIsSaving(false);
    setSelected(jd);
    setPendingSaveName(null);
    setDocumentDepartment(null);
    setOpen(false);
    setMessages([hello]);
    setDocumentMode('preview');
    setIncludeCompany(false);
    setDepartmentKey('');
    setDraft('');
    setSaved('');
    setSaveMessage(null);
    setJDLoadError(null);
    setJDLoading(true);
    try {
      const content = await readRoomFileText(targetApp, jd);
      if (
        requestId !== jdLoadRequestRef.current
        || !isOperationCurrent(operationId, targetApp, targetRoomId)
      ) return;
      if (!content.trim()) {
        setJDLoadError('File JD đang trống.');
        return;
      }
      setDraft(content);
      setSaved(content);
      setDocumentDepartment(resolveJdDepartment(content));
    } catch (error) {
      if (
        requestId !== jdLoadRequestRef.current
        || !isOperationCurrent(operationId, targetApp, targetRoomId)
      ) return;
      setJDLoadError(`Không thể tải nội dung JD: ${describeFeatureError(error, 'không đọc được file JD.')}`);
    } finally {
      if (
        requestId === jdLoadRequestRef.current
        && isOperationCurrent(operationId, targetApp, targetRoomId)
      ) setJDLoading(false);
    }
  };

  const activeFileName = selected?.name || pendingSaveName;
  const selectedDepartment = departments.find((department) => department.key === departmentKey);

  const save = async (
    content: string,
    name?: string,
    existingOperation?: {
      operationId: number;
      targetApp: typeof app;
      targetRoomId: typeof roomId;
      targetService: PipelineService;
    },
  ) => {
    const targetName = name || activeFileName;
    const targetService = existingOperation?.targetService || service.current;
    if (!content.trim() || !targetName || !targetService || isSavingRef.current) return;
    const operationId = existingOperation?.operationId ?? ++operationSequenceRef.current;
    const targetApp = existingOperation?.targetApp ?? app;
    const targetRoomId = existingOperation?.targetRoomId ?? roomId;
    if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await createOrUpdateFile(targetApp, `${targetRoomId}/hr-miniapp/jds/${targetName}`, content);
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      const files = await refresh(targetService, operationId, targetApp, targetRoomId);
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      setSelected(files.find((jd) => jd.name === targetName) || { _id: targetName, name: targetName });
      setPendingSaveName(null);
      setSaved(content);
      setDocumentMode('preview');
      setSaveMessage({ type: 'success', text: '✓ Đã lưu thay đổi.' });
      window.setTimeout(() => {
        if (isOperationCurrent(operationId, targetApp, targetRoomId)) setSaveMessage(null);
      }, 2000);
    } catch (error) {
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      setSaveMessage({
        type: 'error',
        text: `Không thể lưu JD: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      if (isOperationCurrent(operationId, targetApp, targetRoomId)) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const saveDraft = () => save(draft);

  const send = async () => {
    const targetService = service.current;
    if (!input.trim() || !targetService || busy) return;
    if (!activeFileName && !selectedDepartment) {
      setSaveMessage({ type: 'error', text: 'Vui lòng chọn phòng ban trước khi tạo JD mới.' });
      return;
    }
    const operationId = ++operationSequenceRef.current;
    const targetApp = app;
    const targetRoomId = roomId;
    const next = [...messages, { role: 'user' as const, content: input }];
    setMessages(next);
    setInput('');
    setBusy(true);
    const history = buildCompactJDChatHistory(next);
    const prompt = buildJDChatbotPrompt({
      selectedName: activeFileName || undefined,
      draft,
      includeCompany,
      history,
      department: selectedDepartment,
    });
    try {
      const result = await targetService.askAI(prompt, undefined, undefined, undefined, `jd-chat-${Date.now()}`);
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      const text = result?.text || 'Không nhận được phản hồi từ AI.';
      const interpreted = interpretJDAIResponse(text, Boolean(activeFileName));
      setMessages((previous) => [...previous, { role: 'ai', content: interpreted.chatText }]);
      const content = interpreted.documentContent;
      const positionName = extractJDPositionName(text, content || '');
      if (!activeFileName && content) {
        if (!selectedDepartment) {
          setSaveMessage({ type: 'error', text: 'Vui lòng chọn phòng ban trước khi lưu JD mới.' });
          return;
        }
        const generatedName = formatGeneratedJDName(positionName);
        const normalizedContent = positionName
          ? prepareCreatedJD(content, positionName, selectedDepartment)
          : applyJDDepartment(content, selectedDepartment);
        setDocumentDepartment(selectedDepartment);
        setDraft(normalizedContent);
        setDocumentMode(interpreted.nextMode || 'preview');
        if (generatedName) {
          setPendingSaveName(generatedName);
          await save(normalizedContent, generatedName, {
            operationId,
            targetApp,
            targetRoomId,
            targetService,
          });
        }
        else setSaveMessage({ type: 'error', text: 'Chưa nhận được tên vị trí hợp lệ nên JD chưa được lưu.' });
      } else if (content) {
        setDraft(documentDepartment ? applyJDDepartment(content, documentDepartment) : content);
        setDocumentMode(interpreted.nextMode || 'changes');
      }
    } catch (error) {
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      setMessages((previous) => [...previous, { role: 'ai', content: `Lỗi gửi AI: ${String(error)}` }]);
    } finally {
      if (isOperationCurrent(operationId, targetApp, targetRoomId)) setBusy(false);
    }
  };

  const fresh = () => {
    jdLoadRequestRef.current += 1;
    operationSequenceRef.current += 1;
    isSavingRef.current = false;
    setSelected(null);
    setPendingSaveName(null);
    setDocumentDepartment(null);
    setDraft('');
    setSaved('');
    setDocumentMode('preview');
    setJDLoading(false);
    setIsSaving(false);
    setBusy(false);
    setJDLoadError(null);
    setSaveMessage(null);
    setMessages([hello]);
    setOpen(false);
    setIncludeCompany(false);
    setDepartmentKey('');
  };

  const restore = () => {
    setDraft(saved);
    if (!selected && pendingSaveName) {
      setPendingSaveName(null);
      setDocumentDepartment(null);
    }
    setMessages([hello]);
    setDocumentMode('preview');
    setSaveMessage(null);
  };

  useEffect(() => {
    if (!navigationIntent || navigationIntent.target !== 'chatbotJD') return;
    if (handledNavigationSequenceRef.current >= navigationIntent.sequence) return;
    handledNavigationSequenceRef.current = navigationIntent.sequence;
    if (!navigationIntent.jd) return;

    const applyIntent = async () => {
      const targetService = service.current;
      if (!targetService) return;
      const operationId = ++operationSequenceRef.current;
      const targetApp = app;
      const targetRoomId = roomId;
      try {
        const files = await refresh(targetService, operationId, targetApp, targetRoomId);
        if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
        const target = resolveIntentJD(navigationIntent, 'chatbotJD', files);
        if (!target) {
          setJDLoadError('JD đã bị xóa, không còn ở định dạng Markdown hoặc bạn không còn quyền đọc file này. Hãy chọn lại một JD.');
          return;
        }
        await choose(target);
      } catch (error) {
        if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
        setJDLoadError(`Không thể tải danh sách JD: ${describeFeatureError(error, 'không đọc được Room Files.')}`);
      }
    };

    void applyIntent();
  }, [navigationIntent?.sequence]);

  const visibleJDs = jds.filter((jd) => jd.name.toLowerCase().includes(librarySearch.trim().toLowerCase()));
  const canSave = Boolean(activeFileName && draft.trim() && draft !== saved && !jdLoading && !isSaving);
  const refreshLibrary = async () => {
    const targetService = service.current;
    if (!targetService) return;
    const operationId = ++operationSequenceRef.current;
    const targetApp = app;
    const targetRoomId = roomId;
    setLibraryRefreshing(true);
    try {
      await refresh(targetService, operationId, targetApp, targetRoomId);
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      setLibrarySearch('');
    } catch (error) {
      if (!isOperationCurrent(operationId, targetApp, targetRoomId)) return;
      setJDLoadError(`Không thể tải danh sách JD: ${describeFeatureError(error, 'không đọc được Room Files.')}`);
    } finally {
      if (isOperationCurrent(operationId, targetApp, targetRoomId)) setLibraryRefreshing(false);
    }
  };

  return (
    <main className="studio-page jd-studio-page">
      <JDChatbotHeader
        busy={busy}
        canSave={canSave}
        isSaving={isSaving}
        onOpenLibrary={() => setOpen(true)}
        onCreateNew={fresh}
        onSave={saveDraft}
      />

      <div className="jd-studio-workspace">
        <section className="jd-studio-assistant-card" aria-label="Trợ lý tuyển dụng">
          <header className="jd-studio-assistant-header">
            <div>
              <span className="studio-eyebrow">TRỢ LÝ AI</span>
              <h2>Trợ lý tuyển dụng</h2>
              <p>Trao đổi để tạo mới hoặc tinh chỉnh JD đang chọn.</p>
            </div>
          </header>

          <div ref={chatMessagesRef} className="jd-studio-messages">
            {messages.map((message, index) => (
              <div key={index} className={`jd-studio-message jd-studio-message--${message.role}`}>
                <span className="jd-studio-message-avatar" aria-hidden="true">{message.role === 'ai' ? 'AI' : 'BẠN'}</span>
                <p>{message.role === 'ai' ? renderChatMessage(message.content) : message.content}</p>
              </div>
            ))}
            {busy ? (
              <div className="jd-studio-message jd-studio-message--ai" role="status">
                <span className="jd-studio-message-avatar" aria-hidden="true">AI</span>
                <p>AI đang suy nghĩ…</p>
              </div>
            ) : null}
          </div>

          <div className="jd-studio-assistant-footer">
            {!activeFileName ? (
              <JDChatbotDepartmentSelect
                busy={busy}
                departments={departments}
                value={departmentKey}
                onChange={(value) => {
                  setDepartmentKey(value);
                  setSaveMessage(null);
                }}
              />
            ) : null}
            <JDChatbotCompanyOption busy={busy} checked={includeCompany} onChange={setIncludeCompany} />
            <JDChatbotComposer
              busy={busy}
              canSend={Boolean(activeFileName || selectedDepartment)}
              input={input}
              onInputChange={setInput}
              onSend={send}
            />
          </div>
        </section>

        <JDChatbotDocumentPanel
          mode={documentMode}
          onModeChange={setDocumentMode}
          fileName={activeFileName || null}
          draft={draft}
          saved={saved}
          loading={jdLoading}
          loadError={jdLoadError}
          isSaving={isSaving}
          saveMessage={saveMessage}
          onDraftChange={setDraft}
          onOpenLibrary={() => setOpen(true)}
          onRestore={restore}
          onSave={saveDraft}
        />
      </div>

      <JDChatbotLibraryDialog
        open={open}
        files={visibleJDs}
        selectedId={selected?._id || null}
        searchValue={librarySearch}
        refreshing={libraryRefreshing}
        onClose={() => setOpen(false)}
        onSearchChange={setLibrarySearch}
        onRefresh={() => void refreshLibrary()}
        onSelect={(file) => void choose(file)}
      />
    </main>
  );
}
