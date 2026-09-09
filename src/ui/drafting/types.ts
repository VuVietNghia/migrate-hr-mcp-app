export type TemplateCategory = 'thoathuan' | 'chidao' | 'kehoach' | 'thongtin' | 'phutro';
export type TemplateTrack = 'nd30_administrative' | 'modern_enterprise';

export type DraftingActionType =
  | 'full_generation'
  | 'make_formal'
  | 'make_concise'
  | 'add_nda'
  | 'bilingual_summary'
  | 'custom';

export interface DraftingTemplate {
  id: string;
  title: string;
  category: TemplateCategory;
  categoryLabel: string;
  track: TemplateTrack;
  icon: string;
  description: string;
  defaultData: Record<string, string>;
  templateText: string;
}

export interface IDraftingTemplateProvider {
  getTemplates(): DraftingTemplate[];
  getTemplateById(id: string): DraftingTemplate | undefined;
  getTemplatesByCategory(category: TemplateCategory | 'all'): DraftingTemplate[];
}

export interface ICompanyContextProvider {
  getContext(): Promise<string>;
}

export type DiffTokenType = 'unchanged' | 'added' | 'removed';

export interface DiffToken {
  type: DiffTokenType;
  value: string;
}

export interface IDocumentDiffService {
  computeWordDiff(originalText: string, modifiedText: string): DiffToken[];
  generateDiffMarkdown(originalDoc: string, currentDoc: string): string;
  highlightLine(originalLine: string, modifiedLine: string): string;
  isDocumentModified(originalText: string, modifiedText: string): boolean;
  countDifferences(originalText: string, modifiedText: string): number;
  generateVietnameseDocFilename(templateTitle: string, formData: Record<string, string>, extension: string): string;
}
