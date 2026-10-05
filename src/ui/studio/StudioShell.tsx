import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AuditOutlined,
  BankOutlined,
  CloseOutlined,
  FileTextOutlined,
  IdcardOutlined,
  MailOutlined,
  MenuOutlined,
  RobotOutlined,
  ScanOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTheme } from '../theme-provider';
import {
  findStudioNavItem,
  type AppTab,
  type StudioNavGroup,
  type StudioNavIcon,
} from './studio-navigation';

type StudioIcon = typeof BankOutlined;

const ICONS: Record<StudioNavIcon, StudioIcon> = {
  building: BankOutlined,
  briefcase: AuditOutlined,
  scan: ScanOutlined,
  users: TeamOutlined,
  spark: RobotOutlined,
  badge: IdcardOutlined,
  wallet: WalletOutlined,
  mail: MailOutlined,
  file: FileTextOutlined,
};

export interface StudioShellProps {
  activeTab: AppTab;
  groups: readonly StudioNavGroup[];
  onSelectTab: (tab: AppTab) => void;
  roomName: string;
  username: string;
  userRoles: readonly string[] | null | undefined;
  children: ReactNode;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toLocaleUpperCase('vi'))
    .join('') || 'HR';
}

function displayRole(roles: readonly string[] | null | undefined) {
  if (roles?.some((role) => role.toLowerCase() === 'owner')) return 'Chủ Room';
  return roles?.[0] || 'Thành viên';
}

export function StudioShell({
  activeTab,
  groups,
  onSelectTab,
  roomName,
  username,
  userRoles,
  children,
}: StudioShellProps) {
  const { mode, resolved, setMode } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = findStudioNavItem(activeTab);
  const today = useMemo(
    () => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()),
    [],
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const selectTab = (tab: AppTab) => {
    onSelectTab(tab);
    setMobileOpen(false);
  };

  const safeRoomName = roomName.trim() || 'Không gian nhân sự';
  const safeUsername = username.trim() || 'Thành viên';

  return (
    <div
      className={`studio-root${mobileOpen ? ' studio-root--nav-open' : ''}`}
      data-studio-theme={resolved}
      data-studio-theme-mode={mode}
    >
      <aside className="studio-sidebar" aria-label="Thanh điều hướng">
        <div className="studio-brand" aria-label="CV Matcher">
          <span className="studio-brand__mark" aria-hidden="true">CV</span>
          <span>
            <strong>CV Matcher</strong>
            <small>HR Workspace</small>
          </span>
        </div>

        <div className="studio-room-context">
          <span className="studio-room-context__mark" aria-hidden="true">{initials(safeRoomName).slice(0, 1)}</span>
          <span>
            <strong>{safeRoomName}</strong>
            <small>Không gian nhân sự</small>
          </span>
        </div>

        <nav className="studio-nav" aria-label="Điều hướng chính">
          {groups.map((group) => (
            <section className="studio-nav__group" key={group.id} aria-labelledby={`studio-nav-${group.id}`}>
              <h2 id={`studio-nav-${group.id}`}>{group.label}</h2>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = item.id === activeTab;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`studio-nav__item${active ? ' studio-nav__item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => selectTab(item.id)}
                  >
                    <Icon aria-hidden />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="studio-sidebar__footer">
          <label className="studio-theme-control">
            <span>Giao diện</span>
            <select value={mode} aria-label="Giao diện" onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="brand">Brand</option>
            </select>
          </label>
          <div className="studio-account">
            <span className="studio-account__avatar" aria-hidden="true">{initials(safeUsername)}</span>
            <span>
              <strong>{safeUsername}</strong>
              <small>{displayRole(userRoles)}</small>
            </span>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="studio-sidebar-backdrop"
          aria-label="Đóng điều hướng"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="studio-main-shell">
        <header className="studio-topbar">
          <button
            type="button"
            className="studio-mobile-nav-button"
            aria-label={mobileOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <CloseOutlined aria-hidden /> : <MenuOutlined aria-hidden />}
          </button>
          <div className="studio-breadcrumb" aria-label="Đường dẫn">
            <span>HR Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>{activeItem.breadcrumb}</strong>
          </div>
          <time className="studio-topbar__date">{today}</time>
        </header>
        <main className="studio-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
