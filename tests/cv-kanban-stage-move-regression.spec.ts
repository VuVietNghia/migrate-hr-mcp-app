import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `CVScoredTab.tsx` is a `.tsx` file and this project has no DOM test environment
 * (`vitest.config.ts` pins `environment: 'node'`), so the wiring is asserted against the
 * source the way `tests/ui-error-surfacing.spec.ts` does. Every assertion here fails on the
 * pre-fix source that called `app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', ... })`
 * directly and treated any resolved promise as success, even when the Hub rejected the move.
 */
function source(relative: string): string {
  return fs.readFileSync(path.resolve(relative), 'utf8');
}

describe('CVScoredTab routes every stage move through the checked helpers', () => {
  const tab = source('src/ui/cv-scored/CVScoredTab.tsx');

  it('never calls mcpapp.lists.moveItemToStage directly', () => {
    // A direct call resolves normally even when the Hub rejects it (isError: true) — only
    // moveCVToStage / moveInvitedCVToPendingStage wrap that in parseToolResult / catch it.
    expect(tab).not.toContain("'mcpapp.lists.moveItemToStage'");
  });

  it('imports moveCVToStage for the drag-and-drop path', () => {
    expect(tab).toContain("import { moveCVToStage } from './cv-stage-move';");
  });

  it('imports the invite-sent-outcome helpers for the post-invite-email path', () => {
    expect(tab).toContain(
      "import { applyInviteSentToBoards, buildInviteSentMessage, moveInvitedCVToPendingStage } from './invite-sent-outcome';",
    );
  });

  it('calls moveCVToStage inside handleMove', () => {
    const start = tab.indexOf('const handleMove = ');
    const end = tab.indexOf('\n  };', start);
    expect(start).toBeGreaterThan(-1);
    const handleMove = tab.slice(start, end);
    expect(handleMove).toContain('await moveCVToStage(app, id, stageId);');
  });

  it('calls moveInvitedCVToPendingStage inside handleSendInviteEmail', () => {
    const start = tab.indexOf('const handleSendInviteEmail = ');
    const end = tab.indexOf('\n  };', start);
    expect(start).toBeGreaterThan(-1);
    const handleSendInviteEmail = tab.slice(start, end);
    expect(handleSendInviteEmail).toContain('await moveInvitedCVToPendingStage(');
  });
});
