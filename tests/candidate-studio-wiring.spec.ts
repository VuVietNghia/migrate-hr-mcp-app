import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tab = readFileSync(resolve(__dirname, '../src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');

describe('CVScoredTab candidate studio wiring', () => {
  it('renders the Studio screen from the selected one-or-all scope', () => {
    expect(tab).toContain('<CandidateStudioScreen');
    expect(tab).toContain('collectCandidateApplications(boards, recruitmentJobs)');
    expect(tab).toContain('filterCandidates(scopeCandidates, searchQuery, resultFilter)');
    expect(tab).toContain('getCandidateMetrics(scopeCandidates)');
  });

  it('selecting all campaigns changes the data scope and triggers a real load', () => {
    expect(tab).toContain('const handleScopeChange = ');
    expect(tab).toContain('commitSelectedScope(scopeId)');
    expect(tab).toContain('void loadData()');
  });

  it('clears Room-scoped board data before loading a different Room', () => {
    expect(tab).toContain('loadedRoomIdRef.current === roomId');
    expect(tab).toContain('boardsByListIdRef.current = {}');
    expect(tab).toContain('setBoardsByListId({})');
  });
});
