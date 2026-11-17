import { describe, expect, it } from 'vitest';
import { ICONS } from '../../src/components/ui/icons';
import { MOBILE_NAV_ITEMS, NAV_GROUPS, NAV_ITEMS, findNav, navGroupsFor, navHref } from '../../src/lib/nav';

/**
 * Catches the class of mistake that is invisible until someone clicks:
 * a duplicated id, a path missing its trailing slash (which breaks the
 * GitHub Pages base-path join), or an icon name with no matching glyph.
 */
describe('navigation', () => {
  it('has unique ids', () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses paths that are either the home route or end in a slash', () => {
    for (const item of NAV_ITEMS) {
      if (item.path === '') continue;
      expect(item.path, `${item.id} path`).toMatch(/\/$/);
      expect(item.path, `${item.id} must be base-relative`).not.toMatch(/^\//);
    }
  });

  it('references only icons that exist', () => {
    for (const item of NAV_ITEMS) {
      expect(ICONS, `${item.id} icon "${item.icon}"`).toHaveProperty(item.icon);
    }
  });

  it('resolves every id through findNav', () => {
    for (const item of NAV_ITEMS) {
      const found = findNav(item.id);
      expect(found?.item.id).toBe(item.id);
    }
    expect(findNav('does-not-exist')).toBeNull();
  });

  it('groups items into home, trading, and system sections', () => {
    expect(NAV_GROUPS.map((group) => group.id)).toEqual(['home', 'journal', 'system']);
    const trading = NAV_GROUPS.find((group) => group.id === 'journal');
    expect(trading?.items.map((item) => item.id)).toEqual(['trades', 'journal', 'plan']);
  });

  it('keeps the navigation to six destinations', () => {
    expect(NAV_ITEMS).toHaveLength(6);
  });

  it('shows the prop-only destination for a prop desk and hides it for a personal desk', () => {
    const ids = (kind: 'personal' | 'propfirm' | null) =>
      navGroupsFor(kind).flatMap((group) => group.items.map((item) => item.id));

    expect(ids('propfirm')).toContain('plan');
    expect(ids('personal')).not.toContain('plan');
    // No desk chosen yet can mean "all desks", which may include a challenge.
    expect(ids(null)).toContain('plan');
  });

  it('keeps the mobile bar small enough to stay tappable', () => {
    expect(MOBILE_NAV_ITEMS.length).toBeGreaterThan(0);
    expect(MOBILE_NAV_ITEMS.length).toBeLessThanOrEqual(5);
  });

  it('joins hrefs onto the deploy base path without doubling slashes', () => {
    expect(navHref('/ferik_trading_journal/', '')).toBe('/ferik_trading_journal/');
    expect(navHref('/ferik_trading_journal/', 'trades/')).toBe('/ferik_trading_journal/trades/');
    expect(navHref('/', 'trades/')).toBe('/trades/');
  });
});
