import { describe, expect, it } from 'vitest';
import type { CVBoardData, CVProfile } from '../src/ui/cv-scored/candidate-model';
import {
  collectCandidateApplications,
  filterCandidates,
  formatScreeningListLabel,
  getCandidateMetrics,
} from '../src/ui/cv-scored/candidate-view-model';
import * as CandidateViewModel from '../src/ui/cv-scored/candidate-view-model';

function candidate(overrides: Partial<CVProfile> = {}): CVProfile {
  return {
    _id: 'cv-1',
    name: 'Nguyễn Minh Anh',
    status: '03_Tiem_Nang',
    score: 92,
    category: 'ĐẠT',
    email: 'anh@example.com',
    position: 'Senior Product Designer',
    ...overrides,
  };
}

function board(listId: string, listName: string, cvs: CVProfile[], createdAt?: string): CVBoardData {
  return { listId, listName, createdAt, stagesMap: {}, fieldsMap: {}, cvs };
}

describe('collectCandidateApplications', () => {
  it('keeps equal item ids from different campaigns as distinct applications', () => {
    const applications = collectCandidateApplications([
      board('list-a', 'SCREENING_DESIGN_09_2026', [candidate({ _id: 'same' })]),
      board('list-b', 'SCREENING_MARKETING_10_2026', [candidate({ _id: 'same', email: 'anh@example.com' })]),
    ]);

    expect(applications.map((item) => item.applicationKey)).toEqual(['list-a:same', 'list-b:same']);
    expect(applications.map((item) => item.sourceListId)).toEqual(['list-a', 'list-b']);
  });

  it('uses the linked JD title and department instead of the CV job-family value', () => {
    const applications = collectCandidateApplications([
      board('list-a', 'SCREENING_FULL_STACK_DEVELOPER', [candidate({ position: 'TECHNOLOGY' })], '2026-09-01T00:00:00Z'),
    ], [
      { title: 'Full Stack Developer', departmentLabel: 'Engineering' },
    ]);

    expect(applications[0]).toMatchObject({
      jobTitle: 'Full Stack Developer',
      departmentLabel: 'Engineering',
      recruitmentPeriod: 'Ngày 01/09/2026',
    });
  });
});

describe('uploaded JD department mapping', () => {
  it('keeps App Database departments for uploaded PDF, DOCX and Markdown jobs', () => {
    const toCandidateJobs = (CandidateViewModel as Record<string, any>).toCandidateRecruitmentJobs;
    expect(toCandidateJobs).toBeTypeOf('function');

    expect(toCandidateJobs([
      { kind: 'uploaded', fileId: 'pdf', fileName: 'JD Backend Developer.pdf', departmentKey: 'it', departmentLabel: 'IT', format: 'pdf' },
      { kind: 'uploaded', fileId: 'docx', fileName: 'JD Product Designer.docx', departmentKey: 'design', departmentLabel: 'Design', format: 'word' },
      { kind: 'uploaded', fileId: 'md', fileName: 'JD HR Specialist.md', departmentKey: 'hr', departmentLabel: 'HR', format: 'markdown' },
      { kind: 'structured', fileId: 'manual', fileName: 'JD_MANUAL.md', title: 'Manual Role', departmentKey: 'finance', departmentLabel: 'Finance' },
    ])).toEqual([
      { title: 'Backend Developer', departmentLabel: 'IT' },
      { title: 'Product Designer', departmentLabel: 'Design' },
      { title: 'HR Specialist', departmentLabel: 'HR' },
      { title: 'Manual Role', departmentLabel: 'Finance' },
    ]);
  });
});

describe('filterCandidates', () => {
  const applications = collectCandidateApplications([
    board('list-a', 'SCREENING_DESIGN_09_2026', [candidate()]),
    board('list-b', 'SCREENING_ENGINEERING_10_2026', [candidate({
      _id: 'cv-2',
      name: 'Trần Hoàng Nam',
      email: 'nam@example.com',
      position: 'Frontend Developer',
      category: 'CÂN NHẮC',
    })]),
  ]);

  it('searches accent-insensitively across name, email, position, and campaign', () => {
    expect(filterCandidates(applications, 'nguyen minh', 'all').map((item) => item._id)).toEqual(['cv-1']);
    expect(filterCandidates(applications, 'frontend', 'all').map((item) => item._id)).toEqual(['cv-2']);
    expect(filterCandidates(applications, 'engineering', 'all').map((item) => item._id)).toEqual(['cv-2']);
    expect(filterCandidates(applications, 'NAM@EXAMPLE.COM', 'all').map((item) => item._id)).toEqual(['cv-2']);
  });

  it('filters by the real normalized category without mutating the source', () => {
    const filtered = filterCandidates(applications, '', 'CÂN NHẮC');

    expect(filtered.map((item) => item._id)).toEqual(['cv-2']);
    expect(applications).toHaveLength(2);
  });
});

describe('getCandidateMetrics', () => {
  it('counts the supplied scope only', () => {
    const metrics = getCandidateMetrics([
      candidate({ _id: 'a', category: 'ĐẠT', status: '03_Tiem_Nang' }),
      candidate({ _id: 'b', category: 'KHÔNG ĐẠT', status: '07_Chua_Phong_Van' }),
      candidate({ _id: 'c', category: 'CÂN NHẮC', status: '08_Da_Phong_Van' }),
    ]);

    expect(metrics).toEqual({ total: 3, passed: 1, awaitingInterview: 1, interviewed: 1 });
  });
});

describe('formatScreeningListLabel', () => {
  it('removes the technical prefix and formats a valid creation date', () => {
    expect(formatScreeningListLabel({
      _id: 'list-a',
      name: 'SCREENING_Senior_Product_Designer',
      createdAt: '2026-09-12T00:00:00Z',
    })).toBe('Senior Product Designer · 12/09/2026');
  });
});

describe('resolveCandidateInvitePosition', () => {
  it('uses the recruitment campaign name even when the scored CV occupation is TECHNOLOGY', () => {
    const resolvePosition = (CandidateViewModel as Record<string, any>).resolveCandidateInvitePosition;

    expect(resolvePosition?.({
      sourceListName: 'SCREENING_FULL_STACK_DEVELOPER',
      position: 'TECHNOLOGY',
    })).toBe('FULL STACK DEVELOPER');
  });
});
