#!/usr/bin/env node
'use strict';
/*
 * Search-box backend traffic tests (audit finding B11): local search runs on
 * every keystroke, but the zero-result telemetry only fires once typing
 * pauses for CONFIG.search.aiDebounceMs, and a newer query or clearing the
 * box cancels a pending report.
 *
 * The AI refiner tests (one call per pause, abort on newer input, stale
 * responses dropped) were removed with js/ai-refiner.js on 2026-09-27: the
 * backend only indexed 50 of 1,719 bearings, predated the June rebuild, and
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
const DEBOUNCE = NS.CONFIG.search.aiDebounceMs;
eq(DEBOUNCE, 350, 'CONFIG.search.aiDebounceMs is 350');

const ROW = id => ({ id, pn: id, brand: 'SKF', type: 'Deep Groove Ball' });
NS.DB = [ROW('A'), ROW('B')];
NS.DB_MAP = { A: NS.DB[0], B: NS.DB[1] };
const LOCAL = [];        // queries the local engine saw
NS.SearchEngine = {
  fast: q => { LOCAL.push(q); return q.startsWith('zz') ? [] : [ROW('A')]; },
  fallback: () => ({ results: [], note: null }),
  parse: () => ({}),
};
const RENDERED = [];     // ids per Renderer.cards call
NS.Renderer = { cards: r => RENDERED.push(r.map(b => b.id)), modal() {}, closeModal() {}, toggleCompare() {}, openCompare() {} };
NS.Basket = { items: () => ({}), remove() {}, add() {}, has: () => false, count: () => 0, onChange() {} };

require(path.join(ROOT, 'js', 'app.js'));

const q = els.q;
function type(text) { q.value = text; q.fire('input'); }

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

  eq(BACKEND, [], 'nothing calls the removed AI backend');

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
