'use strict';
/*
 * Shared setup for the search API tests (tests/api.js, tests/api-speed.js).
 *
 * Builds the published catalogue in memory (scripts/build-published.js,
 * nothing seeded), bundles the Worker exactly as a deploy would
 * (`wrangler deploy --dry-run`, which uploads nothing), and runs that bundle
 * with wrangler's test harness: the same local workerd runtime as
 * `wrangler dev`, with its own fresh local KV, into which the catalogue is
 * put. Needs `npm install` in api/ once.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');
const BUNDLE_DIR = path.join(API, '.build', 'worker');
const WRANGLER = path.join(API, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

if (!fs.existsSync(WRANGLER)) {
  console.error('api/node_modules is missing: run `npm install` in api/ first.');
  process.exit(1);
}
const { createTestHarness } = require(path.join(API, 'node_modules', 'wrangler'));
const { build, KEY } = require(path.join(ROOT, 'scripts', 'build-published.js'));

function bundle() {
  const r = spawnSync(process.execPath, [WRANGLER, 'deploy', '--dry-run', '--outdir', BUNDLE_DIR],
                      { cwd: API, encoding: 'utf8', env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }) });
  if (r.status !== 0) throw new Error('wrangler bundle failed:\n' + r.stdout + r.stderr);
  return path.join(BUNDLE_DIR, 'index.js');
}

// start({ seed: false }) gives a Worker whose KV is empty.
async function start(opts) {
  opts = opts || {};
  const catalog = opts.catalog || build();
  if (!opts.prebuilt) bundle();
  const server = createTestHarness({
    root: API,
    workers: [{ configPath: 'wrangler.toml', prebuiltWorkerDir: BUNDLE_DIR }],
  });
  await server.listen();
  if (opts.seed !== false) {
    const env = await server.getWorker().getEnv();
    await env.CATALOG.put(KEY, JSON.stringify(catalog));
  }
  // The Worker rate limits /search per CF-Connecting-IP (60 a minute).
  // Unless a test sets that header itself, each request gets its own
  // address, so long test runs are not throttled.
  let n = 0;
  const get = (pathAndQuery, init) => {
    init = Object.assign({}, init);
    const headers = new Headers(init.headers);
    if (!headers.has('CF-Connecting-IP')) {
      n++;
      headers.set('CF-Connecting-IP', `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`);
    }
    init.headers = headers;
    return server.fetch(pathAndQuery, init);
  };
  const search = async (q, init) => {
    const res = await get('/search?q=' + encodeURIComponent(q), init);
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  return { server, catalog, get, search, stop: () => server.close() };
}

module.exports = { start, bundle, build, ROOT, API };
