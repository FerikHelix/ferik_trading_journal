# Design

## Context

See `proposal.md` — Why for motivation and the four specs for requirements.

Current state that shapes this design:

- `src/lib` (≈1,500 lines) already parses Exness CSV and MT5 workbooks, detects
  format from content, dedupes by `accountId+ticketId` and `fileHash`, rebuilds
  positions in a Dexie transaction, and does decimal-exact analytics. This is the
  expensive, tested half and is retained.
- `src/components`, `src/pages`, `src/styles` (≈2,400 lines) are the shell being
  replaced.
- The database is named `ferik-trading-journal` and backup payloads are locked by
  `z.literal('ferik-trading-journal-encrypted')`. Both are load-bearing: changing
  either strands existing user data with no server-side recovery.
- Dexie schema is at version 5. Every version so far has been additive to the
  same database name.
- `deploy.yml` triggers only on `main`, so an archive branch cannot deploy.
- No date/timezone library is present (`decimal.js`, `zod`, `papaparse`, `xlsx`,
  `dexie`, `chart.js`). Timezone arithmetic is done with `Intl`.
- Three files are uncommitted at the time of writing: the zero-field import
  flow. They are the last v1 work and must land before branching.

## Goals / Non-Goals

**Goals:**

- Add desk kind, starting balance, plans, and per-day attestations without
  breaking any existing database or backup.
- Make the day a first-class unit, computed on the desk's own clock.
- Make every guardrail reading honest about what the imported data can prove.
- Reduce the shell to a session-close surface plus a small library.
- Keep the app fully offline and statically deployable to GitHub Pages.

**Non-Goals:**

- No server, no broker API, no live equity feed, no model calls.
- No per-trade images in this change.
- No multi-currency conversion; one currency per desk stays the rule.
- No rewrite of the parser or the aggregation engine.

## Decisions

### Keep the engine, replace the shell in the same repository

Alternative: greenfield repo. Rejected — a new application requires a new
IndexedDB name (because the old data is not copied), which strands every
imported trade and every backup on disk. A fresh git history that copies the
parser is the same code with worse provenance. The shell is what is being
replaced, so deleting `src/components`, `src/pages`, and `src/styles` gives the
same clean-slate feeling at the layer that actually needed it.

### Branch and freeze

`main` receives the pending import work, then tag `v1.0` and branch
`archive/v1`. Work continues on `v2`. `deploy.yml` is untouched, so only `main`
deploys; when v2 merges, pages swaps atomically. Rollback is `git checkout v1.0`.

### Dexie v6, additive, with backfill inside the upgrade

New tables: `plans` (one per prop desk), `sessions` (per desk per firm day:
lowest equity, checklist ticks, one-line note). Existing tables are extended by
adding optional fields, not by rewriting rows.

Version 6 upgrade backfills `kind: 'personal'` on every existing account and
leaves `startingBalance` and `openedAt` unset. Unset is meaningful: percentages
report as unavailable, which is truthful for a history imported mid-account.
Alternative considered: infer starting balance from the earliest balance event.
Rejected — silently wrong numbers are worse than an honest gap.

### Desk kind lives on the account; the plan lives beside it

```
Account { kind, startingBalance?, openedAt? }   // personal | propfirm
Plan    { accountId, ...limits, ruleText }      // only when kind === propfirm
Session { accountId, firmDay, lowestEquity?, checklist, note }
```

A separate `plans` table rather than fields on `accounts` keeps the account row
stable and makes detaching a plan a delete rather than a nulling spree.

### Firm day is a pure function, not a stored column

`firmDayKey(iso, resetTime, resetTimeZone)` converts an instant to the firm's
day label using `Intl.DateTimeFormat` with `timeZone` and `formatToParts`, then
subtracts the reset offset. Positions are bucketed at read time.

Alternative: store a `firmDay` column on each position. Rejected — changing a
plan's reset clock would require rewriting every position, and the reset clock is
the field most likely to be corrected after a paste. Grouping at read time makes
a correction instant.

DST is handled by the platform clock: the offset is recomputed per instant, so a
plan that resets at 00:00 Europe/Prague gets 23-hour and 25-hour firm days around
transitions, which is what the firm does.

### Plan is markdown-first with a validated JSON block

Stored as one string. On paste, a fenced ` ```json ` block is extracted and
validated with a zod schema; the markdown body and checkboxes are parsed into
rule items. Rejected alternatives: (a) structured form fields only — cannot hold
"no weekend holding" and is painful to fill from a firm's web page; (b) markdown
only — nothing can drive a budget bar.

Field errors are reported per path, the previous plan stays in force, and the
pasted text is kept so the user can fix it rather than retype. This makes "paste
what my AI wrote" a first-class path without any model call.

### Rules are a discriminated union of three tiers

```
type Rule =
  | { tier: 'computed'; kind: 'maxDailyLoss' | 'maxTotalLoss' | 'target' | 'minDays' | 'consistency' }
  | { tier: 'soft';     metric: 'tradesPerDay' | 'lotsPerDay'; cap: number }
  | { tier: 'attested'; id: string; text: string }
```

One wall, one renderer, different source of truth per tier. Attested items are
never auto-computed; computed items are never checkboxes.

### Guardrail readings carry a confidence enum

```
type Reading = {
  value: Decimal; limit: Decimal; usedPct: number;
  confidence: 'exact' | 'estimate' | 'attested'
}
```

Rules: realized result and target progress are `exact`. Trailing drawdown from a
balance peak is `estimate` (equity peaks are invisible to a closed-trade export).
A day with no `lowestEquity` stays `estimate` and the UI must say an intraday
breach cannot be ruled out. Entering `lowestEquity` promotes that day to
`attested`. The label is part of the data, not a UI string that can drift.

### Import matching keys on account number

`findMatchingAccount` changes from `server+number` to `number`, then label as a
weaker fallback when no number exists. Existing databases may already contain
two rows for one number; the design adds an explicit merge that moves
`deals`, `balanceEvents`, `positions`, `plans`, and `sessions` onto the survivor
and reports how many records moved. No silent merging — duplicates are visible
and resolvable.

### Import becomes one action

Drop file → parse → resolve desk → commit → show result. The wizard's review step
is removed; the preview data is still produced and shown in the result, because
parsing is what the user is trusting. Manual account creation is a fallback that
appears only when the file carries no account identity.

### Session close is a composed surface, not a new capability

The primary screen composes existing pieces: import action, day summary (from
`trade-calendar`), guardrail bars (from `prop-guardrails`), checklist and note
(from `sessions`). It owns no requirements of its own, which keeps the four
capabilities reusable and avoids a fifth spec that only describes layout.

### Navigation is six destinations, one conditional

Today, Trades (calendar/list toggle), Journal, Plan (prop only), Import,
Settings. `nav.ts` gains a `requires?: 'propfirm'` marker; `tests/unit/nav.test.ts`
is extended to assert the prop-only item is excluded for a personal desk.

### Percentages require a balance baseline

Day-open balance = `startingBalance` + preceding deposits − withdrawals. If
`startingBalance` is unset, percent is `null`, never `0`. The product prompts for
the balance once on the first visit after upgrade and never blocks on it.

### No new dependencies

zod is already present for validation, `Intl` covers timezones, `Decimal` covers
money, Dexie covers storage. The one tempting addition, a date library, is
rejected: a wrong-day bug is exactly the class of bug that destroys trust, and
`Intl` is the platform's own implementation of the calendar rules.

## Risks / Trade-offs

**Closed-trade exports understate drawdown** → Confidence labels are part of the
reading type, the optional lowest-equity field upgrades a day to attested, and
copy never claims safety from realized data alone.

**Reset-clock corrections change historical groupings** → Accepted and desirable:
the firm's clock is the truth. The plan editor shows what changed after a paste.

**Existing duplicate accounts survive the matching fix** → Explicit merge flow
with a record count preview; no automatic merging.

**Dexie v6 cannot be rolled back in place** → v6 only adds tables and optional
fields; a v5-capable build still opens the database and ignores the new tables.
Tagged `v1.0` remains deployable.

**Old backups restore into a v2 database** → Backup snapshot schema version is
bumped, and version 1 payloads are accepted with `kind: 'personal'` and no
starting balance. Restoring stays one-way but never fails.

**Timezone math is easy to get subtly wrong** → `firmDayKey` is a pure function
covered by unit tests around DST transitions and non-midnight resets, not by
end-to-end tests that would need a real clock.

**Shell replacement regresses the token contract** → `tokens.test.ts` still
enforces matching light/dark token sets and plain-hex `--chart-*` values; the new
shell must satisfy it unchanged.

**Uncommitted v1 import work is lost while branching** → Explicit first step:
land or stash those three files before `archive/v1` is cut.

## Migration Plan

1. Commit or stash `ImportWizard.tsx`, `dataClient.ts`, `smoke.spec.ts`; confirm
   `npm test` and `npm run check` pass on `main`.
2. Tag `v1.0`, branch `archive/v1`, then branch `v2`.
3. Extend domain types and add the Dexie v6 upgrade with backfill; unit tests for
   the upgrade run against `fake-indexeddb` with a seeded v5 database.
4. Add `firmDayKey`, plan parsing, guardrail evaluation, and day aggregation as
   pure modules with unit tests before any UI consumes them.
5. Change account matching and add the merge flow; verify against a database
   containing a deliberate duplicate.
6. Build the session-close surface and the calendar; replace pages one at a time,
   deleting each old page as its replacement lands.
7. Bump backup schema to 2, accept version 1, re-run backup tests.
8. Merge `v2` into `main`; Pages redeploys. Rollback is `v1.0`.

## Open Questions

- Warning threshold for a guardrail bar before it reads as at risk. Default 50%
  used, with a stronger treatment at 80%. Adjustable later without touching specs.
- Whether the consistency cap should block a phase transition or only warn. The
  specs treat it as reported, not enforcing; revisit with real firm rules.
- Whether multiple concurrent challenges need a "closest to failing" ranking on
  the Today surface. Deferred; each desk is evaluated independently today.
