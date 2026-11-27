# FerikTrading

A trading journal for MetaTrader 5 that runs fully in the browser. You import your MT5 or Exness trade history, and the app shows daily results, a trade calendar, analytics, notes and, for prop firm challenges, how much of each firm limit you have left. There is no account, no server and no telemetry. All data stays in the browser.

It is for MT5 traders, including people doing prop firm challenges.

**Live:** https://ferikhelix.github.io/ferik_trading_journal/

---

## Tech stack

| Area | Technology |
|---|---|
| Framework | Astro 7 (`output: 'static'`) with Preact 10 islands |
| Language | TypeScript 6 (strict Astro config) |
| Storage | IndexedDB through Dexie 4 |
| Parsing | SheetJS `xlsx` 0.20.3 (from the SheetJS CDN tarball), PapaParse 5 |
| Validation | Zod 4 |
| Money math | decimal.js 10 |
| Charts | Chart.js 4 |
| Crypto | Web Crypto API (PBKDF2-SHA-256 + AES-GCM) for encrypted backups |
| Tests | Vitest 5 with `fake-indexeddb`, Playwright 1.63 |
| Hosting | GitHub Pages, deployed by GitHub Actions |

---

## Prerequisites

- Node.js **22.12 or newer** (`engines` in `package.json`).
- npm.
- For end-to-end tests: Playwright browsers. Locally the config uses the installed Chrome channel.

---

## Getting started

```bash
# 1. Install packages
npm ci

# 2. Start the dev server (http://localhost:4321/)
npm run dev
```

No `.env` file is needed. The app has no API keys and makes no network calls.

---

## Configuration

There is no runtime configuration. Build settings come from the environment:

| Name | Where it comes from | Used for |
|---|---|---|
| `GITHUB_REPOSITORY` | GitHub Actions | Sets `site` to `https://<owner>.github.io` and `base` to `/<repo>/` |
| `GITHUB_ACTIONS` | GitHub Actions | Turns on the GitHub Pages `site` and `base` |
| `PLAYWRIGHT_TEST` | Set to `true` to opt out | Forces the local `site` and `base: '/'` even on Actions |
| `PREVIEW_PORT` | Your shell | Port for the Playwright preview server (default `4321`) |
| `CI` | CI runner | Playwright retries (2), GitHub reporter, bundled Chromium instead of Chrome |

Outside GitHub Actions the app builds with `site: http://localhost:4321` and `base: '/'`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 4321 |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run check` | Type check with `astro check` |
| `npm test` | Unit tests (Vitest, `tests/unit/**/*.test.ts`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Build with local site and base, then run Playwright |

---

## Project structure

```text
src/
├── pages/              # Six routes, each renders AppLayout + one Preact island
├── layouts/            # AppLayout.astro: shell, sidebar, top bar, mobile nav
├── components/         # Preact islands (TodayApp, TradesApp, PlanApp, ...) and shared UI
│   ├── shell/          # Sidebar, Topbar, MobileNav
│   └── ui/             # Card, Field, Badge, icons
├── lib/
│   ├── import/         # Format detection, MT5 workbook/CSV and Exness CSV parsers, deal -> position aggregation
│   ├── desk/           # Plan parsing, rules, guardrails, firm day boundary, balance series
│   ├── db/             # Dexie database, migrations, import commit, account merge
│   ├── analytics/      # Win rate, profit factor, expectancy, streaks, drawdown
│   ├── backup/         # Plain and encrypted backup and restore
│   ├── review/         # Weekly review helpers
│   ├── theme/          # Light/dark/system theme
│   ├── domain/types.ts # Shared types
│   └── nav.ts          # Navigation groups
└── styles/             # Global CSS: tokens, layout, components, pages
tests/
├── unit/               # Vitest (runs in CI)
├── e2e/                # Playwright (local only)
└── fixtures/           # Generated MT5 workbook fixture
openspec/               # Specs and archived changes
docs/superpowers/       # Older design notes and plans
```

---

## How it works

1. You drop an export on **Today** or **Import**. The file is read in the page. Nothing is uploaded.
2. The format is detected from the bytes: a ZIP signature means an MT5 `.xlsx` report, a "Trade History Report" title with a "Positions" section means an MT5 report saved as CSV, and a matching deal header means an Exness CSV.
3. The parser produces deals, balance events and the account details found in the file.
4. The desk is matched by **account number**. If the file has no account number, the label is used. A new account becomes a **personal** desk.
5. Deals are stored with the ID `<accountId>:<ticketId>`, so re-importing overlapping history only adds new deals. The same file twice (same SHA-256) is skipped.
6. All deals of the desk are grouped into positions again, and the pages read from IndexedDB.

### Pages

| Route | Page | What it shows |
|---|---|---|
| `/` | Today | Drop zone, the day's trades and result, % of opening balance, guardrails, checklist, lowest-equity entry, a note, weekly review |
| `/trades/` | Trades | Calendar of daily results, list with search and filters, analytics |
| `/journal/` | Journal | Notes per position: strategy, setup, thesis, emotion, execution rating, mistakes, tags, risk, review |
| `/plan/` | Plan | Challenge plan editor. Prop firm desks only |
| `/import/` | Import | Import wizard |
| `/settings/` | Settings | Desk kind, starting balance, merging duplicate desks, theme, backup and restore, delete all data |

### Desks

| Kind | Judged on | Extra features |
|---|---|---|
| `personal` | Results | None |
| `propfirm` | Room left under each firm limit | Plan, guardrails, rule checklist |

Percentages use the desk's starting balance. If it is not set, percentages show as unavailable, not `0%`.

### Challenge plan

A plan is markdown with **one fenced `json` block** for the numbers. Checkbox lines (`- [ ] ...`) become rules only you can tick. The starter plan suggests asking an AI to fill the JSON from the firm's rule page.

| JSON field | Type | Meaning |
|---|---|---|
| `firm`, `phase` | string | Labels |
| `startingBalance` | positive number or string | Base for all limits |
| `effectiveFrom` | `YYYY-MM-DD` | Plan start date |
| `resetTime` | `HH:mm` | Time the firm's day resets |
| `resetTimeZone` | IANA zone, for example `Europe/Prague` | Zone of the reset time |
| `maxDailyLossPct`, `maxTotalLossPct` | 0 to 100 or `null` | Loss limits |
| `totalLossMode` | `static` or `trailing` | Fixed floor, or a floor that follows the balance peak |
| `profitTargetPct` | 0 to 100 or `null` | Target |
| `minTradingDays` | integer or `null` | Minimum trading days |
| `consistencyPct` | 0 to 100 or `null` | Max share of total profit from one day |
| `softCaps.tradesPerDay`, `softCaps.lotsPerDay` | number | Counted per day, not treated as a firm breach |

A paste that fails validation writes nothing, so the old plan stays in force. Changing the reset time regroups all history by the new firm day.

### Guardrail confidence

| Label | Meaning |
|---|---|
| `exact` | Fully set by the imported history |
| `estimate` | An equity-based limit approximated from closed trades (for example a trailing floor) |
| `attested` | Based on a value you entered, such as the day's lowest equity |

A closed-trade export cannot see the lowest equity during a day. So a daily loss from closed trades is never shown as proof that no intraday breach happened. Enter the day's lowest equity to make that day `attested`.

---

## Data

Everything is in the IndexedDB database `ferik-trading-journal` (Dexie schema version 6).

| Table | Key and indexes | Content |
|---|---|---|
| `accounts` | `id`, `accountNumber` | Desks: label, server, currency, source time zone, kind, starting balance |
| `importBatches` | `id`, unique `[accountId+fileHash]` | One row per imported file with counts |
| `deals` | `id`, unique `[accountId+ticketId]` | Raw deals from exports |
| `balanceEvents` | `id`, unique `[accountId+ticketId]` | Deposits, withdrawals and other balance rows |
| `positions` | `id`, `accountId`, `closeAt` | Positions rebuilt from deals |
| `journals` | `id`, unique `positionId` | Your notes per position |
| `weeklyReviews` | `id`, unique `[accountId+weekStart]` | Weekly reviews |
| `plans` | `id`, unique `accountId` | Challenge plans (markdown + parsed numbers) |
| `sessions` | `id`, unique `[accountId+firmDay]` | Daily checklist ticks, note, lowest equity |
| `settings` | `id` (`app`) | Theme, display time zone |

### Backups

| File | Format |
|---|---|
| `.ftj.json` | Plain JSON snapshot (backup schema version 2, version 1 also restores) |
| `.ftj.enc.json` | Envelope `ferik-trading-journal-encrypted`: AES-GCM, key from PBKDF2-SHA-256 with 600,000 iterations, random salt and IV |

⚠️ Clearing site data deletes the journal. There is no server copy. Back up from Settings regularly.

### Names you must not rename

| Identifier | Where | Why |
|---|---|---|
| `ferik-trading-journal` | `src/lib/db/database.ts` | IndexedDB name. A new name opens an empty database |
| `ferik-trading-journal-encrypted` | `src/lib/backup/index.ts` | Old encrypted backups would stop restoring |
| `ferik-journal-theme` | `src/lib/theme/index.ts` | Theme preference key |
| `ferik_trading_journal` | `astro.config.mjs` | GitHub Pages base path |

---

## Testing

```bash
npm test            # Vitest unit tests (run in CI)
npm run check       # Type check (run in CI)
npm run test:e2e    # Playwright, local only
```

Unit tests cover analytics, backup and restore, import detection and parsing (MT5 workbook, MT5 CSV, Exness CSV), desk balance, firm day boundaries, guardrails, plan parsing, rules, desk merge and the v6 migration, weekly review, navigation and theme tokens.

The Playwright specs (`tests/e2e/`) cover the app shell, the prop desk flow, a smoke run and typing in text fields.

If Playwright fails because `astro preview` went to the background, start `npm run preview` yourself and run `npx playwright test`. If port 4321 is taken, use `PREVIEW_PORT=4331 npx playwright test`.

---

## Deployment

Push to `main`. `.github/workflows/deploy.yml` then:

1. **test**: `npm ci`, `npm test`, `npm run check` on Node 22.
2. **build**: `withastro/action@v6`.
3. **deploy**: `actions/deploy-pages@v5` to GitHub Pages.

It can also be started by hand (`workflow_dispatch`). Playwright does not run in CI.

---

## Known issues / gotchas

- Playwright is not part of CI. It timed out waiting for the preview server on the runner, so run it locally before big UI changes.
- `tests/e2e/smoke.spec.ts` builds its dates from the current week. Do not hard-code a date there.
- In Preact, text inputs must use `onInput`, not `onChange`. `onChange` fires only on blur, so typing seems to do nothing.
- Some messages are in Indonesian (for example the Journal and Settings page subtitles and many error messages). Most labels are English.
- A daily loss from closed trades can understate an intraday drawdown. Enter the day's lowest equity for prop desks.
- Trailing drawdown uses the balance peak, not the equity peak, so it is an estimate.
- `xlsx` is installed from the SheetJS CDN tarball, not from the npm registry. `npm ci` needs access to that host.
- `*.csv` and backup files are in `.gitignore` so private trading data is not committed.
