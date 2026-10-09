import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = fs.readFileSync('src/ui/pipeline-dashboard.tsx', 'utf8');
const app = fs.readFileSync('src/ui/App.tsx', 'utf8');

function block(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Pipeline Studio controller wiring', () => {
  it('removes the form/AI JD creation surface and external Pipeline fonts', () => {
    for (const removed of [
      'JDFormState',
      'handleGenerateJD',
      'jdFormOpen',
      'serviceRef.current.askAI',
      'Tạo bằng form',
      'Chỉnh với AI',
      'fonts.googleapis',
      'DM Sans',
      'Inter',
    ]) {
      expect(dashboard).not.toContain(removed);
    }
  });

  it('keeps CV upload and scoring actions inside the queue instead of duplicating them in the page header', () => {
    expect(dashboard).not.toContain('onClick={() => cvInputRef.current?.click()}');
    expect(dashboard).toContain('fileInputRef={cvInputRef}');
    expect(dashboard.match(/const cvInputRef = useRef<HTMLInputElement>\(null\)/g)).toHaveLength(1);
  });

  it('checks a stop request at the CV boundary and only again after recording the current CV', () => {
    const loop = block(dashboard, 'for (const cv of filesToProcess)', 'if (resultsForKanban.length > 0');
    const processStart = loop.indexOf('await service.processCV(');
    const boundaryCheck = loop.indexOf('if (stopAfterCurrentRef.current) break;');
    const postProcess = loop.slice(processStart);

    expect(boundaryCheck).toBeGreaterThan(loop.indexOf('const before = await checkSourceFiles(cv)'));
    expect(boundaryCheck).toBeLessThan(processStart);
    expect(postProcess.indexOf('const after = await checkSourceFiles(cv)')).toBeGreaterThan(-1);
    expect(postProcess.indexOf('setSelectedIds(')).toBeGreaterThan(postProcess.indexOf('const after = await checkSourceFiles(cv)'));
    expect(postProcess.lastIndexOf('if (stopAfterCurrentRef.current) break;')).toBeGreaterThan(postProcess.indexOf('setSelectedIds('));
  });

  it('saves completed partial results after the loop before exposing a candidate CTA', () => {
    const save = block(dashboard, 'if (resultsForKanban.length > 0', "if (saveError) {");
    expect(save).toContain('const savedBoard = await service.createKanbanBatchViaAI(');
    expect(save).toContain('setSavedCandidateBoard(savedBoard)');
    expect(save).toContain('setSavedResultCount(resultsForKanban.length)');
    expect(dashboard).toContain("onNavigate?.('cvScored', { screening: savedCandidateBoard })");
  });

  it('receives the shared Studio navigation callback from App', () => {
    const pipelinePanel = block(app, "panel('pipeline'", "panel('cvScored'");
    expect(pipelinePanel).toContain('onNavigate={handleNavigate}');
    expect(pipelinePanel).not.toContain('setTab(');
    expect(app).toContain("<CVScoredTab active={tab === 'cvScored'} navigationIntent={navigationIntent} onNavigate={handleNavigate} />");
  });

  it('routes Thêm JD to recruitment instead of uploading directly in Pipeline', () => {
    expect(dashboard).not.toContain('const jdInputRef');
    expect(dashboard).not.toContain('handleUploadJD');
    expect(dashboard).toContain("onAddJD={() => onNavigate?.('recruitment')}");
  });
});
