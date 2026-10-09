import type {
  CandidateApplication,
  CandidateMetricSummary,
  CVBoardData,
  CVProfile,
  ScreeningListRef,
} from './candidate-model';
import type { RecruitmentJob } from '../recruitment/recruitment-jobs';
import { getRecruitmentPositionFromFileName } from '../recruitment/recruitment-uploaded-jobs';

export interface CandidateRecruitmentJob {
  title: string;
  departmentLabel: string;
}

export function toCandidateRecruitmentJobs(jobs: ReadonlyArray<RecruitmentJob>): CandidateRecruitmentJob[] {
  return jobs.map((job) => ({
    title: job.kind === 'uploaded' ? getRecruitmentPositionFromFileName(job.fileName) : job.title,
    departmentLabel: job.departmentLabel,
  }));
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function campaignTitle(value: string): string {
  return value
    .replace(/^\[?SCREENING\]?[_\s-]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || value;
}

function campaignKey(value: string): string {
  return normalize(campaignTitle(value)).replace(/[^a-z0-9]+/g, '');
}

function recruitmentPeriod(board: CVBoardData): string | undefined {
  const rawDate = board.createdAt ?? board.created_at;
  if (!rawDate) return undefined;
  const date = new Date(rawDate);
  if (!Number.isFinite(date.getTime())) return undefined;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `Ngày ${day}/${month}/${date.getUTCFullYear()}`;
}

function findRecruitmentJob(listName: string, jobs: ReadonlyArray<CandidateRecruitmentJob>): CandidateRecruitmentJob | undefined {
  const key = campaignKey(listName);
  return jobs.find((job) => campaignKey(job.title) === key);
}

export function collectCandidateApplications(
  boards: ReadonlyArray<CVBoardData>,
  jobs: ReadonlyArray<CandidateRecruitmentJob> = [],
): CandidateApplication[] {
  return boards.flatMap((board) => board.cvs.map((candidate) => ({
    ...candidate,
    applicationKey: `${board.listId}:${candidate._id}`,
    sourceListId: board.listId,
    sourceListName: board.listName,
    jobTitle: findRecruitmentJob(board.listName, jobs)?.title || campaignTitle(board.listName),
    departmentLabel: findRecruitmentJob(board.listName, jobs)?.departmentLabel,
    recruitmentPeriod: recruitmentPeriod(board),
  })));
}

export function displayCandidatePosition(candidate: Pick<CandidateApplication, 'jobTitle' | 'sourceListName'>): string {
  return candidate.jobTitle || campaignTitle(candidate.sourceListName);
}

export function displayCandidateDepartmentPeriod(candidate: Pick<CandidateApplication, 'departmentLabel' | 'recruitmentPeriod'>): string | undefined {
  return [candidate.departmentLabel, candidate.recruitmentPeriod].filter(Boolean).join(' · ') || undefined;
}

export function filterCandidates(
  candidates: ReadonlyArray<CandidateApplication>,
  query: string,
  resultFilter: string,
): CandidateApplication[] {
  const normalizedQuery = normalize(query);
  const normalizedFilter = normalize(resultFilter);
  return candidates.filter((candidate) => {
    const matchesResult = normalizedFilter === ''
      || normalizedFilter === 'all'
      || normalize(candidate.category) === normalizedFilter;
    if (!matchesResult) return false;
    if (!normalizedQuery) return true;
    return [candidate.name, candidate.email, candidate.position, candidate.jobTitle, candidate.departmentLabel, candidate.sourceListName]
      .some((value) => normalize(value).includes(normalizedQuery));
  });
}

export function getCandidateMetrics(candidates: ReadonlyArray<CVProfile>): CandidateMetricSummary {
  return {
    total: candidates.length,
    passed: candidates.filter((candidate) => normalize(candidate.category) === 'dat').length,
    awaitingInterview: candidates.filter((candidate) => candidate.status === '07_Chua_Phong_Van').length,
    interviewed: candidates.filter((candidate) => candidate.status === '08_Da_Phong_Van').length,
  };
}

export function formatScreeningListLabel(list: ScreeningListRef): string {
  const name = campaignTitle(list.name);
  const rawDate = list.createdAt ?? list.created_at;
  if (!rawDate) return name;
  const date = new Date(rawDate);
  if (!Number.isFinite(date.getTime())) return name;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${name} · ${day}/${month}/${date.getUTCFullYear()}`;
}

export function resolveCandidateInvitePosition(
  candidate: Pick<CandidateApplication, 'sourceListName'>,
): string {
  return formatScreeningListLabel({ name: candidate.sourceListName });
}
