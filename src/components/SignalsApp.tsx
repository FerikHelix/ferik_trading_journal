import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '../lib/domain/types';
import { scanWatchlist, type InstrumentScan, type ScanFailure } from '../lib/market/signals';
import type { Timeframe } from '../lib/market/types';
import { TIMEFRAMES } from '../lib/market/types';
import { ORDER_BLOCK_STATUS_LABEL, type OrderBlock, type OrderBlockStatus } from '../lib/smc';
import { Badge, Card, EmptyState, Icon, Notice, Skeleton, Tabs } from './ui';
import { addSignalAlerts, loadAppSettings } from './dataClient';
import { marketCacheIO } from './marketCacheIO';

const base = import.meta.env.BASE_URL;

const STATUS_TONE: Record<OrderBlockStatus, 'profit' | 'loss' | 'warning' | 'info' | 'neutral'> = {
  touched: 'warning',
  approaching: 'info',
  fresh: 'neutral',
  mitigated: 'neutral',
  invalid: 'loss',
};

function BlockRow({ block, digits, price }: { block: OrderBlock; digits: number; price: number }) {
  const direction = block.direction === 'bullish' ? 'bull' : 'bear';
  return (
    <div className={`signal-card signal-card--${direction}`}>
      <span className="signal-card__rail" aria-hidden="true" />
      <div className="signal-card__body">
        <div className="signal-card__head">
          <Icon name={block.direction === 'bullish' ? 'trending-up' : 'trending-down'} size={15} />
          <span className="signal-card__symbol">
            OB {block.direction === 'bullish' ? 'Bullish' : 'Bearish'}
          </span>
          <Badge tone={STATUS_TONE[block.status]}>{ORDER_BLOCK_STATUS_LABEL[block.status]}</Badge>
          <Badge>{block.event.kind}</Badge>
        </div>
        <div className="signal-card__zone">
          Zona {block.bottom.toFixed(digits)} – {block.top.toFixed(digits)} · harga {price.toFixed(digits)}
        </div>
        <div className="signal-card__meta">
          Terbentuk {new Date(block.t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
          {block.touchedAt && ` · disentuh ${new Date(block.touchedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}`}
        </div>
      </div>
      <div className={`signal-card__distance ${block.distancePct >= 0 ? 'profit' : 'loss'}`}>
        {block.distancePct >= 0 ? '+' : ''}{block.distancePct.toFixed(2)}%
      </div>
    </div>
  );
}

export default function SignalsApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('H1');
  const [scans, setScans] = useState<InstrumentScan[]>([]);
  const [failures, setFailures] = useState<ScanFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (tf: Timeframe, force: boolean) => {
    const current = await loadAppSettings();
    setSettings(current);
    const result = await scanWatchlist(current, marketCacheIO, { timeframe: tf, force });
    setScans(result.scans);
    setFailures(result.failures);
    // Persisting here as well as in the bell keeps the two consistent when the
    // user changes timeframe on this page; addSignalAlerts ignores duplicates.
    await addSignalAlerts(result.alerts).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAppSettings()
      .then((current) => {
        const tf = current.signalTimeframe ?? 'H1';
        setTimeframe(tf);
        return run(tf, false);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [run]);

  async function changeTimeframe(tf: Timeframe) {
    setTimeframe(tf);
    setRefreshing(true);
    await run(tf, false).catch(() => undefined);
    setRefreshing(false);
  }

  async function refresh() {
    setRefreshing(true);
    await run(timeframe, true).catch(() => undefined);
    setRefreshing(false);
  }

  const active = scans.flatMap((scan) =>
    scan.blocks
      .filter((block) => block.status === 'touched' || block.status === 'approaching')
      .map((block) => ({ scan, block })));

  if (loading) {
    return (
      <div className="grid">
        <Skeleton height={38} />
        {[1, 2, 3].map((n) => (
          <div className="card" key={n}>
            <Skeleton width="40%" />
            <div className="u-mt-4"><Skeleton height={54} /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid market-page">
      <div className="u-row-between u-wrap">
        <Tabs
          label="Timeframe"
          active={timeframe}
          onChange={changeTimeframe}
          items={TIMEFRAMES.map((tf) => ({ id: tf, label: tf }))}
        />
        <button className="btn" type="button" onClick={refresh} disabled={refreshing}>
          <Icon name="refresh-cw" size={14} />
          {refreshing ? 'Memindai…' : 'Refresh'}
        </button>
      </div>

      <Notice tone="info" title="Cara order block dideteksi">
        Struktur dihitung dari penutupan candle, bukan sumbu — jadi satu spike yang menembus level tanpa
        close di baliknya tidak dianggap break. Order block diambil dari candle berlawanan terakhir sebelum
        impulse yang menembus struktur (BOS/CHoCH). Status <strong>Mendekati</strong> dan{' '}
        <strong>Menyentuh</strong> yang memunculkan alert saat kamu membuka aplikasi.
      </Notice>

      <Card
        title="Alert aktif"
        description="Zona yang sedang disentuh atau didekati harga sekarang."
        badge={<Badge tone={active.length > 0 ? 'warning' : 'neutral'}>{active.length}</Badge>}
      >
        {active.length === 0 ? (
          <EmptyState
            icon="radar"
            title="Tidak ada zona aktif"
            description="Belum ada order block yang disentuh atau didekati harga pada timeframe ini."
            compact
          />
        ) : (
          <div className="signal-list">
            {active.map(({ scan, block }) => (
              <div key={`${scan.instrument.id}-${block.id}`}>
                <div className="u-xs muted u-mb-2">{scan.instrument.label} · {scan.timeframe}</div>
                <BlockRow block={block} digits={scan.instrument.digits} price={scan.lastPrice} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {failures.length > 0 && (
        <Notice tone="warning" title="Sebagian instrumen tidak bisa dimuat">
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
            {failures.map((failure) => (
              <li key={failure.instrumentId}><strong>{failure.label}</strong> — {failure.message}</li>
            ))}
          </ul>
          <div className="u-mt-3">
            <a className="btn" href={`${base}settings/`}>Atur sumber data</a>
          </div>
        </Notice>
      )}

      {scans.map((scan) => (
        <Card
          key={scan.instrument.id}
          title={`${scan.instrument.label} · ${scan.timeframe}`}
          description={`Harga ${scan.lastPrice.toFixed(scan.instrument.digits)} · candle terakhir ${new Date(scan.lastCandleAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}`}
          badge={scan.proxied ? <Badge tone="warning">Proxy</Badge> : <Badge>{scan.provider}</Badge>}
        >
          {scan.proxyNote && <p className="u-xs muted u-mb-3">Sumber pengganti: {scan.proxyNote}</p>}
          {scan.blocks.length === 0 ? (
            <EmptyState icon="radar" title="Belum ada order block" compact />
          ) : (
            <div className="signal-list">
              {scan.blocks.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  digits={scan.instrument.digits}
                  price={scan.lastPrice}
                />
              ))}
            </div>
          )}
        </Card>
      ))}

      {scans.length === 0 && failures.length === 0 && (
        <EmptyState
          icon="radar"
          title="Watchlist kosong"
          description="Pilih instrumen yang mau dipantau di Settings."
          action={<a className="btn primary" href={`${base}settings/`}>Buka Settings</a>}
        />
      )}

      {settings && !settings.desktopNotifications && (
        <Notice tone="info">
          Notifikasi desktop belum aktif. Aktifkan di <a href={`${base}settings/`}>Settings</a> supaya alert
          muncul sebagai notifikasi browser setiap kali kamu membuka aplikasi.
        </Notice>
      )}
    </div>
  );
}
