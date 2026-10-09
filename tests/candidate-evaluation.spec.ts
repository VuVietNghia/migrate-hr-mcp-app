import { describe, expect, it } from 'vitest';
import { candidateEvaluationIdentity, parseCandidateEvaluationMarkdown } from '../src/ui/cv-scored/candidate-evaluation';

describe('candidate evaluation identity', () => {
  it('derives the real markdown name and month while removing only the item suffix', () => {
    expect(candidateEvaluationIdentity('2026-09-12_CV_Nguyen_Van_A-3f9c1a')).toEqual({
      fileName: '2026-09-12_CV_Nguyen_Van_A.md',
      month: '2026-09',
    });
  });
});

describe('candidate evaluation markdown', () => {
  it('parses only canonical criterion rows and splits evidence', () => {
    const markdown = [
      '| Criterion ID | max | awarded | evidence |',
      '|---|---:|---:|---|',
      '| core_jd_fit | 35 | 30 | React<br>TypeScript |',
      '| relevant_experience | 30 | 24 | 5 năm |',
      '| total | 100 | 88 | không phải criterion |',
    ].join('\n');
    expect(parseCandidateEvaluationMarkdown(markdown).criteria).toEqual([
      { id: 'core_jd_fit', label: 'Mức độ phù hợp yêu cầu cốt lõi của JD', maxPoints: 35, awardedPoints: 30, evidence: ['React', 'TypeScript'] },
      { id: 'relevant_experience', label: 'Kinh nghiệm liên quan và kết quả công việc', maxPoints: 30, awardedPoints: 24, evidence: ['5 năm'] },
    ]);
  });

  it('accepts shared criterion ids only with a rubric-valid max score', () => {
    const parsed = parseCandidateEvaluationMarkdown([
      '| qualifications | 10 | 8 | Chứng chỉ nghề |',
      '| qualifications | 12 | 8 | Max không thuộc rubric |',
    ].join('\n'));
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.criteria[0]).toMatchObject({ id: 'qualifications', maxPoints: 10, awardedPoints: 8 });
  });

  it('uses the declared job family to disambiguate shared criterion labels', () => {
    const parsed = parseCandidateEvaluationMarkdown([
      '- **Nhóm nghề:** OPERATIONS_SERVICE',
      '| relevant_experience | 30 | 23 | Vận hành 3 năm |',
    ].join('\n'));
    expect(parsed.criteria[0]?.label).toBe('Kinh nghiệm liên quan và độ ổn định');
  });
});
