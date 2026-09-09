/**
 * Drafting Templates Module (Barrel Re-export)
 * Refactored into modular architecture with Dependency Injection support.
 */

export * from './drafting/types';
export * from './drafting/services/DraftingTemplateService';
export * from './drafting/services/CompanyContextProvider';
export * from './drafting/services/BuiltinTemplateProvider';
export * from './drafting/services/DocumentDiffService';
export * from './drafting/templates';
export { BUILTIN_TEMPLATES as DRAFTING_TEMPLATES } from './drafting/templates';
