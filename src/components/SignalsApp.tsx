import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AppSettings } from '../lib/domain/types';
import { scanWatchlist, type InstrumentScan, type ScanFailure } from '../lib/market/signals';
import type { Timeframe } from '../lib/market/types';
import { TIMEFRAMES } from '../lib/market/types';
import { ORDER_BLOCK_STATUS_LABEL, type OrderBlock, type OrderBlockStatus } from '../lib/smc';
import CandleChart from './CandleChart';
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

/** Zones price can still react to. Mitigated and invalidated ones are history. */
function liveBlocks(scan: InstrumentScan): OrderBlock[] {
  return scan.blocks.filter((block) =>
    block.status === 'fresh' || block.status === 'approaching' || block.status === 'touched');
}

/**
 * The one zone worth naming on a single line: whatever price is in, else
 * whatever it is closest to.
 */
function headlineBlock(scan: InstrumentScan): OrderBlock | undefined {
  const live = liveBlocks(scan);
  const touched = live.find((block) => block.status === 'touched');
  if (touched) return touched;
  return [...live].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];
}

function isAlerting(scan: InstrumentScan): boolean {
  return scan.blocks.some((block) => block.status === 'touched' || block.status === 'approaching');
}

function zoneLabel(block: OrderBlock, digits: number): string {
  return `${block.bottom.toFixed(digits)} – ${block.top.toFixed(digits)}`;
}

function ZoneSummary({ scan }: { scan: InstrumentScan }) {
  const block = headlineBlock(scan);
  const digits = scan.instrument.digits;

  if (!block) {
    return <span className="zone-summary muted">Tidak ada zona aktif</span>;
  }

  return (
    <span className="zone-summary">
      <Icon name={block.direction === 'bullish' ? 'trending-up' : 'trending-down'} size={13} />
      <span className="zone-summary__range u-tnum">{zoneLabel(block, digits)}</span>
      <Badge tone={STATUS_TONE[block.status]}>{ORDER_BLOCK_STATUS_LABEL[block.status]}</Badge>
    </span>
  );
}

function ScanChart({ scan }: { scan: InstrumentScan }) {
  return (
    <CandleChart
      candles={scan.candles}
      blocks={scan.blocks}
      digits={scan.instrument.digits}
      label={`${scan.instrument.label} ${scan.timeframe}`}
    />
  );
}

function InstrumentHead({ scan }: { scan: InstrumentScan }) {
  return (
    <div className="signal-head">
      <div className="signal-head__title">
        <strong>{scan.instrument.label}</strong>
        <span className="muted u-xs">{scan.timeframe}</span>
        {scan.proxied && <Badge tone="warning">Proxy</Badge>}
      </div>
      <div className="signal-head__meta">
        <span className="u-tnum">{scan.lastPrice.toFixed(scan.instrument.digits)}</span>
        <ZoneSummary scan={scan} />
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
  const [expanded, setExpanded] = useState<string[]>([]);

  const run = useCallback(async (tf: Timeframe, force: boolean) => {
    const current = await loadAppSettings();
    setSettings(current);
    const result = await scanWatchlist(current, marketCacheIO, {
      timeframe: tf,
      force,
      // Instruments resolve at very different speeds, so each is shown as it
      // lands instead of holding the whole page on a skeleton.
      onProgress: (partial) => {
        setScans(partial.scans);
        setFailures(partial.failures);
        setLoading(false);
      },
    });
    setScans(result.scans);
    setFailures(result.failures);
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
    setExpanded([]);
    setRefreshing(true);
    await run(tf, false).catch(() => undefined);
    setRefreshing(false);
  }

  async function refresh() {
    setRefreshing(true);
    await run(timeframe, true).catch(() => undefined);
    setRefreshing(false);
  }

  function toggleRow(id: string) {
    setExpanded((current) => (
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    ));
  }

  const alerting = scans.filter(isAlerting);
  const quiet = scans.filter((scan) => !isAlerting(scan));

  if (loading) {
    return (
      <div className="grid">
        <Skeleton height={38} />
        {[1, 2].map((n) => (
          <div className="card" key={n}>
            <Skeleton width="40%" />
            <div className="u-mt-4"><Skeleton height={180} /></div>
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

      {alerting.length === 0 ? (
        <Card title="Alert aktif" badge={<Badge>0</Badge>}>
          <EmptyState
            icon="radar"
            title="Tidak ada zona aktif"
            description="Belum ada order block yang disentuh atau didekati harga pada timeframe ini."
            compact
          />
        </Card>
      ) : (
        alerting.map((scan) => (
          <Card key={scan.instrument.id} className="signal-alert">
            <InstrumentHead scan={scan} />
            {scan.proxyNote && <p className="u-xs muted u-mb-3">Sumber pengganti: {scan.proxyNote}</p>}
            <ScanChart scan={scan} />
          </Card>
        ))
      )}

      {quiet.length > 0 && (
        <Card
          title="Watchlist"
          description="Zona terdekat per instrumen. Klik baris untuk membuka chart-nya."
          badge={<Badge>{quiet.length}</Badge>}
        >
          <div className="watch-list">
            {quiet.map((scan) => {
              const open = expanded.includes(scan.instrument.id);
              return (
                <div className="watch-row" key={scan.instrument.id}>
                  <button
                    type="button"
                    className="watch-row__button"
                    aria-expanded={open}
                    onClick={() => toggleRow(scan.instrument.id)}
                  >
                    <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
                    <strong className="watch-row__symbol">{scan.instrument.label}</strong>
                    <span className="watch-row__price u-tnum">
                      {scan.lastPrice.toFixed(scan.instrument.digits)}
                    </span>
                    <ZoneSummary scan={scan} />
                  </button>
                  {open && (
                    <div className="watch-row__chart">
                      {scan.proxyNote && <p className="u-xs muted u-mb-2">Sumber pengganti: {scan.proxyNote}</p>}
                      <ScanChart scan={scan} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
