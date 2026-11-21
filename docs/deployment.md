# Deployment (Vercel)

BuBu is a fully static site: no server, no API, no accounts. Everything a user makes is stored in their own browser.

## Production URL

**Not recorded yet.** Fill this in after the first successful deployment, together with the date and the commit it was built from:

| | |
| --- | --- |
| Production URL | _to be filled in after the first deploy_ |
| Deployed commit | _to be filled in_ |
| Smoke test result | _to be filled in (`SMOKE_URL=<url> npm run smoke`)_ |

## What is configured, and why

Everything the host needs is in `vercel.json`:

| Setting | Value | Why |
| --- | --- | --- |
| `framework` | `null` | The site is built by `adapter-static`, not by a Vercel framework preset. |
| `installCommand` / `buildCommand` | `npm ci` / `npm run build` | The same commands used locally; `npm ci` installs exactly what the lockfile says. |
| `outputDirectory` | `build` | `adapter-static` writes the site to `build/`. Vercel's default for a project with no preset is `public`, which is what caused `STATIC_BUILD_NO_OUT_DIR`. |
| `rewrites` | `/(.*)` → `/200.html` | The single-page fallback the build writes. An editor address such as `/budgets/<id>` has no file of its own, so without this a direct link or a reload would be a 404. The host serves real files first, so only unknown addresses reach the fallback. |
| `cleanUrls` | `true` | Prerendered pages are served at `/design`, not `/design.html`. |
| `headers` | immutable cache for `/_app/immutable/*` | Those files have content hashes in their names, so they can be cached for a year. |

The adapter is configured in `vite.config.ts` (`adapter({ fallback: '200.html' })`) and every route is prerendered or client-only (`src/routes/+layout.ts`), so the build runs no server code. The store reads no browser storage until the app starts in the browser, which is why the build and prerender never touch `localStorage`.

Project settings in Vercel that must **not** override these: Framework Preset "Other", and no custom Output Directory (or `build`). If the dashboard has an Output Directory set, it wins over `vercel.json`.

**Optional environment variable:** `VITE_SITE_URL` (for example `https://your-domain`). When set, the build adds the canonical link, `og:url`, `og:image` and the sitemap entry, which all need a full address.

## Secrets

The app needs none: no API keys, no tokens, no backend. The repository is public, so keep it that way: never commit `.env*` files (they are git-ignored, except `.env.example`), and never put a secret in a `VITE_*` variable, because those are compiled into the public JavaScript. `VITE_SITE_URL` is a public address and is safe.

## Build once, reproducibly

```
npm ci
npm run build      # writes the static site to build/
```

Node and npm versions are those the project uses locally; the lockfile pins every dependency.

## Smoke test of a deployed site

```
SMOKE_URL=https://your-deployment.example npm run smoke
```

Without `SMOKE_URL` the same test runs against the local build (it is also part of `npm test`). In a fresh browser it checks:

1. The landing page loads and the Budgets drawer opens (empty state).
2. Creating an empty Budget, adding and editing an Item, then **reloading on the editor route**: the data and the total survive, and the host does not 404.
3. A direct link to an editor route opens in a fresh tab, and an unknown Budget address shows "Budget not found" rather than a server error.
4. A Budget created from a landing-page template survives a reload.
5. Excel export downloads an `.xlsx`, and importing it back opens the copy.
6. No request failed and no script error was thrown on the way.

## Before first launch

The deploy itself, the production URL and the smoke result are filled in by whoever runs the first deployment; this repository cannot do that from here. The responsive, accessibility, error-presentation and integration prerequisites listed on the ticket are the earlier tickets, each merged to `main` with its own tests.
