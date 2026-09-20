#!/usr/bin/env node
'use strict';
/*
 * Builds the "add f0" changeset for FAG rows (data-fix Q11) from the HR 1
 * extraction CSV, ready for scripts/apply-data-fixes.js.
 *
 *   node scripts/make-fag-f0-changeset.js <hr1_de_en_fag_bearings.csv> <out.json>
 *
 * Which rows: every FAG row the calculator can run on today
 * (DGBBCalc.supports) that is a single row bearing (not the 42xx / 43xx
 * double row series), and only those. The CSV's `f0` column comes from the
 * patched extract_fag.py (deep groove rows, HR 1 only).
 *
 * How a row is matched to the CSV: same designation (case, spaces, '-', '_'
 * and '/' ignored) AND bore and OD within 0.5 mm of the CSV row. A row with
 * no match, an ambiguous match (two CSV rows with different f0), or an f0
 * outside 8-20 aborts the run and writes nothing: this never guesses.
 *
 * It only ever emits "add" ops, so it cannot change a value that already
 * exists, and re-running it on a DB that already has f0 emits nothing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const [, , csvPath, outPath] = process.argv;
if (!csvPath || !outPath) {
  console.error('Usage: node scripts/make-fag-f0-changeset.js <hr1 csv> <out.json>');
  process.exit(1);
}
const die = m => { console.error('ABORT: ' + m + ' - no file written.'); process.exit(1); };

// Same load order as index.html / tests/dgbb.js.
global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
global.MYCELA = global.window.MYCELA;
['bearings_db.js', 'js/config.js', 'js/constants.js', 'js/db.js', 'data/dgbb_tables.js', 'data/fag_tables.js', 'js/dgbb_calc.js']
  .forEach(f => require(path.join(ROOT, f)));
const M = global.window.MYCELA;
const C = M.DGBBCalc;

// ── minimal CSV reader (quoted fields, doubled quotes) ─────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csvText = fs.readFileSync(csvPath, 'utf8');
const [head, ...body] = parseCsv(csvText).filter(r => r.length > 1);
const col = n => { const i = head.indexOf(n); if (i < 0) die(`CSV has no "${n}" column (is it the patched extractor's output?)`); return i; };
const iDes = col('designation'), iBore = col('bore_d_mm'), iOd = col('od_D_mm'), iF0 = col('f0');

const norm = s => String(s || '').toUpperCase().replace(/[\s_\-/]+/g, '');
const byDes = {};
body.forEach(r => { (byDes[norm(r[iDes])] = byDes[norm(r[iDes])] || []).push(r); });

// ── the rows ───────────────────────────────────────────────────────────────
const wanted = M.DB.filter(b => b.brand === 'FAG' && C.supports(b) && !C.isFagDoubleRow(b));
const already = wanted.filter(b => b.f0 !== undefined);
const todo = wanted.filter(b => b.f0 === undefined);

const changes = [];
const problems = [];
todo.forEach(b => {
  const cands = (byDes[norm(b.pn)] || []).filter(r =>
    Math.abs(parseFloat(r[iBore]) - b.bore) < 0.5 && Math.abs(parseFloat(r[iOd]) - b.od) < 0.5);
  const vals = [...new Set(cands.map(r => r[iF0]).filter(v => v !== '' && v != null))];
  if (!vals.length) { problems.push(`${b.id}: no CSV row with an f0 (designation ${b.pn}, ${b.bore}x${b.od})`); return; }
  if (vals.length > 1) { problems.push(`${b.id}: ambiguous f0 ${vals.join(' / ')}`); return; }
  const f0 = parseFloat(vals[0]);
  if (!(f0 >= 8 && f0 <= 20)) { problems.push(`${b.id}: f0 ${f0} outside 8-20`); return; }
  changes.push({ id: b.id, op: 'add', fields: { f0 } });
});

console.log(`FAG rows the calculator can run on and that are single row: ${wanted.length}`);
console.log(`  already carrying f0: ${already.length}   to add: ${todo.length}`);
console.log(`  matched with a plausible f0: ${changes.length}   problems: ${problems.length}`);
if (problems.length) { problems.slice(0, 20).forEach(p => console.log('  ' + p)); die(`${problems.length} row(s) could not be matched`); }
if (!changes.length) die('nothing to add');

const vs = changes.map(c => c.fields.f0);
console.log(`  f0 range ${Math.min(...vs)} .. ${Math.max(...vs)}`);
fs.writeFileSync(outPath, '[\n' + changes.map(c => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n', 'utf8');
console.log(`wrote ${outPath} (${changes.length} add ops)`);
