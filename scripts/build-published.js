#!/usr/bin/env node
'use strict';
/*
 * Build the published catalogue for the search API from bearings_db.js.
 *
 *   node scripts/build-published.js            build, then seed local KV
 *   node scripts/build-published.js --no-seed  build only
 *
 * Runs the site's own js/db.js over bearings_db.js (the same type
 * normalisation and sanity filter the browser applies), then keeps only the
 * fields listed in api/published-fields.json. Writes
 * api/.build/published-v1.json (git-ignored) and, unless --no-seed, puts it
 * into the Worker's LOCAL KV store (binding CATALOG, key published/v1) for
 * `wrangler dev`. It never writes to Cloudflare: the KV call is --local.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api');
const OUT_DIR = path.join(API, '.build');
const OUT = path.join(OUT_DIR, 'published-v1.json');
const KEY = 'published/v1';

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
  const rows = global.MYCELA.DB.map(b => {
    const out = {};
    FIELDS.record.forEach(k => { if (b[k] !== undefined) out[k] = b[k]; });
    return out;
  });
  const leaked = Object.keys(FIELDS.excluded).filter(k => rows.some(r => k in r));
  if (leaked.length) throw new Error('excluded field(s) in output: ' + leaked.join(', '));
  return { version: 'v1', count: rows.length, fields: FIELDS.record, rows };
}

if (require.main === module) {
  const catalog = build();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Published catalogue: ${catalog.count} rows, ${catalog.fields.length} fields, ${kb} KB -> ${path.relative(ROOT, OUT)}`);

  if (!process.argv.includes('--no-seed')) {
    const wrangler = path.join(API, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const r = spawnSync(process.execPath, [wrangler, 'kv', 'key', 'put', KEY, '--path', OUT, '--binding', 'CATALOG', '--local'],
                        { cwd: API, stdio: 'inherit' });
    if (r.status !== 0) { console.error('Seeding local KV failed (is wrangler installed? run npm install in api/).'); process.exit(1); }
    console.log(`Seeded local KV: CATALOG ${KEY}`);
  }
}

module.exports = { build, OUT, KEY };
