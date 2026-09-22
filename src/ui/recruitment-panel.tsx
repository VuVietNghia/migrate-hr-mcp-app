import { FormEvent, useEffect, useRef, useState } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { createOrUpdateFile, readRoomFileText } from './privos-rest';
import { PipelineService } from './pipeline-service';
import { MarkdownPathContextBuilder } from './cv-context-builder';
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
  resolveJdDepartment,
} from './recruitment-departments';

type Department = string;

interface Job {
  title: string;
  type: string;
  salary: string;
  summary: string;
  responsibilities: string[];
  
  // Old format compatibility
  requirements?: string[];
  bonuses?: string[];

  // New format
  location?: string;
  req_experience?: string[];
  req_professional?: string[];
  req_soft?: string[];
  req_education?: string[];
  benefits?: string[];
  contact_email?: string;
  contact_title?: string;
}

interface JobDraft {
  title: string;
  type: string;
  salary: string;
  location: string;
  summary: string;
  responsibilities: string;
  req_experience: string;
  req_professional: string;
  req_soft: string;
  req_education: string;
  benefits: string;
  contact_email: string;
  contact_title: string;
}

const EMPTY_DRAFT: JobDraft = {
  title: '',
  type: '',
  salary: '',
  location: '',
  summary: '',
  responsibilities: '',
  req_experience: '',
  req_professional: '',
  req_soft: '',
  req_education: '',
  benefits: '',
  contact_email: '',
  contact_title: '',
};


const IT_JOBS: Job[] = [];

const DEFAULT_DEPARTMENT_TABS = DEFAULT_RECRUITMENT_DEPARTMENTS.map(({ key, label }) => ({
  id: key,
  label,
}));

function splitLines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export default function RecruitmentPanel() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();
  const roomContextRef = useRef({ app, roomId });
  const roomOperationRef = useRef<ReturnType<typeof createRecruitmentRoomOperation> | null>(null);
  roomContextRef.current = { app, roomId };

  const [departments, setDepartments] = useState<{ id: Department; label: string; count?: number }[]>(DEFAULT_DEPARTMENT_TABS);
  const [department, setDepartment] = useState<Department>('it');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobsByDept, setJobsByDept] = useState<Record<string, Job[]>>({
    'it': IT_JOBS,
    'marketing': [],
    'hr': [],
    'other': [],
  });
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<JobDraft>(EMPTY_DRAFT);
  const [isSavingJD, setIsSavingJD] = useState(false);
  const [saveJDError, setSaveJDError] = useState('');
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [departmentName, setDepartmentName] = useState('');
  const [isSavingDepartment, setIsSavingDepartment] = useState(false);
  const [departmentError, setDepartmentError] = useState('');
  const [showRenameDepartmentForm, setShowRenameDepartmentForm] = useState(false);
  const [renamedDepartmentName, setRenamedDepartmentName] = useState('');
  const [isRenamingDepartment, setIsRenamingDepartment] = useState(false);
  const [renameDepartmentError, setRenameDepartmentError] = useState('');
  const [isLoadingRecruitment, setIsLoadingRecruitment] = useState(true);

  useEffect(() => {
    setDepartments(DEFAULT_DEPARTMENT_TABS);
    setDepartment('it');
    setSelectedJob(null);
    setJobsByDept({ it: [], marketing: [], hr: [], other: [] });
    setShowDepartmentForm(false);
    setDepartmentName('');
    setDepartmentError('');
    setIsSavingDepartment(false);
    setShowRenameDepartmentForm(false);
    setRenamedDepartmentName('');
    setIsRenamingDepartment(false);
    setRenameDepartmentError('');
    setIsLoadingRecruitment(Boolean(app && roomId));

    roomOperationRef.current = null;
    if (!app || !roomId) return;
    const operation = createRecruitmentRoomOperation(app, roomId);
    roomOperationRef.current = operation;
    const loadJDs = async () => {
      try {
        const service = new PipelineService(app, roomId, new MarkdownPathContextBuilder());
        const departmentStore = new AppDbRecruitmentDepartmentStore(app, roomId);
        const storedDepartmentsPromise = departmentStore.list().catch((error: unknown) => {
          console.error('Failed to load recruitment departments from App Database', error);
          if (operation.isCurrent(roomContextRef.current)) {
            setDepartmentError('Không tải được danh sách phòng ban đã lưu; các JD trong Room vẫn được hiển thị.');
          }
          return [];
        });
        const jds = await service.fetchAvailableJDs();
        
        const nextJobsByDept: Record<string, Job[]> = {
          it: [],
          marketing: [],
          hr: [],
          other: []
        };
        const jdDepartments: Array<{ key: string; label: string }> = [];

        for (const jd of jds) {
          if (!jd.name.startsWith('JD_') || jd.name.startsWith('JD_AI_')) continue;
          
          let content = '';
          try {
            content = await readRoomFileText(app, { _id: jd._id, downloadUrl: jd.downloadUrl });
          } catch (e: any) {
            console.warn(`[Recruitment] Không đọc được JD ${jd.name}:`, e);
          }
          if (!content) {
            continue;
          }

          const titleH1Match = content.match(/^# TUYỂN DỤNG:\s*(.*)/m);
          const titleMatch = content.match(/^# (.*)/m);
          const title = titleH1Match ? titleH1Match[1].trim() : (titleMatch ? titleMatch[1].trim() : '');
          if (!title) continue;

          // Parse table format
          const locationTableMatch = content.match(/\|\s*\*\*Địa điểm làm việc\*\*\s*\|\s*(.*?)\s*\|/);
          const typeTableMatch = content.match(/\|\s*\*\*Thời gian làm việc\*\*\s*\|\s*(.*?)\s*\|/);
          const salaryTableMatch = content.match(/\|\s*\*\*Mức lương\*\*\s*\|\s*(.*?)\s*\|/);

          // Parse old format
          const typeOldMatch = content.match(/- H\u00ecnh th\u1ee9c: (.*)/);
          const salaryOldMatch = content.match(/- Thu nh\u1eadp: (.*)/);
          const summaryOldMatch = content.match(/- M\u00f4 t\u1ea3 ng\u1eafn: (.*)/);
          const summaryHtmlMatch = content.match(/<!-- SUMMARY:\s*(.*?)\s*-->/);
          
          const { key: deptId, label: deptLabel } = resolveJdDepartment(content);
          const type = typeTableMatch ? typeTableMatch[1].trim() : (typeOldMatch ? typeOldMatch[1].trim() : 'Thỏa thuận');
          const salary = salaryTableMatch ? salaryTableMatch[1].trim() : (salaryOldMatch ? salaryOldMatch[1].trim() : 'Thỏa thuận');
          const location = locationTableMatch ? locationTableMatch[1].trim() : 'Không xác định';
          const summary = summaryHtmlMatch ? summaryHtmlMatch[1].trim() : (summaryOldMatch ? summaryOldMatch[1].trim() : '');

          if (!jdDepartments.find((item) => item.key === deptId)) {
            jdDepartments.push({ key: deptId, label: deptLabel });
          }

          if (!nextJobsByDept[deptId]) nextJobsByDept[deptId] = [];

          const respMatch = content.match(/## 2\. Mô tả công việc\n([\s\S]*?)(?=\n## |\n*$)/) || content.match(/## M\u00f4 t\u1ea3 c\u00f4ng vi\u1ec7c\n([\s\S]*?)(?=\n## |\n*$)/);
          const responsibilities = respMatch ? respMatch[1].split('\n').filter(l => l.trim().startsWith('* ') || l.trim().startsWith('- ')).map(l => l.replace(/^[* -]\s*/, '').trim()) : [];
          
          const oldReqMatch = content.match(/## Y\u00eau c\u1ea7u\n([\s\S]*?)(?=\n## |\n*$)/);
          const requirements = oldReqMatch ? oldReqMatch[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^-\s*/, '').trim()) : undefined;

          const oldBonusMatch = content.match(/## \u0110i\u1ec3m c\u1ed9ng\n([\s\S]*?)(?=\n## |\n*$)/);
          const bonuses = oldBonusMatch ? oldBonusMatch[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^-\s*/, '').trim()) : undefined;

          // New format specific blocks
          const reqExpMatch = content.match(/### Kinh nghiệm\n([\s\S]*?)(?=\n### |\n## |\n*$)/);
          const req_experience = reqExpMatch ? reqExpMatch[1].split('\n').filter(l => l.trim().startsWith('* ')).map(l => l.replace(/^\*\s*/, '').trim()) : [];
          
          const reqProfMatch = content.match(/### Kỹ năng chuyên môn\n([\s\S]*?)(?=\n### |\n## |\n*$)/);
          const req_professional = reqProfMatch ? reqProfMatch[1].split('\n').filter(l => l.trim().startsWith('* ')).map(l => l.replace(/^\*\s*/, '').trim()) : [];
          
          const reqSoftMatch = content.match(/### Kỹ năng mềm\n([\s\S]*?)(?=\n### |\n## |\n*$)/);
          const req_soft = reqSoftMatch ? reqSoftMatch[1].split('\n').filter(l => l.trim().startsWith('* ')).map(l => l.replace(/^\*\s*/, '').trim()) : [];
          
          const reqEduMatch = content.match(/### Học vấn\n([\s\S]*?)(?=\n### |\n## |\n*$)/);
          const req_education = reqEduMatch ? reqEduMatch[1].split('\n').filter(l => l.trim().startsWith('* ')).map(l => l.replace(/^\*\s*/, '').trim()) : [];

          const benefitsMatch = content.match(/## 4\. Quyền lợi\n([\s\S]*?)(?=\n## |\n*$)/);
          const benefits = benefitsMatch ? benefitsMatch[1].split('\n').filter(l => l.trim().startsWith('* ')).map(l => l.replace(/^\*\s*/, '').trim()) : [];

          // Avoid duplicates
          if (!nextJobsByDept[deptId].find(j => j.title === title)) {
            nextJobsByDept[deptId].push({
              title, type, salary, location, summary, responsibilities, requirements, bonuses,
              req_experience, req_professional, req_soft, req_education, benefits
            });
          }
        }

        const storedDepartments = await storedDepartmentsPromise;
        const mergedDepartments = mergeRecruitmentDepartments(storedDepartments, jdDepartments);
        for (const item of mergedDepartments) {
          if (!nextJobsByDept[item.key]) nextJobsByDept[item.key] = [];
        }
        if (!operation.isCurrent(roomContextRef.current)) return;
        setDepartments(mergedDepartments.map(({ key, label }) => ({ id: key, label })));
        setJobsByDept(nextJobsByDept);
      } catch (e: any) {
        console.error("Failed to load JDs from room files", e);
      } finally {
        if (operation.isCurrent(roomContextRef.current)) {
          setIsLoadingRecruitment(false);
        }
      }
    };
    loadJDs();
    return () => {
      operation.cancel();
      if (roomOperationRef.current === operation) roomOperationRef.current = null;
    };
  }, [app, roomId]);

  const selectDepartment = (nextDepartment: Department) => {
    setDepartment(nextDepartment);
    setSelectedJob(null);
    setShowRenameDepartmentForm(false);
    setRenamedDepartmentName('');
    setRenameDepartmentError('');
  };

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingJD) return;
    if (!draft.title.trim() || !draft.summary.trim() || !draft.type.trim() || !draft.salary.trim() || !draft.req_professional.trim()) return;
    if (!app || !roomId) {
      setSaveJDError('Không thể lưu JD vì chưa kết nối được với Room Files.');
      return;
    }

    const newJob: Job = {
      title: draft.title.trim(),
      type: draft.type.trim() || 'Thỏa thuận',
      salary: draft.salary.trim() || 'Thỏa thuận',
      location: draft.location.trim() || 'Không xác định',
      summary: draft.summary.trim(),
      responsibilities: splitLines(draft.responsibilities),
      req_experience: splitLines(draft.req_experience),
      req_professional: splitLines(draft.req_professional),
      req_soft: splitLines(draft.req_soft),
      req_education: splitLines(draft.req_education),
      benefits: splitLines(draft.benefits),
      contact_email: draft.contact_email.trim() || 'Không xác định',
      contact_title: draft.contact_title.trim() || 'Không xác định',
    };

    const deptLabel = departments.find(d => d.id === department)?.label || department;
    const content = `# TUYỂN DỤNG: ${newJob.title.toUpperCase()}

<!-- DEPARTMENT_ID: ${department} -->

***

## 1. Thông tin chung

| Hạng mục               | Chi tiết             |
| ---------------------- | -------------------- |
| **Vị trí tuyển dụng**  | ${newJob.title}    |
| **Phòng ban**          | ${deptLabel}                  |
| **Địa điểm làm việc**  | ${newJob.location}               |
| **Thời gian làm việc** | ${newJob.type}            |
| **Mức lương**          | ${newJob.salary} |

***

## 2. Mô tả công việc

${newJob.responsibilities.length > 0 ? newJob.responsibilities.map(x => `* ${x}`).join('\n') : '* (Chưa cập nhật)'}

***

## 3. Yêu cầu ứng viên

### Kinh nghiệm

${newJob.req_experience && newJob.req_experience.length > 0 ? newJob.req_experience.map(x => `* ${x}`).join('\n') : '* Không yêu cầu'}

### Kỹ năng chuyên môn

${newJob.req_professional && newJob.req_professional.length > 0 ? newJob.req_professional.map(x => `* ${x}`).join('\n') : '* Không yêu cầu'}

### Kỹ năng mềm

${newJob.req_soft && newJob.req_soft.length > 0 ? newJob.req_soft.map(x => `* ${x}`).join('\n') : '* Không yêu cầu'}

### Học vấn

${newJob.req_education && newJob.req_education.length > 0 ? newJob.req_education.map(x => `* ${x}`).join('\n') : '* Không yêu cầu'}

***

## 4. Quyền lợi

${newJob.benefits && newJob.benefits.length > 0 ? newJob.benefits.map(x => `* ${x}`).join('\n') : '* Trao đổi khi phỏng vấn'}

***

## 5. Cách thức ứng tuyển

* **Email nhận CV:** _${newJob.contact_email}_
* **Tiêu đề email:** _${newJob.contact_title}_

> ⚠️ Thông tin email và tiêu đề ứng tuyển có thể thay đổi tùy đợt tuyển dụng. Vui lòng cập nhật nếu cần.

***

_Đăng ngày: ${new Date().toISOString().slice(0, 10)}_

<!-- SUMMARY: ${newJob.summary} -->
`;
    const normalizedTitle = newJob.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const fileName = `JD_${normalizedTitle.replace(/[^a-zA-Z0-9_ -]/g, '').trim().replace(/\s+/g, '_')}.md`;

    setIsSavingJD(true);
    setSaveJDError('');
    try {
      await createOrUpdateFile(app, `${roomId}/hr-miniapp/jds/${fileName}`, content);
      setJobsByDept(prev => ({
        ...prev,
        [department]: [...(prev[department] || []), newJob]
      }));
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
    } catch (error: unknown) {
      console.error('Failed to save JD to Room Files', error);
      const message = error instanceof Error ? error.message : String(error);
      setSaveJDError(`Không thể lưu JD vào Room Files: ${message}`);
    } finally {
      setIsSavingJD(false);
    }
  };

  const submitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingDepartment || !departmentName.trim()) return;
    if (!app || !roomId) {
      setDepartmentError('Không thể lưu phòng ban vì chưa kết nối được với Room.');
      return;
    }
    const operation = roomOperationRef.current;
    if (!operation?.isCurrent(roomContextRef.current)) return;
    setIsSavingDepartment(true);
    setDepartmentError('');
    try {
      const store = new AppDbRecruitmentDepartmentStore(app, roomId);
      const saved = await store.create(departmentName, departments.length);
      if (!operation.isCurrent(roomContextRef.current)) return;
      setDepartments((current) => current.some((item) => item.id === saved.key)
        ? current
        : [...current, { id: saved.key, label: saved.label }]);
      setJobsByDept((current) => ({ ...current, [saved.key]: current[saved.key] || [] }));
      setDepartment(saved.key);
      setSelectedJob(null);
      setDepartmentName('');
      setShowDepartmentForm(false);
    } catch (error: unknown) {
      console.error('Failed to save recruitment department to App Database', error);
      if (!operation.isCurrent(roomContextRef.current)) return;
      const message = error instanceof Error ? error.message : String(error);
      setDepartmentError(`Không thể lưu phòng ban vào Room: ${message}`);
    } finally {
      if (operation.isCurrent(roomContextRef.current)) {
        setIsSavingDepartment(false);
      }
    }
  };

  const submitDepartmentRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRenamingDepartment || !renamedDepartmentName.trim()) return;
    if (!app || !roomId) {
      setRenameDepartmentError('Không thể đổi tên phòng ban vì chưa kết nối được với Room.');
      return;
    }
    if (!isRecruitmentDepartmentRenameable(department)) {
      setRenameDepartmentError('Phòng ban mặc định không thể đổi tên.');
      return;
    }
    const operation = roomOperationRef.current;
    if (!operation?.isCurrent(roomContextRef.current)) return;

    setIsRenamingDepartment(true);
    setRenameDepartmentError('');
    try {
      const order = Math.max(0, departments.findIndex((item) => item.id === department));
      const store = new AppDbRecruitmentDepartmentStore(app, roomId);
      const saved = await store.rename(department, renamedDepartmentName, order);
      if (!operation.isCurrent(roomContextRef.current)) return;
      setDepartments((current) => current.map((item) => (
        item.id === saved.key ? { ...item, label: saved.label } : item
      )));
      setRenamedDepartmentName('');
      setShowRenameDepartmentForm(false);
    } catch (error: unknown) {
      console.error('Failed to rename recruitment department in App Database', error);
      if (!operation.isCurrent(roomContextRef.current)) return;
      const message = error instanceof Error ? error.message : String(error);
      setRenameDepartmentError(`Không thể đổi tên phòng ban: ${message}`);
    } finally {
      if (operation.isCurrent(roomContextRef.current)) {
        setIsRenamingDepartment(false);
      }
    }
  };

  const jobs = jobsByDept[department] || [];
  const departmentLabel = departments.find(d => d.id === department)?.label || department;

  return (
    <main className="recruitment-page">
      <section className="recruitment-hero">
        <span>QUẢN LÝ TUYỂN DỤNG</span>
        <h1>Tạo và quản lý các vị trí tuyển dụng.</h1>
        <p>Thêm mới Job Description (JD) để tự động hóa quy trình sàng lọc và đánh giá CV.</p>
      </section>

      <section className="recruitment-content">
        <div className="recruitment-category-list" role="tablist" aria-label="Nhóm vị trí tuyển dụng" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
          {departments.map((item) => {
            const count = jobsByDept[item.id]?.length || 0;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={department === item.id}
                className={`recruitment-category${department === item.id ? ' recruitment-category-active' : ''}`}
                onClick={() => selectDepartment(item.id)}
              >
                {item.label}
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
          <button
            type="button"
            className="recruitment-category"
            disabled={
              isLoadingRecruitment
              || isSavingDepartment
              || !app
              || !roomId
              || !roomOperationRef.current?.isCurrent(roomContextRef.current)
            }
            onClick={() => {
              setDepartmentError('');
              setShowRenameDepartmentForm(false);
              setRenamedDepartmentName('');
              setRenameDepartmentError('');
              setShowDepartmentForm((current) => !current);
            }}
            style={{ borderStyle: 'dashed' }}
            aria-expanded={showDepartmentForm}
          >
            + Thêm phòng ban
          </button>
        </div>

        {showDepartmentForm && (
          <RecruitmentDepartmentForm
            departmentName={departmentName}
            isLoading={isLoadingRecruitment}
            isSaving={isSavingDepartment}
            onNameChange={setDepartmentName}
            onSubmit={submitDepartment}
            onCancel={() => {
              setDepartmentName('');
              setDepartmentError('');
              setShowDepartmentForm(false);
            }}
          />
        )}
        {departmentError && <p className="recruitment-department-error" role="alert">{departmentError}</p>}

            <div className="recruitment-heading">
              <div>
                <span>{jobs.length > 0 ? 'ĐANG TUYỂN' : 'TỰ TẠO JD'}</span>
                <h2>Phòng Ban: {departmentLabel}</h2>
              </div>
              <div className="recruitment-heading-actions">
                {isRecruitmentDepartmentRenameable(department) && (
                  <button
                    type="button"
                    className="rename-department-button"
                    disabled={isLoadingRecruitment || isRenamingDepartment || !app || !roomId}
                    aria-expanded={showRenameDepartmentForm}
                    onClick={() => {
                      setShowDepartmentForm(false);
                      setDepartmentError('');
                      setRenameDepartmentError('');
                      setRenamedDepartmentName('');
                      setShowRenameDepartmentForm((current) => !current);
                    }}
                  >
                    Đổi tên
                  </button>
                )}
                <button
                  type="button"
                  className="add-job-button"
                  onClick={() => {
                    setShowRenameDepartmentForm(false);
                    setRenamedDepartmentName('');
                    setRenameDepartmentError('');
                    setShowForm(true);
                  }}
                >
                  <span aria-hidden="true">+</span> Thêm JD
                </button>
              </div>
            </div>

            {showRenameDepartmentForm && (
              <RecruitmentDepartmentRenameForm
                currentDepartmentName={departmentLabel}
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
            )}

            {showForm && (
              <form className="job-form" onSubmit={submitJob}>
                <div className="job-form-heading">
                  <div>
                    <span>JD MỚI</span>
                    <h3>Thêm vị trí tuyển dụng</h3>
                  </div>
                  <button type="button" aria-label="Đóng form thêm JD" onClick={() => setShowForm(false)}>×</button>
                </div>
                <div className="job-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <label>
                    <span>Vị trí tuyển dụng <b style={{color: 'red'}}>*</b></span>
                    <input list="list-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ví dụ: Backend Developer" required />
                    <datalist id="list-title">
                      <option value="Lập trình viên Front-end" />
                      <option value="Lập trình viên Back-end" />
                      <option value="Lập trình viên Mobile" />
                      <option value="Data Analyst" />
                      <option value="Chuyên viên Nhân sự" />
                      <option value="Chuyên viên Marketing" />
                    </datalist>
                  </label>
                  <label>
                    <span>Thời gian làm việc <b style={{color: 'red'}}>*</b></span>
                    <input list="list-type" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} placeholder="Ví dụ: Full-time" required />
                    <datalist id="list-type">
                      <option value="Full-time" />
                      <option value="Part-time" />
                      <option value="Thực tập sinh (Intern)" />
                      <option value="Cộng tác viên (CTV)" />
                    </datalist>
                  </label>
                  <label>
                    <span>Mức lương <b style={{color: 'red'}}>*</b></span>
                    <input list="list-salary" value={draft.salary} onChange={(event) => setDraft({ ...draft, salary: event.target.value })} placeholder="Ví dụ: 12.000.000 VNĐ/tháng" required />
                    <datalist id="list-salary">
                      <option value="Thỏa thuận theo năng lực" />
                      <option value="10.000.000 - 15.000.000 VNĐ" />
                      <option value="15.000.000 - 20.000.000 VNĐ" />
                      <option value="20.000.000 - 30.000.000 VNĐ" />
                      <option value="Cạnh tranh trên thị trường" />
                    </datalist>
                  </label>
                  <label>
                    <span>Địa điểm làm việc</span>
                    <input list="list-location" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Ví dụ: Hà Nội" />
                    <datalist id="list-location">
                      <option value="Hà Nội" />
                      <option value="TP. Hồ Chí Minh" />
                      <option value="Đà Nẵng" />
                      <option value="Remote" />
                      <option value="Hybrid" />
                    </datalist>
                  </label>
                  <label className="job-form-wide" style={{ gridColumn: '1 / -1' }}>
                    <span>Mô tả ngắn <b style={{color: 'red'}}>*</b></span>
                    <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="Giới thiệu ngắn hiển thị trên thẻ..." required />
                  </label>
                  <label className="job-form-wide" style={{ gridColumn: '1 / -1' }}>
                    <span>Mô tả công việc</span>
                    <textarea value={draft.responsibilities} onChange={(event) => setDraft({ ...draft, responsibilities: event.target.value })} placeholder="Mỗi dòng là một đầu việc (*...)" />
                  </label>
                  <label>
                    <span>Kinh nghiệm</span>
                    <input list="list-experience" value={draft.req_experience} onChange={(event) => setDraft({ ...draft, req_experience: event.target.value })} placeholder="Yêu cầu về kinh nghiệm..." />
                    <datalist id="list-experience">
                      <option value="Không yêu cầu kinh nghiệm" />
                      <option value="Dưới 1 năm kinh nghiệm" />
                      <option value="1-2 năm kinh nghiệm" />
                      <option value="3-5 năm kinh nghiệm" />
                      <option value="Trên 5 năm kinh nghiệm" />
                    </datalist>
                  </label>
                  <label>
                    <span>Học vấn</span>
                    <input list="list-education" value={draft.req_education} onChange={(event) => setDraft({ ...draft, req_education: event.target.value })} placeholder="Yêu cầu học vấn..." />
                    <datalist id="list-education">
                      <option value="Không yêu cầu bằng cấp" />
                      <option value="Tốt nghiệp Cao đẳng trở lên" />
                      <option value="Tốt nghiệp Đại học trở lên" />
                      <option value="Tốt nghiệp Đại học chuyên ngành CNTT" />
                      <option value="Đang là sinh viên năm 3, năm 4" />
                    </datalist>
                  </label>
                  <label className="job-form-wide" style={{ gridColumn: '1 / -1' }}>
                    <span>Kỹ năng chuyên môn <b style={{color: 'red'}}>*</b></span>
                    <textarea value={draft.req_professional} onChange={(event) => setDraft({ ...draft, req_professional: event.target.value })} placeholder="Kỹ năng chuyên môn..." required />
                  </label>
                  <label className="job-form-wide" style={{ gridColumn: '1 / -1' }}>
                    <span>Kỹ năng mềm</span>
                    <textarea value={draft.req_soft} onChange={(event) => setDraft({ ...draft, req_soft: event.target.value })} placeholder="Kỹ năng mềm..." />
                  </label>
                  <label className="job-form-wide" style={{ gridColumn: '1 / -1' }}>
                    <span>Quyền lợi</span>
                    <textarea value={draft.benefits} onChange={(event) => setDraft({ ...draft, benefits: event.target.value })} placeholder="Mỗi dòng là một quyền lợi..." />
                  </label>
                  <label>
                    <span>Email nhận CV</span>
                    <input type="email" value={draft.contact_email} onChange={(event) => setDraft({ ...draft, contact_email: event.target.value })} placeholder="Ví dụ: hr@company.com" />
                  </label>
                  <label>
                    <span>Tiêu đề email</span>
                    <input value={draft.contact_title} onChange={(event) => setDraft({ ...draft, contact_title: event.target.value })} placeholder="Ví dụ: [Backend] - Họ tên" />
                  </label>
                </div>
                <div className="job-form-actions">
                  <button type="button" onClick={() => setShowForm(false)}>Hủy</button>
                  <button type="submit" disabled={isSavingJD} aria-label={isSavingJD ? 'Đang lưu JD' : undefined}>
                    {isSavingJD ? <span className="recruitment-save-spinner" aria-hidden="true" /> : 'Lưu JD'}
                  </button>
                </div>
                {saveJDError && <p className="job-form-save-error" role="alert">{saveJDError}</p>}
              </form>
            )}

            {jobs.length > 0 ? (
              <div className="job-grid">
                {jobs.map((job) => (
                  <article className="job-card" key={job.title}>
                    <span className="job-team">{departmentLabel}</span>
                    <h3>{job.title}</h3>
                    <p>{job.summary}</p>
                    <dl>
                      <div><dt>Hình thức</dt><dd>{job.type}</dd></div>
                      <div><dt>Thu nhập</dt><dd>{job.salary}</dd></div>
                    </dl>
                    <button
                      type="button"
                      className="job-detail-button"
                      onClick={() => setSelectedJob(selectedJob?.title === job.title ? null : job)}
                    >
                      {selectedJob?.title === job.title ? 'Thu gọn' : 'Xem chi tiết'} <span aria-hidden="true">→</span>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              !showForm && (
                <section className="recruitment-empty recruitment-empty-compact">
                  <div aria-hidden="true">+</div>
                  <h2>Chưa có JD nào</h2>
                  <p>Chọn “Thêm JD” để tạo vị trí tuyển dụng mới.</p>
                </section>
              )
            )}

            {selectedJob && (
              <article className="job-detail-panel">
                <div className="job-detail-title">
                  <div>
                    <span>{departmentLabel} · THÔNG TIN TUYỂN DỤNG</span>
                    <h2>{selectedJob.title}</h2>
                  </div>
                  <button type="button" onClick={() => setSelectedJob(null)} aria-label="Đóng chi tiết vị trí">×</button>
                </div>
                <div className="job-detail-columns">
                  {selectedJob.responsibilities && selectedJob.responsibilities.length > 0 && (
                    <div><h3>Mô tả công việc</h3><ul>{selectedJob.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.requirements && selectedJob.requirements.length > 0 && (
                    <div><h3>Yêu cầu</h3><ul>{selectedJob.requirements.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.bonuses && selectedJob.bonuses.length > 0 && (
                    <div><h3>Điểm cộng</h3><ul>{selectedJob.bonuses.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  
                  {/* New format fields */}
                  {selectedJob.req_experience && selectedJob.req_experience.length > 0 && (
                    <div><h3>Kinh nghiệm</h3><ul>{selectedJob.req_experience.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.req_professional && selectedJob.req_professional.length > 0 && (
                    <div><h3>Kỹ năng chuyên môn</h3><ul>{selectedJob.req_professional.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.req_soft && selectedJob.req_soft.length > 0 && (
                    <div><h3>Kỹ năng mềm</h3><ul>{selectedJob.req_soft.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.req_education && selectedJob.req_education.length > 0 && (
                    <div><h3>Học vấn</h3><ul>{selectedJob.req_education.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                  {selectedJob.benefits && selectedJob.benefits.length > 0 && (
                    <div><h3>Quyền lợi</h3><ul>{selectedJob.benefits.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  )}
                </div>
              </article>
            )}
      </section>
    </main>
  );
}
