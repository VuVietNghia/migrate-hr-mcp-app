import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src/ui/jd-chatbot-functional.tsx'), 'utf8');

describe('JD assistant controller integration', () => {
  it('uses the Studio document and library views with local document modes', () => {
    expect(source).toContain('JDChatbotDocumentPanel');
    expect(source).toContain('JDChatbotLibraryDialog');
    expect(source).toContain("useState<JDDocumentMode>('preview')");
    expect(source).not.toContain('setExitConfirmOpen');
    expect(source).not.toContain('JDChatbotEditButton');
  });

  it('keeps the Markdown-only round-trip boundary and stale-load guard', () => {
    expect(source).toMatch(/EDITABLE_JD_FILE\s*=\s*\/\\\.md\$\/i/);
    expect(source).toContain('const requestId = ++jdLoadRequestRef.current');
    expect(source).toContain('requestId !== jdLoadRequestRef.current');
    expect(source).toContain("resolveIntentJD(navigationIntent, 'chatbotJD', files)");
  });

  it('routes header and footer saves through one guarded draft handler', () => {
    expect(source).toContain('const saveDraft = () => save(draft)');
    expect(source.match(/onSave=\{saveDraft\}/g) ?? []).toHaveLength(2);
    expect(source).toContain('if (!content.trim() || !targetName || !targetService || isSavingRef.current) return');
  });

  it('auto-saves only newly generated JDs and shows existing AI edits as changes', () => {
    expect(source).toContain('if (!activeFileName && content)');
    expect(source).toContain('await save(normalizedContent, generatedName, {');
    expect(source).toContain('interpretJDAIResponse(text, Boolean(activeFileName))');
    expect(source).toContain("setDocumentMode(interpreted.nextMode || 'changes')");
    expect(source).not.toContain('setChangedJDLines');
  });

  it('requires and persists a selected department only when creating a new JD', () => {
    expect(source).toContain('JDChatbotDepartmentSelect');
    expect(source).toContain('AppDbRecruitmentDepartmentStore');
    expect(source).toContain('const selectedDepartment = departments.find');
    expect(source).toContain('if (!activeFileName && !selectedDepartment)');
    expect(source).toContain('prepareCreatedJD(content, positionName, selectedDepartment)');
    expect(source).toContain('department: selectedDepartment');
    expect(source).toContain('canSend={Boolean(activeFileName || selectedDepartment)}');
  });

  it('does not expose Markdown download or legacy edit-exit UI', () => {
    expect(source).not.toContain('Tải .md');
    expect(source).not.toContain('jd-download');
    expect(source).not.toContain('exitConfirmOpen');
    expect(source).not.toContain('jd-chatbot-drawer-backdrop');
  });
});
