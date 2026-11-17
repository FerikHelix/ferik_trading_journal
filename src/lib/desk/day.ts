/**
 * The firm's day boundary.
 *
 * A prop firm's rules reset on its own clock, which is almost never UTC midnight
 * and is not the trader's display timezone either. Every daily number in the
 * product — loss used, trades counted, attestations — is bucketed with this.
 */
export interface FirmClock {
  /** Daily reset as HH:mm in `resetTimeZone`. */
  resetTime: string;
  /** IANA zone the reset time is expressed in. */
  resetTimeZone: string;
}

/** A personal desk still needs a boundary; it just uses its display zone at midnight. */
export const personalClock = (displayTimeZone: string): FirmClock => ({
  resetTime: '00:00',
  resetTimeZone: displayTimeZone,
});

function resetMinutes(resetTime: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(resetTime.trim());
  if (!match) throw new Error(`Jam reset "${resetTime}" harus berformat HH:mm.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Jam reset "${resetTime}" di luar jangkauan.`);
  return hours * 60 + minutes;
}

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    throw new Error(`Zona waktu "${timeZone}" tidak dikenali.`);
  }
}

interface WallClock { year: number; month: number; day: number; hour: number; minute: number }

/**
 * Wall-clock parts of an instant in a zone. `Intl` recomputes the offset for each
 * instant, so DST transitions are the platform's problem rather than ours.
 */
function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

const dateLabel = (year: number, month: number, day: number): string =>
  new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

/**
 * The firm day an instant belongs to, as YYYY-MM-DD.
 *
 * A trade before the reset belongs to the previous day, because that firm day is
 * still running. On a spring-forward day the 23-hour day still produces one key,
 * and on a fall-back day the 25-hour day still produces one key.
 */
export function firmDayKey(instant: string | Date, clock: FirmClock): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error('Tanggal tidak valid.');
  const reset = resetMinutes(clock.resetTime);
  const zone = validZone(clock.resetTimeZone);
  const wall = wallClock(date, zone);
  const minuteOfDay = wall.hour * 60 + wall.minute;
  return minuteOfDay < reset
    ? dateLabel(wall.year, wall.month, wall.day - 1)
    : dateLabel(wall.year, wall.month, wall.day);
}

export const firmDayKeyIn = (clock: FirmClock) => (instant: string | Date): string => firmDayKey(instant, clock);

/** Today's firm day for a clock, using the current instant. */
export const currentFirmDay = (clock: FirmClock, now: Date = new Date()): string => firmDayKey(now, clock);
