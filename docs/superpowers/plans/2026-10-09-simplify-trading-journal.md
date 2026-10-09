# Simplify FerikTrading to Core Trading Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Market, SMC, and Signals subsystem and refocus FerikTrading entirely on an offline-first trading journal.

**Architecture:** Purge all market data providers, iframe scraping, and SMC math; bump the Dexie database schema to v5 dropping disposable cache tables; update the application shell, navigation, and settings; and redesign the Dashboard to be a 100% journal-centric overview driven solely by local IndexedDB.

**Tech Stack:** Astro, Preact, TypeScript, Dexie (IndexedDB), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-09-simplify-trading-journal-design.md](file:///d:/Development/outside_work/ferik_trading_journal/docs/superpowers/specs/2026-10-09-simplify-trading-journal-design.md)

## Global Constraints

- Never rename storage identifiers: `ferik-trading-journal` (IndexedDB), `ferik-trading-journal-encrypted` (backup key), `ferik-journal-theme` (theme preference), or `ferik_trading_journal` (base path).
- Preact islands must use `onInput` for text inputs/textareas and `event.currentTarget` for event targets.
- Mobile bottom navigation items must remain between 1 and 5 items.
- No external network fetching or third-party market data APIs.

## Review Focus

- **Existing user data preserved on upgrade:** Dexie schema bump to v5 must cleanly set `marketCandles: null` and `signalAlerts: null` without affecting accounts, deals, positions, journals, weekly reviews, or settings.
- **No broken navigation links or breadcrumbs:** `nav.ts` must resolve every item cleanly via `findNav`, and trailing slashes must be consistent with base URL handling.
- **Dashboard handles zero-trade state cleanly:** Fresh or empty accounts must show an inviting empty state pointing to Import CSV without throwing errors.
- **Dashboard unjournaled trades filtering:** Positions requiring journal write-up must accurately check `isMeaningfulJournal` against existing journal entries.
- **All remaining unit tests and type checks pass:** `npm test` and `npm run check` must succeed with zero failures.

---

### Task 1: Database Migration & Domain Types Cleanup

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/db/database.ts`
- Modify: `src/components/dataClient.ts`
- Test: `tests/unit/backup.test.ts`

**Interfaces:**
- Consumes: Dexie schema versioning
- Produces: Dexie v5 schema with dropped market tables, clean domain types without `CachedCandles` / `SignalAlert`

- [ ] **Step 1: Update domain types in `src/lib/domain/types.ts`**
Remove `CachedCandles` and `SignalAlert` type definitions.

- [ ] **Step 2: Add Dexie version 5 migration in `src/lib/db/database.ts`**
Add:
```ts
this.version(5).stores({ marketCandles: null, signalAlerts: null });
```
Remove `marketCandles` and `signalAlerts` entity table properties from `TradingJournalDatabase` class, and remove market clear queries in database cleanup helpers.

- [ ] **Step 3: Remove market helper functions in `src/components/dataClient.ts`**
Remove `loadMarketCandles`, `saveMarketCandles`, and `clearMarketCache`.

- [ ] **Step 4: Run unit tests to verify database and backup integrity**
Run: `npx vitest run tests/unit/backup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 1**
```bash
git add src/lib/domain/types.ts src/lib/db/database.ts src/components/dataClient.ts
git commit -m "refactor(db): drop market and signal tables in v5 schema"
```

---

### Task 2: Prune Market & SMC Files, Pages, and Styles

**Files:**
- Delete: `src/pages/signals/index.astro`
- Delete: `src/pages/fundamental/index.astro`
- Delete: `public/dukascopy-frame.html`
- Delete: `src/lib/market/` (directory)
- Delete: `src/lib/smc/` (directory)
- Delete: `src/components/SignalsApp.tsx`
- Delete: `src/components/FundamentalApp.tsx`
- Delete: `src/components/CandleChart.tsx`
- Delete: `src/components/AlertBell.tsx`
- Delete: `src/components/MarketSettings.tsx`
- Delete: `src/components/marketCacheIO.ts`
- Delete: `src/styles/pages/market.css`
- Delete: `tests/unit/smc.test.ts`
- Delete: `tests/e2e/signals.spec.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Filesystem deletions
- Produces: Codebase stripped of all market/signals artifacts

- [ ] **Step 1: Delete pages, public assets, and test files**
Delete `src/pages/signals/index.astro`, `src/pages/fundamental/index.astro`, `public/dukascopy-frame.html`, `tests/unit/smc.test.ts`, and `tests/e2e/signals.spec.ts`.

- [ ] **Step 2: Delete libraries, components, and stylesheets**
Delete directories `src/lib/market/` and `src/lib/smc/`.
Delete `src/components/SignalsApp.tsx`, `FundamentalApp.tsx`, `CandleChart.tsx`, `AlertBell.tsx`, `MarketSettings.tsx`, `marketCacheIO.ts`, and `src/styles/pages/market.css`.

- [ ] **Step 3: Remove stylesheet import from `src/styles/global.css`**
Remove `@import './pages/market.css';`.

- [ ] **Step 4: Commit Task 2**
```bash
git add -A
git commit -m "refactor: remove market and signals files, components, and styles"
```

---

### Task 3: Update Shell, Navigation & Settings

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/components/shell/Topbar.astro`
- Modify: `src/components/SettingsApp.tsx`
- Modify: `tests/unit/nav.test.ts`
- Modify: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `NAV_GROUPS` from `nav.ts`
- Produces: Navigation with 3 groups (`home`, `journal`, `system`) and clean Topbar without `AlertBell`

- [ ] **Step 1: Update `src/lib/nav.ts`**
Remove the `market` nav group. Set mobile flags on: `dashboard`, `trades`, `journal`, `analytics`, `import` (5 items total).

- [ ] **Step 2: Update `src/components/shell/Topbar.astro`**
Remove import and usage of `<AlertBell client:load />`.

- [ ] **Step 3: Update `src/components/SettingsApp.tsx`**
Remove import and `<MarketSettings />` card rendering.

- [ ] **Step 4: Update `tests/unit/nav.test.ts`**
Replace market section expectation with test verifying groups `home`, `journal`, and `system`. Ensure unique IDs and mobile count <= 5 tests pass.

- [ ] **Step 5: Update `tests/e2e/shell.spec.ts`**
Update sidebar heading assertions to `['Jurnal', 'Sistem']` and remove `fundamental/` and `signals/` from routes list.

- [ ] **Step 6: Run nav unit tests**
Run: `npx vitest run tests/unit/nav.test.ts`
Expected: PASS

- [ ] **Step 7: Commit Task 3**
```bash
git add src/lib/nav.ts src/components/shell/Topbar.astro src/components/SettingsApp.tsx tests/unit/nav.test.ts tests/e2e/shell.spec.ts
git commit -m "refactor(shell): update navigation, remove alert bell and market settings"
```

---

### Task 4: Redesign Dashboard Component

**Files:**
- Modify: `src/components/DashboardApp.tsx`

**Interfaces:**
- Consumes: `loadPositions`, `loadAccounts`, `loadJournals` from `dataClient`, `calculateAnalytics` from `lib/analytics`, `isMeaningfulJournal` from `lib/review`
- Produces: High-performance, offline-first Preact journal dashboard

- [ ] **Step 1: Refactor `src/components/DashboardApp.tsx`**
  - Remove all market state, market scanning effects, `DASHBOARD_TIMEFRAME`, and `marketFailures`.
  - Maintain journal state (`positions`, `accounts`, `journals`, `journalLoading`, `error`).
  - Calculate metrics using `calculateAnalytics(positions, accounts, journals, filters)`.
  - Filter unjournaled trades:
    ```ts
    const journalByPosition = new Map(journals.map((j) => [j.positionId, j]));
    const needsJournal = scoped.filter((pos) => !isMeaningfulJournal(journalByPosition.get(pos.id)));
    ```
  - Render Performance Metrics grid:
    - Net P&L (colored by profit/loss)
    - Win rate (%)
    - Profit factor
    - Status Jurnal ("Perlu dijurnal: X trade")
  - Render "Perlu Dijurnal" section if `needsJournal.length > 0` with quick links to `journal/?positionId=...`.
  - Render "Trade Terakhir" recent positions list with symbol, direction, close date, and net profit.
  - Render empty state if no positions exist, encouraging Exness CSV import.

- [ ] **Step 2: Run type check to verify DashboardApp compiles**
Run: `npx astro check`
Expected: 0 errors

- [ ] **Step 3: Commit Task 4**
```bash
git add src/components/DashboardApp.tsx
git commit -m "feat(dashboard): refocus dashboard on trading journal metrics and reflections"
```

---

### Task 5: Documentation & Full Verification

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Cleaned application
- Produces: Accurate documentation and 100% green tests

- [ ] **Step 1: Update `AGENTS.md`**
Remove the "Market data" section and references to Dukascopy, Binance, and signal tests. Reaffirm privacy and offline-first IndexedDB journal scope.

- [ ] **Step 2: Run all unit tests**
Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 3: Run Astro check**
Run: `npm run check`
Expected: Result: 0 errors, 0 warnings.

- [ ] **Step 4: Commit Task 5**
```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md to reflect core trading journal architecture"
```
