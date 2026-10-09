import type { McpApp } from '@privos_ai/app-react';
import { findFolderPath, readRoomFileText, readToolList } from '../privos-rest';
import { stripCvFileSuffix } from '../pipeline-candidate-name';
import { CV_SCORING_RUBRICS } from '../cv-scoring-policy';

export interface CandidateEvaluationFile {
  fileId: string;
  fileName: string;
  downloadUrl?: string;
}

export interface CandidateCriterion {
  id: string;
  label: string;
  maxPoints: number;
  awardedPoints: number;
  evidence: string[];
}

export interface CandidateEvaluationDocument {
  file: CandidateEvaluationFile;
  criteria: CandidateCriterion[];
  fullMarkdown: string;
}

const CRITERIA = Object.values(CV_SCORING_RUBRICS).flat();
const PAGE_SIZE = 100;

export function candidateEvaluationIdentity(candidateName: string): { fileName: string; month: string } | null {
  const base = stripCvFileSuffix(candidateName.replace(/\.md$/i, ''));
  const date = base.match(/^(\d{4}-\d{2})-\d{2}_CV_/i);
  if (!date) return null;
  return { fileName: `${base}.md`, month: date[1] };
}

export function parseCandidateEvaluationMarkdown(markdown: string): { criteria: CandidateCriterion[]; fullMarkdown: string } {
  const criteria: CandidateCriterion[] = [];
  const familyMatch = markdown.match(/\*\*(?:Nhóm nghề|Job family):\*\*\s*([A-Z_]+)/iu);
  const family = familyMatch?.[1]?.toUpperCase() as keyof typeof CV_SCORING_RUBRICS | undefined;
  const preferredCriteria = family && CV_SCORING_RUBRICS[family]
    ? CV_SCORING_RUBRICS[family]
    : CV_SCORING_RUBRICS.GENERAL;
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line) || /^\s*\|\s*[-:]+/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const id = cells[0].replace(/[`*]/g, '').trim().toLowerCase();
    const maxPoints = Number(cells[1]);
    const awardedPoints = Number(cells[2]);
    const criterion = preferredCriteria.find((entry) => entry.id === id && entry.maxPoints === maxPoints)
      ?? CRITERIA.find((entry) => entry.id === id && entry.maxPoints === maxPoints);
    if (!criterion || !Number.isFinite(maxPoints) || !Number.isFinite(awardedPoints)) continue;
    if (maxPoints <= 0 || awardedPoints < 0 || awardedPoints > maxPoints || /\{\{|<[^>]*placeholder/i.test(line)) continue;
    const evidence = cells.slice(3).join('|').split(/<br\s*\/?\s*>/i).map((value) => value.trim()).filter(Boolean);
    criteria.push({ id, label: criterion.label, maxPoints, awardedPoints, evidence });
  }
  return { criteria, fullMarkdown: markdown };
}

export class CandidateEvaluationRepository {
  constructor(private readonly app: McpApp, private readonly roomId: string) {}

  async resolve(candidateName: string): Promise<CandidateEvaluationFile | null> {
    const identity = candidateEvaluationIdentity(candidateName);
    if (!identity) return null;
    const matches: CandidateEvaluationFile[] = [];
    for (const stage of ['02-passed_screening', '01-failed', '03-deep_reviewed']) {
      const folderId = await findFolderPath(this.app, this.roomId, ['hr-miniapp', 'outputs-cv', identity.month, stage]);
      if (!folderId) continue;
      for (let skip = 0; ; skip += PAGE_SIZE) {
        const response = await this.app.callServerTool({
          name: 'mcpapp.files.getByChannel',
          arguments: { channelId: this.roomId, folderId, skip, limit: PAGE_SIZE },
        });
        const files = readToolList(response, 'files');
        for (const file of files) {
          if (String(file?.name || '').normalize('NFC').toLowerCase() !== identity.fileName.normalize('NFC').toLowerCase()) continue;
          if (!file?._id) continue;
          matches.push({ fileId: file._id, fileName: file.name, ...(file.downloadUrl ? { downloadUrl: file.downloadUrl } : {}) });
        }
        if (files.length < PAGE_SIZE) break;
      }
    }
    const unique = [...new Map(matches.map((file) => [file.fileId, file])).values()];
    if (unique.length > 1) throw new Error('Tìm thấy nhiều file đánh giá trùng tên; không thể xác định file chính xác.');
    return unique[0] ?? null;
  }

  async read(file: CandidateEvaluationFile): Promise<CandidateEvaluationDocument> {
    const markdown = await readRoomFileText(this.app, { _id: file.fileId, downloadUrl: file.downloadUrl });
    return { file, ...parseCandidateEvaluationMarkdown(markdown) };
  }
}
