import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => fs.readFileSync(file, 'utf8');

function slice(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('Task 2: tao ho so that bai khong bao thanh cong', () => {
  const service = source('src/ui/lifecycle/services/PrivOSLifecycleService.ts');
  const dashboard = source('src/ui/lifecycle/LifecycleDashboard.tsx');

  it('service khong con sinh id local', () => {
    expect(service).not.toContain('generateLocalId');
    expect(service).not.toContain('local-');
  });

  it('handleCreateSubmit xoa thong bao dang khoi tao va nem loi tiep cho form', () => {
    const handler = slice(dashboard, 'const handleCreateSubmit', 'const handleMoveProfile');
    const catchBlock = handler.slice(handler.indexOf('catch'));
    expect(catchBlock).toContain('setStatusMsg(null)');
    expect(catchBlock).toMatch(/throw\s+err/);
    // Thong bao thanh cong chi den sau khi createProfile tra ve.
    expect(handler.indexOf('await service.createProfile')).toBeLessThan(handler.indexOf('thành công'));
  });
});

describe('Task 3: luu file danh gia CV that bai thi CV bao loi', () => {
  const pipeline = source('src/ui/pipeline-service.ts');

  it('catch quanh viec luu file MD nem loi thay vi chi console.warn', () => {
    const saveBlock = slice(
      pipeline,
      'await createOrUpdateFile(this.app, targetRoomFilePath, extractedMarkdown);',
      'updateStatus({',
    );
    const catchBlock = saveBlock.slice(saveBlock.indexOf('catch'));
    expect(catchBlock).toContain('throw new Error(');
    expect(catchBlock).not.toContain('console.warn');
  });
});

describe('Task 4: ten file danh gia gan hau to CV goc', () => {
  const pipeline = source('src/ui/pipeline-service.ts');
  const cvScored = source('src/ui/cv-scored/CVScoredTab.tsx');

  it('processCV gan hau to truoc khi luu file', () => {
    const suffixAt = pipeline.indexOf('withCvFileSuffix(newMdName, cv._id)');
    expect(suffixAt).toBeGreaterThan(-1);
    expect(suffixAt).toBeLessThan(pipeline.indexOf('await createOrUpdateFile(this.app, targetRoomFilePath'));
  });

  it('onInvite bo hau to truoc khi dung ten', () => {
    const onInvite = slice(cvScored, 'onInvite={(cv, posName) => {', 'setInviteCandidateName(cleanName)');
    expect(onInvite).toContain('stripCvFileSuffix(');
  });
});

describe('Final: trang cong ty cung chon tin AI theo aiMessageId', () => {
  const companyHome = source('src/ui/company-home.tsx');

  it('askCrawlAgent khong lay tin AI moi nhat trong phien chung cua room', () => {
    const crawl = slice(companyHome, 'async function askCrawlAgent', "throw new Error('AI polling timeout.')");
    expect(crawl).not.toMatch(/reverse\(\)\s*\.find/);
    expect(crawl).toMatch(/_id\s*===\s*aiMessageId/);
  });
});
