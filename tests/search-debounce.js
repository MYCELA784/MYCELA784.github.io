#!/usr/bin/env node
'use strict';
/*
 * Search-box backend traffic tests (audit finding B11): local search runs on
 * every keystroke, but the zero-result telemetry only fires on Enter or once
 * typing pauses for CONFIG.search.zeroReportIdleMs, whichever comes first. A
 * newer query or clearing the box cancels a pending report, so a pause
 * mid-typing never logs a half-typed query, and a query is sent at most once
 * per session. Each report carries the fallback's stage as fallbackStage, so
 * the gap log can tell "no such size" from "unparsable".
 *
 * The AI refiner tests (one call per pause, abort on newer input, stale
 * responses dropped) were removed with js/ai-refiner.js on 2026-09-27: the
 * backend only ever saw 50 bearings, its own index had 1,719 rows against the
 * live catalogue's 3,666, that index predated the June rebuild, and
 * its free-tier cold starts exceeded the 12 s client timeout. The recording
 * fetch still fails the run if anything calls the old backend.
 *
 *   node tests/search-debounce.js
 *
 * Loads the real js/config.js and js/app.js against a minimal DOM shim, a
 * stub search engine and a recording fetch. Exits non-zero on any failure.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (got ${JSON.stringify(a)})`); }
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── DOM shim ─────────────────────────────────────────────────────────────
const els = {};
function makeEl(id) {
  const handlers = {};
  const classes = new Set();
  return {
    id, value: '', hidden: false, innerHTML: '', textContent: '', placeholder: '',
    dataset: {}, style: {}, checked: false, disabled: false,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : on; v ? classes.add(c) : classes.delete(c); return v; },
    },
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    fire: (t, ev) => (handlers[t] || []).forEach(fn => fn(Object.assign({ target: { closest: () => null }, preventDefault() {} }, ev))),
    setAttribute() {}, removeAttribute() {}, focus() {}, blur() {},
    closest: () => null, querySelector: () => makeEl(), querySelectorAll: () => [],
    appendChild() {}, contains: () => false,
  };
}
global.document = {
  readyState: 'complete',
  getElementById: id => (els[id] = els[id] || makeEl(id)),
  querySelector: () => makeEl(), querySelectorAll: () => [],
  addEventListener() {}, createElement: () => makeEl(), body: makeEl('body'),
};
global.location = { search: '', href: 'https://www.mycela.in/' };
global.scrollTo = () => {};
global.sessionStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
global.window = global;
global.MYCELA = {};

// ── recording fetch ──────────────────────────────────────────────────────
const BACKEND = [];      // URLs of any call to the removed AI backend
const TELEMETRY = [];    // parsed bodies sent to the Apps Script endpoint
global.fetch = (url, opts) => {
  if (/onrender\.com/.test(url)) BACKEND.push(url);
  else TELEMETRY.push(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
};

// ── stub modules app.js depends on ───────────────────────────────────────
require(path.join(ROOT, 'js', 'config.js'));
const NS = global.MYCELA;
const DEBOUNCE = NS.CONFIG.search.zeroReportIdleMs;
eq(DEBOUNCE, 2000, 'CONFIG.search.zeroReportIdleMs is 2000');

const ROW = id => ({ id, pn: id, brand: 'SKF', type: 'Deep Groove Ball' });
NS.DB = [ROW('A'), ROW('B')];
NS.DB_MAP = { A: NS.DB[0], B: NS.DB[1] };
const LOCAL = [];        // queries the local engine saw
NS.SearchEngine = {
  fast: q => { LOCAL.push(q); return /^(zz|bore )/.test(q) ? [] : [ROW('A')]; },
  // "zzs…" stands in for a size the fallback relaxes (stage 3), "zz0…" for a
  // size with nothing near it (stage 0), any other "zz…" for gibberish (null).
  // "bore …" stands in for a real dimension query the fallback relaxes.
  fallback: q => /^(zzs|bore )/.test(q) ? { results: [ROW('B')], note: 'near', stage: 3 }
               : q.startsWith('zz0') ? { results: [], note: null, stage: 0 }
               : { results: [], note: null, stage: null },
  parse: () => ({}),
};
const RENDERED = [];     // ids per Renderer.cards call
NS.Renderer = { cards: r => RENDERED.push(r.map(b => b.id)), modal() {}, closeModal() {}, toggleCompare() {}, openCompare() {} };
NS.Basket = { items: () => ({}), remove() {}, add() {}, has: () => false, count: () => 0, onChange() {} };

require(path.join(ROOT, 'js', 'app.js'));

const q = els.q;
function type(text) { q.value = text; q.fire('input'); }
function enter() { q.fire('keydown', { key: 'Enter' }); }

(async () => {
  const zero = () => TELEMETRY.filter(t => t.type === 'zero_result').map(t => t.query);

  // 1. local search runs per keystroke; no refiner is loaded
  ok(!NS.AIRefiner, 'MYCELA.AIRefiner is not defined');
  type('6'); type('62'); type('620'); type('6205');
  eq(LOCAL.slice(-4), ['6', '62', '620', '6205'], 'local search runs on every keystroke');
  await wait(DEBOUNCE + 50);
  eq(zero(), [], 'a query with hits sends no zero-result telemetry');

  // 2. zero-result telemetry: once, for the final query, after the pause
  type('zz'); type('zzq'); type('zzqx');
  eq(zero(), [], 'no zero-result telemetry while typing');
  await wait(DEBOUNCE - 100);
  eq(zero(), [], 'no zero-result telemetry before the debounce elapses');
  await wait(150);
  eq(zero(), ['zzqx'], 'zero-result telemetry fires once, for the final query only');
  const last = () => TELEMETRY[TELEMETRY.length - 1];
  ok('fallbackStage' in last() && last().fallbackStage === null,
     'nothing parsable: fallbackStage is sent, as null');

  // 2b. the payload tells "no such size" apart from "unparsable"
  type('zzs12');
  await wait(DEBOUNCE + 50);
  eq([last().query, last().fallbackStage], ['zzs12', 3],
     'fallback supplied results: still reported, with the stage that did');
  type('zz0999');
  await wait(DEBOUNCE + 50);
  eq([last().query, last().fallbackStage], ['zz0999', 0],
     'a size with nothing within tolerance: fallbackStage 0');

  // 3. a query with hits typed during the pause cancels the pending report
  TELEMETRY.length = 0;
  type('zzy'); type('6206');
  await wait(DEBOUNCE + 50);
  eq(zero(), [], 'a newer query with hits cancels the pending zero-result report');

  // 4. clearing the box cancels a pending report
  type('zzw');
  els.clearSearch.fire('click');
  await wait(DEBOUNCE + 50);
  eq(zero(), [], 'clear button cancels the pending zero-result report');

  // 5. emptying the input by typing cancels a pending report too
  type('zzv'); type('');
  await wait(DEBOUNCE + 50);
  eq(zero(), [], 'deleting the query cancels the pending zero-result report');

  // 6. a pause mid-typing does not log the half-typed query
  TELEMETRY.length = 0;
  type('bore 12 od 9');
  await wait(500);
  type('bore 12 od 90');
  await wait(DEBOUNCE - 600);
  eq(zero(), [], 'no report for the half-typed query after a 500 ms pause');
  await wait(800);
  eq(zero(), ['bore 12 od 90'], 'one report, for the finished query only');

  // 7. Enter sends at once, without waiting for the idle timer
  TELEMETRY.length = 0;
  type('zzs77');
  enter();
  eq(zero(), ['zzs77'], 'Enter sends the zero-result report immediately');
  await wait(DEBOUNCE + 100);
  eq(zero(), ['zzs77'], 'the idle timer does not send it a second time');

  // 8. the same query is not sent twice in a session
  type('bore 12 od 90');
  enter();
  type('zzs77');
  await wait(DEBOUNCE + 100);
  eq(zero(), ['zzs77'], 'a query already reported this session is not sent again');

  // 9. a query that has hits at send time sends nothing on Enter
  TELEMETRY.length = 0;
  type('zzt'); type('6207');
  enter();
  await wait(DEBOUNCE + 100);
  eq(zero(), [], 'Enter on a query with hits sends nothing');

  eq(BACKEND, [], 'nothing calls the removed AI backend');

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
