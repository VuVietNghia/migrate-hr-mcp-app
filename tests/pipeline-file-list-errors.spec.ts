import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = fs.readFileSync('src/ui/pipeline-dashboard.tsx', 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = dashboard.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = dashboard.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return dashboard.slice(start, end);
}

describe('CV Pipeline surfaces a failed file-list read', () => {
  it('loadFiles writes the failure into the pipeline log, not only the console', () => {
    const loadFiles = block('const loadFiles = async () => {', 'const reconcileSelectedFiles');
    const catchBlock = loadFiles.slice(loadFiles.indexOf('catch'));
    expect(catchBlock).toContain('addLog(');
    expect(catchBlock).toContain('Không tải được danh sách CV');
  });

  it('the 3 s reconcile reads the list before touching the selection, with no local catch', () => {
    const reconcile = block('const reconcileSelectedFiles', 'usePolling(reconcileSelectedFiles');
    const read = reconcile.indexOf('fetchAvailableFiles()');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(reconcile.indexOf('setSelectedIds('));
    // A local catch returning an empty list would unselect every CV on a failed read.
    expect(reconcile).not.toMatch(/catch\s*\(/);
  });
});

describe('CV Pipeline shows list and upload failures on screen', () => {
  it('loadFiles shows a toast, because addLog only writes to the console', () => {
    const loadFiles = block('const loadFiles = async () => {', 'const reconcileSelectedFiles');
    const catchBlock = loadFiles.slice(loadFiles.indexOf('catch'));
    expect(catchBlock).toContain("showToast(");
    expect(catchBlock).toContain("'error'");
  });

  it('handleUploadCV catches a failed list refresh instead of leaving an unhandled rejection', () => {
    const upload = block('const handleUploadCV = async', 'const handleUploadJD');
    const catchStart = upload.search(/\}\s*catch\s*\(\w+\)\s*\{\s*\n\s*console\.error/);
    expect(catchStart).toBeGreaterThan(upload.indexOf('fetchAvailableFiles()'));
    expect(upload.slice(catchStart, upload.indexOf('} finally {'))).toContain('showToast(');
  });
});
