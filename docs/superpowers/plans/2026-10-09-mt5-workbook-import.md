# MT5 Workbook and Exness Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic, offline import of standard MT5 `.xlsx` history reports while preserving Exness CSV import and making the product’s import experience broker-neutral.

**Architecture:** A content-based dispatcher sends each file to an Exness CSV adapter or a new MT5 workbook adapter, both of which return one shared `ImportPreview`. The MT5 adapter maps completed rows from Positions and balance activity from Deals; account matching and an atomic database commit remain separate from parsing. The hydrated Preact wizard becomes file-first and only asks for account fields when the source lacks usable metadata.

**Tech Stack:** Astro 7, Preact 10, TypeScript 6, Dexie 4, Vitest 5, Playwright 1.63, Papa Parse, Decimal.js, SheetJS CE 0.20.3

**Spec:** `docs/superpowers/specs/2026-10-09-mt5-workbook-import-design.md`

## Global Constraints

- Do not rename `ferik-trading-journal`, `ferik-trading-journal-encrypted`, `ferik-journal-theme`, or `ferik_trading_journal`.
- FerikTrading remains the product name; only user-visible source wording becomes broker-neutral.
- All parsing and persistence remain in the browser with no upload, telemetry, backend, or runtime API request.
- Interpret MT5 workbook timestamps in `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'`.
- Preserve all existing Exness CSV shapes and all old IndexedDB and backup records.
- Keep `Account.accountNumber` stored as a string; represent a missing number as `''` so old backups and database records remain structurally compatible.
- Require label, server, and currency only for newly created accounts; do not reject legacy accounts with empty values when reading them.
- Install SheetJS from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, not the stale public npm release.
- Do not commit `D:\Development\stuff\ReportHistory-35917329.xlsx` or any personal metadata copied from it.
- Preact text fields use `onInput` with `event.currentTarget`; selects and file inputs use `onChange`.
- Keep design-system styles global and place any necessary import-form rules in `src/styles/components/form.css`.
- When a local server is needed, use Astro’s supported background/server commands described in `AGENTS.md`; do not introduce a CI Playwright job.

## Review Focus

- A valid MT5 worksheet whose name and section row numbers differ from the sample must still parse by markers and headers; Task 2 adds this fixture variant.
- A corrupt ZIP or an unrelated XLSX must produce a neutral, user-safe error and must not mutate IndexedDB; Tasks 2 and 4 pin both sides.
- Server/account metadata with case or whitespace differences must reuse one account, and overlapping reports must deduplicate stable position/deal IDs; Task 3 covers this.
- An otherwise valid file with absent account metadata must fall back to existing-account selection or the minimal account form instead of failing; Tasks 2 and 5 cover this.
- Invalid rows or summary mismatches must appear as warnings while valid rows remain importable; Task 2 covers both cases.

---

## File Structure

### Create

- `src/lib/import/detect.ts` — byte/content source detection only.
- `src/lib/import/hash.ts` — SHA-256 helpers for text and binary files.
- `src/lib/import/mt5-workbook.ts` — MT5 worksheet discovery, metadata extraction, Positions mapping, Deals balance extraction, and Results validation.
- `src/lib/import/file.ts` — source dispatch and neutral unsupported/corrupt-file errors.
- `src/lib/import/accounts.ts` — pure detected-account matching rules.
- `tests/fixtures/mt5Workbook.ts` — generated, sanitized MT5-style workbook buffers for unit and E2E tests.
- `tests/unit/import-detection.test.ts` — detector and binary-hash coverage.
- `tests/unit/mt5-workbook.test.ts` — workbook adapter, metadata, timezone, warning, and dispatcher coverage.

### Modify

- `package.json`, `package-lock.json` — add the official SheetJS CE tarball dependency.
- `src/lib/domain/types.ts` — shared source, metadata, and preview contracts; optional batch source format.
- `src/lib/import/parser.ts` — expose supported-header detection and consume the shared hash helper without changing CSV behavior.
- `src/lib/import/index.ts` — export the new import modules.
- `src/lib/db/database.ts` — new-account validation, account target union, atomic account+import transaction, source-specific parser version, and stable deduplication.
- `src/lib/backup/index.ts` — preserve optional `ImportBatch.sourceFormat` during backup validation.
- `src/components/dataClient.ts` — generic preview, account resolution, and commit functions.
- `src/components/ImportWizard.tsx` — readable file-first three-step workflow.
- `src/components/SettingsApp.tsx` — display server and optional account number cleanly.
- `src/pages/import/index.astro` — broker-neutral title and description.
- `src/lib/nav.ts` — broker-neutral import navigation title.
- `src/components/DashboardApp.tsx`, `src/components/TradesApp.tsx`, `src/components/WeeklyReviewApp.tsx` — broker-neutral calls to action and empty states.
- `README.md` — supported sources, automatic metadata behavior, privacy, and timezone rule.
- `tests/unit/data-import.test.ts` — new database API, optional account number, reuse, overlap, rollback, and existing Exness regressions.
- `tests/unit/backup.test.ts` — old/new import-batch round trips.
- `tests/e2e/smoke.spec.ts` — MT5 automatic account flow, Exness fallback flow, and updated headings.
- `tests/e2e/typing.spec.ts` — adapt its CSV helper to the file-first fallback flow.
- `src/styles/components/form.css` — only if the review metadata block needs a reusable global rule.

## Task 1: Shared Import Contract, Detection, and Hashing

**Files:**
- Create: `src/lib/import/detect.ts`
- Create: `src/lib/import/hash.ts`
- Create: `tests/unit/import-detection.test.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/import/parser.ts`
- Modify: `src/lib/import/index.ts`

**Interfaces:**
- Produces: `ImportSourceFormat = 'exness-csv' | 'mt5-xlsx'`.
- Produces: `DetectedAccountMetadata { label; accountNumber; server; currency; sourceTimeZone }`, with all values stored as strings.
- Produces: `ImportPreview extends ParsedImport { sourceFormat; sourceLabel; parserVersion; detectedAccount? }`.
- Produces: `detectImportFormat(bytes: Uint8Array): ImportSourceFormat | undefined`.
- Produces: `hasSupportedExnessHeader(text: string): boolean` without changing `parseExnessCsv(...)` output.
- Produces: `sha256Bytes(bytes: BufferSource): Promise<string>` and preserves `sha256Text(text: string): Promise<string>` as a public export.

- [ ] **Step 1: Write failing detector and hash tests**

Add tests asserting that:

```ts
expect(detectImportFormat(Uint8Array.of(0x50, 0x4b, 0x03, 0x04))).toBe('mt5-xlsx');
expect(detectImportFormat(new TextEncoder().encode('Ticket,Open Time,Type,Item\n1,...'))).toBe('exness-csv');
expect(detectImportFormat(new TextEncoder().encode('name,value\na,b'))).toBeUndefined();
expect(await sha256Bytes(new TextEncoder().encode('hello')))
  .toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
```

Also assert that a semicolon-delimited deal header and the existing snake-case Personal Area header are detected as Exness CSV.

- [ ] **Step 2: Run the new test and confirm the contract is absent**

Run: `npx vitest run tests/unit/import-detection.test.ts`

Expected: FAIL because `detectImportFormat` and `sha256Bytes` do not exist.

- [ ] **Step 3: Add the shared domain types**

In `src/lib/domain/types.ts`, add the exact types listed in Interfaces and add `sourceFormat?: ImportSourceFormat` to `ImportBatch`. Do not change existing `ParsedImport`, `Account`, or storage-key values.

- [ ] **Step 4: Extract hashing and supported-header detection**

Move the hashing implementation to `src/lib/import/hash.ts`; have `parser.ts` import `sha256Text`. Export `hasSupportedExnessHeader(text)` using the same Papa Parse/header-alias rules as `parseExnessCsv`, so detection and parsing cannot drift.

- [ ] **Step 5: Implement content detection and exports**

Implement `detectImportFormat(bytes)` in `detect.ts`: recognize ZIP local-file signatures `PK\x03\x04`, `PK\x05\x06`, and `PK\x07\x08` as workbook candidates; otherwise decode text and require `hasSupportedExnessHeader`. Export `detect`, `hash`, and the new domain-facing functions from `src/lib/import/index.ts`.

- [ ] **Step 6: Run focused and existing import tests**

Run: `npx vitest run tests/unit/import-detection.test.ts tests/unit/data-import.test.ts`

Expected: PASS with all existing Exness parser tests unchanged.

- [ ] **Step 7: Commit the shared contract**

```sh
git add src/lib/domain/types.ts src/lib/import/detect.ts src/lib/import/hash.ts src/lib/import/parser.ts src/lib/import/index.ts tests/unit/import-detection.test.ts
git commit -m "refactor: add shared trade import contract"
```

## Task 2: MT5 Workbook Adapter and Generic File Dispatcher

**Files:**
- Create: `src/lib/import/mt5-workbook.ts`
- Create: `src/lib/import/file.ts`
- Create: `tests/fixtures/mt5Workbook.ts`
- Create: `tests/unit/mt5-workbook.test.ts`
- Modify: `src/lib/import/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ImportPreview`, `DetectedAccountMetadata`, `parseBrokerTime`, `parseDecimal`, `sha256Bytes`, `detectImportFormat`, and `parseExnessCsv` from Task 1/current import modules.
- Produces: `MT5_WORKBOOK_PARSER_VERSION = 1`.
- Produces: `parseMt5Workbook(buffer: ArrayBuffer, sourceTimeZone: string): Promise<ImportPreview>`.
- Produces: `parseTradeHistoryFile(file: File, sourceTimeZone: string): Promise<ImportPreview>`.
- Produces for tests: `makeMt5Workbook(options?: Mt5FixtureOptions): Uint8Array`, generating invented metadata and two positions without personal data.

- [ ] **Step 1: Install the official SheetJS package**

Run: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`

Expected: `package.json` and `package-lock.json` record `xlsx` 0.20.3 from the official tarball URL.

- [ ] **Step 2: Create the sanitized workbook fixture builder**

Create `makeMt5Workbook` with sheet name `History`, metadata for `Test Trader`, account `123456 (USD, Broker-Live, real, Hedge)`, company `Example Broker Ltd`, two completed positions, one `balance` deal, an Orders section containing one canceled order, and Results totals matching the two positions. Options must support extra leading rows, a different sheet name, missing metadata, one invalid position row, a wrong total-trades summary, and omission of the Positions header.

Use these fixed position outcomes so assertions stay stable:

- Position `501`: buy EURUSD `0.20`, open `2026.09.01 10:00:00` at `1.1000`, close `11:00:00` at `1.1050`, commission `-1`, swap `-0.5`, profit `20`, net `18.5`.
- Position `502`: sell XAUUSD `0.10`, open `12:00:00` at `2500`, close `13:00:00` at `2510`, commission `-0.5`, swap `0`, profit `-10`, net `-10.5`.
- Deal `700`: balance/deposit `1000` at `2026.09.01 09:00:00`.

- [ ] **Step 3: Write failing workbook parser tests**

Test these named behaviors:

- `extracts MT5 metadata, positions, balance events, and summary totals`
- `uses the supplied browser timezone for workbook timestamps`
- `finds report markers when the sheet name and section rows move`
- `skips an invalid position row, preserves valid rows, and records an issue`
- `warns instead of failing when Results totals differ`
- `returns no detected account when metadata is missing but keeps parsed trades`
- `rejects a workbook without the required Positions headers`
- `dispatches MT5 XLSX and existing Exness CSV into one ImportPreview shape`
- `rejects corrupt ZIP bytes and unrelated text with neutral errors`

Core assertions for the default fixture:

```ts
expect(preview).toMatchObject({
  sourceFormat: 'mt5-xlsx',
  sourceLabel: 'MT5 Workbook',
  parserVersion: 1,
  detectedAccount: {
    label: 'Example Broker Ltd · 123456',
    accountNumber: '123456',
    server: 'Broker-Live',
    currency: 'USD',
    sourceTimeZone: 'Asia/Bangkok',
  },
});
expect(preview.deals).toHaveLength(2);
expect(preview.balanceEvents).toHaveLength(1);
expect(aggregatePositions(preview.deals).map((position) => position.netProfit)).toEqual(['18.5', '-10.5']);
expect(preview.deals[0].embeddedOpenAt).toBe('2026-09-01T03:00:00.000Z');
expect(preview.deals[0].occurredAt).toBe('2026-09-01T04:00:00.000Z');
```

Assert that the canceled order never appears in `deals` or `issues`, that the balance event uses ticket `700`, and that `fileHash` is 64 lowercase hexadecimal characters.

- [ ] **Step 4: Run the workbook tests and confirm they fail**

Run: `npx vitest run tests/unit/mt5-workbook.test.ts`

Expected: FAIL because the workbook adapter and dispatcher do not exist.

- [ ] **Step 5: Implement worksheet discovery and metadata extraction**

Implement `parseMt5Workbook` with `XLSX.read(buffer)` and `XLSX.utils.sheet_to_json(..., { header: 1, raw: false, defval: '' })`. Locate `Trade History Report`, `Positions`, `Orders`, `Deals`, and `Results` by normalized cell text rather than row numbers. Parse Account metadata as number-before-parentheses plus comma-separated currency/server values; generate `<company> · <number>` or `<company> · <server>`. If label/server cannot be completed, omit `detectedAccount` and allow the fallback UI.

- [ ] **Step 6: Implement Positions, balance, and summary mapping**

Map each valid Positions row to one synthetic exit deal with `ticketId = mt5-position:<positionId>`, `orderId = positionId`, the original side, and embedded open fields. Map only balance-like Deals rows to `BalanceEvent`; ignore trade Deals and all Orders rows. Compare Results trade count and total net profit using Decimal.js and add warnings for mismatches without changing valid records.

- [ ] **Step 7: Implement generic file dispatch**

Implement `parseTradeHistoryFile(file, sourceTimeZone)`: read one `ArrayBuffer`, call `detectImportFormat`, dispatch XLSX to `parseMt5Workbook`, or decode and wrap `parseExnessCsv(text, 'preview', sourceTimeZone)` as `sourceFormat: 'exness-csv'`, `sourceLabel: 'Exness CSV'`, and `parserVersion: EXNESS_PARSER_VERSION`. Translate unsupported/corrupt input into concise Indonesian user-facing errors without exposing XML or stack traces.

- [ ] **Step 8: Run parser tests and typecheck**

Run: `npx vitest run tests/unit/import-detection.test.ts tests/unit/mt5-workbook.test.ts tests/unit/data-import.test.ts`

Expected: PASS.

Run: `npm run check`

Expected: zero errors.

- [ ] **Step 9: Commit the workbook adapter**

```sh
git add package.json package-lock.json src/lib/import/mt5-workbook.ts src/lib/import/file.ts src/lib/import/index.ts tests/fixtures/mt5Workbook.ts tests/unit/mt5-workbook.test.ts
git commit -m "feat: parse MT5 history workbooks"
```

## Task 3: Account Resolution, Atomic Commit, and Backup Compatibility

**Files:**
- Create: `src/lib/import/accounts.ts`
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/import/index.ts`
- Modify: `src/lib/db/database.ts`
- Modify: `src/lib/backup/index.ts`
- Modify: `tests/unit/data-import.test.ts`
- Modify: `tests/unit/backup.test.ts`

**Interfaces:**
- Consumes: `DetectedAccountMetadata`, `ImportPreview`, and `ImportSourceFormat` from Task 1.
- Produces: `findMatchingAccount(accounts: Account[], metadata: DetectedAccountMetadata): Account | undefined`.
- Produces: `NewAccount = Pick<Account, 'label' | 'server' | 'currency' | 'sourceTimeZone'> & Partial<Pick<Account, 'id' | 'accountNumber' | 'createdAt'>>`.
- Produces: `ImportAccountTarget = { kind: 'existing'; accountId: string } | { kind: 'new'; account: NewAccount }`.
- Changes: `importParsedData(target: ImportAccountTarget, fileName: string, parsed: ImportPreview): Promise<ImportCommitResult>`.
- Changes: `ImportCommitResult` includes the resolved `account: Account`.

- [ ] **Step 1: Write failing account matching and validation tests**

Add assertions that matching trims and compares case-insensitively, prefers `server + accountNumber`, falls back to `server + label` only when the metadata number is empty, and does not match the same number on another server. Assert that `createAccount` accepts `accountNumber: ''`, requires non-empty label/server/currency for new accounts, and still stores platform `MT5`.

- [ ] **Step 2: Write failing atomic import and overlap tests**

Update existing callers to the target union, then add tests proving:

- A new target returns and stores its account in the same successful operation.
- A second preview with a different hash, the same MT5 position IDs, and one new position reports the old records as duplicates and inserts only the new record.
- Re-aggregation preserves a journal attached to the stable position ID.
- A mocked `db.deals.bulkAdd` rejection rolls back the just-created account and import batch.
- The same broker ticket remains valid in two different account IDs.

- [ ] **Step 3: Write failing old/new backup round-trip tests**

Assert that an `ImportBatch` with `sourceFormat: 'mt5-xlsx'` survives `serializeBackup`/`parseBackup`, while an old batch without `sourceFormat` still parses and remains without that property. Keep the encrypted-envelope literal unchanged.

- [ ] **Step 4: Run the focused tests and confirm failure**

Run: `npx vitest run tests/unit/data-import.test.ts tests/unit/backup.test.ts`

Expected: FAIL on the new matching, target, transaction, and backup assertions.

- [ ] **Step 5: Implement pure account matching**

Implement `findMatchingAccount` in `accounts.ts` using normalized trimmed lowercase strings. Export it from the import barrel. Do not query Dexie from this module.

- [ ] **Step 6: Update new-account construction and validation**

Refactor account normalization in `database.ts` so `createAccount` and atomic imports share it. Default a missing account number to `''`; require trimmed label, server, and currency for newly created accounts. Do not add a database version or index.

- [ ] **Step 7: Implement the atomic target-based import**

Resolve an existing account or add the normalized new account inside the same `db.transaction('rw', ...)` that writes import batches, deals, balances, and positions. Remap preview IDs to the resolved account as today. Set `ImportBatch.sourceFormat = parsed.sourceFormat` and `parserVersion = parsed.parserVersion`; remove the database layer’s dependency on `EXNESS_PARSER_VERSION`.

- [ ] **Step 8: Preserve batch source format in backups**

Add `sourceFormat: z.enum(['exness-csv', 'mt5-xlsx']).optional()` to `importBatchSchema`. Do not increment `BACKUP_SCHEMA_VERSION` because the field is backward-compatible and optional.

- [ ] **Step 9: Run focused and full unit tests**

Run: `npx vitest run tests/unit/data-import.test.ts tests/unit/backup.test.ts tests/unit/mt5-workbook.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all unit suites pass.

- [ ] **Step 10: Commit persistence changes**

```sh
git add src/lib/domain/types.ts src/lib/import/accounts.ts src/lib/import/index.ts src/lib/db/database.ts src/lib/backup/index.ts tests/unit/data-import.test.ts tests/unit/backup.test.ts
git commit -m "feat: resolve import accounts atomically"
```

## Task 4: File-first Import Wizard

**Files:**
- Modify: `src/components/dataClient.ts`
- Modify: `src/components/ImportWizard.tsx`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `src/styles/components/form.css` only if an existing class cannot express the metadata summary.

**Interfaces:**
- Consumes: `parseTradeHistoryFile`, `findMatchingAccount`, `ImportPreview`, `ImportAccountTarget`, and the target-based `importParsedData` from Tasks 1–3.
- Produces: `previewTradeHistory(file: File): Promise<ImportPreview>`.
- Produces: `resolveDetectedAccount(accounts: Account[], preview: ImportPreview): Account | undefined`.
- Produces: `commitTradeHistory(parsed: ImportPreview, target: ImportAccountTarget, fileName: string): Promise<ImportCommitResult>`.

- [ ] **Step 1: Add a failing automatic MT5 E2E test**

Use `makeMt5Workbook()` in `tests/e2e/smoke.spec.ts`. Upload `history.xlsx` before entering any account fields, click `Preview import`, and assert:

```ts
await expect(page.getByText('MT5 Workbook')).toBeVisible();
await expect(page.getByText('Example Broker Ltd · 123456')).toBeVisible();
await expect(page.getByText(/2 trade valid/)).toBeVisible();
await expect(page.getByLabel('Nama account')).toHaveCount(0);
```

After `Simpan import`, assert `Import selesai`, `3 data baru` (two synthetic trade records plus one balance event), and two rows on `/trades/`. This test also proves a valid unrelated sheet name/row layout from the fixture is accepted.

- [ ] **Step 2: Build and run the focused E2E test to confirm failure**

Start the managed server with: `npx astro dev --background`

Confirm it with: `npx astro dev status`

Then run: `npx playwright test tests/e2e/smoke.spec.ts -g "MT5 workbook"`

Expected: FAIL because `.xlsx` is not accepted and the current wizard starts with account entry.

- [ ] **Step 3: Replace CSV-specific data-client methods**

Replace `previewCsv` and `commitCsv` with the three functions in Interfaces. `previewTradeHistory` supplies the resolved browser timezone. `resolveDetectedAccount` returns `undefined` when metadata is absent or no account matches; the caller distinguishes “create automatically from metadata” from “show fallback controls.”

- [ ] **Step 4: Refactor the wizard into three readable steps**

Rewrite `ImportWizard.tsx` as readable JSX with `File`, `Review`, and `Selesai` steps:

- File accepts `.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Review shows source label, detected account decision, trade/balance/issue counts, issues, and up to five preview rows.
- Complete retains inserted/duplicate/failed reporting and links to Trades.
- Detected complete metadata silently chooses an exact match or prepares a new account target.
- Missing metadata shows existing-account selection plus a new-account option requiring `Nama account` and `Broker / server`; `Nomor account (opsional)` may be empty and currency defaults to `USD`.
- Selecting a different file clears preview, account target, result, and errors.
- Account creation occurs only when `Simpan import` is clicked.

- [ ] **Step 5: Handle parsing and transaction failures safely**

Show neutral errors in the existing `role="alert"` notice, keep the user on the relevant step, and do not persist an account during preview. Use `finally` to clear busy state. Do not render stack traces or workbook internals.

- [ ] **Step 6: Run focused E2E, unit tests, and typecheck**

Run: `npx playwright test tests/e2e/smoke.spec.ts -g "MT5 workbook"`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: zero errors.

- [ ] **Step 7: Commit the file-first wizard**

```sh
git add src/components/dataClient.ts src/components/ImportWizard.tsx src/styles/components/form.css tests/e2e/smoke.spec.ts
git commit -m "feat: add file-first trade import flow"
```

If `form.css` was not changed, omit it from `git add`.

## Task 5: Exness Fallback, Broker-neutral Copy, Documentation, and Final Verification

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/typing.spec.ts`
- Modify: `src/pages/import/index.astro`
- Modify: `src/lib/nav.ts`
- Modify: `src/components/DashboardApp.tsx`
- Modify: `src/components/TradesApp.tsx`
- Modify: `src/components/WeeklyReviewApp.tsx`
- Modify: `src/components/SettingsApp.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: the file-first wizard and metadata-fallback form from Task 4.
- Produces: consistent broker-neutral UI copy and documented support for `MT5 workbook atau Exness CSV`.

- [ ] **Step 1: Update the Exness E2E flow first and confirm it fails against incomplete copy/flow**

Change the CSV smoke test to upload first, click `Preview import`, then select an existing account or create one with:

- `Nama account = Exness utama`
- `Broker / server = Exness-MT5Real`
- Empty optional account number in at least one test.

Assert the source badge is `Exness CSV`, commit succeeds, and analytics still reports one closed position. Update `typing.spec.ts` the same way while preserving its keyboard-only search assertion.

Run: `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/typing.spec.ts`

Expected: FAIL until the fallback labels/copy and all helpers match the new flow.

- [ ] **Step 2: Replace Exness-only product copy**

Use these exact primary strings:

- Page/nav title: `Import riwayat trading`.
- File prompt/help: `MT5 workbook atau Exness CSV`.
- Generic button text: `Import riwayat` or `Preview import` as appropriate.
- Empty states: refer to `riwayat trading` or `data broker`, not `CSV Exness`.

Keep `Exness CSV` only where it identifies that adapter/source. Do not rename FerikTrading.

- [ ] **Step 3: Make Settings account display tolerate no account number**

Display label and server for every account. Include account number only when `account.accountNumber` is non-empty; never render a dangling separator such as ` · MT5` for the empty value.

- [ ] **Step 4: Update README usage and privacy documentation**

Document standard MT5 `.xlsx` reports and Exness CSV, automatic workbook account metadata, fallback account name/server input, local-only parsing, and the browser/device timezone rule. Update local development instructions to use the repository’s background Astro command.

- [ ] **Step 5: Run copy, navigation, Exness, and typing regressions**

Run: `npm test`

Expected: all unit tests pass, including `tests/unit/nav.test.ts`.

Run: `npm run check`

Expected: zero errors.

Run: `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/typing.spec.ts`

Expected: all selected E2E tests pass.

- [ ] **Step 6: Validate the supplied workbook locally without committing it**

Using the running local app, upload `D:\Development\stuff\ReportHistory-35917329.xlsx`. Verify the review shows:

- Source `MT5 Workbook`.
- Vantage Markets metadata from the workbook without manual account fields.
- 69 valid closed positions.
- Balance events from Deals.

Commit the import once, import the same workbook again, and verify the second import reports no new trade/balance records. Clear only the test browser profile afterward; do not alter the workbook.

- [ ] **Step 7: Run the complete release verification**

Run: `npm test`

Expected: PASS.

Run: `npm run check`

Expected: zero errors.

Run: `npm run test:e2e`

Expected: PASS against the already-running local server, per `AGENTS.md`.

Stop the managed server with: `npx astro dev stop`

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 8: Commit copy, documentation, and regression coverage**

```sh
git add tests/e2e/smoke.spec.ts tests/e2e/typing.spec.ts src/pages/import/index.astro src/lib/nav.ts src/components/DashboardApp.tsx src/components/TradesApp.tsx src/components/WeeklyReviewApp.tsx src/components/SettingsApp.tsx README.md
git commit -m "docs: describe MT5 and Exness import support"
```

## Completion Criteria

- A standard MT5 workbook imports through a file-first flow with no manual account input when metadata is complete.
- The supplied workbook resolves its account and previews 69 closed positions.
- Existing Exness CSV variants still import through the minimal metadata fallback.
- Repeated and overlapping MT5 reports do not duplicate stable positions or balance events.
- Account creation and trade persistence are atomic.
- Old databases and backups continue to load, and new backup round trips preserve source format.
- User-visible copy describes MT5 workbook and Exness CSV support without changing the FerikTrading name.
- Unit tests, Astro check, Playwright tests, and `git diff --check` all pass.
