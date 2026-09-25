#!/usr/bin/env node
'use strict';
/*
 * Search-box backend traffic tests (audit finding B11): local search runs on
 * every keystroke, but the AI refiner and the zero-result telemetry only fire
 * once typing pauses for CONFIG.search.aiDebounceMs. A newer query aborts the
 * in-flight request, and a response for a superseded query is never rendered.
 *
 *   node tests/search-debounce.js
 *
 * Loads the real js/config.js, js/ai-refiner.js and js/app.js against a
 * minimal DOM shim, a stub search engine and a recording fetch. Exits
 * non-zero on any failure.
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

// ── recording fetch: backend calls stay pending until the test settles them
const BACKEND = [];      // { query, signal, resolve }
const TELEMETRY = [];    // parsed bodies sent to the Apps Script endpoint
let ignoreAbort = false; // true: a request keeps going after abort (a response that raced it)
global.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  if (/onrender\.com/.test(url)) {
    return new Promise((resolve, reject) => {
      const call = { query: body.query, signal: opts.signal, aborted: false,
        resolve: matches => resolve({ ok: true, json: async () => ({ matches }) }) };
      opts.signal.addEventListener('abort', () => { call.aborted = true; if (!ignoreAbort) reject(new Error('aborted')); });
      BACKEND.push(call);
    });
  }
  TELEMETRY.push(body);
  return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
};

// ── stub modules app.js depends on ───────────────────────────────────────
require(path.join(ROOT, 'js', 'config.js'));
require(path.join(ROOT, 'js', 'ai-refiner.js'));
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
  // 1. typing a part number: local search per keystroke, one backend call
  type('6'); type('62'); type('620'); type('6205');
  eq(LOCAL.slice(-4), ['6', '62', '620', '6205'], 'local search runs on every keystroke');
  eq(BACKEND.length, 0, 'no backend call while typing');
  await wait(DEBOUNCE - 100);
  eq(BACKEND.length, 0, 'no backend call before the debounce elapses');
  await wait(150);
  eq(BACKEND.map(c => c.query), ['6205'], 'one backend call, for the final query only');

  // 2. a newer query aborts the in-flight request
  type('6206');
  ok(BACKEND[0].aborted, 'new input aborts the in-flight request for "6205"');
  await wait(DEBOUNCE + 50);
  eq(BACKEND.map(c => c.query), ['6205', '6206'], 'the newer query goes out after its own debounce');
  const before = RENDERED.length;
  BACKEND[1].resolve(['B']);
  await wait(10);
  eq(RENDERED.slice(before), [['B']], 'the current query\'s AI matches are rendered');

  // 3. a response for a superseded query that arrives anyway is dropped
  ignoreAbort = true;
  type('6207');
  await wait(DEBOUNCE + 50);
  const stale = BACKEND[2];
  eq(stale.query, '6207', 'request for "6207" in flight');
  type('6208');
  const mark = RENDERED.length;       // 6208's local render already happened
  stale.resolve(['B']);
  await wait(10);
  eq(RENDERED.length, mark, 'a response for a superseded query never renders');
  ignoreAbort = false;

  // 4. zero-result telemetry: once, for the final query, after the pause
  await wait(DEBOUNCE + 50);
  TELEMETRY.length = 0;
  type('zz'); type('zzq'); type('zzqx');
  eq(TELEMETRY.length, 0, 'no zero-result telemetry while typing');
  await wait(DEBOUNCE + 50);
  eq(TELEMETRY.filter(t => t.type === 'zero_result').map(t => t.query), ['zzqx'],
     'zero-result telemetry fires once, for the final query only');

  // 5. clearing the box cancels a pending call
  const n = BACKEND.length;
  type('6210');
  els.clearSearch.fire('click');
  await wait(DEBOUNCE + 50);
  eq(BACKEND.length, n, 'clear button cancels the pending backend call');

  // 6. emptying the input by typing cancels a pending call too
  type('6211'); type('');
  await wait(DEBOUNCE + 50);
  eq(BACKEND.length, n, 'deleting the query cancels the pending backend call');

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
