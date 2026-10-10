#!/usr/bin/env node
'use strict';
/*
 * Build the published catalogue for the search API from bearings_db.js.
 *
 *   node scripts/build-published.js            build, then seed local KV
 *   node scripts/build-published.js --no-seed  build only
 *
 * Quick start for the search Worker without the master database: builds
 * the published catalogue straight from bearings_db.js with
 * scripts/lib/published-catalog.js (the same function the admin Worker's
 * publish uses), writes api/.build/published-v1.json (git-ignored) and,
 * unless --no-seed, puts it into the LOCAL KV store as published/v1 with
 * published/current pointing at it. It never writes to Cloudflare: the KV
 * calls are --local, into admin/.wrangler/state.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { buildCatalog } = require('./lib/published-catalog.js');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');
const OUT_DIR = path.join(API, '.build');
const OUT = path.join(OUT_DIR, 'published-v1.json');
const KEY = 'published/v1';
const POINTER = 'published/current';
// One local state folder for both Workers: the admin Worker's own (where
// wrangler keeps its local D1 and KV), which the search Worker's
// `npm run dev` also uses. So a local publish is what local search serves.
const STATE = path.join(ROOT, 'admin', '.wrangler', 'state');

const FIELDS = JSON.parse(fs.readFileSync(path.join(API, 'published-fields.json'), 'utf8'));

function build() {
  global.window = global.window || {};
  global.window.MYCELA = global.window.MYCELA || {};
  global.MYCELA = global.window.MYCELA;
  const log = console.log;
  console.log = () => {};  // js/db.js reports its row count; keep output clean
  try {
    ['bearings_db.js', 'js/config.js', 'js/db.js'].forEach(f => require(path.join(ROOT, f)));
  } finally {
    console.log = log;
  }
  // The raw rows, as js/db.js found them before its own pass. buildCatalog
  // runs that same pass (prepareDB) on a copy.
  const raw = loadRawRows();
  return Object.assign({ version: 1 }, buildCatalog(raw, { fields: FIELDS, prepareDB: global.MYCELA.prepareDB }));
}

// bearings_db.js evaluated in its own sandbox, so the rows are untouched
// by js/db.js (which corrects types in place on the copy the site uses).
function loadRawRows() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'bearings_db.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.MYCELA_DB));
}

if (require.main === module) {
  const catalog = build();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Published catalogue: ${catalog.count} rows, ${catalog.fields.length} fields, ${kb} KB -> ${path.relative(ROOT, OUT)}`);

  if (!process.argv.includes('--no-seed')) {
    const wrangler = path.join(API, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const put = args => spawnSync(process.execPath, [wrangler, 'kv', 'key', 'put', ...args,
                                  '--binding', 'CATALOG', '--local', '--persist-to', STATE],
                                  { cwd: API, stdio: 'inherit' });
    if (put([KEY, '--path', OUT]).status !== 0 || put([POINTER, KEY]).status !== 0) {
      console.error('Seeding local KV failed (is wrangler installed? run npm install in api/).');
      process.exit(1);
    }
    console.log(`Seeded local KV: CATALOG ${KEY}, and ${POINTER} -> ${KEY}`);
  }
}

module.exports = { build, loadRawRows, OUT, KEY, POINTER, STATE };
