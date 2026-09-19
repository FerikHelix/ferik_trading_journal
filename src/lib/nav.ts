import type { IconName } from '../components/ui/icons';

export interface NavItem {
  /** Matches the `active` prop each page passes to AppLayout. */
  id: string;
  /** Sidebar label. */
  label: string;
  /** Page <title> and the breadcrumb leaf. */
  title: string;
  /** BASE_URL-relative; '' is the home route, everything else ends in '/'. */
  path: string;
  icon: IconName;
  /** Shown in the compact bottom bar on small screens. */
  mobile?: boolean;
}

export interface NavGroup {
  id: string;
  /** null renders the items with no section heading. */
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: null,
    items: [
      { id: 'dashboard', label: 'Overview', title: 'Overview', path: '', icon: 'layout-dashboard', mobile: true },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    items: [
      { id: 'fundamental', label: 'Fundamental', title: 'Fundamental', path: 'fundamental/', icon: 'globe', mobile: true },
      { id: 'signals', label: 'Signals', title: 'Signals', path: 'signals/', icon: 'radar', mobile: true },
    ],
  },
  {
    id: 'journal',
    label: 'Jurnal',
    items: [
      { id: 'trades', label: 'Trades', title: 'Riwayat trading', path: 'trades/', icon: 'list', mobile: true },
      { id: 'journal', label: 'Jurnal', title: 'Jurnal posisi', path: 'journal/', icon: 'notebook-pen', mobile: true },
      { id: 'analytics', label: 'Analytics', title: 'Trading analytics', path: 'analytics/', icon: 'bar-chart' },
      { id: 'review', label: 'Weekly Review', title: 'Weekly Review', path: 'review/', icon: 'calendar-check' },
    ],
  },
  {
    id: 'system',
    label: 'Sistem',
    items: [
      { id: 'import', label: 'Import', title: 'Import riwayat Exness', path: 'import/', icon: 'upload' },
      { id: 'settings', label: 'Settings', title: 'Settings & backup', path: 'settings/', icon: 'settings' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => item.mobile);

export function findNav(activeId: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === activeId);
    if (item) return { group, item };
  }
  return null;
}

export function navHref(base: string, path: string): string {
  return `${base}${path.replace(/^\//, '')}`;
}
