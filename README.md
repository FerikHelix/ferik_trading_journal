# FerikTrading

A trading journal for MetaTrader 5 that runs in the browser and works offline. There is no account, no server and no telemetry. Your data stays in your browser.

**Live:** https://ferikhelix.github.io/ferik_trading_journal/

## What it does

There are two kinds of desk:

- **Personal desk:** judged on results. It has trades, a calendar, analytics and notes.
- **Prop firm desk:** judged on how much of each firm limit you have left. It adds a challenge plan, guardrails and a daily checklist.

The app has six pages:

- **Today:** drop in the day's export to see the day's result, how much of each limit it used, the checklist and a note.
- **Trades:** a calendar of daily results (money, % of the day's opening balance and, on a prop desk, the share of the daily loss budget used), plus list and analytics views.
- **Plan** (prop desks only): the firm's rules as markdown with one fenced `json` block. You can paste a rule page and have an AI fill in the block. The app validates it, and a rejected paste leaves the old plan in place.
- **Journal:** notes for each position (strategy, setup, thesis, execution rating, mistakes, tags) and weekly reviews.
- **Import:** see below.
- **Settings:** desk type, starting balance, duplicate merging, theme, backup and restore, and deleting local data.

Each guardrail value carries a confidence label:

| Label | Meaning |
| --- | --- |
| `exact` | Fully determined by the imported history |
| `estimate` | An equity-based limit approximated from closed trades |
| `attested` | Refined by a value you entered, such as the day's lowest equity |

A closed-trade export can't see the lowest equity during a day, so a daily loss based on closed trades is never shown as proof that no intraday breach happened. Enter the day's lowest equity to make that day attested.

## Import

The app detects the format from the file's contents. It reads:

- an MT5 report saved as `.xlsx`
- an MT5 report saved as CSV
- an Exness deal-history CSV

The desk is matched by the account number in the file. If you import overlapping history again, only the new trades are added.

## Run it locally

You need Node.js 22.12 or newer.

```sh
npm ci
npm run dev        # http://localhost:4321/
npm run build      # production build in dist/
npm run check      # type check
npm test           # unit tests (vitest)
npm run test:e2e   # Playwright, local only, not run in CI
```

If `astro preview` detaches into the background and Playwright fails, start `npm run preview` yourself and then run `npx playwright test`. If port 4321 is taken, use `PREVIEW_PORT=4331`.

## Your data

- Everything is stored in the browser's IndexedDB (`ferik-trading-journal`). Imports are parsed in the page and nothing is uploaded.
- Clearing site data deletes the journal, and there is no server copy. Back up from Settings regularly, either as plain `.ftj.json` or encrypted `.ftj.enc.json` (AES-GCM).

## Project layout

```
src/lib/         import parsing, desks, guardrails, storage
src/components/  Preact islands, one per page plus shared UI
src/pages/       the six pages
tests/unit/      vitest (runs in CI)
tests/e2e/       Playwright (local only)
openspec/        specs and the archive of shipped changes
```

Rules for contributors and agents are in [AGENTS.md](./AGENTS.md).

## Deployment

The app is published to GitHub Pages by `.github/workflows/deploy.yml`, which runs the tests and the type check before building. Only `main` deploys. `v1.0` is kept on `archive/v1` as the rollback point.
