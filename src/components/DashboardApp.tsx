import { useEffect, useMemo, useState } from 'preact/hooks';
import { calculateAnalytics } from '../lib/analytics';
import { isMeaningfulJournal } from '../lib/review';
import type { Account, Journal, Position } from '../lib/domain/types';
import { Badge, Card, EmptyState, Icon, Notice, SideBadge, Skeleton, StatTile } from './ui';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;

function money(value: string | null, currency: string | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function DashboardApp() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accountId] = useActiveAccount();

  useEffect(() => {
    Promise.all([loadPositions(), loadAccounts(), loadJournals()])
      .then(([loadedPositions, loadedAccounts, loadedJournals]) => {
        setPositions(loadedPositions);
        setAccounts(loadedAccounts);
        setJournals(loadedJournals);
      })
      .catch(() => setError('Data lokal tidak dapat dimuat.'))
      .finally(() => setLoading(false));
  }, []);

  const filters = useMemo(() => (accountId ? { accountIds: [accountId] } : {}), [accountId]);
  const data = useMemo(
    () => calculateAnalytics(positions, accounts, journals, filters),
    [positions, accounts, journals, filters],
  );

  const metrics = data.metrics;
  const scoped = accountId ? positions.filter((position) => position.accountId === accountId) : positions;
  const journalByPosition = new Map(journals.map((journal) => [journal.positionId, journal]));
  const needsJournal = scoped.filter(
    (position) => position.status === 'closed' && !isMeaningfulJournal(journalByPosition.get(position.id)),
  );

  const recent = [...scoped]
    .filter((position) => position.closeAt)
    .sort((a, b) => (b.closeAt ?? '').localeCompare(a.closeAt ?? ''))
    .slice(0, 5);

  const needsJournalSlice = needsJournal.slice(0, 5);

  return (
    <div className="grid dashboard-page">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="section-head">
        <h2>Ringkasan Jurnal</h2>
        <div className="dashboard-actions">
          <a className="btn btn--sm primary" href={`${base}import/`}>
            <Icon name="upload" size={14} /> Import CSV
          </a>
          <a className="btn btn--sm" href={`${base}journal/`}>
            <Icon name="notebook-pen" size={14} /> Jurnal
          </a>
          <a className="btn btn--sm" href={`${base}review/`}>
            <Icon name="calendar-check" size={14} /> Weekly Review
          </a>
          <a className="btn btn--sm" href={`${base}analytics/`}>
            <Icon name="bar-chart" size={14} /> Analytics
          </a>
        </div>
      </div>

      {loading ? (
        <div className="grid stats-grid">
          {[1, 2, 3, 4].map((n) => (
            <div className="card" key={n}>
              <Skeleton width="40%" />
              <div className="u-mt-3"><Skeleton height={28} width="70%" /></div>
            </div>
          ))}
        </div>
      ) : metrics.totalPositions === 0 ? (
        <Card title="Selamat datang di FerikTrading" description="Jurnal trading offline-first pribadi kamu.">
          <EmptyState
            icon="upload"
            title="Belum ada riwayat trading"
            description="Unggah file CSV riwayat MT5 dari Exness untuk mulai menganalisis performa dan mendokumentasikan evaluasi trading kamu."
            action={<a className="btn primary" href={`${base}import/`}>Import CSV Exness</a>}
            compact
          />
        </Card>
      ) : (
        <>
          {metrics.requiresCurrencySelection && (
            <Notice tone="warning">
              Pilih satu account di menu atas agar kalkulasi nominal dari currency yang berbeda tidak digabungkan.
            </Notice>
          )}

          <div className="grid stats-grid">
            <StatTile
              label="Net P&L"
              value={money(metrics.netProfit, metrics.currency)}
              tone={Number(metrics.netProfit ?? 0) >= 0 ? 'profit' : 'loss'}
              foot="Total keuntungan bersih"
            />
            <StatTile
              label="Win Rate"
              value={metrics.winRate === null ? '—' : `${(metrics.winRate * 100).toFixed(1)}%`}
              foot="Dihitung dari trade selesai"
            />
            <StatTile
              label="Profit Factor"
              value={metrics.profitFactor === null ? '—' : Number(metrics.profitFactor).toFixed(2)}
              foot="Gross profit ÷ gross loss"
            />
            <StatTile
              label="Status Jurnal"
              value={needsJournal.length}
              tone={needsJournal.length > 0 ? undefined : 'profit'}
              foot={needsJournal.length > 0 ? `perlu dijurnal dari ${metrics.totalPositions} trade` : 'semua trade sudah dievaluasi'}
            />
          </div>

          <div className="dashboard-grid-2 u-mt-3">
            <Card
              title="Perlu Dijurnal"
              description="Posisi selesai yang belum memiliki catatan strategi atau evaluasi."
              badge={
                <Badge tone={needsJournal.length > 0 ? 'warning' : 'profit'}>
                  {needsJournal.length}
                </Badge>
              }
              action={
                needsJournal.length > 0 ? (
                  <a className="btn btn--sm" href={`${base}journal/`}>Lihat semua</a>
                ) : undefined
              }
            >
              {needsJournal.length === 0 ? (
                <EmptyState
                  icon="calendar-check"
                  title="Semua trade sudah dievaluasi"
                  description="Kerja bagus! Seluruh trade kamu telah tercatat di jurnal."
                  compact
                />
              ) : (
                <div className="recent-list">
                  {needsJournalSlice.map((position) => (
                    <div className="recent-row" key={position.id}>
                      <span className="u-truncate">
                        <strong className="symbol">{position.symbol}</strong>{' '}
                        <SideBadge side={position.side} />
                      </span>
                      <span className={`recent-row__value ${Number(position.netProfit) >= 0 ? 'profit' : 'loss'}`}>
                        {money(position.netProfit, metrics.currency)}
                      </span>
                      <a
                        className="btn btn--sm"
                        href={`${base}journal/?positionId=${position.id}`}
                      >
                        Tulis Jurnal
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Trade Terakhir"
              description="Posisi selesai yang terakhir dieksekusi."
              action={<a className="btn btn--sm" href={`${base}trades/`}>Semua trade</a>}
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
                        {position.closeAt
                          ? new Date(position.closeAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}
                      </span>
                      <span className={`recent-row__value ${Number(position.netProfit) >= 0 ? 'profit' : 'loss'}`}>
                        {money(position.netProfit, metrics.currency)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
