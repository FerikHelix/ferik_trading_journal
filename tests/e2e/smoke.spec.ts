import { expect, test } from '@playwright/test';

test('all static routes render and navigation works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat datang kembali' })).toBeVisible();
  await page.getByRole('link', { name: /Import/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Import riwayat Exness' })).toBeVisible();
  for (const route of ['trades', 'journal', 'analytics', 'settings']) {
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
  await page.addInitScript(() => localStorage.clear());
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
    buffer: Buffer.from('Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n900,2026.09.01 10:00:00,Buy,0.20,EURUSD,1.1000,2026.09.01 11:00:00,1.1050,-1,-0.5,20'),
  });
  await page.getByRole('button', { name: /Preview CSV/ }).click();
  await expect(page.getByText('Deal valid')).toBeVisible();
  await page.getByRole('button', { name: 'Simpan import' }).click();
  await expect(page.getByRole('heading', { name: 'Import selesai' })).toBeVisible();
  await expect(page.getByText(/1 data baru/)).toBeVisible();
});
