#!/usr/bin/env node
'use strict';
/*
 * Search API tests: the Worker in api/ against the website's own engine.
 *
 *   node tests/api.js        (run `npm install` in api/ once first)
 *
 * - Parity: for every query in tests/search-cases.json, GET /search returns
 *   the same ids in the same order, the same note and the same stage as the
 *   browser's doSearch() steps (fast, then fallback when fast is empty).
 * - Validation: missing / empty / blank / 201-char q is 400, unknown path
 *   404, POST 405, /health { ok: true }, empty KV 503.
 * - Allowlist: no response carries a field outside api/published-fields.json.
 * - Cap: no response has more than 40 results.
 * - CORS: only https://mycela.in, https://www.mycela.in and http://localhost
 *   are allowed (http://www.mycela.in and look-alikes are refused).
 * - Rate limit, in the local runtime's own simulation of the binding: 70
 *   quick searches from one IP, the later ones 429; /health not limited.
 *   (tests/api-ratelimit.js covers the details with a mocked binding.)
 * Exits non-zero on any failure.
 */
const fs = require('fs');
const path = require('path');
const H = require('./api-harness.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}

const FIELDS = JSON.parse(fs.readFileSync(path.join(H.API, 'published-fields.json'), 'utf8'));
const ALLOWED = new Set(FIELDS.record.concat(FIELDS.result));
const EXCLUDED = Object.keys(FIELDS.excluded);

(async () => {
  const api = await H.start();

  // ── the browser engine, loaded as tests/run.js does ─────────────────────
  // build() above already ran bearings_db.js, config.js and db.js into
  // global.MYCELA; add the rest of the search scripts in index.html order.
  ['js/constants.js', 'js/schema-registry.js', 'js/search/parsers.js', 'js/search/rules.js',
   'js/search/scoring.js', 'js/search/fallback.js', 'js/search/engine.js']
    .forEach(f => require(path.join(H.ROOT, f)));
  const SE = global.MYCELA.SearchEngine;
  function browser(q) {
    const hits = SE.fast(q);
    if (hits.length) return { ids: hits.map(b => b.id), note: null, stage: 'exact' };
    const fb = SE.fallback(q);
    return { ids: fb.results.map(b => b.id), note: fb.note, stage: fb.stage };
  }

  const responses = [];
  async function search(q, init) {
    const r = await api.search(q, init);
    if (r.status === 200) responses.push(r.body);
    return r;
  }

  // 1. parity
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'search-cases.json'), 'utf8'));
  const queries = [...new Set(cases.flatMap(c => [c.query, c.sameTopAndScoreAs].filter(Boolean)))];
  let same = 0;
  const diffs = [];
  for (const q of queries) {
    const want = browser(q);
    const got = (await search(q)).body;
    const gotIds = (got.results || []).map(b => b.id);
    if (JSON.stringify(gotIds) === JSON.stringify(want.ids) && got.note === want.note && got.stage === want.stage) same++;
    else diffs.push(`${JSON.stringify(q)}: api [${gotIds}] ${got.stage} vs browser [${want.ids}] ${want.stage}`);
  }
  ok(same === queries.length, `parity: ${same}/${queries.length} search-cases queries give the same ids, order, note and stage as the browser engine`);
  diffs.slice(0, 10).forEach(d => console.log('        ' + d));
  const anyFallback = responses.some(r => typeof r.stage === 'number' && r.count > 0);
  const anyExact = responses.some(r => r.stage === 'exact' && r.count > 0);
  ok(anyFallback && anyExact, 'parity covers both exact results and fallback results');

  // 2. validation and routing
  const status = async (p, init) => (await api.get(p, init)).status;
  ok(await status('/search') === 400, 'missing q -> 400');
  ok(await status('/search?q=') === 400, 'empty q -> 400');
  ok(await status('/search?q=%20%20%20') === 400, 'blank q (spaces only) -> 400');
  ok(await status('/search?q=' + 'a'.repeat(201)) === 400, '201-character q -> 400');
  ok(await status('/search?q=' + 'a'.repeat(200)) === 200, '200-character q -> 200');
  ok(await status('/search?q=%20' + '6'.repeat(200) + '%20') === 200, 'q is trimmed before the length check');
  const bad = await api.get('/search?q=');
  const badBody = await bad.json();
  ok(typeof badBody.error === 'string' && Object.keys(badBody).length === 1, 'a 400 body is a short JSON error  ' + JSON.stringify(badBody));
  ok(await status('/nope') === 404, 'unknown path -> 404');
  ok(await status('/') === 404, 'root path -> 404');
  ok(await status('/search/') === 404, '/search/ (trailing slash) -> 404');
  ok(await status('/search?q=6205', { method: 'POST' }) === 405, 'POST /search -> 405');
  ok(await status('/health', { method: 'DELETE' }) === 405, 'DELETE /health -> 405');
  const health = await api.get('/health');
  ok(health.status === 200 && JSON.stringify(await health.json()) === '{"ok":true}', 'GET /health -> { ok: true }');
  const r6205 = await search('6205');
  ok(r6205.status === 200 && r6205.headers.get('content-type').startsWith('application/json'), 'search answers JSON');
  ok(['results', 'note', 'stage', 'count'].every(k => k in r6205.body) && Object.keys(r6205.body).length === 4,
     'search body is exactly { results, note, stage, count }');

  const empty = await H.start({ seed: false, catalog: api.catalog, prebuilt: true });
  const e = await empty.get('/search?q=6205');
  ok(e.status === 503, 'KV without a catalogue -> 503, not an empty result');
  ok((await empty.get('/health')).status === 200, '/health does not need the catalogue');
  await empty.stop();

  // 3. CORS
  const acao = async origin => (await api.get('/search?q=6205', { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
  ok(await acao('https://www.mycela.in') === 'https://www.mycela.in', 'CORS allows https://www.mycela.in');
  ok(await acao('https://mycela.in') === 'https://mycela.in', 'CORS allows https://mycela.in');
  ok(await acao('http://localhost:8080') === 'http://localhost:8080', 'CORS allows http://localhost:8080');
  ok(await acao('http://localhost') === 'http://localhost', 'CORS allows http://localhost');
  for (const o of ['https://evil.example', 'http://mycela.in', 'http://www.mycela.in', 'https://mycela.in.evil.example',
                   'https://api.mycela.in', 'https://www.mycela.in.evil.example', 'https://www.mycela.in:8443',
                   'http://localhost.evil.example', 'https://localhost:8080', 'null']) {
    ok(await acao(o) === null, `CORS refuses ${o}`);
  }
  ok((await api.get('/search?q=6205')).headers.get('vary') === 'Origin', 'responses carry Vary: Origin');

  // 3b. rate limit, as the local runtime simulates the binding
  const ip = { 'CF-Connecting-IP': '203.0.113.7' };
  const codes = [];
  for (let i = 0; i < 70; i++) codes.push((await api.get('/search?q=6205', { headers: ip })).status);
  const first429 = codes.indexOf(429);
  ok(codes.slice(0, 60).every(c => c === 200), '60 searches in a minute from one IP all succeed');
  ok(first429 >= 60 && codes.slice(first429).every(c => c === 429), `70 quick searches from one IP: from #${first429 + 1} on, 429`);
  const limited = await api.get('/search?q=6205', { headers: ip });
  const limitedBody = await limited.json();
  ok(limited.status === 429 && typeof limitedBody.error === 'string' && Object.keys(limitedBody).length === 1,
     'a 429 body is a short JSON error  ' + JSON.stringify(limitedBody));
  ok((await api.get('/health', { headers: ip })).status === 200, '/health is not rate limited');
  ok((await api.get('/search?q=6205', { headers: { 'CF-Connecting-IP': '203.0.113.8' } })).status === 200,
     'another IP is not affected');

  // 4. allowlist and cap, over every 200 response above plus a wide sweep
  for (const q of ['skf', 'bearing', 'deep groove', 'sealed', '6', 'fag 62', 'bore 50', 'zz', 'ntn 7', 'spherical roller',
                   'needle', 'thrust', '100', 'bore 25 od 52', 'pump bearing 40 mm shaft']) await search(q);
  const keys = new Set();
  responses.forEach(r => r.results.forEach(b => Object.keys(b).forEach(k => keys.add(k))));
  const outside = [...keys].filter(k => !ALLOWED.has(k));
  ok(outside.length === 0, `allowlist: ${responses.length} responses carry only allowed fields  (outside: [${outside}])`);
  ok(EXCLUDED.every(k => !keys.has(k)), `allowlist: no excluded field (${EXCLUDED.join(', ')}) in any response`);
  ok(EXCLUDED.every(k => api.catalog.rows.every(r => !(k in r))), 'allowlist: no excluded field in the published catalogue');
  ok(api.catalog.rows.every(r => Object.keys(r).every(k => FIELDS.record.includes(k))), 'allowlist: the catalogue carries record fields only');
  const most = Math.max(...responses.map(r => r.results.length));
  ok(responses.every(r => r.results.length <= 40 && r.count === r.results.length), `cap: no response over 40 results (largest ${most})`);

  await api.stop();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
