import { test as base, expect } from '@playwright/test';

/**
 * Hermetic browser tests.
 *
 * The signal bell scans the watchlist on every page load, which means real
 * requests to Binance and Twelve Data. Against live APIs the suite became slow
 * and order-dependent: several parallel workers each opening a fresh context
 * (so an empty candle cache) produced enough concurrent network I/O to delay
 * hydration past assertion timeouts, and upstream rate limits made it worse.
 *
 * Blocking every non-local origin makes the suite deterministic and also
 * exercises the path that matters most for correctness — the app degrading to
 * its cached/empty states when a provider is unreachable.
 */
export const test = base.extend<{ hermetic: void }>({
  hermetic: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1:4321').origin;
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const isLocal = url.startsWith(origin)
          || url.startsWith('data:')
          || url.startsWith('blob:')
          || url.startsWith('about:');
        return isLocal ? route.continue() : route.abort();
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
