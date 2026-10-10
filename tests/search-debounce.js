#!/usr/bin/env node
'use strict';
/*
 * Search-box traffic tests. The search box asks the search API (js/api.js);
 * nothing is searched in the browser.
 *
 * Requests to the API:
 * - typing waits CONFIG.api.debounceMs (150 ms) after the last keystroke, so
 *   a burst of keystrokes is one request; Enter and the example buttons do
 *   not wait;
 * - a newer search cancels the request in flight (AbortController), and an
 *   older answer that still arrives is never shown over a newer one;
 * - "Searching..." appears only when a request takes over CONFIG.api.slowMs
 *   (300 ms);
 * - the API being unreachable, or answering 429, shows a friendly message
 *   instead of results;
 * - an answer the page already has is shown again without a request.
 *
 * Zero-result telemetry (audit finding B11) is unchanged in what it sends:
 * only on Enter or once typing pauses for CONFIG.search.zeroReportIdleMs,
 * whichever comes first. A newer query or clearing the box cancels a pending
 * report, so a pause mid-typing never logs a half-typed query, and a query
 * is sent at most once per session. Each report carries the stage the API
 * returned as fallbackStage, so the gap log can tell "no such size" from
 * "unparsable".
 *
 * The recording fetch still fails the run if anything calls the AI backend
 * that was removed on 2026-09-27.
 *
 *   node tests/search-debounce.js
 *
 * Loads the real js/config.js, js/escape.js, js/api.js and js/app.js against
 * a minimal DOM shim, a stand-in for the API and a recording fetch. Exits
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
global.location = { search: '', hostname: 'www.mycela.in', href: 'https://www.mycela.in/' };
global.scrollTo = () => {};
global.sessionStorage = (() => { const s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); } }; })();
global.window = global;
global.MYCELA = {};

// ── stand-in API + recording fetch ───────────────────────────────────────
// What the API would answer, by query:
//   "zzs…"  a size the fallback relaxes into results (stage 3)
//   "zz0…"  a size with nothing near it (stage 0)
//   "zz…"   gibberish (stage null)
//   "bore …" a real dimension query the fallback relaxes (stage 3)
//   "fit…"  one result that names an equivalent (alt) the page has not seen
//   anything else: one exact result
// and how:
//   "slow…" answers after 500 ms      "late…" answers after 400 ms and
//   "down…" the network fails          ignores being cancelled
//   "rate…" 429
const ROW = id => ({ id, pn: id, brand: 'SKF', type: 'Deep Groove Ball' });
function answerFor(q) {
  if (/^(zzs|bore )/.test(q)) return { results: [ROW('B')], note: 'near', stage: 3, count: 1 };
  if (q.startsWith('zz0')) return { results: [], note: null, stage: 0, count: 0 };
  if (q.startsWith('zz')) return { results: [], note: null, stage: null, count: 0 };
  if (q.startsWith('fit')) return { results: [Object.assign(ROW('A'), { alt: ['ALT-1'] })], note: null, stage: 'exact', count: 1 };
  return { results: [ROW('A:' + q)], note: null, stage: 'exact', count: 1 };
}
const BACKEND = [];      // URLs of any call to the removed AI backend
const TELEMETRY = [];    // parsed bodies sent to the Apps Script endpoint
const API = [];          // { path, q, aborted } per request to the search API
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
global.fetch = (url, opts) => {
  opts = opts || {};
  if (/onrender\.com/.test(url)) { BACKEND.push(url); return Promise.reject(new Error('removed')); }
  if (!url.startsWith('https://api.mycela.in/')) {
    TELEMETRY.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  }
  const u = new URL(url);
  const q = u.searchParams.get('q');
  const call = { path: u.pathname, q, ids: u.searchParams.get('ids'), aborted: false };
  API.push(call);
  if (u.pathname === '/stats') return Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 2 }) });
  if (u.pathname === '/parts') return Promise.resolve({ ok: true, status: 200, json: async () => ({ parts: [ROW('ALT-1')], count: 1 }) });
  const ms = q.startsWith('slow') ? 500 : q.startsWith('late') ? 400 : 5;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (q.startsWith('down')) return reject(new TypeError('Failed to fetch'));
      if (q.startsWith('rate')) return resolve({ ok: false, status: 429, json: async () => ({ error: 'too many requests' }) });
      resolve({ ok: true, status: 200, json: async () => answerFor(q) });
    }, ms);
    if (opts.signal) opts.signal.addEventListener('abort', () => {
      call.aborted = true;
      if (q.startsWith('late')) return;          // an answer that arrives anyway
      clearTimeout(t);
      reject(abortError());
    });
  });
};

// ── the real modules, and stubs for the ones around them ─────────────────
['js/config.js', 'js/escape.js', 'js/api.js'].forEach(f => require(path.join(ROOT, f)));
const NS = global.MYCELA;
const IDLE = NS.CONFIG.search.zeroReportIdleMs;
const TYPE = NS.CONFIG.api.debounceMs;
const SLOW = NS.CONFIG.api.slowMs;
eq([IDLE, TYPE, SLOW], [2000, 150, 300], 'CONFIG: zeroReportIdleMs 2000, api.debounceMs 150, api.slowMs 300');
eq(NS.CONFIG.api.baseUrl, 'https://api.mycela.in', 'CONFIG.api.baseUrl is https://api.mycela.in away from localhost');

const SHOWN = [];        // what the page showed, in order: ids per cards() call, or a notice
NS.Renderer = {
  cards: r => SHOWN.push(r.map(b => b.id)),
  notice: (title, text, retry) => SHOWN.push({ notice: title, retry: !!retry }),
  modal() {}, closeModal() {}, toggleCompare() {}, openCompare() {},
};
NS.Basket = { items: () => ({}), remove() {}, add() {}, has: () => false, count: () => 0, unresolved: () => 0,
              state: () => 'ready', sync: () => Promise.resolve('ready'), resolvedItems: () => [] };

require(path.join(ROOT, 'js', 'app.js'));

const q = els.q;
function type(text) { q.value = text; q.fire('input'); }
function enter() { q.fire('keydown', { key: 'Enter' }); }
const searches = () => API.filter(c => c.path === '/search').map(c => c.q);
const notices = () => SHOWN.filter(s => s.notice).map(s => s.notice);
const settle = () => wait(TYPE + 60);     // the typing pause, the request and its answer

(async () => {
  const zero = () => TELEMETRY.filter(t => t.type === 'zero_result').map(t => t.query);
  await wait(20);
  ok(!NS.SearchEngine && !NS.DB && !NS.DB_MAP && !NS.AIRefiner,
     'the page has no search engine, no catalogue and no AI refiner: only the API client');
  eq(API.map(c => c.path), ['/stats'], 'at load the page asks the API for the catalogue count, and nothing else');

  // ── A. typing: one request, after the pause ────────────────────────────
  API.length = 0;
  type('6'); type('62'); type('620'); type('6205');
  await wait(TYPE - 60);
  eq(searches(), [], 'no request while the visitor is still typing');
  await wait(120);
  eq(searches(), ['6205'], 'four quick keystrokes make one request, for the finished text');
  eq(SHOWN[SHOWN.length - 1], ['A:6205'], 'its results are shown');
  await wait(IDLE + 50);
  eq(zero(), [], 'a query with hits sends no zero-result telemetry');
  eq(notices(), [], 'a fast answer never shows "Searching..."');

  // ── B. Enter does not wait; a known answer needs no request ────────────
  API.length = 0; SHOWN.length = 0;
  q.value = '6306'; enter();
  eq(searches(), ['6306'], 'Enter sends the request at once');
  await wait(40);
  eq(SHOWN, [['A:6306']], 'and shows the answer');
  type('6205');
  eq([searches(), SHOWN[SHOWN.length - 1]], [['6306'], ['A:6205']], 'a query answered before is shown again at once, with no new request');

  // ── C. a newer search cancels the one in flight ────────────────────────
  API.length = 0; SHOWN.length = 0;
  q.value = 'slow1'; enter();
  await wait(50);
  q.value = '6307'; enter();
  await wait(40);
  eq(API.map(c => [c.q, c.aborted]), [['slow1', true], ['6307', false]], 'the older request is cancelled when a newer search starts');
  await wait(600);
  eq(SHOWN, [['A:6307']], 'only the newer answer is shown, and no "Searching..." for the cancelled one');

  // ── D. an older answer that arrives anyway is not shown ────────────────
  API.length = 0; SHOWN.length = 0;
  q.value = 'late1'; enter();
  await wait(50);
  q.value = '6308'; enter();
  await wait(500);                                  // late1's answer has arrived by now
  eq(SHOWN, [['A:6308']], 'an older answer arriving after a newer one is never shown over it');
  type('late2');                                    // typed, then the box is emptied before it answers
  await wait(TYPE + 30);
  type('');
  await wait(500);
  ok(!els.results.classList.contains('on') && SHOWN.length === 1, 'an answer arriving after the box was emptied is not shown');

  // ── E. "Searching..." only for a slow request ──────────────────────────
  API.length = 0; SHOWN.length = 0;
  q.value = 'slow2'; enter();
  await wait(SLOW - 80);
  eq(SHOWN, [], 'nothing changes on the page in the first 300 ms');
  await wait(140);
  eq(SHOWN, [{ notice: 'Searching...', retry: false }], 'after 300 ms without an answer the page says "Searching..."');
  await wait(250);
  eq(SHOWN[SHOWN.length - 1], ['A:slow2'], 'then the results replace it');

  // ── F. unreachable and rate limited ────────────────────────────────────
  API.length = 0; SHOWN.length = 0; TELEMETRY.length = 0;
  q.value = 'down1'; enter();
  await wait(60);
  eq(SHOWN, [{ notice: 'Search is not available right now', retry: true }], 'API unreachable: a friendly message with a "Try again" button');
  els.grid.fire('click', { target: { id: 'retryBtn', closest: () => null } });
  await wait(60);
  eq(searches(), ['down1', 'down1'], '"Try again" sends the same search again');
  q.value = 'rate1'; enter();
  await wait(60);
  eq(SHOWN[SHOWN.length - 1], { notice: 'Too many searches in a short time', retry: false }, '429: a message asking to wait a minute');
  await wait(IDLE + 50);
  eq(zero(), [], 'a failed search is not reported as a catalogue gap');
  const m = NS.Api.message({ kind: 'unreachable' }), r = NS.Api.message({ kind: 'rate' });
  ok(![m.title, m.text, r.title, r.text].some(t => /—|undefined|error|429|API/i.test(t)), 'the messages are plain words: no codes, no jargon, no em dash');

  // ── G. same-fit parts the page has not seen are fetched once ───────────
  API.length = 0; SHOWN.length = 0;
  q.value = 'fit1'; enter();
  await wait(60);
  eq(API.map(c => [c.path, c.q || c.ids]), [['/search', 'fit1'], ['/parts', 'ALT-1']], 'a result naming an unseen equivalent: one /parts request for it');
  eq(SHOWN, [['A'], ['A']], 'the cards are drawn, then drawn again once the equivalent is known');
  ok(NS.Api.known('ALT-1') && NS.Api.known('A'), 'both parts are now known to the page (details, compare, list)');

  // ── zero-result telemetry ──────────────────────────────────────────────
  // 2. once, for the final query, after the pause
  TELEMETRY.length = 0;
  type('zz'); type('zzq'); type('zzqx');
  eq(zero(), [], 'no zero-result telemetry while typing');
  await wait(IDLE - 100);
  eq(zero(), [], 'no zero-result telemetry before the idle time elapses');
  await wait(150);
  eq(zero(), ['zzqx'], 'zero-result telemetry fires once, for the final query only');
  const last = () => TELEMETRY[TELEMETRY.length - 1];
  ok('fallbackStage' in last() && last().fallbackStage === null,
     'nothing parsable: fallbackStage is sent, as null');

  // 2b. the payload tells "no such size" apart from "unparsable", from the API's stage
  type('zzs12');
  await wait(IDLE + 50);
  eq([last().query, last().fallbackStage], ['zzs12', 3],
     'fallback supplied results: still reported, with the stage the API returned');
  type('zz0999');
  await wait(IDLE + 50);
  eq([last().query, last().fallbackStage], ['zz0999', 0],
     'a size with nothing within tolerance: fallbackStage 0');

  // 3. a query with hits typed during the pause cancels the pending report
  TELEMETRY.length = 0;
  type('zzy'); await settle(); type('6206');
  await wait(IDLE + 50);
  eq(zero(), [], 'a newer query with hits cancels the pending zero-result report');

  // 4. clearing the box cancels a pending report
  type('zzw'); await settle();
  els.clearSearch.fire('click');
  await wait(IDLE + 50);
  eq(zero(), [], 'clear button cancels the pending zero-result report');

  // 5. emptying the input by typing cancels a pending report too
  type('zzv'); await settle(); type('');
  await wait(IDLE + 50);
  eq(zero(), [], 'deleting the query cancels the pending zero-result report');

  // 6. a pause mid-typing does not log the half-typed query
  TELEMETRY.length = 0;
  type('bore 12 od 9');
  await wait(500);
  type('bore 12 od 90');
  await wait(IDLE - 600);
  eq(zero(), [], 'no report for the half-typed query after a 500 ms pause');
  await wait(800);
  eq(zero(), ['bore 12 od 90'], 'one report, for the finished query only');

  // 7. Enter sends at once, as soon as the answer is in
  TELEMETRY.length = 0;
  type('zzs77');
  enter();
  eq(zero(), [], 'Enter before the answer is in: nothing sent yet');
  await wait(40);
  eq(zero(), ['zzs77'], 'Enter sends the zero-result report as soon as the API has answered, without the idle wait');
  await wait(IDLE + 100);
  eq(zero(), ['zzs77'], 'the idle timer does not send it a second time');
  q.value = 'zzs78'; enter(); await wait(40);
  q.value = 'zzs78'; enter();
  eq(zero(), ['zzs77', 'zzs78'], 'Enter on a query whose answer is already in sends at once');

  // 8. the same query is not sent twice in a session
  TELEMETRY.length = 0;
  type('bore 12 od 90');
  enter();
  type('zzs77');
  await wait(IDLE + 100);
  eq(zero(), [], 'a query already reported this session is not sent again');

  // 9. a query that has hits at send time sends nothing on Enter
  TELEMETRY.length = 0;
  type('zzt'); type('6207');
  enter();
  await wait(IDLE + 100);
  eq(zero(), [], 'Enter on a query with hits sends nothing');

  eq(BACKEND, [], 'nothing calls the removed AI backend');
  ok(API.every(c => ['/search', '/parts', '/stats'].includes(c.path)), 'the page only ever asks the API for /search, /parts and /stats');

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
