import { describe, expect, it } from 'vitest';
import { ICONS } from '../../src/components/ui/icons';
import { MOBILE_NAV_ITEMS, NAV_GROUPS, NAV_ITEMS, findNav, navHref } from '../../src/lib/nav';

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

  it('exposes the market section as first-class navigation', () => {
    const market = NAV_GROUPS.find((group) => group.id === 'market');
    expect(market?.items.map((item) => item.id)).toEqual(['fundamental', 'signals']);
  });

  it('keeps the mobile bar small enough to stay tappable', () => {
    expect(MOBILE_NAV_ITEMS.length).toBeGreaterThan(0);
    expect(MOBILE_NAV_ITEMS.length).toBeLessThanOrEqual(5);
  });

  it('joins hrefs onto the deploy base path without doubling slashes', () => {
    expect(navHref('/ferik_trading_journal/', '')).toBe('/ferik_trading_journal/');
    expect(navHref('/ferik_trading_journal/', 'signals/')).toBe('/ferik_trading_journal/signals/');
    expect(navHref('/', 'trades/')).toBe('/trades/');
  });
});
