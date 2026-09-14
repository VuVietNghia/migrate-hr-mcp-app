import { createContext, useContext, type ReactNode } from 'react';
import type { ActiveTemplateRepository } from '../../cv-scored/invite-template-state';

const EmployeeEmailTemplateContext = createContext<ActiveTemplateRepository | null>(null);

interface EmployeeEmailTemplateProviderProps {
  repository: ActiveTemplateRepository;
  children: ReactNode;
}

export function EmployeeEmailTemplateProvider({ repository, children }: EmployeeEmailTemplateProviderProps) {
  return <EmployeeEmailTemplateContext.Provider value={repository}>{children}</EmployeeEmailTemplateContext.Provider>;
}

/** The Room's employee template store; the composer sends with whichever template is active in Email → Mẫu email. */
export function useEmployeeEmailTemplateRepository(): ActiveTemplateRepository {
  const repository = useContext(EmployeeEmailTemplateContext);
  if (!repository) throw new Error('useEmployeeEmailTemplateRepository must be used within an EmployeeEmailTemplateProvider');
  return repository;
}
