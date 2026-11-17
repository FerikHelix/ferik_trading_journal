# Tasks

## 1. Baseline and branch

- [x] 1.1 Commit or stash `src/components/ImportWizard.tsx`, `src/components/dataClient.ts`, and `tests/e2e/smoke.spec.ts`, then confirm `git status --short` is clean and `npm test && npm run check` pass on `main`
- [x] 1.2 Tag `v1.0`, create `archive/v1`, and branch `v2`; verify `git branch -a` shows all three and `.github/workflows/deploy.yml` still triggers on `main` only

## 2. Domain model and storage

- [x] 2.1 Add `DeskKind`, extend `Account` with `kind`, `startingBalance?`, `openedAt?`, and add `Plan`, `Rule`, `Session`, and `Reading` types in `src/lib/domain/types.ts`; verify `npm run check` passes and no existing field changed type
- [x] 2.2 Add Dexie version 6 with `plans` and `sessions` tables and an upgrade that backfills `kind: 'personal'` on existing accounts; verify a unit test in `tests/unit/` seeds a v5 database with `fake-indexeddb`, opens it, and asserts kind is backfilled while `startingBalance` stays unset
- [x] 2.3 Guard plan attachment in the data layer so a plan cannot be written for a personal desk and a desk with a plan cannot be switched to personal; verify unit tests cover both rejections
- [x] 2.4 Bump the backup snapshot schema version and accept version 1 payloads as personal desks with no starting balance; verify `tests/unit/backup.test.ts` covers both versions and the encrypted literal still round-trips
- [x] 2.5 Confirm day-open balance derivation (starting balance plus preceding deposits and withdrawals, excluding the day's own result); verify a unit test covers a deposit before the first trade of a day

## 3. Firm day and time

- [x] 3.1 Implement `firmDayKey(iso, resetTime, resetTimeZone)` in `src/lib/` using `Intl.DateTimeFormat.formatToParts`; verify unit tests cover a non-midnight reset, a trade just before and just after the boundary, and both DST transitions for a European zone
- [x] 3.2 Make day grouping selectable per desk so prop desks use the plan clock and personal desks use the display timezone; verify a unit test asserts the same position lands on different day keys under the two modes

## 4. Plans and the rule wall

- [x] 4.1 Implement the zod plan schema and the markdown extractor that pulls one fenced `json` block and parses markdown checkboxes; verify unit tests cover a valid paste, a missing block, and a checkbox list
- [x] 4.2 Reject invalid plans with per-field errors while keeping the previous plan in force and preserving the pasted text; verify a unit test asserts a negative limit is rejected, the stored plan is unchanged, and the input text is returned
- [x] 4.3 Implement the three-tier rule model (computed, soft, attested) and its assembly from a parsed plan; verify a unit test asserts attested rules are never marked satisfied from trade data and that soft rules report a count against their cap
- [x] 4.4 Persist per-firm-day checklist ticks and the one-line note on `sessions`; verify a unit test asserts ticks for two different days do not bleed into each other

## 5. Guardrails

- [x] 5.1 Implement daily loss evaluation per firm day against the plan limit, returning a `Reading` with used percentage; verify unit tests cover under-limit, over-limit, and a plan with no daily limit configured
- [x] 5.2 Implement the total loss floor for static and trailing modes; verify unit tests assert a static floor never moves and a trailing floor rises with the balance peak
- [x] 5.3 Attach a confidence level to every reading, using `exact` for realized results and plan-free values, `estimate` for trailing drawdown and days without a recorded low, and `attested` once a lowest equity exists; verify unit tests assert each transition
- [x] 5.4 Implement lowest-equity recording and its effect on the day's used limit; verify a unit test asserts the reading is recomputed from the low and labelled `attested`, and that an absent low leaves the day computable
- [x] 5.5 Implement target progress, minimum trading days, and the consistency cap over reset-clock days; verify unit tests cover half-target, a single day exceeding the cap (naming the day), and a plan with no consistency cap
- [x] 5.6 Report a breached day or plan without hiding or deleting the desk; verify a unit test asserts the breach flag is set and the downstream history still resolves

## 6. Import

- [x] 6.1 Extend content detection to recognise MT5 CSV alongside Exness CSV and MT5 workbook; verify a unit test imports a workbook renamed to `.csv` and asserts unsupported content is rejected without writing
- [x] 6.2 Change account matching to account number alone with a label fallback, ignoring server strings; verify a unit test asserts two exports with the same number and different servers resolve to one desk
- [x] 6.3 Add the explicit duplicate-account merge that moves deals, balance events, positions, plans, and sessions onto the survivor and reports moved counts; verify a unit test asserts no records are lost and the reported counts match
- [x] 6.4 Add desk creation from export metadata as a personal desk when the number is unknown, with no prompts; verify a unit test asserts exactly one desk is created and the history lands on it
- [x] 6.5 Preserve atomic commit and idempotent re-import through the reworked path; verify the existing data-import tests still pass unchanged and add one case covering an overlapping export

## 7. Calendar

- [x] 7.1 Implement day aggregation returning count, realized amount, opening balance, and used budget share per day; verify unit tests cover a trading day, a flat day, an empty day, and a day whose opening balance is unknown
- [x] 7.2 Render the month grid with trade count and result in money and percent, showing no percentage when the opening balance is unknown; verify a component-level test or Playwright check asserts an unknown-balance day renders no `%`
- [x] 7.3 Render the loss-budget bar only for prop desks; verify a Playwright check asserts the bar appears on a prop desk and is absent on a personal desk
- [x] 7.4 Add month navigation that preserves the active desk and day drill-down listing that day's positions; verify a Playwright check opens a day with trades and asserts the listed symbols match

## 8. Shell replacement

- [x] 8.1 Build the session-close surface composing the import action, day summary, guardrail bars, checklist, and note; verify it loads with imported data and completes with one import action and no intermediate confirm step
- [x] 8.2 Add `requires?: 'propfirm'` to `src/lib/nav.ts` entries and reduce navigation to six destinations; verify `tests/unit/nav.test.ts` is extended and asserts the prop-only destination is excluded for a personal desk and included for a prop desk
- [x] 8.3 Add the Trades calendar/list toggle and replace the eight-filter toolbar with search plus result and date range; verify a Playwright check filters by result and date and asserts the row count changes
- [x] 8.4 Replace the remaining pages and delete each old page and its styles as its replacement lands; verify `npm run build` succeeds and no unreferenced page or stylesheet remains
- [x] 8.5 Delete the old styles and rebuild the token and component layers; verify `tests/unit/tokens.test.ts` passes with matching light/dark sets and plain-hex `--chart-*` values
- [x] 8.6 Update `AGENTS.md` for the new module layout and the prop-only navigation marker; verify the documented commands (`npm test`, `npm run check`) run as written

## 9. Integration

- [x] 9.1 Run `npm test` and `npm run check` clean on `v2`
- [x] 9.2 Run the e2e suite locally against a started preview server and confirm the import, typing, shell, and smoke specs pass
- [x] 9.3 Verify a v5 database from `v1.0` opens on `v2` with history intact, existing accounts read as personal, and percentages unavailable until a starting balance is set

## Workflow follow-up

- Archive the change with `openspec archive prop-desk-v2` once review requirements are met.
- Merge `v2` into `main` to deploy; keep `v1.0` and `archive/v1` for rollback.
