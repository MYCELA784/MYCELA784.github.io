#!/usr/bin/env node
'use strict';
/*
 * Search API rate limiting, with a mocked SEARCH_LIMITER binding.
 *
 *   node tests/api-ratelimit.js
 *
 * Calls the Worker's own fetch handler (api/src/index.js) in Node with a
 * fake env: an in-memory CATALOG and a counting limiter that behaves like
 * Cloudflare's Rate Limiting binding ({ key } → { success }), 60 per key.
 * No wrangler, no network. tests/api.js checks the same limit in the local
 * workerd runtime's own simulation of the binding.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { build } = require('../scripts/build-published.js');

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}

const LIMIT = 60;
function mockLimiter() {
  const counts = new Map();
  const calls = [];
  return {
    calls, counts,
    async limit({ key }) {
      calls.push(key);
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      return { success: n <= LIMIT };
    },
  };
}

(async () => {
  const catalog = JSON.parse(JSON.stringify(build()));
  const worker = (await import(pathToFileURL(path.join(__dirname, '..', 'api', 'src', 'index.js')).href)).default;
  const kv = { async get(key, type) { return key === 'published/v1' && type === 'json' ? catalog : null; } };

  const call = (env, p, init) => worker.fetch(new Request('https://api.mycela.in' + p, init), env);
  const from = (ip, extra) => ({ headers: Object.assign(ip ? { 'CF-Connecting-IP': ip } : {}, extra) });

  // 1. the limit, per IP
  let lim = mockLimiter();
  let env = { CATALOG: kv, SEARCH_LIMITER: lim };
  const codes = [];
  for (let i = 0; i < 70; i++) codes.push((await call(env, '/search?q=6205', from('198.51.100.1'))).status);
  ok(codes.slice(0, LIMIT).every(c => c === 200), `the first ${LIMIT} searches from one IP succeed`);
  ok(codes.slice(LIMIT).every(c => c === 429), `searches ${LIMIT + 1} to 70 from that IP get 429`);
  ok(lim.calls.every(k => k === '198.51.100.1'), 'the limiter is keyed on CF-Connecting-IP');

  const r = await call(env, '/search?q=6205', from('198.51.100.1', { Origin: 'https://www.mycela.in' }));
  const body = await r.json();
  ok(r.status === 429 && typeof body.error === 'string' && Object.keys(body).length === 1,
     'a 429 is a short JSON error  ' + JSON.stringify(body));
  ok(r.headers.get('content-type').startsWith('application/json'), 'a 429 is sent as JSON');
  ok(r.headers.get('retry-after') === '60', 'a 429 says Retry-After: 60');
  ok(r.headers.get('access-control-allow-origin') === 'https://www.mycela.in',
     'a 429 still carries the CORS header, so the website can read it');
  ok((await call(env, '/search?q=6205', from('198.51.100.2'))).status === 200, 'another IP is not affected');

  // 2. what is not limited, and what does not use up the limit
  const before = lim.calls.length;
  ok((await call(env, '/health', from('198.51.100.1'))).status === 200, '/health answers even when that IP is over the limit');
  ok((await call(env, '/nope', from('198.51.100.3'))).status === 404, 'an unknown path is still 404');
  ok((await call(env, '/search?q=6205', Object.assign({ method: 'POST' }, from('198.51.100.3')))).status === 405, 'POST is still 405');
  ok(lim.calls.length === before, '/health, 404 and 405 do not touch the limiter');

  // 3. the limit is checked before the query, so bad requests count too
  lim = mockLimiter();
  env = { CATALOG: kv, SEARCH_LIMITER: lim };
  for (let i = 0; i < LIMIT; i++) await call(env, '/search?q=', from('198.51.100.4'));
  ok((await call(env, '/search?q=6205', from('198.51.100.4'))).status === 429, 'invalid searches count toward the limit');

  // 4. no IP header: one shared key, still limited
  await call(env, '/search?q=6205', from(null));
  ok(lim.calls[lim.calls.length - 1] === 'unknown', 'a request without CF-Connecting-IP is keyed as "unknown"');

  // 5. fails open: a missing or failing limiter never takes search down
  ok((await call({ CATALOG: kv }, '/search?q=6205', from('198.51.100.5'))).status === 200, 'no limiter binding: search still answers');
  const broken = { async limit() { throw new Error('limiter unavailable'); } };
  ok((await call({ CATALOG: kv, SEARCH_LIMITER: broken }, '/search?q=6205', from('198.51.100.5'))).status === 200,
     'a limiter that errors: search still answers');

  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
