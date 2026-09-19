import { expect, test } from './fixtures';

test('sidebar groups every section and reaches the new market pages', async ({ page }) => {
  await page.goto('/');

  const sidebar = page.locator('.sidebar');
  // Scoped to the group heading: 'Jurnal' is also a nav item label.
  const headings = sidebar.locator('.nav__label');
  await expect(headings).toHaveText(['Market', 'Jurnal', 'Sistem']);

  await sidebar.getByRole('link', { name: 'Fundamental' }).click();
  await expect(page.getByRole('heading', { name: 'Fundamental', level: 1 })).toBeVisible();

  await page.locator('.sidebar').getByRole('link', { name: 'Signals' }).click();
  await expect(page.getByRole('heading', { name: 'Signals', level: 1 })).toBeVisible();
});

test('topbar breadcrumb names the section and the page', async ({ page }) => {
  await page.goto('/analytics/');
  const breadcrumb = page.locator('.breadcrumb');
  await expect(breadcrumb).toContainText('Jurnal');
  await expect(breadcrumb).toContainText('Trading analytics');
});

test('every route responds and renders its shell', async ({ page }) => {
  const routes = ['', 'fundamental/', 'signals/', 'trades/', 'journal/', 'analytics/', 'review/', 'import/', 'settings/'];
  for (const route of routes) {
    const response = await page.goto(`/${route}`);
    expect(response?.ok(), `/${route} should respond 200`).toBeTruthy();
    await expect(page.locator('.sidebar')).toBeAttached();
    await expect(page.locator('main.content')).toBeVisible();
  }
});

test('mobile hides the sidebar behind a drawer that closes again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).not.toBeInViewport();

  await page.getByRole('button', { name: 'Buka navigasi' }).click();
  await expect(sidebar).toBeInViewport();

  await page.getByRole('button', { name: 'Tutup navigasi' }).click();
  await expect(sidebar).not.toBeInViewport();
});

test('chart marks are theme-specific so light mode stays legible', async ({ page }) => {
  // The regression this guards: --chart-bull was once #22C783 in BOTH themes,
  // which is 1.9:1 on white — effectively invisible.
  await page.goto('/');

  // Read the tokens off detached probe elements rather than by flipping
  // <html>. The theme tokens are declared with attribute selectors, so they
  // apply to any element, and this avoids racing the app's own theme logic
  // (which re-asserts data-theme on <html> as the island hydrates).
  const tokens = await page.evaluate(() => {
    const read = (theme: string) => {
      const probe = document.createElement('div');
      probe.dataset.theme = theme;
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const values = {
        bull: style.getPropertyValue('--chart-bull').trim(),
        bear: style.getPropertyValue('--chart-bear').trim(),
        grid: style.getPropertyValue('--chart-grid').trim(),
      };
      probe.remove();
      return values;
    };
    return { dark: read('dark'), light: read('light') };
  });

  expect(tokens.dark.bull).not.toBe('');
  expect(tokens.light.bull).not.toBe('');
  expect(tokens.light.bull).not.toBe(tokens.dark.bull);
  expect(tokens.light.bear).not.toBe(tokens.dark.bear);
  expect(tokens.light.grid).not.toBe(tokens.dark.grid);
});
