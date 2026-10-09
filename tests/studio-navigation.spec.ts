import { describe, expect, it } from 'vitest';
import {
  ALL_APP_TABS,
  buildStudioNavGroups,
  createInitialMountedTabs,
  findStudioNavItem,
} from '../src/ui/studio/studio-navigation';

describe('Studio navigation model', () => {
  it('mounts data-heavy recruitment tabs and Email when the app starts', () => {
    expect([...createInitialMountedTabs()]).toEqual([
      'home',
      'email',
      'recruitment',
      'pipeline',
      'cvScored',
      'chatbotJD',
    ]);
  });

  it('matches the approved Studio grouping and order', () => {
    const groups = buildStudioNavGroups(false);

    expect(groups.map((group) => group.label)).toEqual([
      'Dữ liệu',
      'Tuyển dụng',
      'Nhân sự & hành chính',
    ]);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      'home',
      'recruitment',
      'pipeline',
      'cvScored',
      'chatbotJD',
      'lifecycle',
      'email',
      'botDrafting',
    ]);
  });

  it('uses Ứng viên as the display label for the existing cvScored route', () => {
    expect(findStudioNavItem('cvScored')).toMatchObject({
      id: 'cvScored',
      label: 'Ứng viên',
      breadcrumb: 'Ứng viên',
    });
  });

  it('includes Payroll exactly once only when access is granted', () => {
    expect(buildStudioNavGroups(false).flatMap((group) => group.items).some((item) => item.id === 'payroll')).toBe(false);
    expect(
      buildStudioNavGroups(true)
        .flatMap((group) => group.items)
        .filter((item) => item.id === 'payroll'),
    ).toHaveLength(1);
  });

  it('provides a label and breadcrumb for every App tab', () => {
    for (const tab of ALL_APP_TABS) {
      const item = findStudioNavItem(tab);
      expect(item.label).not.toBe('');
      expect(item.breadcrumb).not.toBe('');
    }
  });
});
