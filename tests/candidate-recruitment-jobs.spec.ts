import { describe, expect, it } from 'vitest';

import * as CandidateRecruitmentJobs from '../src/ui/cv-scored/candidate-recruitment-jobs';

describe('resolveCandidateRecruitmentJobs', () => {
  it('uses upload metadata for PDF, DOCX and Markdown while preserving structured Markdown jobs', async () => {
    const resolveJobs = (CandidateRecruitmentJobs as Record<string, any>).resolveCandidateRecruitmentJobs;
    expect(resolveJobs).toBeTypeOf('function');

    const readIds: string[] = [];
    const jobs = await resolveJobs({
      files: [
        { _id: 'pdf', name: 'JD Backend Developer.pdf' },
        { _id: 'docx', name: 'JD Product Designer.docx' },
        { _id: 'md-upload', name: 'JD HR Specialist.md' },
        { _id: 'manual', name: 'JD_MANUAL_ROLE.md' },
      ],
      uploadedMetadata: [
        { fileId: 'pdf', fileName: 'JD Backend Developer.pdf', departmentKey: 'it', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
        { fileId: 'docx', fileName: 'JD Product Designer.docx', departmentKey: 'design', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
        { fileId: 'md-upload', fileName: 'JD HR Specialist.md', departmentKey: 'hr', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
      ],
      storedDepartments: [{ key: 'design', label: 'Design', order: 3 }],
      readText: async (file: { _id: string }) => {
        readIds.push(file._id);
        if (file._id !== 'manual') throw new Error('Uploaded files must not be parsed as structured Markdown');
        return `# TUYỂN DỤNG: MANUAL ROLE

<!-- DEPARTMENT_ID: finance -->

| **Phòng ban** | Finance |
| **Địa điểm làm việc** | Hà Nội |
| **Thời gian làm việc** | Full-time |
| **Mức lương** | Thỏa thuận |
`;
      },
    });

    expect(readIds).toEqual(['manual']);
    expect(jobs).toEqual([
      { title: 'MANUAL ROLE', departmentLabel: 'Finance' },
      { title: 'Backend Developer', departmentLabel: 'IT' },
      { title: 'Product Designer', departmentLabel: 'Design' },
      { title: 'HR Specialist', departmentLabel: 'HR' },
    ]);
  });

  it('loads uploaded JD departments from the Room App Database', async () => {
    const loadJobs = (CandidateRecruitmentJobs as Record<string, any>).loadCandidateRecruitmentJobsFromRoom;
    expect(loadJobs).toBeTypeOf('function');

    const app = {
      callServerTool: async ({ name, arguments: args }: { name: string; arguments: Record<string, any> }) => {
        let payload: unknown;
        if (name === 'mcpapp.folders.getByChannel' && !args.parentId) {
          payload = { folders: [{ _id: 'hr-folder', name: 'hr-miniapp' }] };
        } else if (name === 'mcpapp.folders.getByChannel' && args.parentId === 'hr-folder') {
          payload = { folders: [{ _id: 'jd-folder', name: 'jds' }] };
        } else if (name === 'mcpapp.files.getByChannel') {
          payload = { files: [
            { _id: 'pdf', name: 'JD Backend Developer.pdf' },
            { _id: 'docx', name: 'JD Product Designer.docx' },
            { _id: 'md', name: 'JD HR Specialist.md' },
          ] };
        } else if (name === 'mcpapp.db.query' && args.collection === 'hr_recruitment_job_files') {
          payload = { records: [
            { roomId: 'room-1', fileId: 'pdf', fileName: 'JD Backend Developer.pdf', departmentKey: 'it', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
            { roomId: 'room-1', fileId: 'docx', fileName: 'JD Product Designer.docx', departmentKey: 'design', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
            { roomId: 'room-1', fileId: 'md', fileName: 'JD HR Specialist.md', departmentKey: 'hr', source: 'uploaded', createdAt: '2026-10-09T00:00:00Z' },
          ] };
        } else if (name === 'mcpapp.db.query' && args.collection === 'hr_recruitment_departments') {
          payload = { records: [{ roomId: 'room-1', departmentKey: 'design', label: 'Design', order: 3 }] };
        } else {
          throw new Error(`Unexpected tool call: ${name}`);
        }
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      },
    };

    await expect(loadJobs(app, 'room-1')).resolves.toEqual([
      { title: 'Backend Developer', departmentLabel: 'IT' },
      { title: 'Product Designer', departmentLabel: 'Design' },
      { title: 'HR Specialist', departmentLabel: 'HR' },
    ]);
  });
});
