#!/usr/bin/env node
'use strict';
/*
 * Back up the LOCAL master database to an SQL file.
 *
 *   node scripts/backup-master.js
 *   --config <file>      which local database (default admin/wrangler.toml)
 *   --out-dir <dir>      where to write (default data/private/backups)
 *
 * Writes master-<date>.sql (master-<date>-<time>.sql if that exists) with
 * `wrangler d1 export --local`: every table, its rows, and the triggers, so
 * it can be loaded into an empty database to restore. data/private/ is
 * git-ignored: backups contain unpublished data and must never be committed.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ADMIN = path.join(ROOT, 'admin');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const configPath = path.resolve(arg('--config', path.join(ADMIN, 'wrangler.toml')));
const outDir = path.resolve(arg('--out-dir', path.join(ROOT, 'data', 'private', 'backups')));
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString();
let out = path.join(outDir, `master-${stamp.slice(0, 10)}.sql`);
if (fs.existsSync(out)) out = path.join(outDir, `master-${stamp.slice(0, 10)}-${stamp.slice(11, 19).replace(/:/g, '')}.sql`);

const wrangler = path.join(ADMIN, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!fs.existsSync(wrangler)) { console.error('admin/node_modules is missing: run `npm install` in admin/ first.'); process.exit(1); }
const r = spawnSync(process.execPath, [wrangler, 'd1', 'export', 'mycela-master', '--local', '--config', configPath, '--output', out],
                    { cwd: ADMIN, encoding: 'utf8' });
if (r.status !== 0 || !fs.existsSync(out)) {
  console.error('Backup failed:\n' + (r.stderr || r.stdout));
  process.exit(1);
}
console.log(`Backup written: ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
