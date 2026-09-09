export type JobFamily =
  | 'TECHNOLOGY'
  | 'ENGINEERING'
  | 'BUSINESS_MANAGEMENT'
  | 'OPERATIONS_SERVICE'
  | 'GENERAL';

export type CvHardGate = 'NONE' | 'MISSING_MANDATORY' | 'SAI_JD';
export type CvCategory = 'ĐẠT' | 'CÂN NHẮC' | 'KHÔNG ĐẠT' | 'SAI JD';

export interface CvRubricCriterion {
  readonly id: string;
  readonly label: string;
  readonly maxPoints: number;
}

export interface CvCriterionInput {
  id: string;
  max_points: number;
  awarded_points: number;
  evidence: string[];
}

export interface CvAssessmentInput {
  job_family: JobFamily | string;
  hard_gate: CvHardGate | string;
  score: number;
  category: CvCategory | string;
  reason: string;
  criteria: CvCriterionInput[];
  saved_file?: string;
  extracted_evidence?: string[];
  email?: string;
  sdt?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface ValidatedCvAssessment extends CvAssessmentInput {
  job_family: JobFamily;
  hard_gate: CvHardGate;
  category: CvCategory;
}

export const CV_SCORING_RUBRICS: Readonly<Record<JobFamily, readonly CvRubricCriterion[]>> = {
  TECHNOLOGY: [
    { id: 'core_technical_fit', label: 'Năng lực công nghệ cốt lõi theo JD', maxPoints: 35 },
    { id: 'relevant_delivery', label: 'Kinh nghiệm, dự án và kết quả triển khai', maxPoints: 30 },
    { id: 'problem_solving_quality', label: 'Giải quyết vấn đề, chất lượng và vận hành', maxPoints: 20 },
    { id: 'qualifications_learning', label: 'Học vấn, chứng chỉ và khả năng học hỏi', maxPoints: 15 },
  ],
  ENGINEERING: [
    { id: 'core_engineering_fit', label: 'Năng lực kỹ thuật cốt lõi theo JD', maxPoints: 35 },
    { id: 'practical_experience', label: 'Kinh nghiệm thực tế và kết quả công việc', maxPoints: 30 },
    { id: 'standards_safety_quality', label: 'Tiêu chuẩn, an toàn và kiểm soát chất lượng', maxPoints: 20 },
    { id: 'qualifications_tools', label: 'Học vấn, chứng chỉ và công cụ chuyên môn', maxPoints: 15 },
  ],
  BUSINESS_MANAGEMENT: [
    { id: 'business_domain_fit', label: 'Năng lực nghiệp vụ và hiểu biết ngành', maxPoints: 30 },
    { id: 'measurable_results', label: 'Kinh nghiệm và thành tích đo lường được', maxPoints: 30 },
    { id: 'analysis_leadership', label: 'Phân tích, ra quyết định và lãnh đạo', maxPoints: 25 },
    { id: 'qualifications_tools', label: 'Học vấn, chứng chỉ và công cụ nghiệp vụ', maxPoints: 15 },
  ],
  OPERATIONS_SERVICE: [
    { id: 'role_readiness', label: 'Mức độ sẵn sàng đáp ứng công việc', maxPoints: 35 },
    { id: 'relevant_experience', label: 'Kinh nghiệm liên quan và độ ổn định', maxPoints: 30 },
    { id: 'process_service_safety', label: 'Quy trình, dịch vụ, an toàn và kỷ luật', maxPoints: 25 },
    { id: 'qualifications', label: 'Học vấn, chứng chỉ và điều kiện bổ trợ', maxPoints: 10 },
  ],
  GENERAL: [
    { id: 'core_jd_fit', label: 'Mức độ phù hợp yêu cầu cốt lõi của JD', maxPoints: 35 },
    { id: 'relevant_experience', label: 'Kinh nghiệm liên quan và kết quả công việc', maxPoints: 30 },
    { id: 'skills_evidence', label: 'Kỹ năng có bằng chứng trong CV', maxPoints: 20 },
    { id: 'qualifications', label: 'Học vấn, chứng chỉ và điều kiện bổ trợ', maxPoints: 15 },
  ],
};

const JOB_FAMILIES = new Set<JobFamily>(Object.keys(CV_SCORING_RUBRICS) as JobFamily[]);
const HARD_GATES = new Set<CvHardGate>(['NONE', 'MISSING_MANDATORY', 'SAI_JD']);

function normalizeJobFamily(value: unknown): JobFamily | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return JOB_FAMILIES.has(normalized as JobFamily) ? normalized as JobFamily : null;
}

function normalizeCategory(value: unknown): CvCategory | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D');

  if (normalized === 'DAT') return 'ĐẠT';
  if (normalized === 'CAN NHAC') return 'CÂN NHẮC';
  if (normalized === 'KHONG DAT') return 'KHÔNG ĐẠT';
  if (normalized === 'SAI JD') return 'SAI JD';
  return null;
}

function deriveCategory(score: number, hardGate: CvHardGate): CvCategory {
  if (hardGate === 'SAI_JD') return 'SAI JD';
  if (hardGate === 'MISSING_MANDATORY') return 'KHÔNG ĐẠT';
  if (score >= 80) return 'ĐẠT';
  if (score >= 50) return 'CÂN NHẮC';
  return 'KHÔNG ĐẠT';
}


function allowedEvidencePoints(maxPoints: number): Set<number> {
  return new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxPoints * ratio)));
}

function inferJobFamilyFromCriteria(value: unknown): JobFamily {
  if (!Array.isArray(value)) return 'GENERAL';
  const ranked = (Object.entries(CV_SCORING_RUBRICS) as Array<[JobFamily, readonly CvRubricCriterion[]]>)
    .map(([family, rubric]) => ({
      family,
      matches: rubric.filter((expected) => value.some((criterion) => (
        criterion && typeof criterion === 'object'
        && (criterion as CvCriterionInput).id === expected.id
        && ((criterion as CvCriterionInput).max_points === expected.maxPoints
          || (criterion as CvCriterionInput).max_points == null)
      ))).length,
    }))
    .sort((left, right) => right.matches - left.matches);
  return ranked[0].matches > 0 && ranked[0].matches > ranked[1].matches
    ? ranked[0].family
    : 'GENERAL';
}

function normalizeCriteria(
  value: unknown,
  rubric: readonly CvRubricCriterion[],
): CvCriterionInput[] {
  const supplied = Array.isArray(value) ? value : [];
  return rubric.map((expected) => {
    const matches = supplied.filter((criterion) => (
      criterion && typeof criterion === 'object' && (criterion as CvCriterionInput).id === expected.id
    )) as Array<Partial<CvCriterionInput>>;
    const actual = matches.length === 1 ? matches[0] : undefined;
    const suppliedEvidence = actual?.evidence;
    const evidenceIsSafe = Array.isArray(suppliedEvidence)
      && suppliedEvidence.every((item) => typeof item === 'string' && item.trim() !== '');
    const evidence = evidenceIsSafe
      ? suppliedEvidence
        .map((item) => item.trim().replace(/<br\s*\/?\s*>/gi, ' ').replace(/\s+/g, ' '))
      : [];
    const suppliedPoints = actual?.awarded_points;
    const pointsAreSafe = matches.length === 1
      && actual?.max_points === expected.maxPoints
      && evidenceIsSafe
      && Number.isInteger(suppliedPoints)
      && allowedEvidencePoints(expected.maxPoints).has(suppliedPoints as number)
      && ((suppliedPoints as number) === 0 || evidence.length > 0);
    return {
      id: expected.id,
      max_points: expected.maxPoints,
      awarded_points: pointsAreSafe ? suppliedPoints as number : 0,
      evidence,
    };
  });
}

export function validateCvAssessment(input: CvAssessmentInput): ValidatedCvAssessment {
  if (!input || typeof input !== 'object') throw new Error('Kết quả chấm CV không hợp lệ.');

  const jobFamily = normalizeJobFamily(input.job_family) ?? inferJobFamilyFromCriteria(input.criteria);
  const suppliedHardGate = typeof input.hard_gate === 'string'
    ? input.hard_gate.trim().toUpperCase() as CvHardGate
    : 'NONE';
  const hardGate = HARD_GATES.has(suppliedHardGate) ? suppliedHardGate : 'NONE';
  const rubric = CV_SCORING_RUBRICS[jobFamily];
  const criteria = normalizeCriteria(input.criteria, rubric);
  const criterionTotal = criteria.reduce((total, criterion) => total + criterion.awarded_points, 0);

  const effectiveScore = hardGate === 'SAI_JD'
    ? 0
    : hardGate === 'MISSING_MANDATORY'
      ? Math.min(criterionTotal, 49)
      : criterionTotal;

  const expectedCategory = deriveCategory(effectiveScore, hardGate);
  const suppliedReason = typeof input.reason === 'string' && input.reason.trim() !== ''
    ? input.reason.trim()
    : 'Không đủ bằng chứng trong CV để xác nhận mức độ phù hợp với JD.';
  const normalizedReason = hardGate === 'MISSING_MANDATORY'
    ? suppliedReason.replace(
      /^Hard\s+gate\s+MISSING_MANDATORY\s*:\s*/i,
      'Thiếu yêu cầu bắt buộc: ',
    )
    : suppliedReason;

  return {
    ...input,
    job_family: jobFamily,
    hard_gate: hardGate,
    criteria,
    score: effectiveScore,
    category: expectedCategory,
    reason: normalizedReason,
  };
}

export function extractTotalScoreFromMarkdown(markdown: string): number | null {
  if (!markdown) return null;

  const resultMatches = [...markdown.matchAll(
    /^\s*#{1,6}\s*Kết quả\s*:[^\n\r]*\(\s*(\d+(?:\.\d+)?)\s*\/\s*100\s*\)\s*$/gimu,
  )];
  const totalRowMatches = [...markdown.matchAll(
    /^\s*\|\s*\**TỔNG\**\s*\|\s*\**100\**\s*\|\s*\**(\d+(?:\.\d+)?)\**\s*\|[^\n\r]*$/gimu,
  )];
  if (resultMatches.length !== 1 || totalRowMatches.length !== 1) return null;

  const resultScore = Number(resultMatches[0][1]);
  const totalScore = Number(totalRowMatches[0][1]);
  if (resultScore !== totalScore) return null;
  return Number.isInteger(resultScore) && resultScore >= 0 && resultScore <= 100 ? resultScore : null;
}

export function extractFinalCategoryFromMarkdown(markdown: string): CvCategory | null {
  if (!markdown) return null;
  const resultLine = markdown.match(
    /^\s*#{1,6}\s*Kết quả\s*:\s*(?:✅|🟡|❌|⛔)?\s*(SAI JD|KHÔNG ĐẠT|CÂN NHẮC|ĐẠT)\s*\(/imu,
  );
  return normalizeCategory(resultLine?.[1]);
}

function extractMarkdownPolicy(markdown: string): {
  jobFamily: JobFamily | null;
  hardGate: CvHardGate | null;
  criteria: CvCriterionInput[];
} {
  const familyMatch = markdown.match(/^\s*-\s*\*\*Nhóm nghề:\*\*\s*([A-Z_]+)\s*$/imu);
  const gateMatch = markdown.match(/^\s*-\s*\*\*Hard gate:\*\*\s*(NONE|MISSING_MANDATORY|SAI_JD)\s*$/imu);
  const scoringStart = markdown.search(/^##\s+Chấm điểm theo JD\s*$/imu);
  const scoringTail = scoringStart >= 0 ? markdown.slice(scoringStart) : '';
  const conclusionOffset = scoringTail.search(/^###\s+Kết luận\s*$/imu);
  const scoringSection = conclusionOffset >= 0 ? scoringTail.slice(0, conclusionOffset) : scoringTail;
  const criteria: CvCriterionInput[] = [];
  const rowPattern = /^\s*\|\s*`?([a-z][a-z0-9_]*)`?\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*$/gim;
  for (const match of scoringSection.matchAll(rowPattern)) {
    const rawEvidence = match[4].trim();
    criteria.push({
      id: match[1],
      max_points: Number(match[2]),
      awarded_points: Number(match[3]),
      evidence: rawEvidence === 'Không đề cập'
        ? []
        : rawEvidence
          .split(/\s*<br\s*\/?\s*>\s*/i)
          .map((item) => item.trim().replace(/\\\|/g, '|')),
    });
  }
  const hardGate = gateMatch?.[1] as CvHardGate | undefined;
  return {
    jobFamily: normalizeJobFamily(familyMatch?.[1]),
    hardGate: hardGate && HARD_GATES.has(hardGate) ? hardGate : null,
    criteria,
  };
}

export function reconcileMarkdownAssessment(
  markdown: string,
  assessment: ValidatedCvAssessment,
): string {
  const rows = assessment.criteria.map((criterion) => {
    const evidence = criterion.evidence.length > 0
      ? criterion.evidence.map((item) => item.replace(/\|/g, '\\|')).join('<br>')
      : 'Không đề cập';
    return `| ${criterion.id} | ${criterion.max_points} | ${criterion.awarded_points} | ${evidence} |`;
  }).join('\n');
  const scoringSection = `## Chấm điểm theo JD

| Criterion ID | Điểm tối đa | Điểm đạt | Evidence nguyên văn |
|---|---:|---:|---|
${rows}
| **TỔNG** | **100** | **${assessment.score}** | **Tổng điểm sau hard gate** |

### Kết quả: ${assessment.category} (${assessment.score}/100)`;

  let reconciled = markdown;
  const familyLine = `- **Nhóm nghề:** ${assessment.job_family}`;
  const gateLine = `- **Hard gate:** ${assessment.hard_gate}`;
  const familyPattern = /^\s*-\s*\*\*Nhóm nghề:\*\*[^\n\r]*$/imu;
  const gatePattern = /^\s*-\s*\*\*Hard gate:\*\*[^\n\r]*$/imu;
  if (familyPattern.test(reconciled)) {
    reconciled = reconciled.replace(familyPattern, familyLine);
  } else {
    const firstHeading = reconciled.match(/^#[^\n\r]*$/mu);
    reconciled = firstHeading
      ? reconciled.replace(firstHeading[0], `${firstHeading[0]}\n\n${familyLine}`)
      : `${familyLine}\n${reconciled}`;
  }
  if (gatePattern.test(reconciled)) {
    reconciled = reconciled.replace(gatePattern, gateLine);
  } else {
    reconciled = reconciled.replace(familyLine, `${familyLine}\n${gateLine}`);
  }

  const sectionStart = reconciled.search(/^##\s+Chấm điểm theo JD\s*$/imu);
  const conclusionPattern = /^###\s+Kết luận\s*$/imu;
  if (sectionStart >= 0) {
    const conclusionOffset = reconciled.slice(sectionStart).search(conclusionPattern);
    const sectionEnd = conclusionOffset >= 0 ? sectionStart + conclusionOffset : reconciled.length;
    return `${reconciled.slice(0, sectionStart).trimEnd()}\n\n${scoringSection}\n\n${reconciled.slice(sectionEnd).trimStart()}`.trim();
  }

  const legacyLines = reconciled.split(/\r?\n/);
  for (let index = legacyLines.length - 1; index >= 0; index -= 1) {
    if (!/^\s*\|\s*\**TỔNG\**\s*\|/iu.test(legacyLines[index])) continue;
    let tableStart = index;
    let tableEnd = index;
    while (tableStart > 0 && /^\s*\|/.test(legacyLines[tableStart - 1])) tableStart -= 1;
    while (tableEnd + 1 < legacyLines.length && /^\s*\|/.test(legacyLines[tableEnd + 1])) tableEnd += 1;
    legacyLines.splice(tableStart, tableEnd - tableStart + 1);
    index = tableStart;
  }
  reconciled = legacyLines
    .filter((line) => !/^\s*#{1,6}\s*Kết quả\s*:/iu.test(line))
    .join('\n');

  const conclusionStart = reconciled.search(conclusionPattern);
  return conclusionStart >= 0
      ? `${reconciled.slice(0, conclusionStart).trimEnd()}\n\n${scoringSection}\n\n${reconciled.slice(conclusionStart).trimStart()}`.trim()
      : `${reconciled.trimEnd()}\n\n${scoringSection}`.trim();
}

export function validateMarkdownAssessment(
  markdown: string,
  assessment: ValidatedCvAssessment,
): void {
  const markdownScore = extractTotalScoreFromMarkdown(markdown);
  const markdownCategory = extractFinalCategoryFromMarkdown(markdown);
  if (markdownScore === null || markdownCategory === null) {
    throw new Error('Markdown thiếu dòng kết quả cuối hợp lệ với điểm /100 và category.');
  }
  if (markdownScore !== assessment.score || markdownCategory !== assessment.category) {
    throw new Error(
      `Markdown (${markdownCategory}, ${markdownScore}) không khớp JSON (${assessment.category}, ${assessment.score}).`,
    );
  }

  const markdownPolicy = extractMarkdownPolicy(markdown);
  if (markdownPolicy.jobFamily !== assessment.job_family || markdownPolicy.hardGate !== assessment.hard_gate) {
    throw new Error('Job family/hard gate trong Markdown không khớp JSON.');
  }
  if (markdownPolicy.criteria.length !== assessment.criteria.length) {
    throw new Error('Criteria trong Markdown không khớp JSON.');
  }
  const markdownCriteria = new Map(markdownPolicy.criteria.map((criterion) => [criterion.id, criterion]));
  const criteriaMatch = markdownCriteria.size === assessment.criteria.length
    && assessment.criteria.every((criterion) => {
      const markdownCriterion = markdownCriteria.get(criterion.id);
      return Boolean(markdownCriterion)
        && markdownCriterion!.max_points === criterion.max_points
        && markdownCriterion!.awarded_points === criterion.awarded_points;
    });
  if (!criteriaMatch) throw new Error('Criteria trong Markdown không khớp JSON.');

  const evidenceMatches = assessment.criteria.every((criterion) => {
    const markdownEvidence = markdownCriteria.get(criterion.id)?.evidence ?? [];
    const expectedEvidence = criterion.evidence.map((item) => item.trim());
    return markdownEvidence.length === expectedEvidence.length
      && expectedEvidence.every((item, index) => markdownEvidence[index] === item);
  });
  if (!evidenceMatches) throw new Error('Evidence trong Markdown không khớp JSON.');
}
