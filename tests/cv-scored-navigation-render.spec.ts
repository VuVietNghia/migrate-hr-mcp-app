import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@privos_ai/app-react', () => ({
  parseToolResult: (value: unknown) => value,
  usePrivosApp: () => null,
  usePrivosContext: () => ({ roomId: '' }),
}));

import * as candidateModule from '../src/ui/cv-scored/CVScoredTab';

type CandidateBoardComponent = (props: Record<string, unknown>) => ReturnType<typeof createElement>;

describe('candidate board navigation reveal', () => {
  it('renders the targeted screening board expanded immediately', () => {
    const CVBoard = (candidateModule as { CVBoard?: CandidateBoardComponent }).CVBoard;
    expect(CVBoard).toBeTypeOf('function');
    if (!CVBoard) return;

    const html = renderToStaticMarkup(createElement(CVBoard, {
      board: {
        listId: 'screening-2',
        listName: 'SCREENING_BACKEND',
        stagesMap: { stage1: '01_Dau_Vao' },
        fieldsMap: {},
        cvs: [],
      },
      revealSequence: 7,
      onMove: () => undefined,
      onInvite: () => undefined,
      onSelectDetail: () => undefined,
      isInviteSent: () => false,
    }));

    expect(html).toContain('aria-label="Ẩn list SCREENING_BACKEND"');
  });
});
