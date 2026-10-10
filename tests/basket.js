#!/usr/bin/env node
'use strict';
/*
 * Inquiry-basket tests: a persisted basket must never carry a phantom
 * (an id the catalogue no longer has) into the rendered list, the header
 * badge, or the inquiry payload sent to a dealer.
 *
 * The catalogue is not in the browser: the basket's parts come from the
 * search API (GET /parts). A phantom is dropped only when the API answers
 * that it has no such part; if the API cannot be reached the stored basket
 * is left alone.
 *
 *   node tests/basket.js
 *
 * Loads the real js/config.js, js/escape.js, js/api.js and js/features.js
 * against a minimal window/document/localStorage shim and a stand-in fetch
 * that answers /parts. Exits non-zero on any failure.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['js/config.js', 'js/escape.js', 'js/api.js', 'js/features.js'].map(f => path.join(ROOT, f));

let failures = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failures++;
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}  (got ${JSON.stringify(a)})`); }

// ── shims ────────────────────────────────────────────────────────────────
function makeLocalStorage(seed) {
  const store = Object.assign({}, seed);
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _dump: () => store,
  };
}
const noopDoc = {
  readyState: 'complete',
  getElementById: () => null,
  addEventListener: () => {},
};

// What the API's catalogue holds.
const CATALOGUE = {
  'SKF-6205': { id: 'SKF-6205', brand: 'SKF', pn: '6205',   type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
  'NTN-6205': { id: 'NTN-6205', brand: 'NTN', pn: '6205',   type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
  'FAG-6205-C': { id: 'FAG-6205-C', brand: 'FAG', pn: '6205-C', type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
};

// Fresh modules + globals per scenario (features.js reads localStorage at
// eval time). `api` is 'up' or 'down'.
function loadFeatures({ storage, api }) {
  FILES.forEach(f => delete require.cache[require.resolve(f)]);
  global.window = { MYCELA: {} };
  global.MYCELA = global.window.MYCELA;
  global.document = noopDoc;
  global.location = { hostname: 'www.mycela.in', search: '', href: 'https://www.mycela.in/' };
  global.localStorage = storage;
  const calls = [];
  global.fetch = url => {
    calls.push(url);
    if (api === 'down') return Promise.reject(new TypeError('Failed to fetch'));
    const u = new URL(url);
    const ids = u.searchParams.get('ids').split(',');
    const parts = ids.filter(id => CATALOGUE[id]).map(id => CATALOGUE[id]);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ parts, count: parts.length }) });
  };
  FILES.forEach(f => require(f));
  global.MYCELA._calls = calls;
  return global.MYCELA;
}

(async () => {
  // ── 1. phantom ids are pruned once the API has answered ────────────────
  {
    const seed = { mycela_inquiry: JSON.stringify({
      'SKF-6205':  { qty: 10 },
      'NTN-62/22': { qty: 4 },      // phantom: the catalogue has no such id (e.g. renamed away)
      'NTN-6205':  { qty: 7 },
      'GONE-999':  { qty: 1 },      // phantom
    }) };
    const storage = makeLocalStorage(seed);
    const M = loadFeatures({ storage, api: 'up' });

    eq(Object.keys(JSON.parse(storage._dump().mycela_inquiry)).length, 4, 'loading the page alone prunes nothing');
    eq([M.Basket.state(), M.Basket.count(), M.Basket.unresolved()], ['loading', 0, 4],
       'before the API answers: state "loading", nothing shown as resolved yet');

    const state = await M.Basket.sync();
    eq(state, 'ready', 'sync() ends in state "ready"');
    eq(M._calls.length, 1, 'sync() asks the API once (GET /parts)');
    ok(/^https:\/\/api\.mycela\.in\/parts\?ids=/.test(M._calls[0]), 'the request goes to /parts on the API base URL');

    const persisted = JSON.parse(storage._dump().mycela_inquiry);
    eq(Object.keys(persisted).sort(), ['NTN-6205', 'SKF-6205'],
       'sync() prunes phantom ids from localStorage and persists the pruned set');

    eq(M.Basket.count(), 2, 'count() reflects resolvable entries only');

    const items = M.Basket.resolvedItems();
    eq(items.map(i => i.id), ['SKF-6205', 'NTN-6205'], 'resolvedItems() keeps order, drops phantoms');
    ok(items.every(i => i.bearing && i.bearing.pn), 'every resolvedItems() entry carries its bearing');
    eq(items.map(i => i.qty), [10, 7], 'resolvedItems() carries the stored qty');
    eq(M.Basket.unresolved(), 0, 'nothing is left unresolved');
  }

  // ── 2. the inquiry payload never leaks a raw id / blank brand ──────────
  {
    const seed = { mycela_inquiry: JSON.stringify({
      'FAG-6205-C': { qty: 25 },
      'NTN-62/22':  { qty: 5 },     // phantom
    }) };
    const M = loadFeatures({ storage: makeLocalStorage(seed), api: 'up' });
    await M.Basket.sync();

    // same mapping app.js basketItemsPayload() applies
    const payload = M.Basket.resolvedItems().map(it => ({
      brand: it.bearing.brand, designation: it.bearing.pn, qty: it.qty,
    }));
    eq(payload, [{ brand: 'FAG', designation: '6205-C', qty: 25 }],
       'payload contains only the resolvable line');
    ok(payload.every(p => p.brand && p.designation && !/^[A-Z]{2,4}-/.test(p.designation)),
       'no payload line has a blank brand or an id-shaped designation');
  }

  // ── 3. badge count agrees with rendered rows ───────────────────────────
  {
    const seed = { mycela_inquiry: JSON.stringify({
      'SKF-6205': { qty: 1 }, 'NTN-6205': { qty: 1 }, 'PHANTOM-1': { qty: 1 }, 'PHANTOM-2': { qty: 1 },
    }) };
    const M = loadFeatures({ storage: makeLocalStorage(seed), api: 'up' });
    eq(M.Basket.count(), M.Basket.resolvedItems().length, 'before sync: badge count() === number of rows the renderers produce');
    await M.Basket.sync();
    eq([M.Basket.count(), M.Basket.resolvedItems().length], [2, 2],
       'after sync: badge count() === number of rows the renderers produce');
  }

  // ── 4. guard: API unreachable → basket left intact ─────────────────────
  {
    const seed = { mycela_inquiry: JSON.stringify({ 'SKF-6205': { qty: 3 }, 'NTN-62/22': { qty: 9 } }) };
    const storage = makeLocalStorage(seed);
    const M = loadFeatures({ storage, api: 'down' });
    const state = await M.Basket.sync();
    eq(state, 'error', 'with the API unreachable, sync() ends in state "error"');
    eq(Object.keys(JSON.parse(storage._dump().mycela_inquiry)).sort(), ['NTN-62/22', 'SKF-6205'],
       'with the API unreachable, sync() does NOT prune (never wipe a basket on a load glitch)');
    eq([M.Basket.count(), M.Basket.unresolved()], [0, 2], 'the sheet can say 2 parts could not be loaded, instead of "empty"');
  }

  // ── 5. an id the API would refuse is never sent, and is a phantom ──────
  {
    const seed = { mycela_inquiry: JSON.stringify({ 'SKF-6205': { qty: 3 }, '<img src=x onerror=alert(1)>': { qty: 1 } }) };
    const storage = makeLocalStorage(seed);
    const M = loadFeatures({ storage, api: 'up' });
    await M.Basket.sync();
    ok(M._calls.length === 1 && !/img|%3C/i.test(M._calls[0]), 'a stored id that is not id-shaped is not sent to the API');
    eq(Object.keys(JSON.parse(storage._dump().mycela_inquiry)), ['SKF-6205'], '...and is pruned');
  }

  // ── 6. adding and removing ─────────────────────────────────────────────
  {
    const storage = makeLocalStorage({});
    const M = loadFeatures({ storage, api: 'up' });
    M.Api.remember([CATALOGUE['SKF-6205']]);          // as a search result would
    global.window.toggleInquiry = global.window.toggleInquiry || global.toggleInquiry;
    M.Basket.add('SKF-6205');
    eq([M.Basket.has('SKF-6205'), M.Basket.count(), JSON.parse(storage._dump().mycela_inquiry)], [true, 1, { 'SKF-6205': { qty: 10 } }],
       'add() stores the part with the default quantity');
    M.Basket.setQty('SKF-6205', 3.4);
    eq(M.Basket.resolvedItems()[0].qty, 3, 'setQty() stores a whole number');
    ok(!M.Basket.has('toString') && !M.Basket.has('constructor'), 'has() is not fooled by object method names');
    M.Basket.remove('SKF-6205');
    eq([M.Basket.has('SKF-6205'), M.Basket.count()], [false, 0], 'remove() takes it out');
    ok(/data-inq="A&amp;B&quot;"/.test(M.Basket.modalBtnHTML({ id: 'A&B"' })) && !/onclick/.test(M.Basket.modalBtnHTML({ id: 'x' })),
       'the modal button carries the id escaped in data-inq, with no inline handler');
  }

  // ── 7. empty / corrupt localStorage is safe ────────────────────────────
  {
    const M1 = loadFeatures({ storage: makeLocalStorage({}), api: 'up' });
    eq([M1.Basket.count(), M1.Basket.state(), await M1.Basket.sync(), M1._calls.length], [0, 'ready', 'ready', 0],
       'no stored basket → count 0, and no request to the API');
    const M2 = loadFeatures({ storage: makeLocalStorage({ mycela_inquiry: '{bad json' }), api: 'up' });
    eq(M2.Basket.resolvedItems(), [], 'corrupt stored basket → empty, no throw');
    const M3 = loadFeatures({ storage: makeLocalStorage({ mycela_inquiry: '[1,2]' }), api: 'up' });
    eq(M3.Basket.resolvedItems(), [], 'a stored basket of the wrong shape → empty, no throw');
  }

  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
