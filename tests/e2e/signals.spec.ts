import { expect, test } from './fixtures';

/**
 * The signals page used to render a chart plus a stack of order-block cards for
 * every watched instrument, which was unreadable and expensive. Charts are now
 * built only for instruments with a live zone, or for a row the user opens.
 *
 * External requests are blocked by the fixture, so the candle cache is seeded
 * directly. That keeps the test deterministic and makes it exercise the layout
 * rather than whichever provider happens to answer.
 */

const HOUR = 3_600_000;
const START = Date.UTC(2026, 8, 1);

/** Deterministic PRNG, so the generated series is identical on every run. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * A drifting random walk. Regular synthetic candles are useless here: with
 * identical consecutive highs no swing is ever confirmed, so the detector
 * finds no structure and no order blocks at all.
 *
 * Seed 42 with this drift yields exactly one bullish zone, left ~32% below
 * price — far outside the "approaching" threshold, so the instrument is quiet
 * and belongs in the collapsed watchlist rather than the alert section.
 */
function quietSeries(startPrice: number): number[][] {
  const random = rng(42);
  const rows: number[][] = [];
  let price = startPrice;
  for (let i = 0; i < 150; i += 1) {
    const move = (random() - 0.5) * 0.012 + 0.004;
    const open = price;
    const close = price * (1 + move);
    const wick = random() * 0.004 + 0.0005;
    rows.push([
      START + i * HOUR,
      open,
      Math.max(open, close) * (1 + wick),
      Math.min(open, close) * (1 - wick),
      close,
    ]);
    price = close;
  }
  return rows;
}

const SEED = [
  { id: 'XAUUSD', rows: quietSeries(4000) },
  { id: 'BTCUSD', rows: quietSeries(80_000) },
  { id: 'EURUSD', rows: quietSeries(1.1) },
];

async function seedCandles(page: import('@playwright/test').Page) {
  // Touch the app once so Dexie creates the database and its object stores.
  await page.goto('/signals/');
  await page.waitForTimeout(1200);

  await page.evaluate(async (seed) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('ferik-trading-journal');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('marketCandles', 'readwrite');
      const store = tx.objectStore('marketCandles');
      for (const entry of seed) {
        store.put({
          id: `${entry.id}:H1`,
          instrumentId: entry.id,
          timeframe: 'H1',
          provider: 'binance',
          proxied: false,
          fetchedAt: Date.now(),
          rows: entry.rows,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Watch exactly the seeded instruments so nothing else is attempted.
    await new Promise<void>((resolve) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const read = store.get('app');
      read.onsuccess = () => {
        const current = read.result ?? {
          id: 'app', schemaVersion: 1, displayTimeZone: 'UTC', theme: 'system', currencyDisplay: 'account',
        };
        store.put({ ...current, watchlist: seed.map((entry) => entry.id), signalTimeframe: 'H1' });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    db.close();
  }, SEED);
}

test('charts are not rendered for every watched instrument', async ({ page }) => {
  await seedCandles(page);
  await page.goto('/signals/');

  const rows = page.locator('.watch-row');
  // Rows appear progressively, one instrument at a time, so this has to be a
  // retrying assertion rather than a snapshot count.
  await expect(rows).toHaveCount(SEED.length, { timeout: 20000 });

  // The point of the rework: a quiet instrument is one row, not a chart plus a
  // pile of cards.
  await expect(page.locator('.candle-chart')).toHaveCount(0);

  await rows.first().locator('.watch-row__button').click();
  await expect(page.locator('.candle-chart')).toHaveCount(1);

  await rows.first().locator('.watch-row__button').click();
  await expect(page.locator('.candle-chart')).toHaveCount(0);
});

test('a quiet row states the zone range and its status', async ({ page }) => {
  await seedCandles(page);
  await page.goto('/signals/');

  const summary = page.locator('.watch-row .zone-summary').first();
  await expect(summary).toBeVisible({ timeout: 20000 });
  // "from – to", which is what replaced the per-block card list.
  await expect(summary.locator('.zone-summary__range')).toContainText('–');
  await expect(summary.locator('.badge')).toBeVisible();
});

test('order block cards are gone from the signals page', async ({ page }) => {
  await seedCandles(page);
  await page.goto('/signals/');

  await expect(page.locator('.watch-row').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.signal-card')).toHaveCount(0);
});
