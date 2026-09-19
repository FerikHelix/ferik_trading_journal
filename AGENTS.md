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
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
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
hydrated React island, and Astro's scoping never reaches markup a framework
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
   `src/components/ui/icons.ts`).
2. Create `src/pages/<id>/index.astro` rendering `AppLayout active="<id>"`.

`tests/unit/nav.test.ts` checks ids are unique, paths end in `/`, and every
icon name exists.

## Market data

All fetching happens in the browser — there is no backend and no scheduled job.
`src/lib/market/client.ts` is cache-first against IndexedDB because the free
tiers are small (Twelve Data 800/day and 8/min, Alpha Vantage 25/day), and it
returns stale cached candles rather than throwing when a provider fails.

Providers are selected per instrument in `src/lib/market/instruments.ts`. Only
sources that send `Access-Control-Allow-Origin` can ever be used; Yahoo
Finance, GDELT and every finance RSS feed do not, which is why silver and crude
oil need a user-supplied proxy.

Prices use `number`, unlike account money which is `DecimalString`. See the note
at the top of `src/lib/market/types.ts` before changing that.

## Testing

```sh
npm test            # vitest, lib/ only
npm run check       # astro check
npm run test:e2e    # playwright
```

If port 4321 is already taken, run e2e with `PREVIEW_PORT=4331 npx playwright test`.

`tests/e2e/smoke.spec.ts` derives its fixture dates from the current week. Do
not hard-code a date there — the weekly-review assertions depend on the trade
landing exactly one week back.
