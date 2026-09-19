import { useEffect, useMemo, useState } from 'preact/hooks';
import ChartPanel from './ChartPanel';
import { calculateAnalytics } from '../lib/analytics';
import { isMeaningfulJournal } from '../lib/review';
import type { Account, Journal, Position } from '../lib/domain/types';
import { Badge, Card, EmptyState, Icon, Notice, SideBadge, SkeletonCards, StatTile } from './ui';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;
const DAY = 86_400_000;

function money(value: string | null, currency: string | null): string {
  if (value === null) return 'Pilih account';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: currency ?? 'USD' }).format(Number(value));
}

function OnboardingChecklist({ hasTrades, hasJournal, hasReview }: {
  hasTrades: boolean; hasJournal: boolean; hasReview: boolean;
}) {
  const steps = [
    { done: hasTrades, title: 'Import riwayat Exness', desc: 'Unggah CSV MT5 untuk mengisi trade, equity curve, dan statistik.', href: `${base}import/`, cta: 'Import CSV' },
    { done: hasJournal, title: 'Isi jurnal trade pertama', desc: 'Catat setup, tesis, dan emosi supaya evaluasi mingguan punya bahan.', href: `${base}journal/`, cta: 'Buka jurnal' },
    { done: hasReview, title: 'Buat weekly review', desc: 'Tutup minggu dengan satu pelajaran dan satu fokus untuk minggu depan.', href: `${base}review/`, cta: 'Buka review' },
  ];
  const next = steps.find((step) => !step.done);

  return (
    <div className="onboarding">
      {steps.map((step, index) => (
        <div className={`onboarding__step ${step.done ? 'is-done' : ''}`.trim()} key={step.title}>
          <span className="onboarding__mark">
            {step.done ? <Icon name="circle-check" size={15} /> : index + 1}
          </span>
          <div className="onboarding__body">
            <span className="onboarding__title">{step.title}</span>
            <span className="onboarding__desc">{step.desc}</span>
            {step === next && (
              <div className="u-mt-2">
                <a className="btn primary btn--sm" href={step.href}>{step.cta}</a>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
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
      .catch(() => setError('Data lokal tidak dapat dibuka.'))
      .finally(() => setLoading(false));
  }, []);

  const filters = useMemo(() => (accountId ? { accountIds: [accountId] } : {}), [accountId]);
  const data = useMemo(
    () => calculateAnalytics(positions, accounts, journals, filters),
    [positions, accounts, journals, filters],
  );

  /**
   * Same window length immediately before the current one, so each KPI can
   * show a period-over-period delta. calculateAnalytics already accepts a date
   * range, so this is pure composition rather than new maths.
   */
  const previous = useMemo(() => {
    const now = Date.now();
    return calculateAnalytics(positions, accounts, journals, {
      ...filters,
      from: new Date(now - 60 * DAY).toISOString(),
      to: new Date(now - 30 * DAY).toISOString(),
    });
  }, [positions, accounts, journals, filters]);

  const current = useMemo(() => {
    const now = Date.now();
    return calculateAnalytics(positions, accounts, journals, {
      ...filters,
      from: new Date(now - 30 * DAY).toISOString(),
      to: new Date(now).toISOString(),
    });
  }, [positions, accounts, journals, filters]);

  if (loading) return <SkeletonCards count={4} />;
  if (error) return <Notice tone="error">{error}</Notice>;

  const metrics = data.metrics;
  const scoped = accountId ? positions.filter((position) => position.accountId === accountId) : positions;
  const journalByPosition = new Map(journals.map((journal) => [journal.positionId, journal]));

  // Counts journals with actual content, matching how Weekly Review measures
  // completeness — previously this counted any row that merely existed.
  const needsJournal = scoped.filter((position) => !isMeaningfulJournal(journalByPosition.get(position.id)));

  const tradeDelta = current.metrics.totalPositions - previous.metrics.totalPositions;
  const winDelta = current.metrics.winRate !== null && previous.metrics.winRate !== null
    ? (current.metrics.winRate - previous.metrics.winRate) * 100
    : null;

  if (metrics.totalPositions === 0) {
    return (
      <div className="grid dashboard-page">
        <Card title="Mulai dari sini" description="Tiga langkah supaya workspace ini berguna.">
          <OnboardingChecklist hasTrades={false} hasJournal={false} hasReview={false} />
        </Card>
      </div>
    );
  }

  const recent = [...scoped]
    .filter((position) => position.closeAt)
    .sort((a, b) => (b.closeAt ?? '').localeCompare(a.closeAt ?? ''))
    .slice(0, 8);

  return (
    <div className="grid dashboard-page">
      {metrics.requiresCurrencySelection && (
        <Notice tone="warning">
          Pilih satu account agar nominal dari currency berbeda tidak digabungkan.
        </Notice>
      )}

      <div className="grid stats-grid u-mb-0">
        <StatTile
          label="Net P&L"
          value={money(metrics.netProfit, metrics.currency)}
          tone={Number(metrics.netProfit ?? 0) >= 0 ? 'profit' : 'loss'}
          foot="Semua posisi selesai"
        />
        <StatTile
          label="Win rate"
          value={metrics.winRate === null ? '—' : `${(metrics.winRate * 100).toFixed(1)}%`}
          foot="Breakeven dikecualikan"
          delta={winDelta === null ? undefined : {
            text: `${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)} pt`,
            direction: winDelta > 0 ? 'up' : winDelta < 0 ? 'down' : 'flat',
          }}
        />
        <StatTile
          label="Profit factor"
          value={metrics.profitFactor === null ? '—' : Number(metrics.profitFactor).toFixed(2)}
          foot="Gross profit ÷ gross loss"
        />
        <StatTile
          label="Total trade"
          value={metrics.totalPositions}
          foot="30 hari terakhir"
          delta={{
            text: `${tradeDelta >= 0 ? '+' : ''}${tradeDelta} trade`,
            direction: tradeDelta > 0 ? 'up' : tradeDelta < 0 ? 'down' : 'flat',
          }}
        />
      </div>

      <div className="dashboard-main-grid">
        <Card title="Cumulative P&L" badge={<Badge>Semua waktu</Badge>}>
          <div className="chart-box chart-box--lg">
            <ChartPanel
              labels={data.cumulativeProfit.map((point) => new Date(point.at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }))}
              values={data.cumulativeProfit.map((point) => Number(point.cumulativeProfit))}
              valueFormatter={(value) => money(String(value), metrics.currency)}
            />
          </div>
        </Card>

        <Card title="Ringkasan performa" badge={<Badge tone="brand">Insight</Badge>}>
          <div className="metric-list">
            <div className="metric-row"><span>Journal belum lengkap</span><strong>{needsJournal.length}</strong></div>
            <div className="metric-row"><span>Average realized R</span><strong>{metrics.averageRealizedR ? `${Number(metrics.averageRealizedR).toFixed(2)}R` : '—'}</strong></div>
            <div className="metric-row"><span>Expectancy</span><strong>{metrics.expectancy === null ? '—' : money(metrics.expectancy, metrics.currency)}</strong></div>
            <div className="metric-row"><span>Max drawdown</span><strong className="loss">{metrics.maximumDrawdown === null ? '—' : money(metrics.maximumDrawdown, metrics.currency)}</strong></div>
            <div className="metric-row"><span>Winning streak terpanjang</span><strong>{metrics.longestWinningStreak}</strong></div>
            <div className="metric-row"><span>Losing streak terpanjang</span><strong>{metrics.longestLosingStreak}</strong></div>
          </div>
        </Card>
      </div>

      <div className="dashboard-secondary-grid">
        <Card title="Trade terakhir" action={<a className="btn btn--sm" href={`${base}trades/`}>Semua</a>}>
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

        <Card
          title="Perlu dijurnal"
          badge={<Badge tone={needsJournal.length > 0 ? 'warning' : 'profit'}>{needsJournal.length}</Badge>}
        >
          {needsJournal.length === 0 ? (
            <EmptyState icon="circle-check" title="Semua trade sudah dijurnal" compact />
          ) : (
            <div className="recent-list">
              {needsJournal.slice(0, 8).map((position) => (
                <a className="recent-row" key={position.id} href={`${base}journal/?positionId=${position.id}`}>
                  <span className="u-truncate"><strong className="symbol">{position.symbol}</strong></span>
                  <span className="u-xs muted">
                    {position.closeAt ? new Date(position.closeAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : 'open'}
                  </span>
                  <span className="u-xs" style={{ color: 'var(--brand)' }}>Isi →</span>
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card title="Langkah berikutnya">
          <OnboardingChecklist
            hasTrades={positions.length > 0}
            hasJournal={journals.some((journal) => isMeaningfulJournal(journal))}
            hasReview={needsJournal.length === 0}
          />
        </Card>
      </div>
    </div>
  );
}
