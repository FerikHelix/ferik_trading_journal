import type { MarketCacheIO } from '../lib/market/client';
import { getCachedCandles, putCachedCandles } from './dataClient';

/**
 * Binds the market client's storage interface to Dexie.
 *
 * The client itself takes this as a parameter rather than importing the
 * database directly, which is what lets the cache logic be unit-tested with a
 * plain in-memory object and no IndexedDB shim.
 */
export const marketCacheIO: MarketCacheIO = {
  getCandles: getCachedCandles,
  putCandles: putCachedCandles,
};
