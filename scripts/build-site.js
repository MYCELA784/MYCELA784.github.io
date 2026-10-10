#!/usr/bin/env node
'use strict';
/*
 * Build the public website into dist/.
 *
 *   node scripts/build-site.js              writes dist/ (git-ignored)
 *   node scripts/build-site.js --out <dir>  writes somewhere else (tests)
 *
 * dist/ is what gets published (Cloudflare Pages at go-live). It holds ONLY
 * the files listed in PUBLIC_FILES below, copied byte for byte. Nothing is
 * picked up by pattern or by folder: a file that is not on the list is not
 * published, whatever it is called and wherever it sits. So the catalogue
 * (bearings_db.js), the master database, the admin and API code, the
 * scripts, tests, docs and OEM files cannot reach the public site by
 * accident.
 *
 * To publish a new file, add it to the list. The build stops if a listed
 * file is missing, if a page refers to a local file that is not on the list,
 * or if a listed script is not used by any page. tests/build-site.js checks
 * the result.
 *
 * There are no image or font files in this repository today (icons are
 * inline SVG, fonts come from Google Fonts). Add them here when there are.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const PUBLIC_FILES = [
  // pages
  'index.html',
  'about.html',
  'contact.html',
  'dealers.html',
  // styles
  'styles.css',
  'css/components.css',
  // scripts every page uses
  'site.js',
  'contact.js',
  // scripts of the search page (index.html), in load order. No catalogue and
  // no search engine: the page asks the search API (js/api.js).
  'js/config.js',
  'js/escape.js',
  'js/constants.js',
  'js/api.js',
  'js/tables/dgbb_tables.js',
  'js/tables/fag_tables.js',
  'js/dgbb_calc.js',
  'js/renderer.js',
  'js/router.js',
  'js/supplier-form.js',
  'js/features.js',
  'js/canvas.js',
  'js/app.js',
  // for search engines and the domain
  'robots.txt',
  'sitemap.xml',
  'CNAME',
];

// Local files a page refers to: src="..." and href="..." that are not
// another site, an anchor or a mail link. Query strings (?v=12) are dropped.
function localRefs(html) {
  const refs = [];
  const re = /\s(?:src|href)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const ref = m[1].split('#')[0].split('?')[0];
    if (!ref || /^(https?:)?\/\//.test(m[1]) || /^(mailto|tel|data|javascript):/i.test(m[1])) continue;
    refs.push(ref.replace(/^\.?\//, ''));
  }
  return refs;
}

function build(outDir) {
  const problems = [];
  PUBLIC_FILES.forEach(f => {
    if (path.isAbsolute(f) || f.split('/').includes('..')) problems.push(`${f}: not a path inside the repository`);
    else if (!fs.existsSync(path.join(ROOT, f)) || !fs.statSync(path.join(ROOT, f)).isFile()) problems.push(`${f}: listed but missing`);
  });
  const listed = new Set(PUBLIC_FILES);
  const used = new Set();
  PUBLIC_FILES.filter(f => f.endsWith('.html')).forEach(page => {
    if (!fs.existsSync(path.join(ROOT, page))) return;
    localRefs(fs.readFileSync(path.join(ROOT, page), 'utf8')).forEach(ref => {
      used.add(ref);
      if (!listed.has(ref)) problems.push(`${page} refers to ${ref}, which is not on the public list`);
    });
  });
  PUBLIC_FILES.filter(f => /\.(js|css)$/.test(f) && !used.has(f))
    .forEach(f => problems.push(`${f}: on the public list but no page uses it`));
  if (problems.length) throw new Error('Not built:\n  ' + problems.join('\n  '));

  fs.rmSync(outDir, { recursive: true, force: true });
  let bytes = 0;
  PUBLIC_FILES.forEach(f => {
    const to = path.join(outDir, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), to);
    bytes += fs.statSync(to).size;
  });
  return { outDir, files: PUBLIC_FILES.slice(), bytes };
}

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const outDir = path.resolve(i === -1 ? path.join(ROOT, 'dist') : process.argv[i + 1]);
  try {
    const r = build(outDir);
    console.log(`Built ${path.relative(ROOT, r.outDir) || r.outDir}: ${r.files.length} files, ${(r.bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { build, PUBLIC_FILES, localRefs, ROOT };
