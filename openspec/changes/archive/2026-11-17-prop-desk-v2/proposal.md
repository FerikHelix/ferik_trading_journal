# Proposal

## Why

The journal works, but it is a general-purpose trade log asked to do a prop
trader's job: it reports closed-trade P&L when the user needs to know how close
they are to breaching a firm's daily loss limit, it treats every account as
personal, its smallest time unit is a position while every prop rule resets
daily, and importing asks for server and currency before it will read the file.
The result is a seven-page app that requires navigation to answer a question
that resets every session.

## What Changes

- **Account kind.** An account becomes either a personal desk or a prop firm
  desk. Prop desks carry a plan; personal desks never see one.
- **Starting balance and opening date.** Every percentage the product shows is
  currently uncomputable because the app does not know what a 100% account is.
- **Zero-field import.** Drop a file, it lands on the right account. No server,
  no currency, no timezone, no wizard steps. Account matching moves from
  server-plus-number to account number alone, so re-exports stop creating
  duplicate accounts.
- **Session close replaces the dashboard.** One screen: drop the export, see the
  day, see the guardrail bars, tick the checklist, write one line. Import,
  scoring, and daily review collapse into it.
- **Prop guardrails.** A plan holds the firm's numeric limits (daily loss, total
  loss, trailing vs static, target, minimum days, consistency), the firm's reset
  clock, and the rule text. Guardrails render as budget bars with an explicit
  confidence label, because end-of-session exports cannot prove intraday equity.
- **Three-tier rule wall.** Computed limits, soft caps, and unattestable rules
  are three different objects and stop sharing one checklist.
- **Plan authoring by paste.** The plan is markdown with a fenced JSON block,
  validated on paste. The user's AI writes it; the app never calls a model.
- **Calendar as the day unit.** Each day cell carries trade count and loss in
  both money and percent of day-start balance, plus a loss-budget bar on prop
  desks.
- **Shell replaced, engine kept.** `src/lib` (parsing, aggregation, decimal
  analytics, Dexie, backup) is retained. Navigation drops from seven
  destinations to six, with Plan hidden for personal desks.
- **BREAKING** `main` is frozen at tag `v1.0` and preserved on `archive/v1`.
  v2 continues on a new branch. The IndexedDB name and backup literals are
  unchanged, so existing imports and backups keep working.
- **Out of scope:** per-trade screenshots, live equity feeds, broker APIs.

## Capabilities

### New Capabilities

- `account-desk`: account kind, starting balance, opening date, active desk
  selection, and the rule that a prop plan exists only on a prop desk.
- `trade-import`: file detection across Exness CSV and MT5 exports, zero-field
  account resolution by account number, idempotent re-import, and the single
  import action that commits into the active desk.
- `prop-guardrails`: challenge plans and their numeric limits, reset-clock
  aware daily and total drawdown, trailing vs static floors, target and minimum
  day progress, the three-tier rule model, and confidence labelling of every
  guardrail reading.
- `trade-calendar`: the day as the primary aggregation unit, covering day
  summaries, month grids, loss in money and percent, and the prop-only budget
  bar.

### Modified Capabilities

None. The project has no existing specs; all four capabilities are new.

## Impact

- `src/lib/domain/types.ts`: account kind, starting balance, opening date, plan,
  rule, session attestation, and day-summary types.
- `src/lib/db/database.ts`: Dexie v6 with additive tables (`plans`,
  `sessions`); v5 data is not migrated away.
- `src/lib/import/accounts.ts`: matching key changes from server number
  interval to account number.
- `src/lib/import/detect.ts`: content sniffing gains MT5 CSV ahead of the
  reject path.
- `src/lib/analytics/index.ts`: gains firm-day bucketing and drawdown modes; the
  existing closed-trade metric stays but stops being the headline.
- New modules: plan validation, guardrail evaluation, day aggregation.
- `src/components`, `src/pages`, `src/styles`: replaced.
- `src/lib/nav.ts`: six destinations, Plan conditional on desk kind.
- Tests: `tests/unit` extended for guardrail math and day bucketing; existing
  parser, aggregation, backup, and token tests must keep passing.
- Deployment unchanged: GitHub Pages, `deploy.yml` still triggers on `main`
  only, so the archive branch cannot deploy.
