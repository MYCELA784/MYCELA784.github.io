# MYCELA architecture: Phase 1

How the pieces fit once the search API is live. Phase 1 builds the search API
and runs it locally; the steps marked *later* are planned, not built.

```
 visitor's browser
        │
        ▼
 Cloudflare edge (mycela.in DNS, proxied)
        │
        ├── website pages ──────────► GitHub Pages (this repository, main branch)
        │
        ├── /search ────────────────► search API (Cloudflare Worker, api/)
        │                                  │ reads once at start
        │                                  ▼
        │                            published catalogue (Workers KV)
        │                                  ▲
        │                                  │ publish step (later: from D1)
        └── admin (later) ──────────► admin API (Worker, behind Cloudflare Access)
                                           │
                                           ▼
                                     master database (D1, private, later)
```

## The parts

**Edge.** `mycela.in` DNS is on Cloudflare and proxied. Every request passes
through Cloudflare first, which is where edge rate limits and access rules
(*later*) will sit. The search API already limits each visitor to 60
searches a minute itself (Cloudflare's Rate Limiting binding).

**Website.** Still the static site in this repository, served by GitHub
Pages from the `main` branch. Today it loads the whole catalogue
(`bearings_db.js`) into the browser and searches there. Once the API is
deployed, the site will send the search text to the API instead and stop
shipping the catalogue to every visitor.

**Search API** (`api/`, built in Phase 1). A Cloudflare Worker answering
`GET /search` and `GET /health` only. It runs the website's own search code
(one source of truth, no copy), holds the published catalogue in memory,
and never queries a database per search. Target: under 100 ms per search for
visitors in India, of which the search itself takes under 10 ms. See
[`api/README.md`](../api/README.md).

**Admin API** (*later*). A separate Worker for editing the catalogue,
reachable only through Cloudflare Access (signed-in staff). It writes to the
master database and triggers publishing. The public search API never has
write access.

## Two kinds of data

**Master data** (*later*: Cloudflare D1, a private database). The complete
record for each bearing, including fields that are never shown publicly:
sources, internal notes, supplier and OEM details, prices. Only the admin API
can read or change it.

**Published data** (Workers KV, key `published/v1`). A copy built from the
master data with **only** the fields listed in
[`api/published-fields.json`](../api/published-fields.json). This is the only
data the search API can see, so a field that is not on that list cannot
leak through a search, whatever the code does. Until D1 exists, it is built
from `bearings_db.js` by `scripts/build-published.js`.

To publish a change: update the master data, rebuild the published
catalogue, write it to KV under a new version key, then point the API at it.
Keeping each version under its own key means a bad publish can be undone by
pointing back at the previous key.

## Backups

- **Code and public data**: this git repository (GitHub), including the
  history of every change to `bearings_db.js` and the data-fix changesets in
  `scripts/data-fixes/`.
- **Published catalogue**: rebuildable at any time from the master data; old
  versions stay in KV under their version keys.
- **Master database** (*later*): D1's built-in point-in-time recovery, plus a
  regular export to private storage outside this repository.

## Rule: OEM data never enters this repository

Files received from manufacturers, distributors or other OEM sources
(catalogue extracts, price lists, spreadsheets, PDFs) are kept **out of git**:

- Keep them in `data/private/`. That folder is in `.gitignore`, so git will
  not pick them up.
- Never copy their contents into `bearings_db.js`, `schemas/`, `docs/`,
  tests or commit messages.
- What goes public is decided field by field through the published
  catalogue's allowlist, never by committing a source file.

This repository is public (GitHub Pages), and anything committed stays in its
history even after deletion.
