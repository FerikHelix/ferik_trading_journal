import type { DeskKind } from './domain/types';
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
  /** Only rendered when the active desk is of this kind. */
  requires?: DeskKind;
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
      { id: 'dashboard', label: 'Today', title: 'Today', path: '', icon: 'layout-dashboard', mobile: true },
    ],
  },
  {
    id: 'journal',
    label: 'Trading',
    items: [
      { id: 'trades', label: 'Trades', title: 'Trading history', path: 'trades/', icon: 'list', mobile: true },
      { id: 'journal', label: 'Journal', title: 'Trade journal', path: 'journal/', icon: 'notebook-pen', mobile: true },
      { id: 'plan', label: 'Plan', title: 'Challenge plan', path: 'plan/', icon: 'shield-check', requires: 'propfirm' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'import', label: 'Import', title: 'Import history', path: 'import/', icon: 'upload', mobile: true },
      { id: 'settings', label: 'Settings', title: 'Settings & backup', path: 'settings/', icon: 'settings' },
    ],
  },
];

/**
 * Navigation for a desk kind. An unknown kind (no desk selected yet) sees
 * everything, because "all desks" can include a prop firm desk.
 */
export function navGroupsFor(kind: DeskKind | null | undefined): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.requires || kind === null || kind === undefined || item.requires === kind),
    }))
    .filter((group) => group.items.length > 0);
}

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
