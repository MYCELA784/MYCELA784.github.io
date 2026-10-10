#!/usr/bin/env node
'use strict';
/*
 * Public site build test: dist/ holds the public website and nothing else.
 *
 *   node tests/build-site.js
 *
 * Runs scripts/build-site.js into a temp folder and checks what came out:
 * exactly the files on the public list; no catalogue (bearings_db.js), no
 * data/, docs/, tests/, admin/, api/, db/, scripts/ or schemas/ folder, no
 * CLAUDE.md or any other .md file; every local file a page refers to is
 * there; no page loads the catalogue or the in-browser search engine; and
 * no file carries the catalogue inside it under another name.
 *
 * No schema file is needed by the browser: the search runs in the API, so
 * schemas/ is not published.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PUBLIC_FILES, localRefs, ROOT } = require('../scripts/build-site.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}

function walk(dir, base) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const rel = base ? base + '/' + e.name : e.name;
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
  });
}

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'mycela-dist-test-'));
try {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-site.js'), '--out', OUT], { encoding: 'utf8' });
  ok(r.status === 0, 'scripts/build-site.js runs' + (r.status === 0 ? '  (' + r.stdout.trim().replace(/^Built \S+: /, '') + ')' : '\n' + r.stdout + r.stderr));

  const files = walk(OUT, '').sort();
  ok(JSON.stringify(files) === JSON.stringify(PUBLIC_FILES.slice().sort()),
     `dist holds exactly the ${PUBLIC_FILES.length} files on the public list, nothing more`);
  ok(files.every(f => fs.readFileSync(path.join(OUT, f)).equals(fs.readFileSync(path.join(ROOT, f)))),
     'each one is a byte for byte copy');

  // ── what must not be there ─────────────────────────────────────────────
  ok(!files.some(f => /(^|\/)bearings_db\.js$/i.test(f)), 'no bearings_db.js');
  const top = [...new Set(files.filter(f => f.includes('/')).map(f => f.split('/')[0]))].sort();
  for (const dir of ['data', 'docs', 'tests', 'admin', 'api', 'db', 'scripts', 'schemas']) {
    ok(!top.includes(dir), `no ${dir}/ folder`);
  }
  ok(JSON.stringify(top) === JSON.stringify(['css', 'js']), `the only folders are css/ and js/  (found: ${top.join(', ')})`);
  ok(!files.some(f => /\.md$/i.test(f)), 'no .md file (CLAUDE.md, README.md, INSTRUCTIONS.md, docs)');
  ok(!files.some(f => /(^|\/)\.|node_modules|\.toml$|\.sql$|\.json$|\.csv$|package/i.test(f)),
     'no dot file, node_modules, config, SQL, JSON or CSV file');
  ok(!files.some(f => /^js\/(db|schema-registry)\.js$|^js\/search\//.test(f)),
     'no js/db.js, js/schema-registry.js or js/search/: the search engine stays on the API side');
  ok(!files.includes('css/styles.css'), 'no css/styles.css (no page uses it)');

  // ── the pages ──────────────────────────────────────────────────────────
  const pages = files.filter(f => f.endsWith('.html'));
  ok(pages.length === 4, `4 pages: ${pages.join(', ')}`);
  const missing = [];
  pages.forEach(p => localRefs(fs.readFileSync(path.join(OUT, p), 'utf8')).forEach(ref => {
    if (!files.includes(ref)) missing.push(`${p} -> ${ref}`);
  }));
  ok(missing.length === 0, 'every local file a page refers to is in dist' + (missing.length ? '  (missing: ' + missing.join(', ') + ')' : ''));
  const html = pages.map(p => fs.readFileSync(path.join(OUT, p), 'utf8')).join('\n');
  ok(!/bearings_db|js\/db\.js|js\/search\/|schema-registry|schemas\//.test(html.replace(/<!--[\s\S]*?-->/g, '')),
     'no page loads the catalogue, js/db.js, the search engine or a schema');
  const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const about = fs.readFileSync(path.join(OUT, 'about.html'), 'utf8');
  ok(/src="js\/api\.js/.test(index) && /src="js\/escape\.js/.test(index), 'index.html loads the API client and the escape function');
  ok(/src="js\/api\.js/.test(about) && /Api\.stats\(\)/.test(about), 'about.html gets its catalogue count from the API');

  // ── the catalogue is not in there under another name ───────────────────
  const total = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  const dbSize = fs.statSync(path.join(ROOT, 'bearings_db.js')).size;
  ok(total < dbSize / 2, `the whole site is ${(total / 1024).toFixed(0)} KB; the catalogue alone is ${(dbSize / 1024).toFixed(0)} KB`);
  const text = files.filter(f => /\.(js|html|css|txt|xml)$/.test(f)).map(f => fs.readFileSync(path.join(OUT, f), 'utf8')).join('\n');
  ok(!/MYCELA_DB\s*=/.test(text), 'no file defines window.MYCELA_DB');
  // A catalogue row is one line carrying an id, a brand and a designation. One is enough to fail.
  const rowLike = (text.match(/\{[^{}\n]*["']?id["']?\s*:\s*["'][^"']+["'][^{}\n]*["']?pn["']?\s*:[^{}\n]*["']?bore["']?\s*:[^{}\n]*\}/g) || []);
  ok(rowLike.length === 0, 'no file holds anything shaped like a catalogue row');
  const db = fs.readFileSync(path.join(ROOT, 'bearings_db.js'), 'utf8');
  const ids = [...db.matchAll(/["']?id["']?\s*:\s*["']([^"']+)["']/g)].map(m => m[1]);
  const leaked = ids.filter(id => id.length >= 8 && text.includes(id));
  // A code comment may name a part (js/dgbb_calc.js explains one data fix by
  // its id). A catalogue would name thousands.
  ok(ids.length > 3000 && leaked.length <= 3, `of the catalogue's ${ids.length} part ids, at most a stray mention in a comment appears in the published files` +
     `  (found ${leaked.length}${leaked.length ? ': ' + leaked.slice(0, 5).join(', ') : ''})`);

  // ── the build refuses rather than guesses ──────────────────────────────
  ok(!PUBLIC_FILES.some(f => /[*?]/.test(f)) && PUBLIC_FILES.every(f => typeof f === 'string' && !f.endsWith('/')),
     'the public list names files one by one: no patterns, no folders');
  ok(/^dist\/$/m.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')), 'dist/ is git-ignored');
} finally {
  try { fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* temp folder */ }
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
