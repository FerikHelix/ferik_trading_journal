import { useMemo } from 'preact/hooks';
import type { DaySummary } from '../lib/desk/days';

/**
 * A month of trading as cells.
 *
 * Two readings per cell, both of them the trader's own: how many trades, and how
 * much was lost — in money and as a percentage of that day's opening balance. The
 * loss-budget bar only appears when a plan gives the day a budget, because on a
 * personal desk there is nothing to spend.
 */

export interface CalendarMonthProps {
  /** YYYY-MM */
  month: string;
  days: DaySummary[];
  /** firmDay -> share of the daily loss limit used. Absent for personal desks. */
  budget?: Record<string, number | null>;
  money: (value: string) => string;
  selected?: string;
  onSelect?: (firmDay: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Cell {
  key: string;
  dayOfMonth: number;
  summary?: DaySummary;
}

function buildGrid(month: string, days: DaySummary[]): Array<Cell | null> {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return [];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first

  const byDay = new Map(days.map((day) => [day.firmDay, day]));
  const grid: Array<Cell | null> = Array.from({ length: leading }, () => null);
  for (let dayOfMonth = 1; dayOfMonth <= total; dayOfMonth += 1) {
    const key = `${month}-${String(dayOfMonth).padStart(2, '0')}`;
    grid.push({ key, dayOfMonth, summary: byDay.get(key) });
  }
  return grid;
}

const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

export default function CalendarMonth({ month, days, budget, money, selected, onSelect }: CalendarMonthProps) {
  const grid = useMemo(() => buildGrid(month, days), [month, days]);
  const monthLabel = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year, (monthNumber ?? 1) - 1, 1))
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [month]);

  return (
    <div className="calendar" aria-label={`Calendar ${monthLabel}`}>
      <div className="calendar__head">
        <span className="calendar__month">{monthLabel}</span>
      </div>
      <div className="calendar__grid" role="grid">
        {WEEKDAYS.map((weekday) => (
          <div className="calendar__weekday" role="columnheader" key={weekday}>{weekday.slice(0, 2)}</div>
        ))}
        {grid.map((cell, index) => {
          if (!cell) return <div className="cal-cell cal-cell--blank" key={`blank-${index}`} aria-hidden="true" />;
          const summary = cell.summary;
          const used = budget?.[cell.key];
          const realized = summary ? Number(summary.realized) : 0;
          const tone = summary && realized !== 0 ? (realized > 0 ? 'win' : 'loss') : '';
          const classes = [
            'cal-cell',
            summary ? 'cal-cell--traded' : 'cal-cell--empty',
            tone ? `cal-cell--${tone}` : '',
            selected === cell.key ? 'is-selected' : '',
          ].filter(Boolean).join(' ');

          const label = summary
            ? `${cell.key}: ${summary.tradeCount} trades, ${money(summary.realized)}`
              + (summary.resultPct === null ? '' : `, ${pct(summary.resultPct)}`)
            : `${cell.key}: no trades`;

          return (
            <button
              type="button"
              role="gridcell"
              key={cell.key}
              className={classes}
              aria-label={label}
              aria-pressed={selected === cell.key}
              disabled={!summary || !onSelect}
              onClick={() => summary && onSelect?.(cell.key)}
            >
              <span className="cal-cell__day">{cell.dayOfMonth}</span>
              {summary ? (
                <>
                  <span className="cal-cell__count">{summary.tradeCount} trade{summary.tradeCount === 1 ? '' : 's'}</span>
                  <span className={`cal-cell__amount ${realized > 0 ? 'profit' : realized < 0 ? 'loss' : ''}`}>
                    {money(summary.realized)}
                  </span>
                  {summary.resultPct !== null ? (
                    <span className="cal-cell__pct">{pct(summary.resultPct)}</span>
                  ) : null}
                  {typeof used === 'number' ? (
                    <span className={`cal-budget ${used >= 1 ? 'cal-budget--breach' : used >= 0.8 ? 'cal-budget--watch' : ''}`}>
                      <span style={{ width: `${Math.min(100, Math.max(0, used * 100))}%` }} />
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="cal-cell__idle">no trades</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { buildGrid };
