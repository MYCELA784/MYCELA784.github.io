# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MYCELA is a static site (live at `www.mycela.in`, GitHub Pages from `main`) — an industrial bearing parts intelligence tool. No framework, no bundler. Vanilla HTML/CSS/JS.

**On this branch (`site-switch`) the browser no longer receives the catalogue.** The page asks the search API (`api/`) and gets only matching parts. `index.html` and `about.html` do not load `bearings_db.js`, `js/db.js`, `js/schema-registry.js` or `js/search/*`; those now run only inside the API Worker and in Node tests. Nothing is deployed: `main` and the live site are unchanged and still search in the browser.

## Running locally

```
node scripts/preview.js     # builds dist/, search API on :8787, site on :8080
```

Needs `npm install` in `api/` once. Plain steps: `docs/local-preview.md`. The
page needs the API: opened without it (a bare `python -m http.server`, or
`file://`) it loads but every search shows "Search is not available right
now".

## Architecture

### Namespace

All modules attach to a single shared global: `window.MYCELA = window.MYCELA || {}`. Each file does `(function(ns){ ... })(window.MYCELA = window.MYCELA || {})` and attaches one object (e.g. `ns.Router`, `ns.SearchEngine`, `ns.Renderer`). `js/app.js` is loaded last and wires everything together, then assigns thin `window.*` aliases for HTML `onclick` attributes.

### Script load order in the browser (dependency chain)

```
site.js                 → header, theme (all pages)
js/config.js            → MYCELA.CONFIG  (all tunable values; CONFIG.api.baseUrl)
js/escape.js            → MYCELA.esc()   (the one HTML escape function)
js/constants.js         → MYCELA.BC, MYCELA.TI, BRAND_COLORS, SUFFIX_CODES
js/api.js               → MYCELA.Api.*   (search API client and the parts the page has been sent)
js/tables/dgbb_tables.js → MYCELA.DGBB_TABLES (SKF catalogue tables, pure data)
js/tables/fag_tables.js  → MYCELA.FAG_TABLES (FAG's own factor table, pure data)
js/dgbb_calc.js         → MYCELA.DGBBCalc.* (modal load calculator)
js/renderer.js          → MYCELA.Renderer.*
js/router.js            → MYCELA.Router.showPage()
js/supplier-form.js     → MYCELA.SupplierForm.submit()
js/features.js          → MYCELA.Basket (the inquiry list)
js/canvas.js            → self-initialising IIFE (no exposed API)
js/app.js               → wires all modules, sets window.* shims
```

Order matters. Never reorder these `<script>` tags.

The search engine keeps its own order, loaded by the API Worker
(`api/src/search.js`) and by `tests/run.js`, not by any page:
`js/config.js`, `js/constants.js`, `js/schema-registry.js`,
`js/search/parsers.js`, `rules.js`, `scoring.js`, `fallback.js`,
`engine.js`. `bearings_db.js` and `js/db.js` (`MYCELA.prepareDB`) are read
only by the build and seed scripts and by tests.

### No catalogue in the browser

There is no `MYCELA.DB` or `MYCELA.DB_MAP` on the page. `MYCELA.Api`
(`js/api.js`) is the only source of parts:

- `Api.search(q)` → `GET /search`; answers are kept per query for the page's
  lifetime, so a repeated search makes no request.
- `Api.parts(ids)` → `GET /parts` (50 ids a request), for the stored list,
  `alt` ("Same fit") equivalents and opening one part by id.
- `Api.stats()` → `GET /stats`, for the catalogue count on `index.html` and
  `about.html` (the literal in the markup shows until it answers).
- `Api.known(id)` is what the modal, compare, calculator and list read. A
  part exists on the page only if the API has sent it.

Things that used to scan the whole catalogue now ask the API: the modal's
same-size list searches for `"25x52x15"` and keeps results within 0.5 mm;
autocomplete is the first 6 results of the search itself whose part number
contains the typed text. Do not reintroduce a catalogue download to restore
a feature; add to the API instead.

### Escaping

Everything shown on the page that comes from a part, the visitor or an error
goes through `MYCELA.esc()` before `innerHTML`, or is set with
`textContent`. Part ids go into `data-` attributes and are acted on by
delegated listeners in `js/app.js` (`data-info`, `data-add`, `data-cmp`,
`data-x`, `data-open`, `data-inq`, `data-q`, `data-rm`); never build an
inline `onclick` from data. `node tests/escape.js` feeds the page parts made
of `<img src=x onerror=alert(1)>` and fails if any reaches the page as markup.

### Search pipeline

In the browser (`js/app.js` → `doSearch()`): typing waits
`CONFIG.api.debounceMs` (150 ms) after the last keystroke, then one
`Api.search(q)`; Enter, example buttons and "Find by size" do not wait. A
newer search aborts the request in flight (AbortController) and a sequence
number makes sure an older answer is never shown over a newer one.
"Searching..." appears only if a request takes over `CONFIG.api.slowMs`
(300 ms). If the API cannot be reached, or answers 429, the grid shows a
plain message (`Api.message()`), with "Try again" unless rate limited.

In the API (`api/src/search.js` → `runSearch()`), the same two steps the
browser used to run:

1. **`MYCELA.SearchEngine.fast(q)`** — calls `parse()` to extract structured intent (bore/OD/width in mm, load ratings, type, brand, sealing, application tags, environment notes), then scores every bearing in `MYCELA.DB` using `Scorers.*`. Returns up to `CONFIG.search.maxResults` results, each with `_score`, `_matchType`, `_breakdown` (never sent to the browser).
2. **`MYCELA.SearchEngine.fallback(q)`** — if step 1 returns zero results, progressively relaxes constraints through 4 stages (tolerances in `CONFIG.fallback`). It needs a bore (stages 1–3) or a bearing type (stage 4) to relax from; any other query (gibberish, a bare brand, an application word, an unknown designation) gets no results and the empty state. The old stage 5, which filled that case with the first 6 deep groove rows in the DB, was removed 2026-09-27.

The answer's `stage` is `"exact"` when step 1 answered, otherwise the fallback's stage.

Zero-result queries (`stage` not `"exact"`, whatever the fallback then supplied) are also POSTed to the telemetry endpoint as the catalogue-gap signal, but only when the user presses Enter or once typing pauses for `CONFIG.search.zeroReportIdleMs` (2 s), whichever comes first; a newer query or clearing the box cancels the pending report, a report that falls due before the API has answered waits for the answer, and each query is sent at most once per session. A failed search is never reported. The payload carries `fallbackStage`, taken from the API's `stage`: 1–4 when the fallback relaxed a real size or type into results ("no such size"), 0 when the query had a size or type but nothing was within tolerance, `null` when there was nothing parsable to relax from. Reports sent before 2026-09-27 have no such field. `node tests/search-debounce.js` pins the request and telemetry behaviour; `node tests/site-search.js` checks, against the real Worker, that the page shows the engine's parts, order, note and stage for every `tests/search-cases.json` query.

**AI refiner removed 2026-09-27.** Search used to have a third step, `MYCELA.AIRefiner.refine(q)` (`js/ai-refiner.js`), which POSTed the query to `https://mycela-backend.onrender.com/search`. It was turned off and the file deleted because it had not been working: the backend only ever saw 50 bearings, its own index had 1,719 rows against the live catalogue's 3,666 at the time (the catalogue itself was never 1,719), that index predates the June rebuild, and free-tier cold starts exceed the 12-second client timeout. `CONFIG.search.backendUrl` and `aiTimeoutMs` are kept in `js/config.js`, commented as unused.

### Tuning search ranking

**All numeric weights live in `js/config.js`** under `CONFIG.scoring` — never hardcoded in scorer files. To adjust ranking, edit only `config.js`. The keys map directly to scorer function names in `js/search/scoring.js` (e.g. `CONFIG.scoring.boreExact` → `Scorers.bore()`).

To add a new environment/application pattern, edit the rule tables in `js/search/rules.js` — no logic changes needed.

### Modal load calculator

`js/dgbb_calc.js` (ported from the separate `bearing_calc` project, with its
catalogue tables in `js/tables/dgbb_tables.js`) computes basic rating life L10h,
the minimum-load check and the speed check for **deep groove ball bearings**,
under a radial load for every eligible row and under a combined (radial + axial)
load for FAG single row rows only (below). `js/renderer.js` renders it as a collapsed
section under the modal's specs grid, and only when `DGBBCalc.supports(b)`
is true — i.e. `type === 'Deep Groove Ball'`, `cr`, `c0r`, `bore`, `od`
and `rpm` are all present, and `rpm` is plausible for the size (n·dm at or
above `MIN_N_DM`, derived in `js/dgbb_calc.js`; 29 rows fail it, logged as
Q9 in `docs/data-quarantine.md`) and the designation is not a mistyped
family (`NOT_DEEP_GROOVE`: 64 SKF angular contact rows typed Deep Groove
Ball, the `32xx`/`33xx` double-row ones in Q9b and the single-row `7x` ones in
Q9c, where radial-only `P = Fr` would overstate life). Everything else gets no
calculator.
`node tests/dgbb.js` pins the gate and the FAG/SKF separation; `node tests/modal-calc.js`
drives the modal UI; `node tests/apply-data-fixes.js` tests the changeset tool.

**Combined loading (Fa > 0) is FAG-only, with FAG's own table.** It needs the
factor f0, which the database holds only for 297 FAG single row deep groove rows
(data-fix Q11, taken from FAG's catalogue). Those rows, and only those
(`DGBBCalc.supportsCombined`), get an axial-load input, computed by `calcPFag`
with FAG's Table 10 (`js/tables/fag_tables.js`), for normal operating clearance, with
**no clearance selector**. Never use SKF's `TABLE_9` with a FAG f0 (the two are
different numbers; the mix measured −9.6% to +5.1% on life, `bearing_calc` docs
§9a-4): `evaluate()` takes no f0 argument, the factor comes from the record, and
`tests/dgbb.js` section 8 fails if the separation breaks. There is deliberately
no brand-agnostic version, and the UI says combined loading is currently
available for FAG bearings only and why, in terms of our data. FAG double row
(`42xx`/`43xx`) rows get none. NTN is a logged candidate, not built (Q12).

Deliberate refusals, carried over from the source project: for every other row,
combined loading needs an f0 the database does not carry (the catalogue PDF
tables we extracted from do not list it; other sources do, see `bearing_calc`
docs §9a), and it cannot be derived from the dimensions, so `calcP` throws
rather than assuming one — do not add a default f0. Do not
describe this as the manufacturer not publishing f0 or kr: it is a limit of
our data. The minimum-load check uses the 0.01·Cr guideline for the same
reason (no kr in the data). `a_SKF` is not calculated or exposed, so results are labelled *basic* rating life.
Formulas are unchanged from `bearing_calc`; keep them that way so the two
copies cannot drift.

### Debug mode

Append `?debug=1` to the URL. `app.js` logs the API's answer for each search to the console. No visible UI change. The parsed intent and score breakdowns stay on the API side; use `node tests/run.js "6205 skf"` to see them.

### Page routing

Three pages (`home`, `search`, `suppliers`) as `<div id="page-*">` elements. `MYCELA.Router.showPage(name)` toggles `.active` CSS class. No URL changes, no history API.

### CSS

All styles in `css/styles.css`. CSS variables on `:root` (warm off-white palette: `--bg`, `--bg2`–`--bg4`, `--rule`, `--gold`, `--border`, `--border2`, `--faint`, `--muted`, `--white`). Written compact/minified. Fonts: Syncopate (headings), Jost (body), JetBrains Mono (part numbers/data).

## Search API (`api/`, local only)

A Cloudflare Worker that answers `GET /search?q=`, `GET /parts?ids=` (up to
50 ids, each matching the id rule; unknown ids are left out), `GET /stats`
(`{ count }`) and `GET /health` from a
published catalogue in Workers KV (binding `CATALOG`: `published/current`
names the live key, e.g. `published/v2`), held in memory and re-checked at
most once a minute. It only reads KV and has no D1 binding; never give it
one (`tests/admin.js` fails if `api/wrangler.toml` gains one). It imports the site's own `js/search/*`, `js/config.js`,
`js/constants.js` and `schemas/` through `api/src/search.js`; never copy
search logic into `api/`. Returned record fields are exactly those in
`api/published-fields.json` (`scripts/build-published.js` builds the
catalogue with the same list). `/search`, `/parts` and `/stats` share one
rate limit (60 a minute per IP). Not deployed. On this branch the site calls
it: `http://localhost:8787` when the page is on localhost or 127.0.0.1,
`https://api.mycela.in` otherwise (`CONFIG.api.baseUrl`).
`npm install` in `api/` once, then `node tests/api.js` (parity with the
browser engine on every `tests/search-cases.json` query, validation, CORS,
allowlist, 40 cap, rate limit), `node tests/api-ratelimit.js` (60 a minute
per IP on /search via the `SEARCH_LIMITER` binding, mocked) and
`node tests/api-speed.js` (1,000 queries, p95 under 10 ms), and
`node tests/site-search.js` (the page's own code against the Worker). OEM source files go in `data/private/` (git-ignored) and never into
the repository. See `api/README.md` and `docs/architecture.md`.

## Master database and admin Worker (`admin/`, `db/`, local only)

The private master database is D1 `mycela-master` (`db/migrations/`: `parts`,
`import_batches`, `staged_parts`, append-only `audit_log`, `publishes`, view
`staged_vs_master`). `admin/` is the only Worker bound to it and the only
writer of the published catalogue. Endpoints: `POST /admin/import` (CSV or
JSON, checked by `admin/src/validate.js`, any bad row rejects the whole
file), `GET /admin/import/:id` (error report or diff preview),
`POST /admin/import/:id/commit`, `POST /admin/publish` (writes
`published/v<N>`, moves `published/current`), `POST /admin/rollback/:version`
(moves the pointer only, master data unchanged), `GET /admin/audit`. Not
deployed; the ids in `admin/wrangler.toml` are placeholders. How to use it:
`docs/data-pipeline.md`.

- Every request must pass the Cloudflare Access JWT check in
  `admin/src/access.js`. There is no bypass, not even locally: do not add
  one. Tests sign their own tokens and stub the certs fetch.
- All SQL lives in the `SQL` table in `admin/src/pipeline.js` as fixed text
  with `?N` placeholders; values are only ever bound. Multi-step changes run
  as one `db.batch`.
- The published catalogue has one definition,
  `scripts/lib/published-catalog.js`, used by publish and by
  `scripts/build-published.js`. `js/db.js` exposes `MYCELA.prepareDB` (type
  correction and sanity filter) for it; the website's behaviour is unchanged.
- Migrations: add a new numbered file, never edit one that has been applied.
  `import_batches` is created before `parts` on purpose: a backup lists
  tables in creation order and would not restore otherwise.
- `scripts/seed-master.js` loads `bearings_db.js` as batch 0 through the same
  import path; `scripts/backup-master.js` exports to `data/private/backups/`.
  Local state for both Workers is `admin/.wrangler/state`. Scripts that use
  wrangler's `getPlatformProxy` must pass `persist` explicitly: its default
  is the folder the script was started from, not the one next to the config.
- Upload validation blocks `< > " \`` in text because `js/renderer.js` does
  not escape what it displays (`docs/todo-security.md`). That is a stopgap,
  not the fix.

`npm install` in `admin/` once, then `node tests/admin.js` (about half a
minute, on a throwaway database in a temp folder: migrations, seed, good and
bad files, SQL text in a designation, audit log protection, bad Access
tokens, publish and rollback seen through the search Worker with the clock
moved forward, backup and restore).

## Publishing: only the public file list

`node scripts/build-site.js` copies the public website into `dist/`
(git-ignored): exactly the files named one by one in `PUBLIC_FILES` in that
script, nothing by pattern or folder. `dist/` is what Cloudflare Pages will
publish at go-live. To publish a new file, add it to the list; the build
stops if a page refers to a local file that is not listed. No schema file is
published (the browser does not need one), and the calculator tables live in
`js/tables/` so that no `data/` folder is published. `node tests/build-site.js`
fails if `dist/` holds `bearings_db.js`, `data/`, `docs/`, `tests/`,
`admin/`, `api/`, `db/`, `scripts/`, `schemas/`, any `.md` file, or anything
shaped like a catalogue row.

## Deployment

Push to `main` → GitHub Pages deploys the repository root automatically to `www.mycela.in`. No CI, no preview environments. **Do not merge `site-switch` into `main` before go-live**: the site on this branch needs the search API deployed at `https://api.mycela.in`, and GitHub Pages would publish the whole repository, `bearings_db.js` included. Go-live publishes `dist/` instead.
