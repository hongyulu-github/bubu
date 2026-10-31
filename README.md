# bubu

BuBu is a budget builder. This repository holds the application source code only. Budgets are stored in users' browsers and are not version controlled.

## Repository

- GitHub: https://github.com/hongyulu-github/bubu
- Remote: `git@github.com:hongyulu-github/bubu.git`
- Default branch: `main`

## Development

BuBu is a static, client-only SvelteKit app (Svelte 5 runes, TypeScript, `adapter-static`). There are no server endpoints or accounts. Requires Node 22+.

```sh
npm install
npx playwright install chromium   # once, for browser component tests
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Prerender the app to static files in `build/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Type-check with `svelte-check` |
| `npm test` | Run unit tests (Node), component tests (real Chromium) and end-to-end tests against the built site, once. The e2e project runs `npm run build` itself |
| `npm run test:unit` | Run the tests in watch mode |

Layout: application code in `src/lib` (import via `#lib`), static routes in `src/routes`. Every route is prerendered (`src/routes/+layout.ts`), so code that touches browser globals such as `window` or `localStorage` must run inside `onMount`, an `$effect`, or an event handler, or the build will fail.

Tests: `*.spec.ts` run in Node; `*.svelte.spec.ts` run in a real browser via `vitest-browser-svelte` (see `src/lib/smoke`); `e2e/*.e2e.ts` drive the built static site in Chromium with Playwright.

Saving: there is no Save button. `BudgetPersistence` (`src/lib/state/persistence.svelte.ts`) is the one automatic save path: it watches the shared state and writes whatever changed (Budget documents and flat Item arrays only) to `localStorage` through `src/lib/storage/bubu.ts`, under `bubu:` keys. Undo and redo results are saved like any other change; the history itself is never stored, so it starts empty after a reload. If saving fails (storage full or unavailable) an alert appears, the work stays on screen, and the next change or "Try again" retries. Data it cannot read is never overwritten.

Editor keys: the spreadsheet is one stop in the Tab order. With a cell focused, the arrow keys move between cells (read-only ones included, collapsed rows skipped); Enter or F2 starts editing an editable cell. While editing, Enter commits and moves down, Tab and Shift+Tab commit and move to the next or previous editable cell, and Escape cancels; an invalid value stays in the cell with its message. Arrow keys inside an input only move the caret. Code, Total and a Group's Unit price never enter edit mode. Undo and redo shortcuts are separate (LUL-60).

Actions are icons, not text buttons: each has an accessible name and a tooltip (with its shortcut). A Budget's name renames in place (double-click it, or the pencil button; Enter saves, Escape cancels). Row actions (add below, add child, delete) appear on hover or focus (no right-click menu in the table, so the browser's cut, copy and paste menu works in cells); the Budgets list has a "⋯" menu and a right-click menu per Budget (rename, duplicate, delete). "New item" is the last row of the table. Table amounts (Unit price, Total) are plain numbers rounded to the currency's decimals; only the Grand total shows the currency symbol and thousands separators.

Routes: `/budgets` lists saved Budgets, `/budgets/new` creates an empty one, and `/budgets/<uuid>` opens one. Budget URLs depend on browser-local data, so they are not prerendered: the build emits an SPA fallback (`200.html`) and **the host must serve `/200.html` for any URL it has no file for** (a rewrite; configure this when deploying).

UI: [stdf](https://stdf.dev) components with the Starbucks theme on Tailwind 4 (see the update note in [docs/design-foundation.md](docs/design-foundation.md)). Design tokens and base components (`Button`, `Input`, `NumberInput`, `Dialog`, `TableCell`) are documented in [docs/design-foundation.md](docs/design-foundation.md), including source and license. Run `npm run dev` and open `/design` for a live preview.

A tree drag-and-drop prototype lives at `/prototypes/tree-dnd`; integration notes are in [docs/pragmatic-tree-dnd.md](docs/pragmatic-tree-dnd.md).

## Version-control workflow

Clone:

```sh
git clone git@github.com:hongyulu-github/bubu.git
cd bubu
```

Make a change on a branch:

```sh
git switch -c <branch-name>
git add <files>
git commit -m "Describe the change"
```

Push:

```sh
git push -u origin <branch-name>   # first push of a branch
git push                           # later pushes
```

Pull the latest changes:

```sh
git pull --ff-only
```

## Notes

- Push access requires being authenticated as the `hongyulu-github` account (SSH key or `gh auth login`).
- Never commit secrets. `.env` and `.env.*` are ignored; commit only `.env.example` files with placeholder values.
- Dependencies (`node_modules/`) and build output (`/build`, `/.svelte-kit`) are ignored.
