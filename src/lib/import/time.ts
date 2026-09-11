function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function parseBrokerTime(value: string, timeZone: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('Waktu kosong');
  if (/Z$|[+-]\d\d:?\d\d$/.test(raw)) {
    const direct = new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  }
  const match = raw.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    ?? raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)?.map((v, i, a) => i === 1 ? a[3] : i === 3 ? a[1] : v);
  if (!match) throw new Error(`Format waktu tidak didukung: ${raw}`);
  const [, y, mo, d, h, mi, s = '0'] = match;
  const desired = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  let instant = new Date(desired);
  // Two passes handle DST offsets without relying on the host timezone.
  for (let i = 0; i < 2; i += 1) {
    const p = partsInZone(instant, timeZone);
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant = new Date(instant.getTime() + desired - represented);
  }
  if (Number.isNaN(instant.getTime())) throw new Error(`Zona waktu tidak valid: ${timeZone}`);
  return instant.toISOString();
}
