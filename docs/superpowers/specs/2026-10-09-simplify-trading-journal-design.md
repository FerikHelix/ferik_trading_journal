# Design Spec: Simplify FerikTrading to Core Trading Journal

- **Date:** 2026-10-09
- **Status:** Approved
- **Topic:** Remove Market/Signals subsystem and refocus application purely on trading journal functionality.

---

## 1. Context and Problem Statement

FerikTrading currently contains a market data and signals subsystem alongside its core trading journal functionality. This subsystem includes:
- External market data fetchers (Binance REST, Dukascopy sandboxed JSONP iframe).
- SMC (Smart Money Concepts) order block detection and swing structure detection.
- Fundamental bias calculations and market overview widgets.
- Real-time alert polling (`AlertBell.tsx`).
- Market data configuration and cache controls in Settings.

This subsystem introduces external network dependencies, third-party iframe sandboxing, and background scan polling that distract from the application's primary identity: a private, fast, offline-first trading journal for logging trades, analyzing performance, and writing trade reflections.

The goal is to prune the Market and Signals subsystem completely and redesign the Dashboard to be 100% focused on journal metrics, unjournaled trade tracking, and trade review workflows.

---

## 2. Goals and Non-Goals

### Goals
- **Complete removal of Market & Signals layer:** Eliminate all external market data fetching, SMC order block math, market pages, alert bells, and Dukascopy iframes.
- **Pure Journal Dashboard:** Redesign the Dashboard to render instantly from IndexedDB with zero network requests, highlighting account performance, unjournaled trade reminders, recent trades, and quick actions.
- **Safe Database Schema Migration:** Retain all user trade history, accounts, journals, weekly reviews, and app settings without data loss. Drop disposable `marketCandles` and `signalAlerts` tables via Dexie version migration.
- **Maintain Test Integrity:** Remove tests for deleted features, update navigation and shell tests, ensuring all remaining unit and e2e checks pass cleanly.

### Non-Goals
- Changing the Exness MT5 CSV parser or import pipelines.
- Changing analytics calculations or weekly review mechanics.
- Renaming any critical database keys or storage identifiers (`ferik-trading-journal`, `ferik-trading-journal-encrypted`, `ferik-journal-theme`, `ferik_trading_journal`).

---

## 3. Detailed Architectural Changes

### 3.1 Files to Delete

#### Pages and Static Assets
- `src/pages/signals/index.astro`
- `src/pages/fundamental/index.astro`
- `public/dukascopy-frame.html`

#### Modules & Libraries
- `src/lib/market/` (all files: `client.ts`, `instruments.ts`, `signals.ts`, `bias.ts`, `types.ts`, `providers/binance.ts`, `providers/dukascopy.ts`)
- `src/lib/smc/` (all files: `index.ts`, `orderBlocks.ts`, `structure.ts`, `swings.ts`)

#### UI Components & Styles
- `src/components/SignalsApp.tsx`
- `src/components/FundamentalApp.tsx`
- `src/components/CandleChart.tsx`
- `src/components/AlertBell.tsx`
- `src/components/MarketSettings.tsx`
- `src/components/marketCacheIO.ts`
- `src/styles/pages/market.css`

#### Tests
- `tests/unit/smc.test.ts`
- `tests/e2e/signals.spec.ts`

---

### 3.2 Files to Modify

#### 1. Global Styles (`src/styles/global.css`)
- Remove `@import './pages/market.css';`.

#### 2. Domain Types (`src/lib/domain/types.ts`)
- Remove `CachedCandles` and `SignalAlert` interfaces.
- Remove references to market timeframes if unused.

#### 3. Database (`src/lib/db/database.ts`)
- Bump Dexie to version 5:
  ```ts
  this.version(5).stores({ marketCandles: null, signalAlerts: null });
  ```
- Remove `marketCandles` and `signalAlerts` entity table properties from `TradingJournalDatabase`.
- Remove market clearing logic from any database helper functions.

#### 4. Navigation (`src/lib/nav.ts`)
- Remove the `market` nav group.
- Keep the following groups:
  - `home`: Overview (`path: ''`, icon: `layout-dashboard`, mobile: true)
  - `journal` (label: `'Jurnal'`):
    - Trades (`trades/`, icon: `list`, mobile: true)
    - Jurnal (`journal/`, icon: `notebook-pen`, mobile: true)
    - Analytics (`analytics/`, icon: `bar-chart`, mobile: true)
    - Weekly Review (`review/`, icon: `calendar-check`)
  - `system` (label: `'Sistem'`):
    - Import (`import/`, icon: `upload`, mobile: true)
    - Settings (`settings/`, icon: `settings`)
- Total mobile items: 5 (`dashboard`, `trades`, `journal`, `analytics`, `import`).

#### 5. Topbar Shell (`src/components/shell/Topbar.astro`)
- Remove `<AlertBell client:load />` and its import.
- Keep `AccountPicker`, `ThemeToggle`, and mobile navigation button.

#### 6. Settings Page (`src/components/SettingsApp.tsx`)
- Remove `MarketSettings` import and its rendered `<MarketSettings />` card.
- Retain Account management, Currency settings, Theme settings, and Encrypted Backup/Restore.

#### 7. Data Client Helpers (`src/components/dataClient.ts`)
- Remove market helper functions (`loadMarketCandles`, `saveMarketCandles`, `clearMarketCache`, etc.).

#### 8. Dashboard (`src/components/DashboardApp.tsx`)
- Redesign into a dedicated, offline-first journal command center:
  - **State:** Loads `positions`, `accounts`, `journals` via Dexie. No network polling or scan timeouts.
  - **Performance Metrics Grid:**
    - Net P&L (colored by profit/loss)
    - Win rate (%)
    - Profit factor
    - Unjournaled trades count ("Perlu dijurnal: X dari Y trade")
  - **Unjournaled Trades Reminder:**
    - Callout card showing closed trades without notes or strategy tags, with quick link to edit their journal.
  - **Recent Activity Table:**
    - Last 5 closed positions with symbol, direction, close date, and net profit.
  - **Quick Action Bar:**
    - Links to Import CSV, Buka Jurnal, Weekly Review, and Full Analytics.

#### 9. Tests
- **`tests/unit/nav.test.ts`:**
  - Remove assertion for `market` nav group.
  - Validate updated groups (`home`, `journal`, `system`) and mobile navigation length (<= 5).
- **`tests/e2e/shell.spec.ts`:**
  - Update sidebar group heading assertions to `['Jurnal', 'Sistem']`.
  - Remove clicks to Fundamental and Signals.
  - Remove `fundamental/` and `signals/` from route response check list.

#### 10. Documentation (`AGENTS.md`)
- Remove the **Market data** section (CORS, Dukascopy iframe JSONP, Binance API, circuit breaker notes).
- Document that FerikTrading is purely an offline-first trading journal storing imported trades and reflections in IndexedDB.

---

## 4. Verification and Testing

1. **Unit Tests:** Run `npm test` to verify that all remaining unit tests pass (analytics, backup, data-import, nav, theme, tokens, weekly-review).
2. **Typecheck & Astro Check:** Run `npm run check` to ensure zero broken imports or TypeScript compile errors.
3. **E2E Smoke Tests:** Verify shell navigation and critical journal flows (`npm run test:e2e` locally).
