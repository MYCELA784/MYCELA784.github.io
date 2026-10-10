# MYCELA architecture

How the pieces fit once the search API is live. The search API, the admin
API, the master database and the publish step are built and run locally, and
on the `site-switch` branch the website uses the search API. Nothing is
deployed yet: the live site still runs from `main` and still searches in the
browser. Steps marked *later* are planned, not built.

```
 visitor's browser
        │
        ▼
 Cloudflare edge (mycela.in DNS, proxied)
        │
        ├── website pages ──────────► the public files only (dist/); today GitHub Pages
        │
        ├── /search /parts /stats ──► search API (Cloudflare Worker, api/)
        │                                  │ reads, re-checks once a minute
        │                                  ▼
        │                            published catalogue (Workers KV)
        │                                  ▲
        │                                  │ publish, rollback
        └── admin ──────────────────► admin API (Worker, behind Cloudflare Access)
                                           │
                                           ▼
                                     master database (D1, private)
```

## The parts

**Edge.** `mycela.in` DNS is on Cloudflare and proxied. Every request passes
through Cloudflare first, which is where edge rate limits and access rules
(*later*) will sit. The search API already limits each visitor to 60
searches a minute itself (Cloudflare's Rate Limiting binding).

**Website.** A static site. The live one is served by GitHub Pages from the
`main` branch, loads the whole catalogue (`bearings_db.js`) into the browser
and searches there. On the `site-switch` branch that is replaced: the page
sends the search text to the API and receives only the matching parts (a few
KB a search, against 1.1 MB for the catalogue), and the catalogue is never
sent to a visitor. Part details, the list, compare, the load calculator and
the catalogue count all use what the API sends (`/search`, `/parts`,
`/stats`). Everything shown is escaped (`js/escape.js`). Try it locally:
[`local-preview.md`](local-preview.md).

**What gets published.** Not the repository. `scripts/build-site.js` copies
an explicit list of public files (pages, styles, the browser scripts) into
`dist/`, and that folder is what Cloudflare Pages will publish at go-live.
`bearings_db.js`, `docs/`, `tests/`, `scripts/`, `schemas/`, `admin/`, `api/`
and `db/` are not on the list, and `tests/build-site.js` fails if any of
them, or anything shaped like a catalogue row, turns up in `dist/`.

**Search API** (`api/`). A Cloudflare Worker answering `GET /search`,
`GET /parts` (parts by id), `GET /stats` (the catalogue count) and
`GET /health` only, all read-only. It runs the website's own search code
(one source of truth, no copy), holds the published catalogue in memory,
and never queries a database per search. Target: under 100 ms per search for
visitors in India, of which the search itself takes under 10 ms. See
[`api/README.md`](../api/README.md).

**Admin API** (`admin/`, built, local only). A separate Worker for loading
files into the catalogue and publishing it. Every request must carry a valid
Cloudflare Access token (signed-in staff), which the Worker checks itself;
there is no way to switch that off, so it refuses everything until it is
deployed behind Access. It is the only program bound to the master database
and the only one that writes the published catalogue. The search API has no
database binding and never writes. How to use it:
[`data-pipeline.md`](data-pipeline.md).

## Two kinds of data

**Master data** (Cloudflare D1 database `mycela-master`, private; tables in
`db/migrations/`). The complete record for each bearing, including fields
that are never shown publicly, and where each row came from (source, file,
import). Only the admin API can read or change it. Changes arrive as
uploaded files: each file is checked row by row and rejected whole if any row
is wrong, then previewed, then committed. Every upload, commit, changed
bearing, publish and rollback is written to an audit log that the database
itself refuses to update or delete. Today the database holds what
`bearings_db.js` holds (loaded by `scripts/seed-master.js`); internal
notes, supplier details and prices are *later*.

**Published data** (Workers KV, keys `published/v1`, `published/v2`, ...).
A copy built from the master data with **only** the fields listed in
[`api/published-fields.json`](../api/published-fields.json). This is the only
data the search API can see, so a field that is not on that list cannot
leak through a search, whatever the code does. One function builds it
(`scripts/lib/published-catalog.js`), whether from the master database (the
admin API's publish) or straight from `bearings_db.js`
(`scripts/build-published.js`, a quick start without the database), and
`tests/admin.js` checks the two give the same catalogue.

To publish a change: load it into the master data, then publish. The admin
API writes the catalogue to KV under the next version key and moves the key
`published/current` to point at it. The search API re-reads that pointer at
most once a minute, so a publish is live within a minute with no redeploy.
Each version stays under its own key, so a bad publish is undone by pointing
`published/current` back at an older one (rollback). A rollback does not
change the master data.

## Backups

- **Code and public data**: this git repository (GitHub), including the
  history of every change to `bearings_db.js` and the data-fix changesets in
  `scripts/data-fixes/`.
- **Published catalogue**: rebuildable at any time from the master data; old
  versions stay in KV under their version keys.
- **Master database**: `npm run backup` in `admin/` writes a full SQL export
  to `data/private/backups/` (git-ignored), which loads back into an empty
  database. *Later*, once deployed: D1's built-in point-in-time recovery,
  plus a regular export to private storage outside this repository.

## Rule: OEM data never enters this repository

Files received from manufacturers, distributors or other OEM sources
(catalogue extracts, price lists, spreadsheets, PDFs) are kept **out of git**:

- Keep them in `data/private/`. That folder is in `.gitignore`, so git will
  not pick them up.
- Never copy their contents into `bearings_db.js`, `schemas/`, `docs/`,
  tests or commit messages.
- What goes public is decided field by field through the published
  catalogue's allowlist, never by committing a source file.
- They are loaded into the master database through the admin API
  ([`data-pipeline.md`](data-pipeline.md)). Backups of that database go in
  `data/private/backups/` and are never committed either.

This repository is public (GitHub Pages), and anything committed stays in its
history even after deletion.
