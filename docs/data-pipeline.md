# Data pipeline: from an OEM file to the live catalogue

How a bearing gets from a file someone sent us into what the search API
serves, and how to undo it. Read [`architecture.md`](architecture.md) first
for the overall picture.

**Status: local only.** Nothing here is deployed. The database, the admin
Worker and the published catalogue all run on your own computer, in
`admin/.wrangler/` (not committed). The commands below never log in to
Cloudflare and never upload anything.

## The short version

```
OEM file ──upload──► checked ──► staged ──preview──► commit ──► master database
 (CSV/JSON)             │                                             │
                        └─ any problem: whole file rejected        publish
                           with a row by row report                   │
                                                                      ▼
                                              published/v3, v2, v1 (catalogue copies)
                                                                      ▲
                                              published/current ──────┘ (which one is live)
```

1. **Upload** a CSV or JSON file. Every row is checked. One bad row rejects
   the whole file.
2. **Preview** what a good file would add and change.
3. **Commit** it into the master database.
4. **Publish**: a new numbered copy of the catalogue is built, and the search
   API switches to it within a minute.
5. **Roll back** if the publish was wrong: point the search API at an older
   copy.

Every step is written to an audit log that cannot be edited.

## What is where

| Thing | Where | What it is |
|---|---|---|
| Master database | D1 database `mycela-master` (tables in `db/migrations/`) | Every bearing with every field, plus imports, the audit log and the list of publishes. Private. |
| Admin Worker | `admin/` | The only program that can write to the master database or publish. |
| Published catalogue | Workers KV, keys `published/v1`, `published/v2`, ... | One copy per publish, with only the public fields (`api/published-fields.json`). |
| Live pointer | KV key `published/current` | Holds the name of the copy the search API serves, for example `published/v2`. |
| Search Worker | `api/` | Reads the published catalogue. It has no database and cannot write anything. |

## One-time setup

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
cd admin
npm install                  # once: installs wrangler, Cloudflare's local tool
npm run migrate              # creates the empty tables
npm run seed -- --publish    # loads today's bearings_db.js as import 0 and publishes it as v1
```

The seed goes through the same checks as any uploaded file and is recorded in
the audit log as "seed script (local)". It only runs on an empty database.

To see the result in the search API: `cd ../api`, `npm install`, `npm run dev`,
then open http://localhost:8787/search?q=6205. The search Worker reads the
same local storage the admin Worker writes.

## Who is allowed

Every request to the admin Worker must come through **Cloudflare Access**:
Access signs the person in and attaches a signed token, and the Worker checks
that token (right team, right application, not expired, real signature)
before doing anything. The signed-in email is what the audit log records.
There is no password, no API key and no switch to turn the check off.

Because the check cannot be turned off, the admin Worker **refuses every
request until it is deployed behind Access**, including on your own computer
(`npm run dev` in `admin/` starts it, and it answers 500 "admin access is not
configured"). Until then the upload, commit, publish and rollback steps are
exercised by `node tests/admin.js`, which signs its own test tokens. The
seed and backup scripts work locally today.

The requests below are written for the deployed Worker. `$ADMIN` is its
address and `$TOKEN` the Access token; how you obtain the token is decided at
the deploy step.

## 1. Load an OEM file

Keep the file in `data/private/` (git-ignored). It never goes into this
repository.

```sh
curl -X POST "$ADMIN/admin/import?source_name=NTN%20price%20list%202026&file_name=ntn-2026.csv" \
     -H "Cf-Access-Jwt-Assertion: $TOKEN" \
     -H "Content-Type: text/csv" \
     --data-binary @data/private/ntn-2026.csv
```

`source_name` is required and says where the data came from. `file_name` is
optional. Use `Content-Type: application/json` for a JSON file.

### File format

CSV: comma separated, first line is the column names, UTF-8, at most 10 MB.
Put a value in double quotes if it contains a comma. JSON: a list of rows, or
`{ "rows": [...] }`.

| Column | Required | Rule |
|---|---|---|
| `id` | yes | Unique in the file. Letters, digits and `_ . - /` only, up to 64 characters. An id already in the database means "update that bearing". |
| `brand` | yes | One of the brands in `schemas/bearing.schema.json` (today SKF, NTN, FAG). A new brand has to be added there first. |
| `pn` | yes | The designation. Up to 64 characters. |
| `type` | yes | One of the types in `schemas/bearing.schema.json`. |
| `bore`, `od`, `w`, `cr`, `c0r`, `rpm`, `speed_ref`, `mass`, `pu`, `f0` | no | A number greater than 0. `bore` must be smaller than `od`. |
| `sealing` | no | One of the sealing values in the schema. |
| `apps`, `alt` | no | Lists. In CSV, separate items with `;`. `alt` items must be valid ids. |
| `source` | no | Up to 200 characters. |

No other columns are accepted. Text may not contain `<`, `>`, `"`, a backtick
or control characters. An apostrophe is fine. An empty cell means "no value".

A row sets **every** field of its bearing: leaving `mass` empty on an
existing bearing removes its mass. Bearings that are not in the file are left
alone. Nothing is ever deleted by an import.

## 2. Read the error report

If anything is wrong the answer is status 422 and **nothing is loaded**, not
even the good rows:

```json
{
  "batch_id": 3,
  "status": "rejected",
  "row_count": 6,
  "error_count": 4,
  "errors": [
    { "row": 2, "id": "NTN-6204", "field": "bore", "problem": "bore (60) must be smaller than od (47)" },
    { "row": 3, "id": "NTN-6205", "field": "brand", "problem": "unknown brand \"Acme\". Known: SKF, NTN, FAG" },
    { "row": 4, "id": "NTN-6206", "field": "pn", "problem": "is required" },
    { "row": 6, "id": "NTN-6207", "field": "id", "problem": "duplicate id: also on row 5" }
  ]
}
```

`row` counts data rows, so row 1 is the line after the header. The answer
lists the first 50 problems. `GET $ADMIN/admin/import/3` gives up to 1,000.
Fix the file and upload it again: a rejected import cannot be committed.

## 3. Preview

A good file answers 201 with `"status": "staged"` and a `batch_id`. It is
checked and waiting, and the master database has not changed yet. Look at
what it would do:

```sh
curl "$ADMIN/admin/import/4" -H "Cf-Access-Jwt-Assertion: $TOKEN"
```

```json
"preview": {
  "added": 2, "changed": 1, "unchanged": 1,
  "first_changes": [
    { "row": 2, "id": "SKF-6206", "kind": "changed", "fields": { "mass": { "from": 0.2, "to": 0.21 } } },
    { "row": 3, "id": "NTN-9001", "kind": "added", "values": { "...": "..." } }
  ]
}
```

`first_changes` shows the first 50 added or changed bearings. Check the
counts are what you expect. A large `changed` number on a file that was meant
to add new parts is a warning sign.

## 4. Commit

```sh
curl -X POST "$ADMIN/admin/import/4/commit" -H "Cf-Access-Jwt-Assertion: $TOKEN"
```

All of the file's rows go into the master database together, or none do. The
audit log gets one row for the commit and one for every bearing added or
changed, with its values before and after. Committing the same import twice
is refused (409).

The website and the search API do not change yet.

## 5. Publish

```sh
curl -X POST "$ADMIN/admin/publish" -H "Cf-Access-Jwt-Assertion: $TOKEN"
```

This builds a new copy of the catalogue from the master database with only
the public fields, stores it under the next number (`published/v2`), and
moves `published/current` to it. Older copies are kept.

The search API notices within a minute. Rows that fail the website's own
sanity filter (`js/db.js`) are left out of the published copy, as they are on
the website today, so the published row count can be lower than the number of
parts in the database.

## 6. Roll back

```sh
curl -X POST "$ADMIN/admin/rollback/1" -H "Cf-Access-Jwt-Assertion: $TOKEN"
```

Points the search API back at `published/v1`. Live within a minute. You can
roll forward again the same way (`/admin/rollback/2`).

A rollback only changes which copy is live. **It does not undo the import**:
the master database still has the new data, and the next publish will include
it again. To take data back out, upload a corrected file, commit and publish.

## See what happened

```sh
curl "$ADMIN/admin/audit?limit=50" -H "Cf-Access-Jwt-Assertion: $TOKEN"
```

Newest first: who did what and when, for every upload, rejection, commit,
bearing added or changed, publish and rollback. The database refuses any
attempt to change or delete an audit row.

## Back up

```sh
cd admin
npm run backup
```

Writes `data/private/backups/master-<date>.sql`: every table, every row, the
audit log and its protection. That folder is git-ignored. Backups contain
unpublished data, so never commit one or put one in a public place. Copy the
file somewhere safe outside this computer.

To restore, load the file into an **empty** database (do not run
`npm run migrate` first, the backup creates the tables itself):

```sh
cd admin
npx wrangler d1 execute mycela-master --local --file ../data/private/backups/master-2026-10-10.sql
```

The published copies in KV are not in the backup. After a restore, publish
again to make a fresh copy.

## Checks

`node tests/admin.js` (after `npm install` in `admin/`) runs all of the above
on a throwaway database in a temp folder: migrations, seed, a good file, a
bad file, the audit log protection, bad sign-in tokens, publish, rollback,
backup and restore. It takes about half a minute.

## Known gaps

- Not deployed: no real Cloudflare Access application, D1 database or KV
  namespace exists yet. The ids in `admin/wrangler.toml` are placeholders.
- No web page for uploads yet: the steps are plain HTTP requests.
- No way to delete a bearing through an import.
- See [`todo-security.md`](todo-security.md).
