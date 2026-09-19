import { MarketDataError, type NewsItem } from '../types';

/**
 * Alpha Vantage NEWS_SENTIMENT — CORS-open and pre-scored, which is why it is
 * used for headlines rather than an RSS feed (no major finance RSS feed sends
 * CORS headers, so none can be read from a static page).
 *
 * The free tier allows only 25 requests per day, so callers must go through
 * the cache and refresh at most a few times daily. One request returns up to
 * 1000 items, so that ceiling is workable.
 */
const BASE = 'https://www.alphavantage.co/query';

interface AlphaFeedItem {
  title?: string;
  url?: string;
  time_published?: string;
  summary?: string;
  source?: string;
  overall_sentiment_score?: number;
}

/** Alpha Vantage stamps are `YYYYMMDDTHHMMSS` with no separators or zone. */
function parseStamp(raw: string | undefined): string {
  if (!raw || raw.length < 15) return new Date().toISOString();
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

const CODE_PATTERN = /\b(USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD|XAU|XAG|BTC)\b/g;

const KEYWORD_TAGS: Array<[RegExp, string]> = [
  [/\bgold\b|\bbullion\b|\bemas\b/i, 'XAU'],
  [/\bsilver\b|\bperak\b/i, 'XAG'],
  [/\boil\b|\bcrude\b|\bwti\b|\bbrent\b|\bopec\b/i, 'OIL'],
  [/\bbitcoin\b|\bbtc\b|\bcrypto\b/i, 'BTC'],
  [/\bfed\b|\bfomc\b|federal reserve/i, 'USD'],
  [/\becb\b|european central bank/i, 'EUR'],
  [/\bboe\b|bank of england/i, 'GBP'],
  [/\bboj\b|bank of japan/i, 'JPY'],
  [/\brba\b|reserve bank of australia/i, 'AUD'],
  [/\bboc\b|bank of canada/i, 'CAD'],
  [/\bsnb\b|swiss national bank/i, 'CHF'],
  [/\brbnz\b/i, 'NZD'],
];

function tagsFor(title: string, summary: string): string[] {
  const haystack = `${title} ${summary}`;
  const tags = new Set<string>();
  for (const match of haystack.matchAll(CODE_PATTERN)) tags.add(match[1]);
  for (const [pattern, tag] of KEYWORD_TAGS) if (pattern.test(haystack)) tags.add(tag);
  return [...tags];
}

export async function fetchAlphaVantageNews(apiKey: string, signal?: AbortSignal): Promise<NewsItem[]> {
  if (!apiKey) throw new MarketDataError('API key Alpha Vantage belum diisi.', 'no-key');

  const url = new URL(BASE);
  url.searchParams.set('function', 'NEWS_SENTIMENT');
  url.searchParams.set('topics', 'financial_markets,economy_monetary,economy_macro,energy_transportation');
  url.searchParams.set('sort', 'LATEST');
  url.searchParams.set('limit', '200');
  url.searchParams.set('apikey', apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Tidak bisa menghubungi Alpha Vantage.', 'network');
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) throw new MarketDataError('Respons Alpha Vantage tidak dikenali.', 'upstream');

  // The free tier answers HTTP 200 with a prose "Note"/"Information" when the
  // 25/day cap is hit, so the status code alone never reveals the failure.
  const note = (payload.Note ?? payload.Information) as string | undefined;
  if (note) throw new MarketDataError(note, 'rate-limit');
  const errorMessage = payload['Error Message'] as string | undefined;
  if (errorMessage) throw new MarketDataError(errorMessage, 'upstream');

  const feed = payload.feed as AlphaFeedItem[] | undefined;
  if (!Array.isArray(feed)) throw new MarketDataError('Alpha Vantage tidak mengembalikan berita.', 'upstream');

  return feed.map((item, index): NewsItem => {
    const title = item.title ?? 'Tanpa judul';
    const summary = item.summary ?? '';
    return {
      id: item.url ?? `av-${index}`,
      title,
      url: item.url ?? '#',
      source: item.source ?? 'Alpha Vantage',
      publishedAt: parseStamp(item.time_published),
      summary,
      sentiment: typeof item.overall_sentiment_score === 'number' ? item.overall_sentiment_score : undefined,
      tags: tagsFor(title, summary),
    };
  });
}
