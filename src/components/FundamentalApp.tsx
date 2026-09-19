import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '../lib/domain/types';
import { BIAS_LABEL, computeBias } from '../lib/market/bias';
import { loadCandles, loadNews } from '../lib/market/client';
import { findInstrument } from '../lib/market/instruments';
import { resolveWatchlist } from '../lib/market/signals';
import type { InstrumentBias, NewsItem } from '../lib/market/types';
import { Badge, Card, EmptyState, Icon, Notice, Skeleton, Tabs } from './ui';
import { loadAppSettings } from './dataClient';
import { marketCacheIO } from './marketCacheIO';

interface Row {
  instrumentId: string;
  label: string;
  name: string;
  digits: number;
  bias: InstrumentBias | null;
  price: number | null;
  changePercent: number | null;
  proxyNote?: string;
  error?: string;
}

const base = import.meta.env.BASE_URL;

function toneFor(direction: InstrumentBias['direction']) {
  if (direction === 'bullish') return 'profit' as const;
  if (direction === 'bearish') return 'loss' as const;
  return 'neutral' as const;
}

function BiasCard({ row }: { row: Row }) {
  const bias = row.bias;
  const confidence = Math.round((bias?.confidence ?? 0) * 100);
  const direction = bias?.direction ?? 'neutral';

  return (
    <article className="card bias-card">
      <div className="bias-card__head">
        <div>
          <div className="bias-card__symbol">{row.label}</div>
          <div className="u-xs muted">{row.name}</div>
        </div>
        <Badge tone={toneFor(direction)}>{BIAS_LABEL[direction]}</Badge>
      </div>

      {row.error ? (
        <p className="u-xs muted u-mb-0">{row.error}</p>
      ) : (
        <>
          <div>
            <div className="bias-card__price">
              {row.price === null ? '—' : row.price.toFixed(row.digits)}
            </div>
            {row.changePercent !== null && (
              <div className={`bias-card__change ${row.changePercent >= 0 ? 'profit' : 'loss'}`}>
                {row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%
              </div>
            )}
          </div>

          <div className="bias-meter">
            <div className="bias-meter__track">
              <div
                className={`bias-meter__fill bias-meter__fill--${direction === 'bearish' ? 'bear' : 'bull'}`}
                style={
                  direction === 'bearish'
                    ? { right: '50%', width: `${confidence / 2}%` }
                    : { left: '50%', width: `${confidence / 2}%` }
                }
              />
            </div>
            <div className="bias-meter__labels">
              <span>Bearish</span>
              <span>Keyakinan {confidence}%</span>
              <span>Bullish</span>
            </div>
          </div>

          {bias && bias.reasons.length > 0 && (
            <details>
              <summary className="u-xs muted" style={{ cursor: 'pointer' }}>Alasan</summary>
              <ul className="u-xs muted" style={{ margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
                {bias.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </details>
          )}
        </>
      )}

      {row.proxyNote && (
        <div className="bias-card__foot">
          <span><Icon name="activity" size={12} /> Proxy: {row.proxyNote}</span>
        </div>
      )}
    </article>
  );
}

export default function FundamentalApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsState, setNewsState] = useState<{ stale: boolean; error?: string }>({ stale: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newsFilter, setNewsFilter] = useState<string>('all');

  const run = useCallback(async (force: boolean) => {
    const current = await loadAppSettings();
    setSettings(current);

    // News is fetched BEFORE the candles so sentiment can feed straight into
    // computeBias. Doing it the other way round would mean either a second
    // pass over every instrument or a bias that silently ignores the feed.
    let feedItems: NewsItem[] = [];
    try {
      const feed = await loadNews(current, marketCacheIO, { force });
      feedItems = feed.items;
      setNews(feed.items);
      setNewsState({ stale: feed.stale });
    } catch (error) {
      setNewsState({ stale: false, error: error instanceof Error ? error.message : 'Gagal memuat berita.' });
    }

    const watchlist = resolveWatchlist(current);
    const collected: Row[] = [];

    for (const [index, instrumentId] of watchlist.entries()) {
      const instrument = findInstrument(instrumentId);
      if (!instrument) continue;

      // Spaced out to stay inside Twelve Data's 8-requests-per-minute ceiling.
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 350));

      try {
        const result = await loadCandles(instrumentId, 'H4', current, marketCacheIO, { force });
        const candles = result.candles;
        const last = candles[candles.length - 1];
        const reference = candles[Math.max(0, candles.length - 7)];
        collected.push({
          instrumentId,
          label: instrument.label,
          name: instrument.name,
          digits: instrument.digits,
          bias: computeBias({ instrument, candles, news: feedItems }),
          price: last?.c ?? null,
          changePercent: last && reference ? ((last.c - reference.c) / reference.c) * 100 : null,
          proxyNote: result.proxyNote,
        });
      } catch (error) {
        collected.push({
          instrumentId,
          label: instrument.label,
          name: instrument.name,
          digits: instrument.digits,
          bias: null,
          price: null,
          changePercent: null,
          error: error instanceof Error ? error.message : 'Gagal memuat data.',
        });
      }
      setRows([...collected]);
    }

  }, []);

  useEffect(() => {
    run(false).catch(() => undefined).finally(() => setLoading(false));
  }, [run]);

  async function refresh() {
    setRefreshing(true);
    await run(true).catch(() => undefined);
    setRefreshing(false);
  }

  const missingKey = settings && !settings.twelveDataKey;
  const missingNewsKey = settings && !settings.alphaVantageKey;

  const tags = ['all', ...new Set(news.flatMap((item) => item.tags))].slice(0, 9);
  const visibleNews = newsFilter === 'all'
    ? news
    : news.filter((item) => item.tags.includes(newsFilter));

  if (loading && rows.length === 0) {
    return (
      <div className="grid bias-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="card" key={n}>
            <Skeleton />
            <div className="u-mt-4"><Skeleton height={26} width="60%" /></div>
            <div className="u-mt-3"><Skeleton height={10} /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid market-page">
      <div className="u-row-between u-wrap">
        <p className="provider-status u-mb-0">
          <Icon name="activity" size={13} />
          Data dari Binance (tanpa key) dan Twelve Data (key kamu). Cache lokal dipakai dulu agar kuota gratis tidak cepat habis.
        </p>
        <button className="btn" type="button" onClick={refresh} disabled={refreshing}>
          <Icon name="refresh-cw" size={14} />
          {refreshing ? 'Memuat…' : 'Refresh'}
        </button>
      </div>

      {missingKey && (
        <Notice tone="warning" title="Sebagian instrumen belum punya sumber data">
          Tanpa API key Twelve Data, hanya BTC dan emas (lewat proxy PAXG) yang bisa diambil dari browser.
          Forex major butuh key gratis Twelve Data. XAG dan WTI tidak tersedia di tier gratis mana pun —
          butuh data proxy sendiri. Atur di <a href={`${base}settings/`}>Settings</a>.
        </Notice>
      )}

      <div className="grid bias-grid">
        {rows.map((row) => <BiasCard key={row.instrumentId} row={row} />)}
      </div>

      <Card
        title="Berita & sentimen"
        description="Headline pasar yang ditandai per mata uang dan instrumen."
        badge={newsState.stale ? <Badge tone="warning">Cache</Badge> : undefined}
      >
        {missingNewsKey ? (
          <EmptyState
            icon="newspaper"
            title="Belum ada sumber berita"
            description={
              <>Isi API key gratis Alpha Vantage di Settings untuk menarik headline beserta skor sentimen.
                Feed RSS biasa tidak bisa dipakai karena tidak mengirim header CORS.</>
            }
            action={<a className="btn primary" href={`${base}settings/`}>Buka Settings</a>}
            compact
          />
        ) : newsState.error ? (
          <Notice tone="error">{newsState.error}</Notice>
        ) : news.length === 0 ? (
          <EmptyState icon="newspaper" title="Belum ada berita" compact />
        ) : (
          <>
            <Tabs
              label="Filter berita"
              active={newsFilter}
              onChange={setNewsFilter}
              items={tags.map((tag) => ({ id: tag, label: tag === 'all' ? 'Semua' : tag }))}
            />
            <div className="news-list">
              {visibleNews.slice(0, 25).map((item) => (
                <article className="news-item" key={item.id}>
                  <a className="news-item__title" href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                  <div className="news-item__meta">
                    <span>{item.source}</span>
                    <span>{new Date(item.publishedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    {typeof item.sentiment === 'number' && (
                      <Badge tone={item.sentiment > 0.1 ? 'profit' : item.sentiment < -0.1 ? 'loss' : 'neutral'}>
                        {item.sentiment >= 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                      </Badge>
                    )}
                    {item.tags.slice(0, 4).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
