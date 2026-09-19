import { describe, expect, it } from 'vitest';
import type { Candle } from '../../src/lib/market/types';
import { detectOrderBlocks, detectStructure, findSwings } from '../../src/lib/smc';

const HOUR = 3_600_000;

function candle(index: number, o: number, h: number, l: number, c: number): Candle {
  return { t: index * HOUR, o, h, l, c };
}

/**
 * Hand-built series with one confirmed swing high (105 at index 2), one
 * confirmed swing low (97 at index 5), a single down-close candle at index 6,
 * and an impulse at index 7 that closes above the swing high.
 *
 * The order block must therefore be index 6, zone 98.5 - 101.5.
 */
const BASE: Candle[] = [
  candle(0, 100, 101, 99, 100),
  candle(1, 100, 102, 99, 101),
  candle(2, 101, 105, 100, 104),
  candle(3, 104, 103.5, 101, 102),
  candle(4, 102, 102.5, 100, 101),
  candle(5, 101, 101.2, 97, 98),
  candle(6, 101, 101.5, 98.5, 99),
  candle(7, 99, 107, 98.8, 106),
  candle(8, 106, 108, 105, 107),
  candle(9, 107, 109, 106, 108),
  candle(10, 108, 110, 107, 109),
];

describe('findSwings', () => {
  it('confirms fractal pivots with lower highs and higher lows on both sides', () => {
    const swings = findSwings(BASE, 2);
    const high = swings.find((swing) => swing.kind === 'high');
    const low = swings.find((swing) => swing.kind === 'low');

    expect(high).toMatchObject({ index: 2, price: 105 });
    expect(low).toMatchObject({ index: 5, price: 97 });
  });

  it('never marks the first or last `lookback` candles, since they cannot be confirmed', () => {
    const swings = findSwings(BASE, 2);
    for (const swing of swings) {
      expect(swing.index).toBeGreaterThanOrEqual(2);
      expect(swing.index).toBeLessThanOrEqual(BASE.length - 3);
    }
  });
});

describe('detectStructure', () => {
  it('records a break only when a candle CLOSES beyond the swing', () => {
    const events = detectStructure(BASE, findSwings(BASE, 2));
    const bullish = events.find((event) => event.direction === 'bullish');

    expect(bullish).toMatchObject({ index: 7, direction: 'bullish', level: 105 });
  });

  it('ignores a wick that pierces the level without closing through it', () => {
    // Index 7 spikes to 106 but closes at 104, below the 105 swing high.
    const wickOnly = [...BASE.slice(0, 7), candle(7, 99, 106, 98.8, 104), ...BASE.slice(8)];
    const events = detectStructure(wickOnly, findSwings(wickOnly, 2));

    expect(events.some((event) => event.direction === 'bullish' && event.index === 7)).toBe(false);
  });

  it('labels the first break against the prevailing direction a CHoCH', () => {
    const events = detectStructure(BASE, findSwings(BASE, 2));
    const kinds = events.map((event) => event.kind);
    // The first recorded break has no prevailing trend to reverse.
    expect(kinds[0]).toBe('BOS');
  });
});

describe('detectOrderBlocks', () => {
  it('picks the last down-close candle before a bullish break', () => {
    const blocks = detectOrderBlocks(BASE, { swingLookback: 2 });
    const bullish = blocks.find((block) => block.direction === 'bullish');

    expect(bullish).toBeDefined();
    expect(bullish).toMatchObject({ index: 6, top: 101.5, bottom: 98.5, direction: 'bullish' });
  });

  it('reports an untouched far-away zone as fresh', () => {
    const blocks = detectOrderBlocks(BASE, { swingLookback: 2 });
    const bullish = blocks.find((block) => block.direction === 'bullish');

    expect(bullish?.status).toBe('fresh');
    expect(bullish?.distancePct).toBeGreaterThan(0);
  });

  it('reports `touched` while price sits inside the zone', () => {
    const series = [...BASE, candle(11, 105, 105.5, 99, 100)];
    const blocks = detectOrderBlocks(series, { swingLookback: 2 });
    const bullish = blocks.find((block) => block.direction === 'bullish' && block.index === 6);

    expect(bullish?.status).toBe('touched');
    expect(bullish?.touchedAt).toBeDefined();
  });

  it('reports `mitigated` once price has visited the zone and left it', () => {
    const series = [
      ...BASE,
      candle(11, 105, 105.5, 99, 100),
      candle(12, 100, 106, 99.5, 105.5),
    ];
    const blocks = detectOrderBlocks(series, { swingLookback: 2 });
    const bullish = blocks.find((block) => block.direction === 'bullish' && block.index === 6);

    expect(bullish?.status).toBe('mitigated');
  });

  it('invalidates a bullish zone when a candle closes below it', () => {
    const series = [...BASE, candle(11, 105, 105.5, 95, 96)];
    const blocks = detectOrderBlocks(series, { swingLookback: 2 });
    const bullish = blocks.find((block) => block.direction === 'bullish' && block.index === 6);

    expect(bullish?.status).toBe('invalid');
  });

  it('flags a zone as approaching when price is within the threshold', () => {
    // Close at 101.9 is ~0.39% above the 101.5 top.
    const series = [...BASE, candle(11, 105, 105.5, 101.9, 101.9)];
    const blocks = detectOrderBlocks(series, { swingLookback: 2, approachPercent: 0.5 });
    const bullish = blocks.find((block) => block.direction === 'bullish' && block.index === 6);

    expect(bullish?.status).toBe('approaching');
  });

  it('returns nothing for a series too short to confirm any swing', () => {
    expect(detectOrderBlocks(BASE.slice(0, 4), { swingLookback: 2 })).toEqual([]);
  });

  it('is pure — the same input yields the same output', () => {
    const first = detectOrderBlocks(BASE, { swingLookback: 2 });
    const second = detectOrderBlocks(BASE, { swingLookback: 2 });
    expect(first).toEqual(second);
  });
});
