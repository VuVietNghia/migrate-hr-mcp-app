import { createContext, useContext, ReactNode } from 'react';
import { ILifecycleService } from '../types';

const LifecycleServiceContext = createContext<ILifecycleService | null>(null);

export function useLifecycleService(): ILifecycleService {
  const context = useContext(LifecycleServiceContext);
  if (!context) {
    throw new Error('useLifecycleService must be used within a LifecycleServiceProvider');
  }
  return context;
}

interface LifecycleServiceProviderProps {
  service: ILifecycleService;
  children: ReactNode;
}

export function LifecycleServiceProvider({ service, children }: LifecycleServiceProviderProps) {
  return (
    <LifecycleServiceContext.Provider value={service}>
      {children}
    </LifecycleServiceContext.Provider>
  );
}
