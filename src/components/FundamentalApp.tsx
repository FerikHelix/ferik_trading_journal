import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AppSettings } from '../lib/domain/types';
import { BIAS_LABEL, computeBias } from '../lib/market/bias';
import { loadCandles } from '../lib/market/client';
import { findInstrument } from '../lib/market/instruments';
import { resolveWatchlist } from '../lib/market/signals';
import type { InstrumentBias } from '../lib/market/types';
import { Badge, Icon, Notice, Skeleton } from './ui';
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
  provider?: string;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (force: boolean) => {
    const current = await loadAppSettings();
    setSettings(current);

    const watchlist = resolveWatchlist(current);
    const collected: Row[] = [];

    for (const [index, instrumentId] of watchlist.entries()) {
      const instrument = findInstrument(instrumentId);
      if (!instrument) continue;

      // Spaced out because several of these endpoints rate-limit a burst;
      // CoinGecko starts refusing after about six requests in twenty seconds.
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
          bias: computeBias({ instrument, candles }),
          price: last?.c ?? null,
          changePercent: last && reference ? ((last.c - reference.c) / reference.c) * 100 : null,
          provider: result.provider,
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

  const failed = rows.filter((row) => row.error);

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
          Bias dihitung dari tren, struktur pasar, dan momentum. Tanpa API key — data di-cache lokal.
        </p>
        <button className="btn" type="button" onClick={refresh} disabled={refreshing}>
          <Icon name="refresh-cw" size={14} />
          {refreshing ? 'Memuat…' : 'Refresh'}
        </button>
      </div>

      {settings && failed.length > 0 && (
        <Notice tone="warning" title="Sebagian instrumen tidak bisa dimuat">
          {failed.map((row) => row.label).join(', ')} gagal diambil — biasanya karena Dukascopy
          sedang tidak bisa dihubungi. Coba Refresh, atau isi data proxy di{' '}
          <a href={`${base}settings/`}>Settings</a>.
        </Notice>
      )}

      <div className="grid bias-grid">
        {rows.map((row) => <BiasCard key={row.instrumentId} row={row} />)}
      </div>

      <Notice tone="info" title="Cara membaca bias">
        Tiga sinyal digabung dengan bobot tetap: tren (MA20 vs MA50) 40%, struktur pasar
        (BOS/CHoCH terakhir) 35%, dan momentum 25%. Keyakinan turun kalau salah satu sinyal belum
        bisa dihitung — misalnya candle belum cukup untuk MA50. Buka <strong>Alasan</strong> di
        tiap kartu untuk melihat angka mentah di balik keputusannya.
      </Notice>
    </div>
  );
}
