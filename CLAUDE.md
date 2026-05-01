# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MYCELA is a static GitHub Pages site (deployed at `www.mycela.in`) — an industrial bearing parts intelligence tool. There is no build system, no package manager, and no framework. Everything is vanilla HTML/CSS/JS.

## Running locally

Open `index.html` directly in a browser, or serve it with any static file server:

```
python -m http.server 8080
# or
npx serve .
```

No compilation, no install step.

## File structure

- `index.html` — the entire application: all pages, CSS (inline `<style>`), and JavaScript (inline `<script>`)
- `bearings_db.js` — large JS file loaded by `index.html`; exports a global array of bearing objects (NTN, SKF catalog data)
- `CNAME` — GitHub Pages custom domain (`www.mycela.in`)

## Architecture

**Single-page app with client-side routing.** Three "pages" (home, search, suppliers) are rendered as `<div id="page-*">` elements. `showPage(name)` toggles the `.active` CSS class to switch between them — no URL changes, no history API.

**Hybrid search pipeline** (triggered by `doSearch()`):
1. `fastSearch(q)` — instant local match against `bearings_db.js` data using `parseQuery()` for NLP intent
2. `fallbackSearch(q)` — relaxed constraints if step 1 returns nothing
3. `refineWithAI(q)` — async POST to `https://mycela-backend.onrender.com/search` (separate backend, holds the Claude API key); never blocks the UI; silently no-ops on failure

**`parseQuery(raw)`** converts free-text into structured intent: part numbers, bore/OD/width dimensions with unit conversion (mm/cm/m/in), load values (N/kN/kgf), bearing type hints, application tags, and environment notes. Results are used to score/filter bearings from the local DB.

## CSS conventions

All CSS lives in a single `<style>` block in `index.html`, minified/compact. CSS variables are declared on `:root` (dark green/gold palette: `--bg`, `--gold`, `--border`, etc.). No CSS preprocessor.

## Deployment

Push to `main` — GitHub Pages deploys automatically. No CI, no preview environments.
