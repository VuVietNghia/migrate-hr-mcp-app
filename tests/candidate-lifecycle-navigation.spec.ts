import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextStudioNavigationIntent } from '../src/ui/studio/studio-navigation-intent';

describe('candidate to lifecycle navigation', () => {
  it('creates a generic create-form intent without candidate identity', () => {
    const intent = nextStudioNavigationIntent(null, 'lifecycle', { lifecycle: { openCreateForm: true } });
    expect(intent.lifecycle).toEqual({ openCreateForm: true });
    expect(JSON.stringify(intent)).not.toContain('candidateId');
  });

  it('wires Candidates through App and opens only the existing Lifecycle form', () => {
    const app = readFileSync(resolve(__dirname, '../src/ui/App.tsx'), 'utf8');
    const candidates = readFileSync(resolve(__dirname, '../src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');
    const lifecycle = readFileSync(resolve(__dirname, '../src/ui/lifecycle/LifecycleDashboard.tsx'), 'utf8');

    expect(app).toContain('onNavigate={handleNavigate}');
    expect(app).toContain('navigationIntent={navigationIntent}');
    expect(candidates).toContain("onNavigate?.('lifecycle', { lifecycle: { openCreateForm: true } })");
    expect(lifecycle).toContain("navigationIntent?.target !== 'lifecycle'");
    expect(lifecycle).toContain('setIsCreating(true)');
    expect(lifecycle).not.toContain('candidateId');
  });
});
