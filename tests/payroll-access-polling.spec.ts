import { describe, expect, it } from 'vitest';
import { refreshPayrollAccess } from '../src/ui/payroll/access/usePayrollAccessPolling';

describe('refreshPayrollAccess', () => {
  it('returns true when the fresh context result carries the owner role', async () => {
    const app = {
      callServerTool: async () => ({ userRoles: ['owner'] }),
    };

    expect(await refreshPayrollAccess(app)).toBe(true);
  });

  it('returns false when the fresh context result no longer carries the owner role', async () => {
    const app = {
      callServerTool: async () => ({ userRoles: ['member'] }),
    };

    expect(await refreshPayrollAccess(app)).toBe(false);
  });

  it('returns false when the context call throws, instead of leaving access stuck open', async () => {
    const app = {
      callServerTool: async () => {
        throw new Error('mcpapp.context.get unavailable');
      },
    };

    expect(await refreshPayrollAccess(app)).toBe(false);
  });
});
