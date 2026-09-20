#!/usr/bin/env node
'use strict';
/*
 * DGBB calculator gate tests: which Deep Groove Ball rows get the modal
 * calculator, and that the plausibility floor on the stored limiting speed
 * (js/dgbb_calc.js MIN_N_DM) still sits where its derivation says it does.
 *
 *   node tests/dgbb.js
 *
 * Loads the same files, in the same order, as index.html. Exits non-zero
 * on any failure.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global.window || {};
global.window.MYCELA = global.window.MYCELA || {};
global.MYCELA = global.window.MYCELA;
['bearings_db.js', 'js/config.js', 'js/constants.js', 'js/db.js', 'data/dgbb_tables.js', 'js/dgbb_calc.js']
  .forEach(f => require(path.join(ROOT, f)));

const M = global.window.MYCELA;
const C = M.DGBBCalc;
let failures = 0;
function ok(cond, msg) { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; }

const nDm = b => b.rpm * 0.5 * (b.bore + b.od);
const REQ = ['cr', 'c0r', 'bore', 'od', 'rpm'];
const dg = M.DB.filter(b => b.type === 'Deep Groove Ball');
const complete = dg.filter(b => REQ.every(k => b[k] > 0));
const rejected = complete.filter(b => !C.supports(b));

// ── 1. the gate rejects on speed, only on speed ───────────────────────────
ok(rejected.every(b => nDm(b) < C.MIN_N_DM), 'every complete DGBB row the gate rejects is below MIN_N_DM');
ok(complete.filter(b => C.supports(b)).every(b => nDm(b) >= C.MIN_N_DM), 'every row it accepts is at or above MIN_N_DM');
ok(dg.filter(b => !complete.includes(b)).every(b => !C.supports(b)), 'a row missing cr/c0r/bore/od/rpm is never supported');

// ── 2. the known-bad row (NTN-6201, rpm 620 = Cr in kgf) gets no calculator ─
ok(C.supports(M.DB_MAP['NTN-6201']) === false, 'NTN-6201 (rpm 620, real value near 24 000) is rejected');
ok(C.supports(M.DB_MAP['NTN-6303']) === true, 'NTN-6303 (rpm 19 000) is still supported');
ok(!C.supports({ type: 'Tapered Roller', cr: 20, c0r: 20, bore: 30, od: 62, rpm: 9000 }), 'a tapered roller is not supported');

// ── 3. the floor sits in a real gap, so it is not a tuned edge ────────────
const below = Math.max(...complete.map(nDm).filter(v => v < C.MIN_N_DM));
const above = Math.min(...complete.map(nDm).filter(v => v >= C.MIN_N_DM));
ok(below < 0.95 * C.MIN_N_DM && above > 1.1 * C.MIN_N_DM,
   `no row within 5% below / 10% above the floor (nearest ${Math.round(below)} and ${Math.round(above)})`);

// ── 4. the documented derivation still reproduces ─────────────────────────
const L = complete.map(b => Math.log10(nDm(b))).sort((a, b) => a - b);
const q = p => { const i = p * (L.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return L[lo] + (L[hi] - L[lo]) * (i - lo); };
const fence = Math.pow(10, q(0.25) - 2 * (q(0.75) - q(0.25)));
ok(fence > below && fence < above, `Tukey k=2 fence (${Math.round(fence)}) falls in the same gap as MIN_N_DM`);
ok(C.MIN_N_DM > below && C.MIN_N_DM < above, 'MIN_N_DM falls in that gap');

// ── 5. the refusals survive: no axial load without f0 ─────────────────────
let refused = false;
try { C.evaluate({ bearing: M.DB_MAP['NTN-6303'], Fr: 1, n: 1000, Fa: 0.5 }); }
catch (e) { refused = /f0 is required/.test(e.message); }
ok(refused, 'Fa > 0 without f0 still throws the f0 explanation');
const r = C.evaluate({ bearing: M.DB_MAP['NTN-6303'], Fr: 2, n: 1000 });
ok(r.life.label === 'basic rating life (L10h)', 'life is labelled basic rating life (a_SKF not exposed)');

console.log(`\n${complete.filter(b => C.supports(b)).length} of ${dg.length} DGBB rows calculable; ${rejected.length} rejected on speed`);
console.log(failures ? failures + ' FAILED' : 'all passed');
process.exit(failures ? 1 : 0);
