import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two panels below are `.tsx` and this project has no DOM test environment
 * (`vitest.config.ts` pins `environment: 'node'` and only collects `tests/**` + `.spec.ts`), so the
 * rendering contract is asserted against the source the way `manifest.spec.ts` and
 * `packaging.spec.ts` assert against their artifacts. Every assertion here fails on the pre-fix
 * source.
 */
function source(relative: string): string {
  return fs.readFileSync(path.resolve(relative), 'utf8');
}

describe('PayrollTab schema-init failure is shown, not swallowed', () => {
  const tab = source('src/ui/payroll/PayrollTab.tsx');

  it('captures the initializeSchema rejection in state instead of only logging it', () => {
    // Pre-fix the `.catch` only called `console.error`, so `schemaInitialized` stayed false and the
    // user got the "Đang khởi tạo hệ thống Lương..." spinner forever with no reason given.
    expect(tab).toContain('setSchemaError(');
    const catchBlock = tab.slice(tab.indexOf('.catch('), tab.indexOf('return () => {'));
    expect(catchBlock).toContain('setSchemaError(');
  });

  it('renders a Vietnamese failure message carrying the error text instead of the spinner', () => {
    expect(tab).toContain('Không khởi tạo được hệ thống Lương.');
    expect(tab).toContain('{schemaError}');
    // The error branch must come before the spinner branch, otherwise the spinner still wins.
    // `lastIndexOf` because the spinner's text is also quoted in the catch block's comment.
    expect(tab.indexOf('if (schemaError)')).toBeGreaterThan(-1);
    expect(tab.indexOf('if (schemaError)')).toBeLessThan(tab.lastIndexOf('Đang khởi tạo hệ thống Lương'));
  });

  it('keeps the cancelled guard on both outcomes', () => {
    expect(tab).toContain('let cancelled = false;');
    expect(tab).toContain('cancelled = true;');
  });
});

describe('LifecycleDashboard surfaces the actionable roster error', () => {
  const dashboard = source('src/ui/lifecycle/LifecycleDashboard.tsx');

  it('interpolates the thrown message the way PayrollDashboard does', () => {
    // `PrivOSLifecycleService` throws instructions for restoring the Kanban config item; the old
    // generic string dropped them and left the instruction console-only.
    expect(dashboard).toContain('const detail = error instanceof Error ? error.message : String(error);');
    expect(dashboard).toContain('Không thể tải danh sách hồ sơ nhân sự: ${detail}');
    expect(dashboard).not.toContain("'Không thể tải danh sách hồ sơ nhân sự.'");
  });
});

describe('SCOPES.md db:write justification matches the code', () => {
  const row = source('SCOPES.md')
    .split(/\r?\n/)
    .find((line) => line.startsWith('| `db:write`'));

  it('describes the tombstone write rather than a hard delete that no longer exists', () => {
    expect(row).toBeDefined();
    expect(row).toContain('deletedAt');
    expect(row).not.toContain('mcpapp.db.create/update/delete');
  });

  it('agrees with the source: no payroll path calls mcpapp.db.delete', () => {
    // `src/services/hub-tool-caller.ts` still maps that tool name to a scope; an allowlist entry is
    // not a call site, so only the payroll code itself is scanned.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.resolve('src/services/payroll'));
    walk(path.resolve('src/ui/payroll'));
    files.push(path.resolve('src/payroll-tools.ts'));
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes("'mcpapp.db.delete'"));
    expect(offenders).toEqual([]);
  });
});

describe('CVScoredTab reports the invite-mail flow without alert()', () => {
  const tab = source('src/ui/cv-scored/CVScoredTab.tsx');

  it('never calls alert(), which the Hub iframe drops silently', () => {
    // The Hub sandboxes the iframe without `allow-modals`: every `alert()` is ignored and only
    // logs "Ignored call to 'alert()'" to the console, so the operator saw nothing at all.
    // Comments are stripped first — they name `alert()` to explain why it is banned.
    const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/(^|[^.\w])alert\(/m);
  });

  it('renders a toast element for those messages', () => {
    expect(tab).toContain('cv-invite-toast');
    expect(tab).toContain('{inviteToast.message}');
  });

  it('tells the operator the mail is on its way when the modal closes', () => {
    const handler = tab.slice(tab.indexOf('const handleSendInviteEmail = '));
    expect(handler.slice(0, handler.indexOf('\n  };'))).toContain('Email đang được gửi tới');
  });

  it('styles the toast, unlike the unstyled pl-toast it was modelled on', () => {
    expect(source('src/ui/hr-premium-styles.css')).toContain('.cv-invite-toast {');
  });
});
