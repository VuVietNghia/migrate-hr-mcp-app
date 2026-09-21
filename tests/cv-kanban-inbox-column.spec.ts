import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CVScoredTab hien cot Dau vao khi board co the o 01_Dau_Vao', () => {
  const tab = fs.readFileSync(path.resolve('src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');

  it('truyen hasInboxCards vao getCVColumnsForStages', () => {
    expect(tab).toContain(
      "getCVColumnsForStages(board.stagesMap, board.cvs.some((cv) => cv.status === '01_Dau_Vao'))",
    );
  });

  it('khong con loi goi chi voi stagesMap', () => {
    expect(tab).not.toContain('getCVColumnsForStages(board.stagesMap);');
  });
});
