import { describe, expect, it } from 'vitest';
import { currentFirmDay, firmDayKey, personalClock } from '../../src/lib/desk/day';

const prague = (resetTime: string) => ({ resetTime, resetTimeZone: 'Europe/Prague' });

describe('firm day keys', () => {
  it('treats a midnight reset as the calendar day in the firm zone', () => {
    const clock = prague('00:00');
    expect(firmDayKey('2026-11-17T22:30:00Z', clock)).toBe('2026-11-17'); // 23:30 CET
    expect(firmDayKey('2026-11-17T23:30:00Z', clock)).toBe('2026-11-18'); // 00:30 CET
  });

  it('keeps a trade before a non-midnight reset on the previous firm day', () => {
    const clock = prague('22:00');
    expect(firmDayKey('2026-11-17T20:59:00Z', clock)).toBe('2026-11-16'); // 21:59 CET
    expect(firmDayKey('2026-11-17T21:00:00Z', clock)).toBe('2026-11-17'); // 22:00 CET
  });

  it('handles the spring-forward 23-hour day', () => {
    const clock = prague('00:00');
    expect(firmDayKey('2026-03-28T22:30:00Z', clock)).toBe('2026-03-28'); // 23:30 CET
    expect(firmDayKey('2026-03-28T23:30:00Z', clock)).toBe('2026-03-29'); // 00:30 CET
    expect(firmDayKey('2026-03-29T21:30:00Z', clock)).toBe('2026-03-29'); // 23:30 CEST
    expect(firmDayKey('2026-03-29T22:30:00Z', clock)).toBe('2026-03-30'); // 00:30 CEST
  });

  it('handles the fall-back 25-hour day', () => {
    const clock = prague('00:00');
    expect(firmDayKey('2026-10-24T21:30:00Z', clock)).toBe('2026-10-24'); // 23:30 CEST
    expect(firmDayKey('2026-10-24T22:30:00Z', clock)).toBe('2026-10-25'); // 00:30 CEST
    expect(firmDayKey('2026-10-25T22:30:00Z', clock)).toBe('2026-10-25'); // 23:30 CET
    expect(firmDayKey('2026-10-25T23:30:00Z', clock)).toBe('2026-10-26'); // 00:30 CET
  });

  it('rolls back across a month and year boundary', () => {
    const clock = prague('22:00');
    expect(firmDayKey('2026-12-31T20:00:00Z', clock)).toBe('2026-12-30');
    expect(firmDayKey('2027-01-01T20:00:00Z', clock)).toBe('2026-12-31');
  });

  it('rejects a malformed reset time or an unknown zone', () => {
    expect(() => firmDayKey('2026-11-17T00:00:00Z', prague('25:00'))).toThrow('luar jangkauan');
    expect(() => firmDayKey('2026-11-17T00:00:00Z', prague('midnight'))).toThrow('HH:mm');
    expect(() => firmDayKey('2026-11-17T00:00:00Z', { resetTime: '00:00', resetTimeZone: 'Mars/Olympus' })).toThrow('Zona waktu');
  });

  it('gives personal desks a midnight boundary in their display zone', () => {
    const clock = personalClock('Asia/Bangkok');
    expect(firmDayKey('2026-11-17T16:30:00Z', clock)).toBe('2026-11-17'); // 23:30 ICT
    expect(firmDayKey('2026-11-17T17:30:00Z', clock)).toBe('2026-11-18'); // 00:30 ICT
  });

  it('reports today for a clock', () => {
    expect(currentFirmDay(prague('00:00'), new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18');
  });
});
