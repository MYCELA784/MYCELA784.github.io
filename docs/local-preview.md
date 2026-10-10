# Try the new website on your own computer

This opens the website exactly as it will be published, on your computer
only. The page no longer downloads the whole catalogue: it asks the search
API for each search and gets back only the matching parts.

Nothing here logs in to Cloudflare, uploads anything or changes the live
site.

## What you need

- [Node.js](https://nodejs.org) 20 or newer.
- This repository, on the `site-switch` branch.

## Steps

1. Open a terminal in the repository folder.

2. The first time only, install the local tool the search API runs on:

   ```sh
   cd api
   npm install
   cd ..
   ```

3. Start the preview:

   ```sh
   node scripts/preview.js
   ```

   It prints four steps and then waits:

   ```
   1/4  Built dist/: 24 public files, 175 KB
   2/4  Using the local published catalogue that is already there
   3/4  Starting the search API on http://localhost:8787 ...
        The search API is answering: 3,654 parts in the catalogue
   4/4  Serving dist/ on http://localhost:8080

   Open http://localhost:8080 in your browser and try a search.
   Press Ctrl+C to stop.
   ```

   The very first run says "No local published catalogue yet: building one
   from bearings_db.js" at step 2 instead. That is expected.

4. Open **http://localhost:8080** in your browser.

5. When you are done, go back to the terminal and press **Ctrl+C**. That
   stops both the website and the search API.

## Things to try

- Type `6205` in the search box. Results appear a moment after you stop
  typing.
- Type `bore 12 od 90`. There is no such bearing, so you get the closest ones
  with a note saying so.
- Type nonsense. You get "We don't have that one yet".
- Click **Details** on a result: specifications, parts of the same size, and
  the load calculator.
- **Add to list** on two parts, then reload the page. Your list is still
  there.
- Tick two **compare** boxes, then **Compare (2)**.
- **Find by size** in the header: enter a bore and an outer diameter.
- The **About** page shows the number of parts in the catalogue.

To see that the catalogue is no longer sent to the browser:

- Open http://localhost:8080/bearings_db.js. It says "404 not found".
- In the browser, press F12, choose the **Network** tab and reload. The page
  loads about 175 KB in all. Each search is one small request to
  `localhost:8787/search`.

To see what happens when the search API is down: stop the preview with
Ctrl+C, then start only the website with any simple web server pointed at
`dist/`, for example `npx serve dist -l 8080`. A search now shows "Search is
not available right now" with a **Try again** button.

## What the preview is made of

| Address | What it is |
|---|---|
| http://localhost:8080 | The website: only the files in `dist/`. Anything else is 404. |
| http://localhost:8787 | The search API (`api/`), reading the local published catalogue. |

`dist/` is rebuilt every time the preview starts. It holds only the files on
the public list in `scripts/build-site.js`, and it is not committed.

The local published catalogue lives in `admin/.wrangler/` (not committed).
If you have loaded and published data through the master database
(`docs/data-pipeline.md`), the preview serves that. If not, it builds a copy
from `bearings_db.js` the first time.

After you change `bearings_db.js`, refresh that copy before starting the
preview:

```sh
node scripts/build-published.js
```

(Skip this if you publish from the master database: it would overwrite
version 1 of your local published catalogue.)

## If something goes wrong

| What you see | What to do |
|---|---|
| `api/node_modules is missing` | Do step 2. |
| `Port 8080 is already in use` | Another program is using it, often an earlier preview. Close it and start again. |
| The search API does not start, or says the address is in use | Something else is on port 8787, often an earlier preview. Close it and start again. |
| "Search is not available right now" on the page | The preview is not running, or you opened the page as a file. Use http://localhost:8080. |
| "Too many searches in a short time" | The API allows 60 requests a minute, on your computer too. Wait a minute. |
| The count on the page is old | The count comes from the published catalogue. Refresh it as described above. |

## Not part of this preview

Nothing is deployed. The live site at www.mycela.in still runs from the
`main` branch and still searches in the browser. Going live needs the search
API deployed at `https://api.mycela.in` and `dist/` published, which are
later steps.
