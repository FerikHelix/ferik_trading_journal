import { expect, test } from './fixtures';

/**
 * The import fixture used to hard-code 2026.09.01, which sat exactly one week
 * behind the date this test was written — so "Minggu sebelumnya" reached it in
 * a single click. Once the calendar moved past that, one click stopped being
 * enough and the weekly-review assertions began failing for reasons unrelated
 * to the code. Deriving the day from the current week keeps the click count
 * correct permanently.
 */
function lastWeekWednesday(): Date {
  const now = new Date();
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
  // Mid-week of the previous week: never on a boundary a rounding difference
  // could push into an adjacent week.
  return new Date(thisMonday - 7 * 86_400_000 + 2 * 86_400_000);
}

const pad = (value: number) => String(value).padStart(2, '0');
const TRADE_DAY = lastWeekWednesday();
/** Exness CSV format: YYYY.MM.DD */
const csvDay = `${TRADE_DAY.getUTCFullYear()}.${pad(TRADE_DAY.getUTCMonth() + 1)}.${pad(TRADE_DAY.getUTCDate())}`;
/** <input type="date"> format: YYYY-MM-DD */
const isoDay = `${TRADE_DAY.getUTCFullYear()}-${pad(TRADE_DAY.getUTCMonth() + 1)}-${pad(TRADE_DAY.getUTCDate())}`;

test('all static routes render and navigation works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat datang kembali' })).toBeVisible();
  await page.getByRole('link', { name: /Import/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Import riwayat Exness' })).toBeVisible();
  for (const route of ['trades', 'journal', 'analytics', 'review', 'settings']) {
    const response = await page.goto(`/${route}/`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
  }
});

test('empty journal route is safe without a position id', async ({ page }) => {
  await page.goto('/journal/');
  await expect(page.getByText('Pilih trade untuk dijurnal')).toBeVisible();
});

test('theme follows system by default and persists a manual choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  // Playwright already gives each test a fresh context, so localStorage starts
  // empty. An addInitScript clear here would re-run on the reload below and
  // wipe the preference this test is meant to verify, leaving it to race an
  // async IndexedDB write that nothing awaits.
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

test('first CSV import creates an account and commits the preview', async ({ page }) => {
  await page.goto('/import/');
  await page.getByLabel('Nomor account').fill('123456');
  await page.getByRole('button', { name: /Lanjut pilih file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n900,${csvDay} 10:00:00,Buy,0.20,EURUSD,1.1000,${csvDay} 11:00:00,1.1050,-1,-0.5,20`),
  });
  await page.getByRole('button', { name: /Preview CSV/ }).click();
  await expect(page.getByText('Deal valid')).toBeVisible();
  await page.getByRole('button', { name: 'Simpan import' }).click();
  await expect(page.getByRole('heading', { name: 'Import selesai' })).toBeVisible();
  await expect(page.getByText(/1 data baru/)).toBeVisible();
  await page.goto('/analytics/');
  await expect(page.getByRole('heading', { name: 'Cumulative P&L' })).toBeVisible();
  await expect(page.locator('.chart-box canvas').first()).toBeVisible();
  await page.getByLabel('Periode').selectOption('custom');
  await page.getByLabel('Dari').fill(isoDay);
  await page.getByLabel('Sampai').fill(isoDay);
  await expect(page.getByText('1 closed position')).toBeVisible();
  await page.goto('/review/');
  await page.getByRole('button', { name: 'Minggu sebelumnya' }).click();
  await expect(page.getByText('Kelengkapan journal')).toBeVisible();
  await page.getByLabel('Lesson minggu ini').fill('Tunggu konfirmasi sebelum entry.');
  await expect(page.getByText('✓ Tersimpan')).toBeVisible();
});

test('analytics filter bar and themed chart containers render', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/analytics/');
  await expect(page.getByLabel('Periode')).toBeVisible();
  await page.getByLabel('Periode').selectOption('custom');
  await expect(page.getByLabel('Dari')).toBeVisible();
  await expect(page.getByLabel('Sampai')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
