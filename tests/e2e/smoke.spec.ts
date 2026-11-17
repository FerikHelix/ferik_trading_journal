import { expect, test } from './fixtures';
import { makeMt5Workbook } from '../fixtures/mt5Workbook';

/**
 * Fixture dates come from the current week, never a literal. A hard-coded date
 * silently drifts out of the range the UI is showing and starts failing for
 * reasons unrelated to the code.
 */
function lastWeekWednesday(): Date {
  const now = new Date();
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
  return new Date(thisMonday - 7 * 86_400_000 + 2 * 86_400_000);
}

const pad = (value: number) => String(value).padStart(2, '0');
const TRADE_DAY = lastWeekWednesday();
const csvDay = `${TRADE_DAY.getUTCFullYear()}.${pad(TRADE_DAY.getUTCMonth() + 1)}.${pad(TRADE_DAY.getUTCDate())}`;

const DESK_LABEL = 'Example Broker Ltd \u00b7 123456';

async function importWorkbook(page: import('@playwright/test').Page) {
  await page.goto('/import/');
  await page.locator('[data-import-ready="true"]').waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(makeMt5Workbook({ sheetName: 'Broker Export', extraLeadingRows: 3 })),
  });
  await expect(page.getByText('Imported', { exact: true })).toBeVisible();
}

test('all static routes render and navigation works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Import/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Import history', level: 1 })).toBeVisible();
  for (const route of ['trades', 'journal', 'plan', 'settings']) {
    const response = await page.goto(`/${route}/`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
  }
});

test('empty journal route is safe without a position id', async ({ page }) => {
  await page.goto('/journal/');
  await expect(page.getByText('Pilih trade untuk dijurnal')).toBeVisible();
});

test('MT5 workbook creates its detected desk in one action', async ({ page }) => {
  await page.goto('/import/');
  await page.locator('[data-import-ready="true"]').waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(makeMt5Workbook({ sheetName: 'Broker Export', extraLeadingRows: 3 })),
  });

  // No preview-and-confirm step: choosing the file is the action.
  await expect(page.getByText('Imported', { exact: true })).toBeVisible();
  await expect(page.getByText(DESK_LABEL)).toBeVisible();
  await expect(page.getByLabel('Desk name')).toHaveCount(0);

  await page.getByRole('link', { name: 'See the calendar' }).click();
  await page.getByRole('tab', { name: /^List/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('a file with no account identity asks once for a name', async ({ page }) => {
  await page.goto('/import/');
  await page.locator('[data-import-ready="true"]').waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n900,${csvDay} 10:00:00,Buy,0.20,EURUSD,1.1000,${csvDay} 11:00:00,1.1050,-1,-0.5,20`),
  });

  await expect(page.getByText('This file does not say which desk it belongs to')).toBeVisible();
  await page.getByLabel('Desk name').fill('Personal Exness');
  await page.getByLabel('Broker / server').fill('Exness-Live');
  await page.getByRole('button', { name: 'Save import' }).click();

  await expect(page.getByText('Imported', { exact: true })).toBeVisible();
  await expect(page.getByText('Personal Exness')).toBeVisible();
});

test('theme follows system by default and persists a manual choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Ganti ke mode terang' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/settings/');
  await page.getByLabel('Dark').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('analytics lives inside the trades page as a view', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/trades/');
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Cumulative P&L' })).toBeVisible();
  await expect(page.locator('.chart-box canvas').first()).toBeVisible();
});

test('the trades list filters by result and by date range', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/trades/');
  await page.getByRole('tab', { name: /^List/ }).click();

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);

  // The fixture holds one winner and one loser.
  await page.getByLabel('Result filter').selectOption('loss');
  await expect(rows).toHaveCount(1);

  await page.getByLabel('Result filter').selectOption('');
  await page.getByLabel('From date').fill('2099-01-01');
  await expect(rows).toHaveCount(0);
});
