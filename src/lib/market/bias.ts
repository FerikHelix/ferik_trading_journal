import { detectStructure, findSwings } from '../smc';
import type { BiasDirection, Candle, Instrument, InstrumentBias, NewsItem } from './types';

/**
 * Directional bias per instrument.
 *
 * Deliberately simple and fully explainable: three independent signals, each
 * contributing a bounded vote, with the reasons surfaced verbatim in the UI.
 * A score the user cannot interrogate is worse than no score, so every branch
 * here pushes a sentence onto `reasons`.
 */

export interface BiasInput {
  instrument: Instrument;
  /** Higher-timeframe candles, oldest first. */
  candles: Candle[];
  news: NewsItem[];
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((total, value) => total + value, 0) / period;
}

/** Weighted vote in [-1, 1]; positive is bullish. */
interface Vote {
  score: number;
  reason: string;
}

function trendVote(candles: Candle[]): Vote | null {
  const closes = candles.map((candle) => candle.c);
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);
  if (fast === null || slow === null) return null;

  const spreadPct = ((fast - slow) / slow) * 100;
  // A 0.1% separation is noise on FX but meaningful on crypto; clamping keeps
  // one instrument from dominating the blend purely through volatility.
  const score = Math.max(-1, Math.min(1, spreadPct / 1.5));
  if (Math.abs(spreadPct) < 0.05) {
    return { score: 0, reason: 'MA20 dan MA50 nyaris berimpit — tren belum jelas.' };
  }
  return {
    score,
    reason: fast > slow
      ? `MA20 di atas MA50 (+${spreadPct.toFixed(2)}%) — tren naik.`
      : `MA20 di bawah MA50 (${spreadPct.toFixed(2)}%) — tren turun.`,
  };
}

function structureVote(candles: Candle[]): Vote | null {
  const events = detectStructure(candles, findSwings(candles, 2));
  const last = events[events.length - 1];
  if (!last) return null;
  const label = last.kind === 'CHoCH' ? 'CHoCH' : 'BOS';
  return {
    score: last.direction === 'bullish' ? 0.8 : -0.8,
    reason: `${label} ${last.direction === 'bullish' ? 'bullish' : 'bearish'} terakhir di ${last.level.toFixed(4)}.`,
  };
}

function momentumVote(candles: Candle[]): Vote | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const reference = candles[Math.max(0, candles.length - 25)];
  const changePct = ((last.c - reference.c) / reference.c) * 100;
  const score = Math.max(-1, Math.min(1, changePct / 2));
  return {
    score,
    reason: `Perubahan ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% dalam ${Math.min(24, candles.length - 1)} candle terakhir.`,
  };
}

function newsVote(instrument: Instrument, news: NewsItem[]): Vote | null {
  const relevant = news.filter((item) => item.tags.some((tag) => instrument.drivers.includes(tag)));
  const scored = relevant.filter((item) => typeof item.sentiment === 'number');
  if (scored.length === 0) return null;

  const average = scored.reduce((total, item) => total + (item.sentiment ?? 0), 0) / scored.length;

  // A headline tagged with the QUOTE currency pushes the pair the other way:
  // bullish USD news is bearish for EURUSD. drivers[0] is the base.
  const base = instrument.drivers[0];
  const baseWeighted = scored.reduce((total, item) => {
    const touchesBase = item.tags.includes(base);
    return total + (item.sentiment ?? 0) * (touchesBase ? 1 : -1);
  }, 0) / scored.length;

  const score = Math.max(-1, Math.min(1, baseWeighted * 3));
  return {
    score,
    reason: `${scored.length} berita relevan, sentimen rata-rata ${average >= 0 ? '+' : ''}${average.toFixed(2)}.`,
  };
}

const WEIGHTS = { trend: 0.35, structure: 0.3, momentum: 0.2, news: 0.15 };

export function computeBias({ instrument, candles, news }: BiasInput): InstrumentBias {
  const votes: Array<[keyof typeof WEIGHTS, Vote | null]> = [
    ['trend', trendVote(candles)],
    ['structure', structureVote(candles)],
    ['momentum', momentumVote(candles)],
    ['news', newsVote(instrument, news)],
  ];

  let weighted = 0;
  let totalWeight = 0;
  const reasons: string[] = [];

  for (const [key, vote] of votes) {
    if (!vote) continue;
    weighted += vote.score * WEIGHTS[key];
    totalWeight += WEIGHTS[key];
    reasons.push(vote.reason);
  }

  if (totalWeight === 0) {
    return {
      instrumentId: instrument.id,
      direction: 'neutral',
      confidence: 0,
      reasons: ['Belum ada data yang cukup untuk menghitung bias.'],
      updatedAt: new Date().toISOString(),
    };
  }

  // Renormalise by the weight actually present, so a missing news feed lowers
  // confidence rather than silently dragging the score toward zero.
  const normalised = weighted / totalWeight;
  const coverage = totalWeight / Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  let direction: BiasDirection = 'neutral';
  if (normalised > 0.15) direction = 'bullish';
  else if (normalised < -0.15) direction = 'bearish';

  if (direction === 'neutral') {
    reasons.push('Sinyal saling bertentangan — tidak ada bias dominan.');
  }

  return {
    instrumentId: instrument.id,
    direction,
    confidence: Math.min(1, Math.abs(normalised) * coverage),
    reasons,
    updatedAt: new Date().toISOString(),
  };
}

export const BIAS_LABEL: Record<BiasDirection, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Netral',
};
