# MT5 Workbook and Exness Import Design

**Date:** 2026-10-09

## Summary

FerikTrading will support two local trade-history sources:

- Exness CSV exports already accepted by the application.
- Standard MT5 trade-history workbooks in `.xlsx` format, including the supplied Vantage Markets report shape.

The product and import experience will become broker-neutral. A file-first importer will detect the source format, normalize it into the existing trade domain, resolve or create the destination account, and commit the account and data atomically. Parsing remains entirely in the browser, with no telemetry, upload, backend, or external runtime API.

## Goals

- Import a standard MT5 `.xlsx` history report without requiring the user to enter account details that are already present in the workbook.
- Preserve every currently supported Exness CSV shape.
- Keep analytics, journals, weekly reviews, and account scoping independent of the source format.
- Reuse accounts across overlapping MT5 reports and deduplicate stable source records.
- Replace Exness-only user-visible wording with wording that describes MT5 workbook and Exness CSV support.
- Preserve all existing IndexedDB data and backup compatibility.

## Non-goals

- MT4 reports, MT5 HTML reports, arbitrary spreadsheets, or broker-specific formats other than the existing Exness CSV variants.
- Direct MT5 terminal integration, broker API synchronization, cloud storage, or server-side parsing.
- Importing pending, canceled, or unfilled orders.
- Inferring MT5 server timezones from broker names or maintaining a server-timezone registry.
- Guaranteed cross-format deduplication when the same account history is imported once as detailed Exness deals and again as synthetic MT5 workbook positions. Deduplication is guaranteed for repeated and overlapping reports of the same supported format.
- Adding account management or account editing beyond the import flow.

## Constraints and invariants

- The IndexedDB name `ferik-trading-journal` must not change.
- The encrypted-backup discriminator `ferik-trading-journal-encrypted` must not change.
- The theme key `ferik-journal-theme` must not change and must continue to be referenced through `THEME_STORAGE_KEY`.
- The GitHub Pages base path `ferik_trading_journal` must not change.
- FerikTrading remains the product name. Only source-specific user-visible copy changes.
- The app remains offline-first. The workbook dependency is bundled at build time and import performs no network request.
- MT5 timestamps are interpreted in the browser/device timezone because MT5 reports do not contain a server timezone.
- Existing accounts and backups with empty server or account-number strings remain readable.

## Architecture

### File-first orchestration

The import flow starts with a file rather than an account:

1. Read the selected file as an `ArrayBuffer`.
2. Detect its source format from its bytes and structure, using the extension only as a hint.
3. Dispatch to the appropriate source adapter.
4. Produce a common import preview containing normalized records, account metadata when available, source metadata, issues, and a file hash.
5. Resolve an existing account or prepare a new account.
6. Show the source, account decision, counts, issues, and sample records.
7. On confirmation, create the account if needed and commit the normalized records in one Dexie transaction.

The format dispatcher owns detection only. Source adapters own source-specific parsing. Database code receives normalized data and does not inspect CSV columns, workbook sections, or broker names.

### Supported source adapters

#### Exness CSV adapter

The current `parseExnessCsv` behavior remains supported, including:

- MT5 deal-history rows with explicit entry and exit events.
- Closed-order CSVs containing open and close values in one row.
- Exness Personal Area snake-case exports with UTC timestamps.
- BOMs, comma or semicolon delimiters, localized decimal formats, balance rows, and row-level issues.

The existing parser will sit behind the shared import interface. A metadata-poor Exness CSV will not create an account during preview. The review step will ask the user to select an existing account or create one using the minimal account form.

#### MT5 workbook adapter

The adapter accepts an OOXML `.xlsx` workbook with the standard MT5 `Trade History Report` layout. It finds a worksheet by required report markers and headers rather than relying on a sheet name or fixed row numbers.

It reads:

- `Name`, `Account`, `Company`, and report date metadata.
- The `Positions` section for completed trades.
- Balance-like rows from the `Deals` section.
- The `Results` section for validation when totals are present.

It intentionally ignores the `Orders` section because that section includes pending and canceled orders and is not the canonical record of completed trades.

### Workbook library

Use SheetJS Community Edition 0.20.3 from the official SheetJS package source. The public npm registry release is stale; installation must use the official tarball URL and commit the resulting lockfile. SheetJS reads the browser `ArrayBuffer` and converts the relevant worksheet into an array of rows. Only cell values are required; styles, charts, formulas, and workbook rendering are not used.

References:

- <https://docs.sheetjs.com/docs/getting-started/installation/nodejs/>
- <https://docs.sheetjs.com/docs/getting-started/examples/import/>

## Domain mapping

### MT5 positions

Each valid row in the workbook `Positions` section represents one completed position and is normalized as one synthetic exit `Deal`, following the same embedded-open convention already used by Exness closed-order exports:

| MT5 column | Domain field |
| --- | --- |
| Opening `Time` | `embeddedOpenAt` |
| `Position` | `positionId`, stable synthetic `ticketId`, and `orderId` |
| `Symbol` | `symbol` |
| `Type` | position side and normalized exit-deal side |
| `Volume` | `volume` |
| Opening `Price` | `embeddedOpenPrice` |
| `S / L` | `stopLoss` when non-empty and non-zero |
| `T / P` | `takeProfit` when non-empty and non-zero |
| Closing `Time` | `occurredAt` and `sourceTime` |
| Closing `Price` | `price` |
| `Commission` | `commission` |
| `Swap` | `swap` |
| `Profit` | `profit` |

The existing position aggregator then produces one closed `Position`. Net profit remains `profit + commission + swap`, matching the current domain convention.

Rows with unrecognized sides, missing position IDs, invalid timestamps, or invalid required numbers become row-level errors. Blank separator, subtotal, chart, and summary rows are ignored.

### MT5 balance events

Rows in the `Deals` section whose type or comment identifies balance, deposit, withdrawal, or credit activity become `BalanceEvent` records. The MT5 Deal ID is the stable ticket identity. Amount, timestamp, and comment come from the report row. Direction is classified using the existing balance-event rules and the amount sign.

Trade rows from `Deals` are not imported because this report shape does not expose Position IDs there. Attempting to reconstruct positions from order IDs would incorrectly split opening and closing deals.

### Summary validation

When a `Results` section supplies totals, the adapter compares:

- Total trade count against valid imported position rows.
- Total net profit against the sum of profit, commission, and swap, using decimal arithmetic and a small display-rounding tolerance.

A mismatch produces a visible warning. It does not silently alter source values or block otherwise valid records.

## Source detection and shared result

Source detection follows this order:

1. An OOXML ZIP signature plus required workbook structures identifies an XLSX candidate.
2. The workbook adapter confirms standard MT5 markers and required headers.
3. Non-XLSX bytes are decoded as text and checked using the existing Exness header aliases.
4. A file matching neither source returns an unsupported-format error.

The common preview result adds source information to the existing parsed records:

- Source format: `exness-csv` or `mt5-xlsx`.
- Human-readable source label.
- Adapter/parser version.
- Optional detected account metadata.
- Deals, balance events, skipped count, issues, preview rows, and SHA-256 file hash.

The exact interface may use nested objects, but source-specific details must not leak into database commit logic.

## Account model and resolution

### Required and optional values

For newly created accounts:

- Account name/label is required.
- Broker/server is required and continues to use the existing `server` field.
- Account number is optional and remains stored as a string; an absent number is represented by an empty string for backward compatibility.
- Currency is detected when possible and otherwise defaults to `USD`.
- Platform remains `MT5`.
- Source timezone is the browser/device timezone.

Existing legacy accounts with empty values are not migrated destructively or rejected when loaded.

### Workbook metadata

For the supplied report shape, the `Account` metadata contains:

- The account number before the parenthesized details.
- Currency as the first parenthesized value.
- Server as the second parenthesized value.

The `Company` row supplies the broker/company name. The generated label is `<company> · <account number>`; if the number is absent, it falls back to `<company> · <server>`.

### Matching

Automatic MT5 account resolution normalizes whitespace and case, then matches:

1. `server + account number` when an account number exists.
2. `server + account label` when no account number exists.

An exact existing match is reused. Otherwise, the importer prepares a new account from workbook metadata. Metadata is shown in the review but requires no manual entry.

For a source without sufficient metadata, the review step offers existing-account selection or a compact new-account form. New-account fields are account name and broker/server, with optional account number and currency defaulting to `USD`.

## Atomic persistence and compatibility

Account creation and data import occur in the same Dexie transaction after the user confirms the preview. Parsing failures or abandoned previews therefore do not leave empty accounts.

`ImportBatch` records gain a source-format value and retain a numeric parser version. The source-format value must be optional when reading old backups and old IndexedDB records. No new index is required for account resolution because account lists are small and can be scanned in memory.

Repeated-file behavior remains based on `accountId + fileHash`. Overlapping MT5 workbooks deduplicate positions by account-scoped MT5 Position ID and balance events by account-scoped Deal ID. Re-aggregation continues to rebuild positions without deleting journals; stable position IDs preserve journal associations.

Backup schema parsing must accept both old import batches without a source format and new batches with one. No storage identifier is renamed and no existing table is dropped.

## User experience

### Wizard

The wizard becomes:

1. **File** — accept `.csv` and `.xlsx`; explain that processing stays local.
2. **Review** — show detected source, account decision, valid trades, balance events, skipped rows, issues, and a short preview. Show the minimal account controls only when metadata is insufficient.
3. **Complete** — report inserted, duplicate, and failed counts and link to trades.

Changing the selected file clears all prior detection, account-resolution, preview, result, and error state.

### Product copy

Replace user-visible Exness-only copy across the import page, navigation, dashboard, trades, weekly review, and related empty states. Preferred wording is:

- `Import riwayat trading` for the action/page.
- `MT5 workbook atau Exness CSV` where supported formats need to be explicit.
- `Data broker` or `riwayat trading` when the source format is irrelevant.

The Exness name remains where it identifies the Exness-specific adapter. The FerikTrading product name is unchanged.

### Preact behavior

The import page remains a hydrated Preact island. Text inputs use `onInput` and `event.currentTarget`; selects and file inputs use native `onChange`. Workbook parsing starts from an explicit user action and reports busy state while running.

## Error handling

Blocking errors include:

- Unreadable or corrupt workbook containers.
- A workbook without a recognizable MT5 report worksheet.
- Missing required Positions headers.
- A file that matches no supported format.
- No valid trade or balance records after parsing.
- Missing required account name or server after fallback input.
- A database transaction failure.

Non-blocking warnings include:

- Invalid individual rows.
- Missing optional SL, TP, account number, currency, or summary values.
- Summary count or net-profit mismatches.
- Skipped non-trade rows.

The review limits displayed issues while retaining the full issue count. Errors must not expose workbook XML or stack traces to the user.

## Testing and verification

### Fixtures and privacy

Create a small sanitized MT5-style workbook fixture with invented identity, account, and trade data. Do not copy or commit the supplied workbook, its customer name, its account number, or its full trading history.

### Unit tests

Cover:

- Content-based format detection for XLSX and CSV.
- Rejection of unsupported and corrupt files.
- MT5 metadata extraction and generated account label.
- Browser-timezone conversion for workbook timestamps.
- Position-row normalization, including prices, SL/TP, costs, and net profit.
- Balance-event extraction and classification.
- Ignoring Orders and non-balance Deals rows.
- Row-level issue reporting and summary mismatch warnings.
- Existing Exness CSV parser regression cases.
- Automatic account creation and reuse.
- Optional account number and required new-account label/server validation.
- Atomic rollback when commit fails.
- Same-file and overlapping-MT5-report deduplication.
- Old backup and import-batch compatibility.

### End-to-end tests

Add local Playwright coverage for:

- Selecting a sanitized MT5 workbook, reviewing detected metadata, committing without manual account input, and viewing imported trades.
- Importing a metadata-poor Exness CSV using the compact account flow.
- Updating existing expectations that mention Exness-only headings or buttons.

Continue to start the local server separately before Playwright, following the repository instructions.

### Verification commands

Run:

```sh
npm test
npm run check
npm run test:e2e
```

Finally, validate locally against `D:\Development\stuff\ReportHistory-35917329.xlsx` without committing it. Expected high-level results are:

- Source detected as an MT5 workbook.
- Metadata resolves to the Vantage Markets account in the report.
- 69 closed positions.
- Balance events from the Deals section.
- A repeated import produces no duplicate records.

## Documentation updates

Update the README and import-page help text to state that FerikTrading currently supports standard MT5 `.xlsx` trade-history workbooks and Exness CSV exports. Document that all parsing is local and that workbook times use the browser/device timezone.
