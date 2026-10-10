#!/usr/bin/env node
'use strict';
/*
 * Load today's bearings_db.js into the LOCAL master database as import
 * batch 0, source "public catalogues".
 *
 *   node scripts/seed-master.js                 import and commit
 *   node scripts/seed-master.js --publish       ...then publish it (published/v1)
 *   --config <wrangler.toml>                    which local database (default admin/wrangler.toml;
 *                                               its data lives in .wrangler/state next to that file)
 *
 * It goes through the same import path as any uploaded file (the admin
 * Worker's importFile and commitBatch): every row is checked, and the batch
 * and each part are written to the audit log. The actor is
 * "seed script (local)". It refuses to run on a database that already has
 * imports. Local only: nothing is sent to Cloudflare.
 *
 * Run the migrations first: npm run migrate (in admin/).
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadRawRows } = require('./build-published.js');

const ROOT = path.join(__dirname, '..');
const ADMIN = path.join(ROOT, 'admin');
const ACTOR = 'seed script (local)';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function main() {
  const configPath = path.resolve(arg('--config', path.join(ADMIN, 'wrangler.toml')));
  const wranglerEntry = path.join(ADMIN, 'node_modules', 'wrangler');
  if (!fs.existsSync(wranglerEntry)) throw new Error('admin/node_modules is missing: run `npm install` in admin/ first.');
  const { getPlatformProxy } = require(wranglerEntry);
  const pipeline = await import(pathToFileURL(path.join(ADMIN, 'src', 'pipeline.js')).href);

  const proxy = await getPlatformProxy({ configPath });
  const env = proxy.env;
  try {
    const hasTable = await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'import_batches'").first();
    if (!hasTable) throw new Error('the master database has no tables yet: run `npm run migrate` in admin/ first.');
    const existing = (await env.DB.prepare('SELECT count(*) AS n FROM import_batches').first()).n;
    if (existing) throw new Error(`the master database already has ${existing} import(s); the seed only runs on an empty one.`);

    const rows = loadRawRows();
    const bytes = new TextEncoder().encode(JSON.stringify(rows));
    const imp = await pipeline.importFile(env, { bytes, kind: 'json', sourceName: 'public catalogues',
                                                 fileName: 'bearings_db.js', actor: ACTOR });
    if (imp.status !== 'staged') {
      console.error(`bearings_db.js was rejected: ${imp.error_count} problem(s). First ones:`);
      imp.errors.forEach(e => console.error(`  row ${e.row} ${e.id || ''} ${e.field || ''}: ${e.problem}`));
      process.exitCode = 1;
      return;
    }
    const done = await pipeline.commitBatch(env, imp.batch_id, ACTOR);
    console.log(`Seeded batch ${imp.batch_id}: ${imp.row_count} rows checked, ${done.added} added, ${done.changed} changed.`);
    if (process.argv.includes('--publish')) {
      const p = await pipeline.publish(env, ACTOR);
      console.log(`Published ${p.key} (${p.row_count} rows); published/current now points to it.`);
    }
  } finally {
    await proxy.dispose();
  }
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
