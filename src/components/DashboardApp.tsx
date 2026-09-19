import { useEffect, useMemo, useState } from 'preact/hooks';
import { calculateAnalytics } from '../lib/analytics';
import { isMeaningfulJournal } from '../lib/review';
import type { Account, Journal, Position } from '../lib/domain/types';
import { BIAS_LABEL, computeBias } from '../lib/market/bias';
import { scanWatchlist, type InstrumentScan, type ScanFailure } from '../lib/market/signals';
import type { BiasDirection } from '../lib/market/types';
import { ORDER_BLOCK_STATUS_LABEL, type OrderBlock } from '../lib/smc';
import { Badge, Card, EmptyState, Icon, Notice, SideBadge, Skeleton, StatTile } from './ui';
import { loadAccounts, loadAppSettings, loadJournals, loadPositions } from './dataClient';
import { marketCacheIO } from './marketCacheIO';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;

/**
 * The dashboard reads the higher timeframe only. "Bias hari ini" and the zones
 * worth knowing about before the session are both H4 questions, and using one
 * timeframe means one pass over the watchlist instead of two. The Signals page
 * keeps its own timeframe for actually trading.
 */
const DASHBOARD_TIMEFRAME = 'H4' as const;

function money(value: string | null, currency: string | null): string {
  if (value === null) return 'Pilih account';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: currency ?? 'USD' }).format(Number(value));
}

function toneFor(direction: BiasDirection) {
  if (direction === 'bullish') return 'profit' as const;
  if (direction === 'bearish') return 'loss' as const;
  return 'neutral' as const;
}

function BiasTile({ scan }: { scan: InstrumentScan }) {
  const bias = computeBias({ instrument: scan.instrument, candles: scan.candles });
  const confidence = Math.round(bias.confidence * 100);
  const last = scan.candles[scan.candles.length - 1];
  const reference = scan.candles[Math.max(0, scan.candles.length - 7)];
  const change = last && reference ? ((last.c - reference.c) / reference.c) * 100 : null;

  return (
    <a className="bias-tile" href={`${base}fundamental/`}>
      <div className="bias-tile__head">
        <strong>{scan.instrument.label}</strong>
        <Badge tone={toneFor(bias.direction)}>{BIAS_LABEL[bias.direction]}</Badge>
      </div>
      <div className="bias-tile__price u-tnum">{scan.lastPrice.toFixed(scan.instrument.digits)}</div>
      <div className="bias-tile__foot">
        {change !== null && (
          <span className={change >= 0 ? 'profit' : 'loss'}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </span>
        )}
        <span className="muted">Keyakinan {confidence}%</span>
      </div>
    </a>
  );
}

function SignalRow({ scan, block }: { scan: InstrumentScan; block: OrderBlock }) {
  const digits = scan.instrument.digits;
  return (
    <a className="signal-row" href={`${base}signals/`}>
      <Icon name={block.direction === 'bullish' ? 'trending-up' : 'trending-down'} size={14} />
      <strong>{scan.instrument.label}</strong>
      <span className="muted u-tnum u-truncate">
        {block.bottom.toFixed(digits)} – {block.top.toFixed(digits)}
      </span>
      <Badge tone={block.status === 'touched' ? 'warning' : 'info'}>
        {ORDER_BLOCK_STATUS_LABEL[block.status]}
      </Badge>
      <span className={`u-tnum ${block.distancePct >= 0 ? 'profit' : 'loss'}`}>
        {block.distancePct >= 0 ? '+' : ''}{block.distancePct.toFixed(2)}%
      </span>
    </a>
  );
}

export default function DashboardApp() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalLoading, setJournalLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountId] = useActiveAccount();

  const [scans, setScans] = useState<InstrumentScan[]>([]);
  const [marketFailures, setMarketFailures] = useState<ScanFailure[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadPositions(), loadAccounts(), loadJournals()])
      .then(([loadedPositions, loadedAccounts, loadedJournals]) => {
        setPositions(loadedPositions);
        setAccounts(loadedAccounts);
        setJournals(loadedJournals);
      })
      .catch(() => setError('Data lokal tidak dapat dibuka.'))
      .finally(() => setJournalLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAppSettings()
      .then((settings) => scanWatchlist(settings, marketCacheIO, {
        timeframe: DASHBOARD_TIMEFRAME,
        onProgress: (partial) => {
          if (cancelled) return;
          setScans(partial.scans);
          setMarketFailures(partial.failures);
          setMarketLoading(false);
        },
      }))
      .then((result) => {
        if (cancelled) return;
        setScans(result.scans);
        setMarketFailures(result.failures);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setMarketLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filters = useMemo(() => (accountId ? { accountIds: [accountId] } : {}), [accountId]);
  const data = useMemo(
    () => calculateAnalytics(positions, accounts, journals, filters),
    [positions, accounts, journals, filters],
  );

  const signals = scans.flatMap((scan) =>
    scan.blocks
      .filter((block) => block.status === 'touched' || block.status === 'approaching')
      .map((block) => ({ scan, block })));

  const metrics = data.metrics;
  const scoped = accountId ? positions.filter((position) => position.accountId === accountId) : positions;
  const journalByPosition = new Map(journals.map((journal) => [journal.positionId, journal]));
  const needsJournal = scoped.filter((position) => !isMeaningfulJournal(journalByPosition.get(position.id)));

  const recent = [...scoped]
    .filter((position) => position.closeAt)
    .sort((a, b) => (b.closeAt ?? '').localeCompare(a.closeAt ?? ''))
    .slice(0, 5);

  return (
    <div className="grid dashboard-page">
      <section>
        <div className="section-head">
          <h2>Bias hari ini</h2>
          <span className="muted u-xs">{DASHBOARD_TIMEFRAME} · tren, struktur, momentum</span>
        </div>
        {marketLoading && scans.length === 0 ? (
          <div className="grid bias-strip">
            {[1, 2, 3, 4].map((n) => (
              <div className="bias-tile" key={n}>
                <Skeleton width="60%" />
                <div className="u-mt-3"><Skeleton height={20} width="70%" /></div>
              </div>
            ))}
          </div>
        ) : scans.length === 0 ? (
          <Card>
            <EmptyState
              icon="globe"
              title="Data market belum tersedia"
              description="Belum ada instrumen yang berhasil dimuat. Periksa watchlist di Settings."
              action={<a className="btn" href={`${base}settings/`}>Buka Settings</a>}
              compact
            />
          </Card>
        ) : (
          <div className="grid bias-strip">
            {scans.map((scan) => <BiasTile key={scan.instrument.id} scan={scan} />)}
          </div>
        )}

        {marketFailures.length > 0 && (
          <p className="muted u-xs u-mt-3">
            Tidak bisa dimuat: {marketFailures.map((failure) => failure.label).join(', ')}.{' '}
            <a href={`${base}settings/`}>Atur sumber data</a>
          </p>
        )}
      </section>

      <Card
        title="Sinyal aktif"
        description="Order block yang sedang disentuh atau didekati harga."
        badge={<Badge tone={signals.length > 0 ? 'warning' : 'neutral'}>{signals.length}</Badge>}
        action={<a className="btn btn--sm" href={`${base}signals/`}>Buka Signals</a>}
      >
        {signals.length === 0 ? (
          <EmptyState
            icon="radar"
            title={marketLoading ? 'Memindai order block…' : 'Tidak ada zona aktif'}
            description={marketLoading ? undefined : 'Harga sedang tidak berada di dekat order block mana pun.'}
            compact
          />
        ) : (
          <div className="signal-rows">
            {signals.map(({ scan, block }) => (
              <SignalRow key={`${scan.instrument.id}-${block.id}`} scan={scan} block={block} />
            ))}
          </div>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {!journalLoading && metrics.totalPositions === 0 ? (
        <Card title="Jurnal" description="Belum ada trade yang diimport.">
          <EmptyState
            icon="upload"
            title="Import riwayat Exness"
            description="Unggah CSV MT5 untuk mulai mencatat dan mengevaluasi trade kamu."
            action={<a className="btn primary" href={`${base}import/`}>Import CSV</a>}
            compact
          />
        </Card>
      ) : (
        <section>
          <div className="section-head">
            <h2>Jurnal</h2>
            <a className="btn btn--sm" href={`${base}analytics/`}>Analytics lengkap</a>
          </div>

          {metrics.requiresCurrencySelection && (
            <Notice tone="warning">
              Pilih satu account agar nominal dari currency berbeda tidak digabungkan.
            </Notice>
          )}

          <div className="grid stats-grid u-mt-3 u-mb-0">
            <StatTile
              label="Net P&L"
              value={journalLoading ? '—' : money(metrics.netProfit, metrics.currency)}
              tone={Number(metrics.netProfit ?? 0) >= 0 ? 'profit' : 'loss'}
              foot="Semua posisi selesai"
            />
            <StatTile
              label="Win rate"
              value={metrics.winRate === null ? '—' : `${(metrics.winRate * 100).toFixed(1)}%`}
              foot="Breakeven dikecualikan"
            />
            <StatTile
              label="Profit factor"
              value={metrics.profitFactor === null ? '—' : Number(metrics.profitFactor).toFixed(2)}
              foot="Gross profit ÷ gross loss"
            />
            <StatTile
              label="Perlu dijurnal"
              value={needsJournal.length}
              foot={`dari ${metrics.totalPositions} trade`}
            />
          </div>

          <Card
            title="Trade terakhir"
            className="u-mt-4"
            action={<a className="btn btn--sm" href={`${base}trades/`}>Semua</a>}
          >
            {recent.length === 0 ? (
              <EmptyState icon="list" title="Belum ada trade selesai" compact />
            ) : (
              <div className="recent-list">
                {recent.map((position) => (
                  <a className="recent-row" key={position.id} href={`${base}journal/?positionId=${position.id}`}>
                    <span className="u-truncate">
                      <strong className="symbol">{position.symbol}</strong>{' '}
                      <SideBadge side={position.side} />
                    </span>
                    <span className="u-xs muted">
                      {position.closeAt ? new Date(position.closeAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—'}
                    </span>
                    <span className={`recent-row__value ${Number(position.netProfit) >= 0 ? 'profit' : 'loss'}`}>
                      {money(position.netProfit, metrics.currency)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
