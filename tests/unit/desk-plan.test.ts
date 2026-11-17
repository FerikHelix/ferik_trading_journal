import { describe, expect, it } from 'vitest';
import { extractMachineBlock, parseAttestedRules, parsePlanMarkdown } from '../../src/lib/desk/plan';

const markdown = `# FTMO Challenge - Phase 1

Rules pasted from the firm, plus the numbers the app needs.

\`\`\`json
{
  "firm": "FTMO",
  "phase": "Phase 1",
  "startingBalance": "100000",
  "effectiveFrom": "2026-11-01",
  "resetTime": "00:00",
  "resetTimeZone": "Europe/Prague",
  "maxDailyLossPct": 5,
  "maxTotalLossPct": 10,
  "totalLossMode": "static",
  "profitTargetPct": 10,
  "minTradingDays": 4,
  "consistencyPct": null,
  "softCaps": { "tradesPerDay": 2 }
}
\`\`\`

- [ ] No trading 15 minutes around high-impact news
- [ ] No positions held over the weekend
- [ ] Max 2 setups per session
`;

describe('plan markdown', () => {
  it('extracts the machine block', () => {
    expect(extractMachineBlock(markdown)?.startsWith('{')).toBe(true);
    expect(extractMachineBlock('# no block')).toBeUndefined();
  });

  it('parses a valid plan into typed fields', () => {
    const parsed = parsePlanMarkdown(markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.machine).toMatchObject({
      firm: 'FTMO',
      startingBalance: '100000',
      effectiveFrom: '2026-11-01',
      resetTime: '00:00',
      resetTimeZone: 'Europe/Prague',
      maxDailyLossPct: 5,
      maxTotalLossPct: 10,
      totalLossMode: 'static',
      profitTargetPct: 10,
      minTradingDays: 4,
      consistencyPct: null,
      softCaps: { tradesPerDay: 2 },
    });
    expect(parsed.attested.map((rule) => rule.id)).toEqual([
      'no-trading-15-minutes-around-high-impact-news',
      'no-positions-held-over-the-weekend',
      'max-2-setups-per-session',
    ]);
    expect(parsed.markdown).toBe(markdown);
  });

  it('accepts numbers written as strings and percentages written with a sign', () => {
    const parsed = parsePlanMarkdown(markdown.replace('"maxDailyLossPct": 5', '"maxDailyLossPct": "5%"'));
    expect(parsed.ok && parsed.machine.maxDailyLossPct).toBe(5);
  });

  it('defaults an omitted soft cap and total loss mode', () => {
    const minimal = parsePlanMarkdown(`\`\`\`json
{ "startingBalance": 5000, "effectiveFrom": "2026-11-01", "resetTime": "22:00", "resetTimeZone": "Asia/Jakarta" }
\`\`\``);
    expect(minimal.ok).toBe(true);
    if (!minimal.ok) return;
    expect(minimal.machine.totalLossMode).toBe('static');
    expect(minimal.machine.softCaps).toEqual({});
    expect(minimal.machine.maxDailyLossPct).toBeNull();
    expect(minimal.attested).toEqual([]);
  });

  it('reports a missing block instead of guessing', () => {
    const parsed = parsePlanMarkdown('# Plan without a machine block');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.path).toBe('markdown');
    expect(parsed.markdown).toBe('# Plan without a machine block');
  });

  it('reports unreadable json', () => {
    const parsed = parsePlanMarkdown('```json\n{ nope }\n```');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.path).toBe('json');
  });

  it('reports a field path for an absent required number', () => {
    const parsed = parsePlanMarkdown('```json\n{ "resetTime": "00:00", "resetTimeZone": "UTC" }\n```');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.map((error) => error.path)).toContain('startingBalance');
    expect(parsed.errors.map((error) => error.path)).toContain('effectiveFrom');
  });

  it('rejects a reset clock the platform cannot honour', () => {
    const parsed = parsePlanMarkdown(markdown.replace('Europe/Prague', 'Mars/Olympus'));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.path).toBe('resetTime');
  });

  it('gives duplicate checkbox text distinct ids', () => {
    const rules = parseAttestedRules('- [ ] No news\n- [ ] No news\n- [x] No weekend holds');
    expect(rules.map((rule) => rule.id)).toEqual(['no-news', 'no-news-2', 'no-weekend-holds']);
  });

  it('leaves the markdown untouched so a rejection can be shown back to the user', () => {
    const bad = markdown.replace('"maxDailyLossPct": 5', '"maxDailyLossPct": -5');
    const parsed = parsePlanMarkdown(bad);
    expect(parsed.ok).toBe(false);
    expect(parsed.markdown).toBe(bad);
  });

  it('keeps a markdown body without checkboxes valid', () => {
    const parsed = parsePlanMarkdown(markdown.replace(/- \[ \] .*\n?/g, ''));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.attested).toEqual([]);
  });
});
