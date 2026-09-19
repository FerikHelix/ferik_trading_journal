import type { Candle, Timeframe } from '../market/types';

export type Direction = 'bullish' | 'bearish';

export interface Swing {
  index: number;
  t: number;
  price: number;
  kind: 'high' | 'low';
}

export interface StructureEvent {
  index: number;
  t: number;
  /** BOS continues the prevailing direction; CHoCH is the first break against it. */
  kind: 'BOS' | 'CHoCH';
  direction: Direction;
  /** The swing level that was broken. */
  level: number;
}

export type OrderBlockStatus = 'fresh' | 'approaching' | 'touched' | 'mitigated' | 'invalid';

export interface OrderBlock {
  id: string;
  direction: Direction;
  /** Zone bounds, always top >= bottom. */
  top: number;
  bottom: number;
  /** Open time of the origin candle. */
  t: number;
  index: number;
  /** The break that qualified this candle as an order block. */
  event: StructureEvent;
  status: OrderBlockStatus;
  /** First time price traded into the zone, if it ever did. */
  touchedAt?: number;
  /** Signed distance from the last close to the near edge, in percent. */
  distancePct: number;
}

export interface DetectOptions {
  /** Candles either side required for a pivot to count as a swing. */
  swingLookback?: number;
  /** How close (percent of price) counts as "approaching". */
  approachPercent?: number;
  /** Cap on returned blocks. */
  maxBlocks?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  swingLookback: 2,
  approachPercent: 0.35,
  maxBlocks: 6,
};

/**
 * Fractal swing points: a high is a swing when `lookback` candles on both
 * sides are lower. Candles within `lookback` of either end can never qualify,
 * so the newest few bars intentionally produce no swings — that is what stops
 * a still-forming leg from being treated as confirmed structure.
 */
export function findSwings(candles: Candle[], lookback = DEFAULTS.swingLookback): Swing[] {
  const swings: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    const candle = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= lookback; offset += 1) {
      const left = candles[i - offset];
      const right = candles[i + offset];
      if (left.h >= candle.h || right.h >= candle.h) isHigh = false;
      if (left.l <= candle.l || right.l <= candle.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swings.push({ index: i, t: candle.t, price: candle.h, kind: 'high' });
    if (isLow) swings.push({ index: i, t: candle.t, price: candle.l, kind: 'low' });
  }
  return swings.sort((a, b) => a.index - b.index);
}

/**
 * Structure breaks. A break is recorded when a candle CLOSES beyond the most
 * recent confirmed swing — close, not wick, so a single spike through a level
 * does not count. The first break that reverses the prevailing direction is a
 * CHoCH; subsequent breaks in the same direction are BOS.
 */
export function detectStructure(candles: Candle[], swings: Swing[]): StructureEvent[] {
  const events: StructureEvent[] = [];
  let trend: Direction | null = null;
  let brokenHigh = Number.NEGATIVE_INFINITY;
  let brokenLow = Number.POSITIVE_INFINITY;

  let lastHigh: Swing | undefined;
  let lastLow: Swing | undefined;
  let cursor = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];

    // A swing at index n is only confirmed once the candles after it exist, so
    // it becomes eligible from bar n+1 onward. Advancing a cursor keeps this
    // linear instead of rescanning the swing list on every bar.
    while (cursor < swings.length && swings[cursor].index < i) {
      const swing = swings[cursor];
      if (swing.kind === 'high') lastHigh = swing;
      else lastLow = swing;
      cursor += 1;
    }

    if (lastHigh && candle.c > lastHigh.price && lastHigh.price !== brokenHigh) {
      events.push({
        index: i,
        t: candle.t,
        kind: trend === 'bearish' ? 'CHoCH' : 'BOS',
        direction: 'bullish',
        level: lastHigh.price,
      });
      brokenHigh = lastHigh.price;
      trend = 'bullish';
    } else if (lastLow && candle.c < lastLow.price && lastLow.price !== brokenLow) {
      events.push({
        index: i,
        t: candle.t,
        kind: trend === 'bullish' ? 'CHoCH' : 'BOS',
        direction: 'bearish',
        level: lastLow.price,
      });
      brokenLow = lastLow.price;
      trend = 'bearish';
    }
  }

  return events;
}

/**
 * The order block for a break is the last candle closing AGAINST the break
 * direction before the impulse that caused it: the last down-close candle
 * before a bullish break, the last up-close candle before a bearish one.
 */
function originIndex(candles: Candle[], event: StructureEvent): number {
  for (let i = event.index; i >= 0; i -= 1) {
    const candle = candles[i];
    if (event.direction === 'bullish' && candle.c < candle.o) return i;
    if (event.direction === 'bearish' && candle.c > candle.o) return i;
  }
  return -1;
}

function statusFor(
  candles: Candle[],
  block: { direction: Direction; top: number; bottom: number },
  event: StructureEvent,
  approachPercent: number,
): { status: OrderBlockStatus; touchedAt?: number; distancePct: number } {
  const last = candles[candles.length - 1];
  const price = last.c;

  let touchedAt: number | undefined;
  let invalidated = false;

  // Evaluation starts after the impulse, not after the origin candle: the
  // impulse itself necessarily passes through the zone it just left behind.
  for (let i = event.index + 1; i < candles.length; i += 1) {
    const candle = candles[i];
    if (touchedAt === undefined && candle.l <= block.top && candle.h >= block.bottom) {
      touchedAt = candle.t;
    }
    if (block.direction === 'bullish' && candle.c < block.bottom) invalidated = true;
    if (block.direction === 'bearish' && candle.c > block.top) invalidated = true;
  }

  const nearEdge = block.direction === 'bullish' ? block.top : block.bottom;
  const distancePct = nearEdge === 0 ? 0 : ((price - nearEdge) / nearEdge) * 100;

  if (invalidated) return { status: 'invalid', touchedAt, distancePct };

  const insideNow = price <= block.top && price >= block.bottom;
  if (insideNow) return { status: 'touched', touchedAt: touchedAt ?? last.t, distancePct };
  if (touchedAt !== undefined) return { status: 'mitigated', touchedAt, distancePct };
  if (Math.abs(distancePct) <= approachPercent) return { status: 'approaching', distancePct };
  return { status: 'fresh', distancePct };
}

/**
 * Detect order blocks on a single series. Pure — no network, no clock, no
 * storage — so it can be unit-tested against fixed candle fixtures.
 */
export function detectOrderBlocks(candles: Candle[], options: DetectOptions = {}): OrderBlock[] {
  const config = { ...DEFAULTS, ...options };
  if (candles.length < config.swingLookback * 2 + 3) return [];

  const swings = findSwings(candles, config.swingLookback);
  const events = detectStructure(candles, swings);
  const blocks: OrderBlock[] = [];
  const seen = new Set<number>();

  for (const event of events) {
    const index = originIndex(candles, event);
    if (index < 0 || seen.has(index)) continue;
    seen.add(index);

    const origin = candles[index];
    const top = Math.max(origin.h, origin.l);
    const bottom = Math.min(origin.h, origin.l);
    const evaluated = statusFor(candles, { direction: event.direction, top, bottom }, event, config.approachPercent);

    blocks.push({
      id: `${event.direction}-${origin.t}`,
      direction: event.direction,
      top,
      bottom,
      t: origin.t,
      index,
      event,
      ...evaluated,
    });
  }

  // Newest first, with invalidated zones pushed to the back so trimming keeps
  // the blocks that still matter.
  const rank: Record<OrderBlockStatus, number> = {
    touched: 0,
    approaching: 1,
    fresh: 2,
    mitigated: 3,
    invalid: 4,
  };
  return blocks
    .sort((a, b) => b.t - a.t)
    .sort((a, b) => rank[a.status] - rank[b.status])
    .slice(0, config.maxBlocks);
}

export const ORDER_BLOCK_STATUS_LABEL: Record<OrderBlockStatus, string> = {
  fresh: 'Fresh',
  approaching: 'Mendekati',
  touched: 'Menyentuh',
  mitigated: 'Mitigated',
  invalid: 'Invalid',
};

/** Statuses worth raising an alert for when the app is opened. */
export const ALERTABLE_STATUSES: OrderBlockStatus[] = ['approaching', 'touched'];

export interface InstrumentSignals {
  instrumentId: string;
  timeframe: Timeframe;
  blocks: OrderBlock[];
  lastPrice: number;
  lastCandleAt: number;
}
