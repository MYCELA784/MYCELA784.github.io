#!/usr/bin/env node
'use strict';
/*
 * Inquiry-basket tests: a persisted basket must never carry a phantom
 * (an id that no longer resolves in DB_MAP) into the rendered list, the
 * nav badge, or the inquiry payload sent to a dealer.
 *
 *   node tests/basket.js
 *
 * Loads js/features.js against a minimal window/document/localStorage
 * shim. Exits non-zero on any failure.
 */
const path = require('path');
const FEATURES = path.join(__dirname, '..', 'js', 'features.js');

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

const DB_MAP = {
  'SKF-6205': { id: 'SKF-6205', brand: 'SKF', pn: '6205',   type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
  'NTN-6205': { id: 'NTN-6205', brand: 'NTN', pn: '6205',   type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
  'FAG-6205-C': { id: 'FAG-6205-C', brand: 'FAG', pn: '6205-C', type: 'Deep Groove Ball', bore: 25, od: 52, w: 15 },
};

// Fresh module + globals per scenario (features.js reads localStorage and
// DB_MAP at eval time).
function loadFeatures({ storage, dbMap }) {
  delete require.cache[require.resolve(FEATURES)];
  global.window = { MYCELA: {} };
  global.MYCELA = global.window.MYCELA;
  global.MYCELA.DB_MAP = dbMap;
  global.document = noopDoc;
  global.localStorage = storage;
  global.showPage = () => {};
  require(FEATURES);
  return global.MYCELA;
}

// ── 1. phantom ids are pruned from localStorage on load ──────────────────
{
  const seed = { mycela_inquiry: JSON.stringify({
    'SKF-6205':  { qty: 10 },
    'NTN-62/22': { qty: 4 },      // phantom: not in DB_MAP (e.g. renamed away)
    'NTN-6205':  { qty: 7 },
    'GONE-999':  { qty: 1 },      // phantom
  }) };
  const storage = makeLocalStorage(seed);
  const M = loadFeatures({ storage, dbMap: DB_MAP });

  const persisted = JSON.parse(storage._dump().mycela_inquiry);
  eq(Object.keys(persisted).sort(), ['NTN-6205', 'SKF-6205'],
     'load() prunes phantom ids from localStorage and persists the pruned set');

  eq(M.Basket.count(), 2, 'count() reflects resolvable entries only');

  const items = M.Basket.resolvedItems();
  eq(items.map(i => i.id), ['SKF-6205', 'NTN-6205'], 'resolvedItems() keeps order, drops phantoms');
  ok(items.every(i => i.bearing && i.bearing.pn), 'every resolvedItems() entry carries its bearing');
  eq(items.map(i => i.qty), [10, 7], 'resolvedItems() carries the stored qty');
}

// ── 2. the inquiry payload never leaks a raw id / blank brand ────────────
{
  const seed = { mycela_inquiry: JSON.stringify({
    'FAG-6205-C': { qty: 25 },
    'NTN-62/22':  { qty: 5 },     // phantom
  }) };
  const M = loadFeatures({ storage: makeLocalStorage(seed), dbMap: DB_MAP });

  // same mapping app.js basketItemsPayload() applies
  const payload = M.Basket.resolvedItems().map(it => ({
    brand: it.bearing.brand, designation: it.bearing.pn, qty: it.qty,
  }));
  eq(payload, [{ brand: 'FAG', designation: '6205-C', qty: 25 }],
     'payload contains only the resolvable line');
  ok(payload.every(p => p.brand && p.designation && !/^[A-Z]{2,4}-/.test(p.designation)),
     'no payload line has a blank brand or an id-shaped designation');
}

// ── 3. badge count agrees with rendered rows ─────────────────────────────
{
  const seed = { mycela_inquiry: JSON.stringify({
    'SKF-6205': { qty: 1 }, 'NTN-6205': { qty: 1 }, 'PHANTOM-1': { qty: 1 }, 'PHANTOM-2': { qty: 1 },
  }) };
  const M = loadFeatures({ storage: makeLocalStorage(seed), dbMap: DB_MAP });
  eq(M.Basket.count(), M.Basket.resolvedItems().length,
     'badge count() === number of rows the renderers produce');
}

// ── 4. guard: DB_MAP not populated → basket left intact ──────────────────
{
  const seed = { mycela_inquiry: JSON.stringify({ 'SKF-6205': { qty: 3 }, 'NTN-62/22': { qty: 9 } }) };
  const storage = makeLocalStorage(seed);
  loadFeatures({ storage, dbMap: {} });   // empty map (DB failed / wrong load order)
  eq(Object.keys(JSON.parse(storage._dump().mycela_inquiry)).sort(), ['NTN-62/22', 'SKF-6205'],
     'with an empty DB_MAP, load() does NOT prune (never wipe a basket on a load glitch)');
}

// ── 5. empty / corrupt localStorage is safe ─────────────────────────────
{
  const M1 = loadFeatures({ storage: makeLocalStorage({}), dbMap: DB_MAP });
  eq(M1.Basket.count(), 0, 'no stored basket → count 0');
  const M2 = loadFeatures({ storage: makeLocalStorage({ mycela_inquiry: '{bad json' }), dbMap: DB_MAP });
  eq(M2.Basket.resolvedItems(), [], 'corrupt stored basket → empty, no throw');
}

console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`);
process.exit(failures ? 1 : 0);
