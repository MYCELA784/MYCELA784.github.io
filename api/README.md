# MYCELA search API

A small web service that answers bearing searches. Today the website does every
search inside the visitor's browser, which means every visitor downloads the
whole catalogue (`bearings_db.js`, about 1.2 MB). This service will let the
website send the search text instead and get back only the matching parts.

It is **Phase 1, local only**: it runs on your own computer. Nothing here has
been deployed, and the live site does not use it yet. See
[`docs/architecture.md`](../docs/architecture.md) for where it fits.

## What it does

It is a Cloudflare Worker: a small program that, once deployed, runs in
Cloudflare's data centres close to each visitor (including in India), so
answers come back quickly.

It answers two addresses and nothing else:

| Request | Answer |
|---|---|
| `GET /search?q=6205 skf` | `{ "results": [...], "note": ..., "stage": ..., "count": 5 }` |
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
| any other address | 404 | `{ "error": "not found" }` |
| anything but `GET` (for example `POST`) | 405 | `{ "error": "method not allowed" }` |
| more than 60 searches in a minute from one visitor (IP address) | 429 | `{ "error": "too many requests, try again in a minute" }` |
| the catalogue has not been loaded into storage | 503 | `{ "error": "catalogue not available" }` |

Only these websites may call it from a browser: `https://mycela.in`,
`https://www.mycela.in`, and `http://localhost` (any port) for development.
Plain `http://` versions of the site and look-alike addresses are refused.

### Rate limit

Each visitor (counted by IP address) may make 60 searches per minute. After
that, searches get a 429 answer with a `Retry-After: 60` header until the
minute is up. `/health` is never limited. It uses Cloudflare's Rate Limiting
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
It is read once from Cloudflare's key-value storage (Workers KV, binding
`CATALOG`, key `published/v1`) when the Worker starts, so no search waits on
storage.

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
npm install        # once: installs wrangler, Cloudflare's local tool
npm run dev        # builds the catalogue, loads it into local storage, starts the API
```

Then open, for example:

- http://localhost:8787/health
- http://localhost:8787/search?q=6205%20skf
- http://localhost:8787/search?q=bore%2012%20od%2090

`npm run dev` runs `scripts/build-published.js`, which:

1. runs the website's `js/db.js` over `bearings_db.js`,
2. keeps only the allowed fields,
3. writes `api/.build/published-v1.json`, and
4. puts it into wrangler's **local** storage (`api/.wrangler/`).

Run it again after `bearings_db.js` changes. To build the file without
touching storage: `node scripts/build-published.js --no-seed` (from the repo
root).

The generated files (`api/.build/`, `api/.wrangler/`, `api/node_modules/`)
are not committed.

## Testing it

From the repo root, after `npm install` in `api/`:

```sh
node tests/api.js            # answers, errors, allowed fields, CORS, rate limit, 40-result cap
node tests/api-ratelimit.js  # the rate limit in detail, with a stand-in limiter
node tests/api-speed.js      # 1,000 searches: speed, catalogue size, memory
```

or `npm test` inside `api/` for all three.

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

## Not in Phase 1

Deploying, the private master database (D1) and the admin API behind
Cloudflare Access come later. See
[`docs/architecture.md`](../docs/architecture.md).
