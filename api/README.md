# MYCELA search API

A small web service that answers bearing searches. The live website does every
search inside the visitor's browser, which means every visitor downloads the
whole catalogue (`bearings_db.js`, about 1.1 MB). With this service the
website sends the search text instead and gets back only the matching parts.

It is **local only**: it runs on your own computer. Nothing here has been
deployed, and the live site does not use it yet. On the `site-switch` branch
the website does use it: see
[`docs/local-preview.md`](../docs/local-preview.md) to try that, and
[`docs/architecture.md`](../docs/architecture.md) for where it fits.

## What it does

It is a Cloudflare Worker: a small program that, once deployed, runs in
Cloudflare's data centres close to each visitor (including in India), so
answers come back quickly.

It answers four addresses and nothing else. All of them only read:

| Request | Answer |
|---|---|
| `GET /search?q=6205 skf` | `{ "results": [...], "note": ..., "stage": ..., "count": 5 }` |
| `GET /parts?ids=SKF-6205,NTN-6205` | `{ "parts": [...], "count": 2 }`: those parts, in the order asked. Up to 50 ids. An id that is not in the catalogue is simply left out. Used for the list ("basket"), part details and same-fit links. |
| `GET /stats` | `{ "count": 3654 }`: how many parts the catalogue holds |
| `GET /health` | `{ "ok": true }`, a simple "I am running" check |

- **results**: the matching bearings, in the same order the website shows
  them, at most 40.
- **note**: the explanation shown when no exact match was found (for example
  "No bearing found with bore 12 mm and OD 90 mm. ..."), otherwise `null`.
- **stage**: `"exact"` when the normal search found the parts. Otherwise the
  fallback step that answered: 1 to 4 when it relaxed the request into close
  matches, 0 when the query had a size or type but nothing was close, `null`
  when there was nothing it could read.
- **count**: how many results came back.

Errors:

| When | Status | Body |
|---|---|---|
| `q` missing, empty, or longer than 200 characters (after trimming spaces) | 400 | `{ "error": "..." }` |
| `ids` missing, more than 50 ids, or an id with characters no part id has | 400 | `{ "error": "..." }` |
| any other address | 404 | `{ "error": "not found" }` |
| anything but `GET` (for example `POST`) | 405 | `{ "error": "method not allowed" }` |
| more than 60 requests in a minute from one visitor (IP address), counting `/search`, `/parts` and `/stats` together | 429 | `{ "error": "too many requests, try again in a minute" }` |
| the catalogue has not been loaded into storage | 503 | `{ "error": "catalogue not available" }` |

Only these websites may call it from a browser: `https://mycela.in`,
`https://www.mycela.in`, and `http://localhost` or `http://127.0.0.1` (any
port) for development.
Plain `http://` versions of the site and look-alike addresses are refused.

### Rate limit

Each visitor (counted by IP address) may make 60 requests per minute to
`/search`, `/parts` and `/stats` together. After that, they get a 429 answer
with a `Retry-After: 60` header until the minute is up. `/health` is never
limited. It uses Cloudflare's Rate Limiting
binding (`SEARCH_LIMITER` in `wrangler.toml`). Cloudflare counts separately
in each of its data centres and the count is approximate, so a visitor may
get a few more than 60 before the limit starts. If the limiter itself ever
fails, searches carry on rather than the API going down with it.
`wrangler dev` and the tests simulate the limiter on your computer.

### Same search as the website

The search itself is **not copied**. The Worker imports the website's own
files (`js/search/*`, `js/config.js`, `js/constants.js`,
`schemas/bearing.schema.json`) unchanged, through a small adapter
(`src/search.js`). A ranking change made for the website therefore applies
here too, and `tests/api.js` checks that both give the same answers.

### What data it holds

The Worker keeps a **published catalogue** in memory: the bearings after the
website's own clean-up (`js/db.js`), with only the fields the website shows.
It is read from Cloudflare's key-value storage (Workers KV, binding
`CATALOG`): the key `published/current` names the live copy (for example
`published/v2`). The Worker loads that copy when it starts and checks the
pointer again at most once a minute, so no search waits on storage and a
publish or rollback goes live within a minute. The Worker only reads: it has
no database and never writes to storage.

The allowed fields are listed in [`published-fields.json`](published-fields.json),
the one place to change them:

- **Returned**: `id`, `brand`, `pn`, `type`, `bore`, `od`, `w`, `cr`, `c0r`,
  `rpm`, `speed_ref`, `f0`, `mass`, `sealing`, `alt`, `source`, plus two
  per-search flags the result cards use, `_designationOnly` and
  `_queriedSealing`.
- **Never returned**: `apps` (hidden on the site pending re-sourcing), `pu`
  (not used anywhere), and the ranking internals `_score`, `_matchType`,
  `_breakdown`.

## Running it on your computer

You need [Node.js](https://nodejs.org) 20 or newer. Everything below runs
locally; nothing logs in to Cloudflare or uploads anything.

```sh
cd api
npm install          # once: installs wrangler, Cloudflare's local tool
npm run quickstart   # builds the catalogue from bearings_db.js and loads it into local storage
npm run dev          # starts the API
```

Then open, for example:

- http://localhost:8787/health
- http://localhost:8787/search?q=6205%20skf
- http://localhost:8787/search?q=bore%2012%20od%2090

`npm run quickstart` runs `scripts/build-published.js`, which:

1. runs the website's `js/db.js` over `bearings_db.js`,
2. keeps only the allowed fields,
3. writes `api/.build/published-v1.json`, and
4. puts it into wrangler's **local** storage as `published/v1`, with
   `published/current` pointing at it.

Local storage is `admin/.wrangler/state`, shared with the admin Worker, so
the search API also serves whatever was last published locally from the
master database. If you have set that up (`npm run seed -- --publish` in
`admin/`, see [`docs/data-pipeline.md`](../docs/data-pipeline.md)), skip the
quickstart: it would overwrite `published/v1`.

Run it again after `bearings_db.js` changes. To build the file without
touching storage: `node scripts/build-published.js --no-seed` (from the repo
root).

The generated files (`api/.build/`, any `.wrangler/` folder, `node_modules/`)
are not committed.

## Testing it

From the repo root, after `npm install` in `api/`:

```sh
node tests/api.js            # answers, errors, allowed fields, CORS, rate limit, 40-result cap
node tests/api-ratelimit.js  # the rate limit in detail, with a stand-in limiter
node tests/api-speed.js      # 1,000 searches: speed, catalogue size, memory
node tests/site-search.js    # the website's own code, through this API: same parts as the engine
```

or `npm test` inside `api/` for the first three.

- `tests/api.js` bundles the Worker exactly as a deploy would (without
  uploading), runs it in Cloudflare's local runtime, and checks every query
  in `tests/search-cases.json` against the website's search: same parts, same
  order, same note, same stage.
- `tests/api-speed.js` times 1,000 realistic searches (part numbers, sizes,
  plain language, gibberish) and fails if the 95th-percentile search time is
  over 10 ms.

The website's own tests (`node tests/run.js` and the others in `tests/`) are
unchanged and still apply.

## Files

| File | What it is |
|---|---|
| `wrangler.toml` | Worker settings: name, entry file, the `CATALOG` storage binding (its id is a placeholder until the first deploy), the `SEARCH_LIMITER` rate limit. |
| `published-fields.json` | The field allowlist. |
| `src/index.js` | Addresses, input checks, CORS, rate limit, loading the catalogue. |
| `src/search.js` | The adapter that runs the website's search code. |
| `src/globals.js` | Gives the website's scripts the `window.MYCELA` they expect. |
| `../scripts/build-published.js` | Builds the published catalogue and seeds local storage. |

## Not built yet

Deploying, and switching the website over to this API. The private master
database (D1) and the admin API that publishes the catalogue are built and
run locally: see [`docs/data-pipeline.md`](../docs/data-pipeline.md) and
[`docs/architecture.md`](../docs/architecture.md).
