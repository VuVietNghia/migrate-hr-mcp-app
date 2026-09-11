import { DraftingTemplate, IDraftingTemplateProvider, TemplateCategory } from '../types';
import { BUILTIN_TEMPLATES } from '../templates';

export class BuiltinTemplateProvider implements IDraftingTemplateProvider {
  private templates: DraftingTemplate[];

  constructor(customTemplates?: DraftingTemplate[]) {
    this.templates = customTemplates && customTemplates.length > 0 
      ? [...customTemplates] 
      : [...BUILTIN_TEMPLATES];
  }

  public getTemplates(): DraftingTemplate[] {
    return [...this.templates];
  }

  public getTemplateById(id: string): DraftingTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  public getTemplatesByCategory(category: TemplateCategory | 'all'): DraftingTemplate[] {
    if (category === 'all') {
      return this.getTemplates();
    }
    return this.templates.filter(t => t.category === category);
  }
}
