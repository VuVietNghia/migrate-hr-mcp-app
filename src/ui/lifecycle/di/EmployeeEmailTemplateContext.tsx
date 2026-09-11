import { createContext, useContext, type ReactNode } from 'react';
import type { IEmployeeEmailTemplateProvider } from '../email/EmployeeEmailTemplateProvider';

const EmployeeEmailTemplateContext = createContext<IEmployeeEmailTemplateProvider | null>(null);

interface EmployeeEmailTemplateProviderProps {
  provider: IEmployeeEmailTemplateProvider;
  children: ReactNode;
}

export function EmployeeEmailTemplateProvider({ provider, children }: EmployeeEmailTemplateProviderProps) {
  return <EmployeeEmailTemplateContext.Provider value={provider}>{children}</EmployeeEmailTemplateContext.Provider>;
}

export function useEmployeeEmailTemplateProvider(): IEmployeeEmailTemplateProvider {
  const provider = useContext(EmployeeEmailTemplateContext);
  if (!provider) throw new Error('useEmployeeEmailTemplateProvider must be used within an EmployeeEmailTemplateProvider');
  return provider;
}
