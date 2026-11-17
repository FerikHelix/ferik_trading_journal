## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using Preact or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Identifiers that must never be renamed

These are storage keys, not branding. Renaming any of them silently destroys or
strands user data, and there is no server-side copy to recover from.

| Identifier | Where | What breaks |
| --- | --- | --- |
| `ferik-trading-journal` | `src/lib/db/database.ts` | IndexedDB name. A new, empty database opens and every imported trade is stranded. |
| `ferik-trading-journal-encrypted` | `src/lib/backup/index.ts` | Encrypted backups already on disk stop restoring (`z.literal` check). |
| `ferik-journal-theme` | `src/lib/theme/index.ts` | Theme preference resets. Reference it through `THEME_STORAGE_KEY`, never as a literal. |
| `ferik_trading_journal` | `astro.config.mjs` | GitHub Pages base path. Every deployed URL 404s. |

The product name is **FerikTrading**; only user-visible strings carry it.

## Styling

`src/styles/global.css` is a barrel of `@import`s — Vite inlines them into one
stylesheet. Put new rules in the matching file under `tokens/`, `layout/`,
`components/` or `pages/`, and add the import in cascade order (low specificity
first).

The design system must stay **global**, not Astro-scoped: every page body is a
hydrated Preact island, and Astro's scoping never reaches markup a framework
component renders.

Two rules the tests enforce (`tests/unit/tokens.test.ts`):

- Light and dark must declare the **same token set**. A token present in one
  theme only fails the build.
- Every `--chart-*` token must be plain hex or 8-digit hex. `ChartPanel` reads
  them with `getComputedStyle` and hands the raw string to canvas, which cannot
  parse `color-mix()` or `var()`.

Order also matters within the barrel: `.icon-btn` sets `display: grid` in
`components/nav.css`, so rules in `layout/app-shell.css` that hide icon buttons
need extra specificity to survive the cascade.

## Adding a page

1. Add the entry to `src/lib/nav.ts` (grouped, with an icon from
   `src/components/ui/icons.ts`). Set `requires: 'propfirm'` if the page only
   makes sense for a challenge desk.
2. Create `src/pages/<id>/index.astro` rendering `AppLayout active="<id>"`.

`tests/unit/nav.test.ts` checks ids are unique, paths end in `/`, every icon
name exists, the navigation stays at six destinations, and `navGroupsFor(kind)`
hides prop-only entries from a personal desk.

The sidebar is server-rendered, so prop-only links ship with `hidden` and
`AccountSwitcher` reveals them once the active desk is known. Do not render them
unconditionally — a personal desk must not see a plan entry, even briefly.

## Desks: personal and prop firm

An `Account` is a **desk**, and its `kind` decides which physics apply. A
personal desk is judged on results. A prop firm desk is judged on how much of
each limit is left, so it carries a `Plan` the personal desk never sees.

- `Account.startingBalance` is what every percentage is measured against. When
  it is unset, percentages report as unavailable — never `0%`. A blank is
  honest; zero is a lie.
- `Plan` is stored as markdown plus a validated parse of its fenced `json` block.
  `applyPlanText` is the only write path: a rejected paste writes nothing, so the
  previous plan keeps guarding the desk.
- Rules are a three-tier union (`src/lib/desk/rules.ts`): computed limits the
  system derives, soft caps it counts against, and attested rules only the trader
  can tick. Never auto-satisfy an attested rule from trade data.
- Every guardrail reading carries a `confidence` of `exact`, `estimate` or
  `attested`. Closed-trade exports cannot see an intrabar equity low, so a
  realized-only daily loss must never be presented as breach-proof.

## The day boundary

`src/lib/desk/day.ts` computes a firm day from the plan's reset time and zone.
Firms rarely reset at UTC midnight and never at the trader's display midnight, so
every daily number (loss used, trade count, ticks) is bucketed through
`firmDayKey`. Changing the reset clock in a plan re-groups history at read time;
nothing is stored per position.

Balance baselines are compared by day key, not timestamp, so no caller has to
invert a timezone to find "the start of the day".

## Preact, not React

Islands import from `preact/hooks`. Two rules exist because the compiler will
not catch either mistake:

- **Text inputs and textareas use `onInput`, never `onChange`.** Preact binds
  `onChange` to the native `change` event, which only fires on blur, so a
  controlled field silently stops accepting typed text. Selects, radios and
  file inputs keep `onChange` — there the native event is correct.
  `tests/e2e/typing.spec.ts` guards this, and it is written to actually fail:
  asserting the field's own value proves nothing (with no re-render the browser
  keeps the typed text), so it asserts a state-driven side effect instead.
- **Use `event.currentTarget`, not `event.target`.** Preact types `target` as a
  bare `EventTarget` with no `.value`. This one does fail typecheck.

`useSyncExternalStore` does not exist in `preact/hooks`; `useActiveAccount`
uses a plain subscription instead.

## Offline-first architecture

All journal storage and analytics happen entirely in the browser using IndexedDB
(`ferik-trading-journal`). There is no backend, no telemetry, no tracking, and
no external API dependencies. The app runs completely offline.

## Testing

```sh
npm test            # vitest, lib/ only
npm run check       # astro check
npm run test:e2e    # playwright — local only, NOT in CI
```

CI runs `npm test` and `npm run check` before deploying. The Playwright job was
removed: it could never get a preview server to answer on the runner
(`Timed out waiting 60000ms from config.webServer`) and blocked every deploy.

Locally, `astro preview` detaches into a background daemon when it detects an
agent environment, which makes Playwright's `webServer` look like it exited.
Start the server yourself first, then run the tests against it.

If port 4321 is already taken, run e2e with `PREVIEW_PORT=4331 npx playwright test`.

`tests/e2e/smoke.spec.ts` derives its fixture dates from the current week. Do
not hard-code a date there — the weekly-review assertions depend on the trade
landing exactly one week back.
