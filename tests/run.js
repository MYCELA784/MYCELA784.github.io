#!/usr/bin/env node
'use strict';
/*
 * Query-to-expected-top test runner for the schema-driven search pipeline.
 *
 *   node tests/run.js            run tests/search-cases.json
 *   node tests/run.js -v         also print the top-3 for every case
 *   node tests/run.js "6205 skf" ad-hoc: just print the ranked results
 *
 * Loads the same files, in the same order, as index.html, with a minimal
 * window shim. Exits non-zero if any case fails.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
global.MYCELA = global.window.MYCELA;

[
  'bearings_db.js',
  'js/config.js',
  'js/constants.js',
  'js/db.js',
  'js/schema-registry.js',
  'js/search/parsers.js',
  'js/search/rules.js',
  'js/search/scoring.js',
  'js/search/fallback.js',
  'js/search/engine.js',
].forEach(f => require(path.join(ROOT, f)));

const SE = global.window.MYCELA.SearchEngine;

// ── ad-hoc mode ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const verbose = args.includes('-v') || args.includes('--verbose');
const adhoc = args.filter(a => a[0] !== '-');
if (adhoc.length) {
  adhoc.forEach(q => {
    console.log('\n=== ' + JSON.stringify(q) + ' ===');
    console.log(JSON.stringify(SE.parse(q), null, 1));
    SE.fast(q, 10).forEach((b, i) =>
      console.log(`${String(i + 1).padStart(2)}. ${String(b._score).padStart(5)}  ${b.id.padEnd(20)} ${String(b.pn).padEnd(16)} ${b.brand.padEnd(4)} ${String(b.type).padEnd(22)} ${b.sealing}`));
  });
  process.exit(0);
}

// ── helpers ──────────────────────────────────────────────────────────────
function get(obj, dotpath) {
  return dotpath.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setEq(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const s = a.slice().sort();
  const t = b.slice().sort();
  return s.every((v, i) => v === t[i]);
}
function deepMatch(actual, expected, trail, errs) {
  if (Array.isArray(expected)) {
    if (!setEq(actual, expected)) errs.push(`${trail}: expected [${expected}] got ${JSON.stringify(actual)}`);
    return;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') { errs.push(`${trail}: expected object got ${JSON.stringify(actual)}`); return; }
    Object.keys(expected).forEach(k => deepMatch(actual[k], expected[k], trail ? trail + '.' + k : k, errs));
    return;
  }
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > 0.011) errs.push(`${trail}: expected ${expected} got ${JSON.stringify(actual)}`);
    return;
  }
  if (actual !== expected) errs.push(`${trail}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

function runCase(c, index) {
  const errs = [];
  const hits = SE.fast(c.query, c.topN || 10);
  const ids = hits.map(h => h.id);
  const top = hits[0];

  if (c.top && (!top || top.id !== c.top)) errs.push(`top: expected ${c.top} got ${top ? top.id : '(none)'}`);
  if (c.topOneOf && (!top || c.topOneOf.indexOf(top.id) === -1)) errs.push(`topOneOf: expected one of [${c.topOneOf}] got ${top ? top.id : '(none)'}`);
  if (c.inTop) {
    const n = c.inTopN || 5;
    [].concat(c.inTop).forEach(id => {
      if (ids.slice(0, n).indexOf(id) === -1) errs.push(`inTop${n}: ${id} not in [${ids.slice(0, n)}]`);
    });
  }
  if (c.notInResults) {
    [].concat(c.notInResults).forEach(id => {
      if (ids.indexOf(id) !== -1) errs.push(`notInResults: ${id} present`);
    });
  }
  if (c.topSealing && (!top || top.sealing !== c.topSealing)) errs.push(`topSealing: expected ${c.topSealing} got ${top ? top.sealing : '(none)'}`);
  if (c.topType && (!top || top.type !== c.topType)) errs.push(`topType: expected ${c.topType} got ${top ? top.type : '(none)'}`);
  if (c.topBoreIn) {
    if (!top || top.bore < c.topBoreIn[0] || top.bore > c.topBoreIn[1]) errs.push(`topBoreIn: ${c.topBoreIn} got ${top ? top.bore : '(none)'}`);
  }
  if (c.topOdIn) {
    if (!top || top.od < c.topOdIn[0] || top.od > c.topOdIn[1]) errs.push(`topOdIn: ${c.topOdIn} got ${top ? top.od : '(none)'}`);
  }

  if (c.parse) {
    const p = SE.parse(c.query);
    deepMatch(p, c.parse, '', errs);
  }
  if (c.noParseKeys) {
    const p = SE.parse(c.query);
    [].concat(c.noParseKeys).forEach(k => {
      if (get(p, k) !== undefined) errs.push(`noParseKey ${k}: expected absent got ${JSON.stringify(get(p, k))}`);
    });
  }
  if (c.sameTopAndScoreAs) {
    const other = SE.fast(c.sameTopAndScoreAs, 5)[0];
    if (!top || !other) errs.push(`sameTopAndScoreAs: missing result`);
    else {
      if (top.id !== other.id) errs.push(`sameTopAndScoreAs: top ${top.id} vs ${other.id}`);
      if (top._score !== other._score) errs.push(`sameTopAndScoreAs: score ${top._score} vs ${other._score}`);
    }
  }

  const ok = errs.length === 0;
  const label = `${ok ? 'PASS' : 'FAIL'}  #${String(index + 1).padStart(2)}  ${JSON.stringify(c.query)}`;
  console.log(label + (c.note ? '   — ' + c.note : ''));
  if (!ok) errs.forEach(e => console.log('        ✗ ' + e));
  if (verbose && ok) {
    SE.fast(c.query, 3).forEach(b => console.log(`        · ${String(b._score).padStart(4)}  ${b.id}  (${b.sealing})`));
  }
  return ok;
}

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'search-cases.json'), 'utf8'));
console.log(`Running ${cases.length} search cases\n`);
let pass = 0;
cases.forEach((c, i) => { if (runCase(c, i)) pass++; });
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
