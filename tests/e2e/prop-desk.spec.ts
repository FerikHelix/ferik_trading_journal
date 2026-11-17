import { expect, test } from './fixtures';
import { makeMt5Workbook } from '../fixtures/mt5Workbook';

const DESK_LABEL = 'Example Broker Ltd \u00b7 123456';

async function importWorkbook(page: import('@playwright/test').Page) {
  await page.goto('/import/');
  await page.locator('[data-import-ready="true"]').waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(makeMt5Workbook()),
  });
  await expect(page.getByText('Imported', { exact: true })).toBeVisible();
}

/**
 * A personal desk's calendar: no budget bar, and no percentage until the account
 * has a starting balance — an unknown baseline must never read as flat.
 */
test('personal desk calendar shows no budget bar and no invented percentage', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/trades/');

  const traded = page.locator('.cal-cell--traded').first();
  await expect(traded).toBeVisible();
  await expect(traded).not.toContainText('%');
  await expect(page.locator('.cal-budget')).toHaveCount(0);
});

test('setting a starting balance makes percentages appear', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/settings/');

  await page.getByLabel(`Starting balance for ${DESK_LABEL}`).fill('100000');
  await page.getByRole('button', { name: 'Save facts' }).click();
  await expect(page.getByText(/facts saved/)).toBeVisible();

  await page.goto('/trades/');
  await expect(page.locator('.cal-cell--traded').first()).toContainText('%');
});

test('a prop desk gets a plan, a budget bar, day drill-down and month navigation', async ({ page }) => {
  await importWorkbook(page);

  // Promote the detected desk, then paste the starter plan.
  await page.goto('/plan/');
  await page.getByRole('button', { name: 'Make this a prop firm desk' }).click();
  await page.getByRole('button', { name: 'Apply plan' }).click();
  await expect(page.getByText('Plan saved. Guardrails now read from it.')).toBeVisible();
  await expect(page.getByText('Only you can confirm', { exact: true })).toBeVisible();

  // The prop-only navigation entry is now visible.
  await page.goto('/trades/');
  await expect(page.locator('.nav__link[data-requires="propfirm"]')).toBeVisible();

  const traded = page.locator('.cal-cell--traded').first();
  await expect(traded).toBeVisible();
  await expect(traded.locator('.cal-budget')).toBeVisible();
  const monthBefore = await page.locator('.calendar__month').innerText();

  // Opening the day lists the trades the export contained.
  await traded.click();
  await expect(page.locator('tbody')).toContainText('EURUSD');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  // Month navigation keeps the desk and its budget bars.
  await page.getByRole('button', { name: '←' }).click();
  await expect(page.locator('.calendar__month')).not.toHaveText(monthBefore);
  await page.getByRole('button', { name: '→' }).click();
  await expect(page.locator('.calendar__month')).toHaveText(monthBefore);
});

test('the plan page hides guardrails from a personal desk', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/plan/');
  await expect(page.getByRole('heading', { name: 'This is a personal desk' })).toBeVisible();
  // The sidebar entry ships hidden and stays hidden for a personal desk.
  await expect(page.locator('.nav__link[data-requires="propfirm"]')).toBeHidden();
});

test('an invalid plan is rejected and the previous plan stays in force', async ({ page }) => {
  await importWorkbook(page);
  await page.goto('/plan/');
  await page.getByRole('button', { name: 'Make this a prop firm desk' }).click();
  await page.getByRole('button', { name: 'Apply plan' }).click();
  await expect(page.getByText('Plan saved. Guardrails now read from it.')).toBeVisible();

  const editor = page.locator('#plan-markdown');
  const broken = (await editor.inputValue()).replace('"maxDailyLossPct": 5', '"maxDailyLossPct": -5');
  await editor.fill(broken);
  await page.getByRole('button', { name: 'Apply plan' }).click();

  await expect(page.getByText('Plan not saved — the previous one is still in force')).toBeVisible();
  await expect(page.getByText(/maxDailyLossPct/)).toBeVisible();

  // The stored plan still guards: its facts are unchanged.
  await expect(page.locator('.fact-list')).toContainText('5%');
});
