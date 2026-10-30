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

Routes: `/budgets` lists saved Budgets and `/budgets/<uuid>` opens one. Budget URLs depend on browser-local data, so they are not prerendered: the build emits an SPA fallback (`200.html`) and **the host must serve `/200.html` for any URL it has no file for** (a rewrite; configure this when deploying).

Design tokens and base components (`Button`, `Input`, `NumberInput`, `Dialog`, `TableCell`) are documented in [docs/design-foundation.md](docs/design-foundation.md), including source and license. Run `npm run dev` and open `/design` for a live preview.

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
