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
// 32xx / 33xx and 7x are rejected by designation (sections 2b, 2c), not by speed
const isFam3 = b => /^3[23]\d{2}(?!\d)/.test(String(b.pn).toUpperCase().replace(/\s+/g, ''));
const isFam7 = b => /^7\d/.test(String(b.pn).toUpperCase().replace(/\s+/g, ''));
const rejected = complete.filter(b => !C.supports(b) && !isFam3(b) && !isFam7(b));

// ── 1. the gate rejects on speed, only on speed ───────────────────────────
ok(rejected.every(b => nDm(b) < C.MIN_N_DM), 'every complete DGBB row the gate rejects is below MIN_N_DM');
ok(complete.filter(b => C.supports(b)).every(b => nDm(b) >= C.MIN_N_DM), 'every row it accepts is at or above MIN_N_DM');
ok(dg.filter(b => !complete.includes(b)).every(b => !C.supports(b)), 'a row missing cr/c0r/bore/od/rpm is never supported');

// ── 2. the known-bad row (NTN-6201, rpm 620 = Cr in kgf) gets no calculator ─
ok(C.supports(M.DB_MAP['NTN-6201']) === false, 'NTN-6201 (rpm 620, real value near 24 000) is rejected');
ok(C.supports(M.DB_MAP['NTN-6303']) === true, 'NTN-6303 (rpm 19 000) is still supported');
ok(!C.supports({ type: 'Tapered Roller', cr: 20, c0r: 20, bore: 30, od: 62, rpm: 9000 }), 'a tapered roller is not supported');

// ── 2b. mistyped families: typed Deep Groove Ball, catalogue says angular contact ──
// SKF 32xx / 33xx are double row angular contact (SKF US catalogue printed pp.81-83).
// Gated by designation because the type field is what is wrong (Q9b).
const fam3 = dg.filter(isFam3);
ok(fam3.length === 26, `26 rows typed DGBB carry a 32xx/33xx designation (got ${fam3.length})`);
ok(fam3.every(b => b.brand === 'SKF') && fam3.every(b => !C.supports(b)), 'all 26 are SKF and none is supported');
ok(C.supports(M.DB_MAP['SKF-3309_DNRCBM']) === false && C.supports(M.DB_MAP['SKF-3315_A']) === false,
   'SKF-3309_DNRCBM and SKF-3315_A get no calculator');
ok(dg.filter(b => C.supports(b)).every(b => !isFam3(b)), 'no calculable row has a 32xx/33xx designation');

// ── 2c. single row angular contact, 7x series (Q9c) ───────────────────────
// Unlike 2b this one is wrong, not merely out of scope: radial-only P = Fr
// overstates the life when the bearing develops an induced axial load.
const norm = b => String(b.pn).toUpperCase().replace(/\s+/g, '');
const fam7 = dg.filter(isFam7);
ok(fam7.length === 38, `38 rows typed DGBB carry a 7x designation (got ${fam7.length})`);
ok(fam7.every(b => b.brand === 'SKF') && fam7.every(b => !C.supports(b)), 'all 38 are SKF and none is supported');
ok(dg.filter(b => C.supports(b)).every(b => !/^7\d/.test(norm(b))), 'no calculable row has a 7x designation');
ok(C.supports(M.DB_MAP['SKF-618___560_MA']) === true, 'slash-coded deep groove (SKF 618/560 MA) is still supported');
const fagDouble = dg.filter(b => /^4[23]\d{2}/.test(norm(b)) && C.supports(b));
ok(fagDouble.length === 24 && fagDouble.every(b => b.brand === 'FAG'), 'FAG 42xx/43xx double row deep groove stay calculable (24)');

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

// ── 6. wording guard: never say a manufacturer does not publish f0 / kr ────
// That was written once, and was false (SKF's product pages list both; it is
// only the catalogue PDF tables we extracted from that do not). Say "not in
// our data" or "not in the catalogue PDF" instead.
const fs = require('fs');
const scan = ['CLAUDE.md', 'js/dgbb_calc.js', 'js/renderer.js', 'data/dgbb_tables.js']
  .concat(fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => 'docs/' + f));
const claim = /(SKF|FAG|NTN|manufacturer|the maker)s?\s+(does not|doesn't|do not|never)\s+(print|publish|list)|\b(f0|kr)\b[^.\n]{0,60}\b(never published|not published|unpublished)/i;
const offenders = scan.filter(f => claim.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
ok(offenders.length === 0, 'no source file or doc claims a manufacturer does not publish f0 / kr' +
   (offenders.length ? ' (' + offenders.join(', ') + ')' : ''));

console.log(`\n${complete.filter(b => C.supports(b)).length} of ${dg.length} DGBB rows calculable; ${rejected.length} rejected on speed, ${fam3.length} as mistyped 32xx/33xx, ${fam7.length} as mistyped 7x`);
console.log(failures ? failures + ' FAILED' : 'all passed');
process.exit(failures ? 1 : 0);
