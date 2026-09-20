# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MYCELA is a static GitHub Pages site (deployed at `www.mycela.in`) — an industrial bearing parts intelligence tool. No build system, no package manager, no framework. Vanilla HTML/CSS/JS.

## Running locally

```
python -m http.server 8080
# or
npx serve .
```

No compilation, no install step. Open `index.html` in a browser or serve from root.

## Architecture

### Namespace

All modules attach to a single shared global: `window.MYCELA = window.MYCELA || {}`. Each file does `(function(ns){ ... })(window.MYCELA = window.MYCELA || {})` and attaches one object (e.g. `ns.Router`, `ns.SearchEngine`, `ns.Renderer`). `js/app.js` is loaded last and wires everything together, then assigns thin `window.*` aliases for HTML `onclick` attributes.

### Script load order (dependency chain)

```
bearings_db.js          → sets window.MYCELA_DB (raw array)
js/config.js            → MYCELA.CONFIG  (all tunable values)
js/constants.js         → MYCELA.BC, MYCELA.TI
js/db.js                → MYCELA.DB, MYCELA.DB_MAP
js/search/parsers.js    → MYCELA.SearchEngine.parse()
js/search/rules.js      → MYCELA.SearchEngine.EnvironmentRules / ApplicationRules
js/search/scoring.js    → MYCELA.SearchEngine.Scorers
js/search/fallback.js   → MYCELA.SearchEngine.fallback()
js/search/engine.js     → MYCELA.SearchEngine.fast()
js/ai-refiner.js        → MYCELA.AIRefiner.refine()
data/dgbb_tables.js     → MYCELA.DGBB_TABLES (catalogue tables, pure data)
js/dgbb_calc.js         → MYCELA.DGBBCalc.* (modal load calculator)
js/renderer.js          → MYCELA.Renderer.*
js/router.js            → MYCELA.Router.showPage()
js/supplier-form.js     → MYCELA.SupplierForm.submit()
js/canvas.js            → self-initialising IIFE (no exposed API)
js/app.js               → wires all modules, sets window.* shims
```

Order matters. Never reorder these `<script>` tags.

### Search pipeline (`js/app.js` → `doSearch()`)

1. **`MYCELA.SearchEngine.fast(q)`** — instant local search. Calls `parse()` to extract structured intent (bore/OD/width in mm, load ratings, type, brand, sealing, application tags, environment notes), then scores every bearing in `MYCELA.DB` using `Scorers.*`. Returns up to `CONFIG.search.maxResults` results, each with `_score`, `_matchType`, `_breakdown`.
2. **`MYCELA.SearchEngine.fallback(q)`** — if step 1 returns zero results, progressively relaxes constraints through 5 stages (tolerances in `CONFIG.fallback`).
3. **`MYCELA.AIRefiner.refine(q)`** — async POST to `https://mycela-backend.onrender.com/search` (backend holds the Claude API key). Returns `{ matches: id[], explanation?, tips? }` or `null`. Never blocks the UI; silently no-ops on failure. Timeout from `CONFIG.search.aiTimeoutMs`.

### Tuning search ranking

**All numeric weights live in `js/config.js`** under `CONFIG.scoring` — never hardcoded in scorer files. To adjust ranking, edit only `config.js`. The keys map directly to scorer function names in `js/search/scoring.js` (e.g. `CONFIG.scoring.boreExact` → `Scorers.bore()`).

To add a new environment/application pattern, edit the rule tables in `js/search/rules.js` — no logic changes needed.

### Modal load calculator

`js/dgbb_calc.js` (ported from the separate `bearing_calc` project, with its
catalogue tables in `data/dgbb_tables.js`) computes basic rating life L10h,
the minimum-load check and the speed check for **deep groove ball bearings
under a radial load only**. `js/renderer.js` renders it as a collapsed
section under the modal's specs grid, and only when `DGBBCalc.supports(b)`
is true — i.e. `type === 'Deep Groove Ball'`, `cr`, `c0r`, `bore`, `od`
and `rpm` are all present, and `rpm` is plausible for the size (n·dm at or
above `MIN_N_DM`, derived in `js/dgbb_calc.js`; 29 rows fail it, logged as
Q9 in `docs/data-quarantine.md`) and the designation is not a mistyped
family (`NOT_DEEP_GROOVE`: 64 SKF angular contact rows typed Deep Groove
Ball, the `32xx`/`33xx` double-row ones in Q9b and the single-row `7x` ones in
Q9c, where radial-only `P = Fr` would overstate life). Everything else gets no
calculator.
`node tests/dgbb.js` pins the gate.

Deliberate refusals, carried over from the source project: combined loading
(Fa > 0) needs the factor f0. The database does not carry it (the catalogue
PDF tables we extracted from do not list it; other sources do, see
`bearing_calc` docs §9a), and it cannot be derived from the dimensions, so
`calcP` throws rather than assuming one — do not add a default f0. Do not
describe this as the manufacturer not publishing f0 or kr: it is a limit of
our data. The minimum-load check uses the 0.01·Cr guideline for the same
reason (no kr in the data). `a_SKF` is not calculated or exposed, so results are labelled *basic* rating life.
Formulas are unchanged from `bearing_calc`; keep them that way so the two
copies cannot drift.

### Debug mode

Append `?debug=1` to the URL. `app.js` logs to console: parsed intent object, per-result score breakdowns, and AI response payload. No visible UI change.

### Page routing

Three pages (`home`, `search`, `suppliers`) as `<div id="page-*">` elements. `MYCELA.Router.showPage(name)` toggles `.active` CSS class. No URL changes, no history API.

### CSS

All styles in `css/styles.css`. CSS variables on `:root` (warm off-white palette: `--bg`, `--bg2`–`--bg4`, `--rule`, `--gold`, `--border`, `--border2`, `--faint`, `--muted`, `--white`). Written compact/minified. Fonts: Syncopate (headings), Jost (body), JetBrains Mono (part numbers/data).

## Deployment

Push to `main` → GitHub Pages deploys automatically to `www.mycela.in`. No CI, no preview environments.
