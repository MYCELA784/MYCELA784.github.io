#!/usr/bin/env node
'use strict';
/*
 * Search API speed and size check.
 *
 *   node tests/api-speed.js        (run `npm install` in api/ once first)
 *
 * 1,000 realistic queries (part numbers, sizes, plain language, gibberish),
 * generated from the catalogue with a fixed seed so every run is the same:
 *
 * - Compute: runSearch() from api/src/search.js, the exact code the Worker
 *   runs per request, timed in Node. (Inside workerd the clock does not
 *   advance during pure computation, so it cannot time itself.)
 *   Target: p95 under 10 ms. The run fails above it.
 * - End to end: the same queries over HTTP to the bundled Worker in the
 *   local workerd runtime (wrangler's test harness). Includes local HTTP
 *   overhead; reported, not asserted.
 * - Size and memory: the published catalogue's JSON size, and, in a clean
 *   child process that loads only the Worker's search code and the
 *   catalogue, the heap each takes and the heap after all 1,000 searches
 *   (Workers allow 128 MB per isolate).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const H = require('./api-harness.js');

const N = 1000;
const TARGET_P95_MS = 10;

// ── deterministic query mix ─────────────────────────────────────────────
let seed = 20261004;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];

function makeQueries(rows) {
  const brands = ['skf', 'fag', 'ntn', 'SKF', 'Schaeffler'];
  const seals = ['2rs', 'zz', '2z', 'sealed', 'shielded', 'open', 'rs', 'llu'];
  const types = ['deep groove', 'angular contact', 'taper roller', 'spherical roller', 'cylindrical roller',
                 'needle', 'thrust ball', 'self aligning', 'deepgrove', 'taperd roller'];
  const uses = ['electric motor', 'pump', 'gearbox', 'conveyor', 'fan', 'spindle', 'wheel hub', 'compressor',
                'high temperature', 'water resistant', 'food grade', 'high speed', 'heavy load', 'tractor'];
  const parts = [
    () => pick(rows).pn,
    () => pick(brands) + ' ' + pick(rows).pn,
    () => pick(rows).pn + ' ' + pick(brands),
    () => pick(rows).pn.toLowerCase().replace(/\s+/g, ''),
    () => pick(rows).pn.split(/[ -]/)[0] + '-' + pick(seals).toUpperCase(),
    () => pick(rows).pn.split(/[ -]/)[0] + ' ' + pick(seals) + ' c3',
    () => String(pick(rows).pn).slice(0, 3),
  ];
  const sizes = [
    () => { const b = pick(rows); return `bore ${b.bore} od ${b.od}`; },
    () => { const b = pick(rows); return `${b.bore}x${b.od}x${b.w}`; },
    () => { const b = pick(rows); return `${b.bore}mm bore ${pick(seals)}`; },
    () => { const b = pick(rows); return `id ${b.bore} od ${b.od} width ${b.w}`; },
    () => `bore ${Math.floor(rnd() * 300) + 3} od ${Math.floor(rnd() * 500) + 10}`,
    () => { const b = pick(rows); return `od ${b.od - 2} to ${b.od + 3} bore ${b.bore}`; },
    () => `${pick(types)} bore ${pick(rows).bore}`,
  ];
  const plain = [
    () => `bearing for ${pick(uses)} ${pick(rows).bore}mm shaft`,
    () => `${pick(types)} bearing for ${pick(uses)}`,
    () => `${pick(brands)} ${pick(types)} ${pick(seals)}`,
    () => `need a ${pick(seals)} bearing ${pick(rows).bore} mm bore for ${pick(uses)}`,
    () => `${pick(uses)} bearing`,
    () => `which bearing fits a ${pick(rows).od} mm housing`,
    () => `cheap ${pick(brands)} bearing ${pick(rows).pn}`,
  ];
  const junk = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 -/.;\'[]';
    let s = '';
    const len = 3 + Math.floor(rnd() * 28);
    for (let i = 0; i < len; i++) s += chars[Math.floor(rnd() * chars.length)];
    return s.trim() || 'qq';
  };
  const out = [];
  for (let i = 0; i < N; i++) {
    const k = i % 4;
    const q = k === 0 ? pick(parts)() : k === 1 ? pick(sizes)() : k === 2 ? pick(plain)() : junk();
    out.push(String(q).trim().slice(0, 200) || 'x');
  }
  return out;
}

function stats(ms) {
  const s = ms.slice().sort((a, b) => a - b);
  const at = p => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { p50: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}
const fmt = x => x.toFixed(2) + ' ms';

(async () => {
  let failures = 0;

  const catalog = H.build();
  const text = JSON.stringify(catalog);

  // ── compute: the Worker's own search code, in Node ────────────────────
  const S = await import(pathToFileURL(path.join(H.API, 'src', 'search.js')).href);
  const parsed = JSON.parse(text);
  S.setCatalog(parsed.rows);
  const queries = makeQueries(parsed.rows);
  for (let i = 0; i < 50; i++) S.runSearch(queries[i]);    // warm up
  const compute = [];
  const counts = { exact: 0, fallback: 0, none: 0 };
  let biggest = 0;
  for (const q of queries) {
    const t = performance.now();
    const r = S.runSearch(q);
    compute.push(performance.now() - t);
    if (r.stage === 'exact') counts.exact++; else if (r.count) counts.fallback++; else counts.none++;
    biggest = Math.max(biggest, r.count);
  }

  // ── memory: a clean process holding only what the Worker holds ────────
  const dir = path.join(H.API, '.build');
  fs.mkdirSync(dir, { recursive: true });
  const catFile = path.join(dir, 'speed-catalog.json');
  const qFile = path.join(dir, 'speed-queries.json');
  fs.writeFileSync(catFile, text);
  fs.writeFileSync(qFile, JSON.stringify(queries));
  const child = `
    import { readFileSync } from 'fs';
    const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
    const h0 = heap();
    const S = await import(${JSON.stringify(pathToFileURL(path.join(H.API, 'src', 'search.js')).href)});
    const h1 = heap();
    S.setCatalog(JSON.parse(readFileSync(${JSON.stringify(catFile)}, 'utf8')).rows);
    const h2 = heap();
    for (const q of JSON.parse(readFileSync(${JSON.stringify(qFile)}, 'utf8'))) S.runSearch(q);
    const h3 = heap();
    console.log(JSON.stringify({ engine: h1 - h0, catalog: h2 - h1, after: h3 - h0 }));`;
  const m = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', child], { encoding: 'utf8' });
  fs.unlinkSync(catFile); fs.unlinkSync(qFile);
  if (m.status !== 0) throw new Error('memory child failed:\n' + m.stderr);
  const mem = JSON.parse(m.stdout.trim().split('\n').pop());
  const mb = x => (x / 1048576).toFixed(1) + ' MB';

  // ── end to end: HTTP to the bundled Worker in local workerd ───────────
  const api = await H.start({ catalog });
  await api.search('6205');                                 // first request loads KV
  const e2e = [];
  for (const q of queries) {
    const t = performance.now();
    const r = await api.search(q);
    e2e.push(performance.now() - t);
    if (r.status !== 200) { failures++; console.log(`FAIL  ${JSON.stringify(q)} -> ${r.status}`); }
    if (r.body.results && r.body.results.length > 40) { failures++; console.log(`FAIL  ${JSON.stringify(q)} over 40 results`); }
  }
  await api.stop();

  const c = stats(compute), e = stats(e2e);
  console.log(`Queries: ${N} (${N / 4} part numbers, ${N / 4} sizes, ${N / 4} plain language, ${N / 4} gibberish)`);
  console.log(`  answered by exact search ${counts.exact}, by the fallback ${counts.fallback}, no results ${counts.none}; largest response ${biggest} results`);
  console.log(`Search compute (runSearch, Node ${process.version}): p50 ${fmt(c.p50)}  p95 ${fmt(c.p95)}  max ${fmt(c.max)}`);
  console.log(`End to end over local HTTP (workerd):  p50 ${fmt(e.p50)}  p95 ${fmt(e.p95)}  max ${fmt(e.max)}`);
  console.log(`Published catalogue: ${catalog.count} rows, ${catalog.fields.length} fields, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB JSON`);
  console.log(`Memory (clean process, heap after GC): search code ${mb(mem.engine)}, catalogue ${mb(mem.catalog)}, ` +
              `everything after the 1,000 searches ${mb(mem.after)} (Workers limit 128 MB per isolate)`);

  const okSpeed = c.p95 < TARGET_P95_MS;
  console.log((okSpeed ? 'PASS  ' : 'FAIL  ') + `search compute p95 under ${TARGET_P95_MS} ms`);
  if (!okSpeed) failures++;
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
