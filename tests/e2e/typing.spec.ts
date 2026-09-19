import { expect, test } from './fixtures';

/**
 * Guards the Preact `onChange` trap.
 *
 * In React, `onChange` on a text field has `input` semantics and fires on every
 * keystroke. Preact binds the prop to the native `change` event instead, which
 * for a text field only fires on blur — so a controlled field silently stops
 * feeding component state while the user types.
 *
 * Two things make this hard to test, and both were got wrong first time:
 *  - `page.fill()` dispatches `input` AND `change`, so a broken field passes.
 *    These tests use `keyboard.type()`, which dispatches `input` only.
 *  - Asserting the field's own value proves nothing: when the handler never
 *    fires there is no re-render, so the browser's own typed text stays in the
 *    DOM and the assertion passes anyway.
 *
 * So the assertion has to be a side effect that only exists if component state
 * actually changed. Here that is the trades table filtering itself down.
 */

const pad = (value: number) => String(value).padStart(2, '0');

function lastWeekWednesday(): Date {
  const now = new Date();
  const mondayOffset = (now.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
  return new Date(thisMonday - 7 * 86_400_000 + 2 * 86_400_000);
}

const TRADE_DAY = lastWeekWednesday();
const csvDay = `${TRADE_DAY.getUTCFullYear()}.${pad(TRADE_DAY.getUTCMonth() + 1)}.${pad(TRADE_DAY.getUTCDate())}`;

const CSV = [
  'Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit',
  `900,${csvDay} 10:00:00,Buy,0.20,EURUSD,1.1000,${csvDay} 11:00:00,1.1050,-1,-0.5,20`,
  `901,${csvDay} 12:00:00,Sell,0.10,XAUUSD,4300.00,${csvDay} 13:00:00,4290.00,-1,-0.5,15`,
].join('\n');

async function importTwoTrades(page: import('@playwright/test').Page) {
  await page.goto('/import/');
  await page.getByLabel('Nomor account').fill('123456');
  await page.getByRole('button', { name: /Lanjut pilih file/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await page.getByRole('button', { name: /Preview CSV/ }).click();
  await page.getByRole('button', { name: 'Simpan import' }).click();
  await expect(page.getByRole('heading', { name: 'Import selesai' })).toBeVisible();
}

test('typing in the trades search filters the table before any blur', async ({ page }) => {
  await importTwoTrades(page);
  await page.goto('/trades/');

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);

  await page.locator('.toolbar input').first().click();
  await page.keyboard.type('XAU', { delay: 20 });

  // Filtering is driven purely by component state, so this count can only drop
  // if the keystrokes reached it. The field is never blurred.
  await expect(rows).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('XAUUSD');
  await expect(page.locator('tbody')).not.toContainText('EURUSD');
});
