#!/usr/bin/env node
'use strict';
/*
 * Website-through-the-API parity: what the page shows for a search is what
 * the search engine itself returns.
 *
 *   node tests/site-search.js        (run `npm install` in api/ once first)
 *
 * tests/run.js checks the engine's ranking, and tests/api.js checks the
 * API's raw answers against the engine. This test checks the last link: the
 * website's own code. The real js/config.js, js/escape.js, js/api.js and
 * js/app.js run in a page-like sandbox that has no catalogue and no search
 * engine, with their requests sent to the real Worker (bundled as a deploy
 * would, in the local workerd runtime). For every query in
 * tests/search-cases.json the parts the page hands to its renderer must be
 * the engine's parts, in the engine's order, with the engine's note, and the
 * stage the page would report to the gap log must be the engine's stage.
 *
 * Also: the modal's same-size list (asked from the API as "25x52x15") finds
 * what the old in-browser scan found, and /parts returns the catalogue's own
 * rows for a stored list.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./api-harness.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const api = await H.start();

  // ── the engine, loaded as tests/run.js does (expected values) ──────────
  ['js/constants.js', 'js/schema-registry.js', 'js/search/parsers.js', 'js/search/rules.js',
   'js/search/scoring.js', 'js/search/fallback.js', 'js/search/engine.js']
    .forEach(f => require(path.join(H.ROOT, f)));
  const ENGINE = global.MYCELA;
  const SE = ENGINE.SearchEngine;
  function engine(q) {
    const hits = SE.fast(q);
    if (hits.length) return { ids: hits.map(b => b.id), note: null, stage: 'exact' };
    const fb = SE.fallback(q);
    return { ids: fb.results.map(b => b.id), note: fb.note, stage: fb.stage };
  }

  // ── the page: its own scripts, in a sandbox with nothing else ──────────
  const requests = [];      // every request the page made to the API
  let bytes = 0;
  const TELEMETRY = [];
  const el = () => {
    const handlers = {}, cls = new Set();
    return { value: '', hidden: false, innerHTML: '', textContent: '', dataset: {}, style: {}, disabled: false,
             classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle: () => false },
             addEventListener: (t, fn) => { handlers[t] = fn; }, setAttribute() {}, focus() {}, blur() {},
             closest: () => null, querySelector: () => el(), querySelectorAll: () => [], contains: () => false };
  };
  const els = {};
  const page = {
    document: { readyState: 'complete', getElementById: id => (els[id] = els[id] || el()), querySelector: () => el(),
                querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el() },
    location: { search: '', hostname: 'localhost', href: 'http://localhost:8080/' },
    sessionStorage: { getItem: () => null, setItem() {} },
    scrollTo() {}, console, setTimeout, clearTimeout, AbortController, URLSearchParams, URL, Promise,
    fetch: async (url, init) => {
      if (!url.startsWith('http://localhost:8787/')) { TELEMETRY.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true }) }; }
      const p = url.slice('http://localhost:8787'.length);
      requests.push(p);
      const res = await api.get(p, { headers: { Origin: 'http://localhost:8080' } });
      const text = await res.text();
      bytes += text.length;
      return { ok: res.ok, status: res.status, json: async () => JSON.parse(text) };
    },
  };
  page.window = page;
  vm.createContext(page);
  const load = f => vm.runInContext(fs.readFileSync(path.join(H.ROOT, f), 'utf8'), page, { filename: f });
  ['js/config.js', 'js/escape.js', 'js/api.js'].forEach(load);
  const SHOWN = [];
  page.MYCELA.Renderer = {
    cards: (results, state) => SHOWN.push({ rows: results, title: state.title, sub: state.sub }),
    notice: title => SHOWN.push({ notice: title }), modal() {}, closeModal() {}, toggleCompare() {}, openCompare() {},
  };
  page.MYCELA.Basket = { items: () => ({}), has: () => false, count: () => 0, unresolved: () => 0, state: () => 'ready',
                         sync: () => Promise.resolve('ready'), resolvedItems: () => [], remove() {}, add() {} };
  load('js/app.js');
  const P = page.MYCELA;
  ok(P.CONFIG.api.baseUrl === 'http://localhost:8787', 'on localhost the page uses the local API (http://localhost:8787)');
  ok(!P.DB && !P.DB_MAP && !P.SearchEngine && !page.MYCELA_DB, 'the page has no catalogue and no search engine of its own');

  // ── 1. every search case, through the page ─────────────────────────────
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'search-cases.json'), 'utf8'));
  const queries = [...new Set(cases.flatMap(c => [c.query, c.sameTopAndScoreAs].filter(Boolean)))];
  const FIELDS = JSON.parse(fs.readFileSync(path.join(H.API, 'published-fields.json'), 'utf8'));
  const ALLOWED = new Set(FIELDS.record.concat(FIELDS.result));
  let sameParts = 0, sameText = 0, sameStage = 0, extra = 0, exact = 0, fallback = 0, none = 0;
  const diffs = [];
  for (const q of queries) {
    const want = engine(q);
    SHOWN.length = 0;
    await P.App.doSearch(q);
    const got = SHOWN[SHOWN.length - 1] || {};
    const ids = (got.rows || []).map(b => b.id);
    if (same(ids, want.ids)) sameParts++; else diffs.push(`${JSON.stringify(q)}: page [${ids.slice(0, 5)}] vs engine [${want.ids.slice(0, 5)}]`);
    const n = want.ids.length;
    if (got.title === `${n} result${n === 1 ? '' : 's'}` && got.sub === (want.note || `for "${q.trim()}"`)) sameText++;
    else diffs.push(`${JSON.stringify(q)}: page says ${JSON.stringify([got.title, got.sub])}`);
    if (P.Api.cached(q.trim()).stage === want.stage) sameStage++; else diffs.push(`${JSON.stringify(q)}: stage ${P.Api.cached(q.trim()).stage} vs ${want.stage}`);
    (got.rows || []).forEach(b => Object.keys(b).forEach(k => { if (!ALLOWED.has(k)) extra++; }));
    if (want.stage === 'exact') exact++; else if (n) fallback++; else none++;
  }
  const N = queries.length;
  ok(sameParts === N, `parity: for ${sameParts}/${N} search-cases queries the page shows the engine's parts, in the engine's order`);
  ok(sameText === N, `parity: for ${sameText}/${N} the page shows the same result count and the same note`);
  ok(sameStage === N, `parity: for ${sameStage}/${N} the stage the page would report to the gap log is the engine's`);
  diffs.slice(0, 10).forEach(d => console.log('        ' + d));
  ok(exact > 0 && fallback > 0 && none > 0, `the cases cover exact results (${exact}), fallback results (${fallback}) and no results (${none})`);
  ok(extra === 0, 'the page was sent published fields only');
  const searchRequests = requests.filter(p => p.startsWith('/search'));
  ok(searchRequests.length === new Set(queries.map(q => q.trim())).size, `one request per search (${searchRequests.length} for ${N} queries)`);
  const dbBytes = fs.statSync(path.join(H.ROOT, 'bearings_db.js')).size;
  ok(bytes / searchRequests.length < dbBytes / 100,
     `an average search sends the browser ${(bytes / searchRequests.length / 1024).toFixed(1)} KB; the catalogue it used to download is ${(dbBytes / 1024).toFixed(0)} KB`);

  // ── 2. zero-result telemetry carries the API's stage ───────────────────
  const zeroCase = queries.find(q => { const w = engine(q); return typeof w.stage === 'number' && w.stage > 0; });
  TELEMETRY.length = 0;
  await P.App.doSearch(zeroCase);
  // no Enter: the report goes out once the idle time has passed
  await new Promise(r => setTimeout(r, P.CONFIG.search.zeroReportIdleMs + 100));
  const sent = TELEMETRY.filter(t => t.type === 'zero_result');
  ok(sent.length === 1 && sent[0].query === zeroCase.trim() && sent[0].fallbackStage === engine(zeroCase).stage,
     `a fallback query (${JSON.stringify(zeroCase)}) is reported once, with fallbackStage ${engine(zeroCase).stage} from the API`);

  // ── 3. the modal's same-size list, asked from the API ──────────────────
  const DB = ENGINE.DB;
  const near = (x, b) => x.id !== b.id && Math.abs(x.bore - b.bore) < 0.5 && Math.abs(x.od - b.od) < 0.5 && Math.abs(x.w - b.w) < 0.5;
  const bySize = new Map();
  DB.forEach(b => { const k = `${b.bore}|${b.od}|${b.w}`; if (!bySize.has(k)) bySize.set(k, b); });
  const sample = [...bySize.values()].filter((b, i) => i % 12 === 0);
  let sizeOk = 0;
  const sizeDiffs = [];
  for (const b of sample) {
    const oldScan = DB.filter(x => near(x, b));
    const a = await P.Api.search(`${b.bore}x${b.od}x${b.w}`);
    const viaApi = a.results.filter(x => near(x, b)).slice(0, 5);
    if (viaApi.length === Math.min(5, oldScan.length) && viaApi.every(x => oldScan.some(o => o.id === x.id))) sizeOk++;
    else sizeDiffs.push(`${b.id} ${b.bore}x${b.od}x${b.w}: api ${viaApi.length}, scan ${oldScan.length}`);
  }
  ok(sizeOk === sample.length, `same-size parts: for ${sizeOk}/${sample.length} sampled sizes the API gives as many (up to 5) as the old in-browser scan, all of that size`);
  sizeDiffs.slice(0, 5).forEach(d => console.log('        ' + d));

  // ── 4. parts by id, for the list and for links to one part ─────────────
  const wantIds = ['SKF-6205', 'NTN-6205', 'NO-SUCH-PART', DB[DB.length - 1].id];
  const fresh = wantIds.filter(id => !P.Api.known(id));
  const before = requests.length;
  await P.Api.parts(wantIds);
  ok(wantIds.filter(id => id !== 'NO-SUCH-PART').every(id => {
    const got = P.Api.known(id), row = api.catalog.rows.find(r => r.id === id);
    return got && same(got, row);
  }), '/parts gives the page the catalogue\'s own published rows');
  ok(P.Api.missing('NO-SUCH-PART') && !P.Api.known('NO-SUCH-PART'), 'a part that does not exist is marked missing, not invented');
  ok(requests.length - before === (fresh.length ? 1 : 0), 'only parts the page has not seen are asked for, in one request');
  await P.Api.parts(wantIds);
  ok(requests.length - before === (fresh.length ? 1 : 0), 'asking again makes no request at all');
  const st = await P.Api.stats();
  ok(st.count === DB.length, `/stats gives the page the catalogue count the engine has (${DB.length})`);

  await api.stop();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
