import type { AppSettings, SignalAlert } from '../domain/types';
import { ALERTABLE_STATUSES, detectOrderBlocks, type OrderBlock } from '../smc';
import { loadCandles, type MarketCacheIO } from './client';
import { findInstrument } from './instruments';
import type { Instrument, Timeframe } from './types';

export interface InstrumentScan {
  instrument: Instrument;
  timeframe: Timeframe;
  blocks: OrderBlock[];
  lastPrice: number;
  lastCandleAt: number;
  provider: string;
  proxied: boolean;
  proxyNote?: string;
  fetchedAt: number;
}

export interface ScanFailure {
  instrumentId: string;
  label: string;
  message: string;
}

export interface ScanResult {
  scans: InstrumentScan[];
  failures: ScanFailure[];
  alerts: SignalAlert[];
}

/**
 * Alert identity.
 *
 * Deliberately excludes the timestamp: the point is that reopening the app
 * while price still sits in the same zone must NOT raise the same alert
 * again. A new alert only appears when the instrument, timeframe, zone or
 * status genuinely differs.
 */
function alertId(instrumentId: string, timeframe: Timeframe, block: OrderBlock): string {
  return `${instrumentId}:${timeframe}:${block.id}:${block.status}`;
}

function toAlert(instrument: Instrument, timeframe: Timeframe, block: OrderBlock, price: number): SignalAlert {
  return {
    id: alertId(instrument.id, timeframe, block),
    instrumentId: instrument.id,
    timeframe,
    direction: block.direction,
    status: block.status as 'approaching' | 'touched',
    top: block.top,
    bottom: block.bottom,
    price,
    createdAt: new Date().toISOString(),
  };
}

export const DEFAULT_WATCHLIST = ['XAUUSD', 'BTCUSD', 'EURUSD', 'GBPUSD'];

export function resolveWatchlist(settings: AppSettings): string[] {
  const list = settings.watchlist?.length ? settings.watchlist : DEFAULT_WATCHLIST;
  return list.filter((id) => findInstrument(id));
}

/**
 * Scans the watchlist for order blocks and returns the alert-worthy ones.
 *
 * Instruments are fetched sequentially with a small gap rather than in
 * parallel: Twelve Data's free tier allows 8 requests per minute and answers a
 * burst with 429s, which would look like "the app is broken" to the user.
 */
export async function scanWatchlist(
  settings: AppSettings,
  io: MarketCacheIO,
  options: { timeframe?: Timeframe; force?: boolean; signal?: AbortSignal; spacingMs?: number } = {},
): Promise<ScanResult> {
  const timeframe = options.timeframe ?? settings.signalTimeframe ?? 'H1';
  const spacing = options.spacingMs ?? 350;
  const watchlist = resolveWatchlist(settings);

  const scans: InstrumentScan[] = [];
  const failures: ScanFailure[] = [];
  const alerts: SignalAlert[] = [];

  for (const [index, instrumentId] of watchlist.entries()) {
    const instrument = findInstrument(instrumentId);
    if (!instrument) continue;

    if (index > 0 && spacing > 0) {
      await new Promise((resolve) => setTimeout(resolve, spacing));
    }

    try {
      const result = await loadCandles(instrumentId, timeframe, settings, io, {
        force: options.force,
        signal: options.signal,
      });
      if (result.candles.length === 0) continue;

      const blocks = detectOrderBlocks(result.candles);
      const last = result.candles[result.candles.length - 1];

      scans.push({
        instrument,
        timeframe,
        blocks,
        lastPrice: last.c,
        lastCandleAt: last.t,
        provider: result.provider,
        proxied: result.proxied,
        proxyNote: result.proxyNote,
        fetchedAt: result.fetchedAt,
      });

      for (const block of blocks) {
        if (!ALERTABLE_STATUSES.includes(block.status)) continue;
        alerts.push(toAlert(instrument, timeframe, block, last.c));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      failures.push({
        instrumentId,
        label: instrument.label,
        message: error instanceof Error ? error.message : 'Gagal memuat data.',
      });
    }
  }

  return { scans, failures, alerts };
}

export function describeAlert(alert: SignalAlert): string {
  const instrument = findInstrument(alert.instrumentId);
  const digits = instrument?.digits ?? 2;
  const zone = `${alert.bottom.toFixed(digits)} – ${alert.top.toFixed(digits)}`;
  const side = alert.direction === 'bullish' ? 'bullish' : 'bearish';
  return alert.status === 'touched'
    ? `Harga menyentuh order block ${side} di ${zone}.`
    : `Harga mendekati order block ${side} di ${zone}.`;
}

export function alertTitle(alert: SignalAlert): string {
  const instrument = findInstrument(alert.instrumentId);
  const label = instrument?.label ?? alert.instrumentId;
  return `${label} ${alert.timeframe} · ${alert.status === 'touched' ? 'Menyentuh OB' : 'Mendekati OB'}`;
}
