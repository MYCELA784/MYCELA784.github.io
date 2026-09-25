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

// ── 7. no axial spec label in either renderer (Q10) ───────────────────────
// "Max Axial Load" was c0r * 0.5 computed at display time and shown as a
// per-bearing rating on every type. A label containing "axial" in any modal
// spec row, compare row or card chip is a regression: fail on it.
// Only those three places are scanned: the modal's `const specs = [...]` grid,
// the compare table's `const rows = [...]`, and the card `specChip(...)` calls.
// The load calculator's own "Working" rows (e.g. "Axial load Fa") describe
// the user's duty point, not a bearing property, and are deliberately not scanned.
function specLabels(src) {
  const out = [];
  let m;
  // every `const specs = [` / `const rows = [` (there are two `specs`: the card chips and the modal grid),
  // each taken up to its matching closing bracket
  ['const specs = [', 'const rows = ['].forEach(start => {
    for (let i = src.indexOf(start); i !== -1; i = src.indexOf(start, i + 1)) {
      let depth = 0, k = i + start.length - 1;
      for (; k < src.length; k++) { if (src[k] === '[') depth++; else if (src[k] === ']' && --depth === 0) break; }
      const block = src.slice(i, k + 1);
      const rowRe = /\[\s*'([^'\n]+)'\s*,/g;      // ['Bore (d)', ...]
      while ((m = rowRe.exec(block))) out.push(m[1]);
    }
  });
  const chipRe = /specChip\(\s*'([^'\n]+)'/g;   // grid-card chips
  while ((m = chipRe.exec(src))) out.push(m[1]);
  return out;
}
const hasAxial = labels => labels.filter(l => /axial/i.test(l));
ok(hasAxial(specLabels("    const specs = [\n      ['Max Axial Load',     axial],\n    ];")).length === 1, 'self-check: the label scan catches the old "Max Axial Load" row');
ok(hasAxial(specLabels("    const working = [\n      ['Axial load Fa', 1],\n    ];")).length === 0, "self-check: the calculator's Working rows are not treated as spec labels");
for (const f of ['js/renderer.js']) {
  const labels = specLabels(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  ok(labels.includes('Bore (d)') && labels.includes('Static Load C0r') && labels.length >= 10,
     `${f}: label scan is not vacuous (${labels.length} labels found)`);
  ok(hasAxial(labels).length === 0, `${f}: no spec label mentions "axial"` +
     (hasAxial(labels).length ? ' (' + hasAxial(labels).join(', ') + ')' : ''));
}

// ── 8. FAG combined loading: FAG's own table, FAG rows only, never mixed ──────
// Combined loading (Fa > 0) is offered only for FAG single row rows that carry
// FAG's f0, and is computed with FAG's Table 10 (data/fag_tables.js). SKF's
// Table 9 must never be used with a FAG f0: measured, that mix moves life by
// -9.6% to +5.1% against FAG's own table (docs/bearing-calculations.md 9a-4).
const FT = require(path.join(ROOT, 'data', 'fag_tables.js'));
const SKF_KEYS = require(path.join(ROOT, 'data', 'dgbb_tables.js')).TABLE_9.map(r => r.key);

// 8a. the table is what the catalogue prints (HR 1 p.231, Table 10)
ok(JSON.stringify(FT.FAG_TABLE_10) === JSON.stringify([
  { key: 0.3, e: 0.22, X: 0.56, Y: 2.0 }, { key: 0.5, e: 0.24, X: 0.56, Y: 1.8 },
  { key: 0.9, e: 0.28, X: 0.56, Y: 1.58 }, { key: 1.6, e: 0.32, X: 0.56, Y: 1.4 },
  { key: 3, e: 0.36, X: 0.56, Y: 1.2 }, { key: 6, e: 0.43, X: 0.56, Y: 1.0 }]),
  'FAG_TABLE_10 equals the six rows printed on HR 1 p.231');
ok(/normal operating clearance/.test(FT.FAG_TABLE_10_META.clearance) && Object.keys(FT.FAG_TABLE_10[0]).join() === 'key,e,X,Y',
   'FAG table is labelled normal operating clearance and has no C3 / C4 columns');
ok(FT.FAG_TABLE_10.every(r => SKF_KEYS.indexOf(r.key) === -1), "FAG's key grid shares no row with SKF's (they are different tables)");

// 8b. calcPFag against hand arithmetic. f0 13.8, C0r 7.8, Fr 2, Fa 1:
//     key = 13.8/7.8 = 1.76923, between rows 1.6 and 3: t = 0.12088,
//     e = 0.32 + 0.04t = 0.32484, Y = 1.4 - 0.2t = 1.37582, Fa/Fr = 0.5 > e,
//     P = 0.56*2 + 1.37582*1 = 2.49582
{
  const r = C.calcPFag({ Fr: 2, Fa: 1, C0: 7.8, f0: 13.8 });
  ok(Math.abs(r.P - 2.49582) < 1e-4 && Math.abs(r.e - 0.32484) < 1e-4 && Math.abs(r.Y - 1.37582) < 1e-4 && r.clamped === null,
     `calcPFag: hand-checked worked example (P = ${r.P.toFixed(5)})`);
  ok(C.calcPFag({ Fr: 5, Fa: 0.5, C0: 10, f0: 14 }).P === 5, 'calcPFag: Fa/Fr <= e gives P = Fr');
  ok(C.calcPFag({ Fr: 3, Fa: 0, C0: 10, f0: 14 }).P === 3, 'calcPFag: Fa = 0 gives P = Fr');
  const g = C.calcPFag({ Fr: 1, Fa: 1, C0: 15.7, f0: 14.13 });   // key = 0.9 exactly
  ok(Math.abs(g.key - 0.9) < 1e-9 && g.e === 0.28 && g.Y === 1.58, 'calcPFag: exactly on a grid row returns that row');
  ok(C.calcPFag({ Fr: 1, Fa: 0.3, C0: 20, f0: 14 }).clamped === 'below' && C.calcPFag({ Fr: 1, Fa: 5, C0: 5, f0: 14 }).clamped === 'above',
     "calcPFag: outside FAG's 0.3-6 range it uses the nearest row and reports clamped");
}
{
  let threw = 0;
  [{ Fr: 0, Fa: 1, C0: 7, f0: 14 }, { Fr: 1, Fa: -1, C0: 7, f0: 14 }, { Fr: 1, Fa: 1, C0: 0, f0: 14 }, { Fr: 1, Fa: 1, C0: 7, f0: null }]
    .forEach(a => { try { C.calcPFag(a); } catch (e) { threw++; } });
  ok(threw === 4, 'calcPFag: refuses Fr <= 0, Fa < 0, missing C0, missing f0');
}

// 8c. separation: the FAG path and the SKF path are different code reading different tables
{
  const src = fs.readFileSync(path.join(ROOT, 'js', 'dgbb_calc.js'), 'utf8');
  const fnBody = name => { const i = src.indexOf('function ' + name + '('); const j = src.indexOf('\n  function ', i + 10); return src.slice(i, j === -1 ? undefined : j); };
  ok(!/TABLE_9|TABLE_10_PAIRED|A1_TABLE/.test(fnBody('calcPFag')), "calcPFag never reads SKF's tables");
  ok(!/FAG_TABLE/.test(fnBody('calcP')), "calcP (SKF table) never reads FAG's table");
  ok(!/f0/.test(fnBody('evaluate').split('\n')[0]), 'evaluate() takes no f0 parameter (the factor comes from the record only)');
}

// pick real rows from the database, so this also proves the data landed
const fagRows = M.DB.filter(b => b.brand === 'FAG');
const fagCombined = fagRows.filter(b => C.supportsCombined(b));
const fagRow = fagCombined[0];
const skfRow = M.DB.find(b => b.brand === 'SKF' && C.supports(b));
const ntnRow = M.DB.find(b => b.brand === 'NTN' && C.supports(b));
const throwsCombined = rec => { try { C.evaluate({ bearing: rec, Fr: 1, n: 1000, Fa: 0.5 }); return false; } catch (e) { return /f0 is required/.test(e.message); } };

ok(!!fagRow, 'the database has at least one FAG row that supports combined loading');
ok(throwsCombined(skfRow) && throwsCombined(ntnRow), 'evaluate refuses Fa > 0 on SKF and NTN rows');
ok(throwsCombined(Object.assign({}, skfRow, { f0: 14 })) && throwsCombined(Object.assign({}, ntnRow, { f0: 14 })),
   'evaluate refuses Fa > 0 on SKF / NTN even if an f0 is put on the record (no cross-brand f0)');
ok(throwsCombined(Object.assign({}, fagRow, { f0: undefined })), 'evaluate refuses Fa > 0 on a FAG row that has no f0');
ok(throwsCombined(Object.assign({}, fagRow, { pn: '4200-BB-TVH', f0: 13 })), 'evaluate refuses Fa > 0 on a FAG double row (42xx/43xx) even with an f0');
ok(C.supportsCombined(Object.assign({}, skfRow, { f0: 14 })) === false && C.supportsCombined(Object.assign({}, ntnRow, { f0: 14 })) === false,
   'supportsCombined is false for SKF / NTN whatever the record carries');

// evaluate() on a real FAG row is FAG's table, and ignores a caller-supplied f0
{
  const b = Object.assign({}, fagRow, { f0: 14.5, c0r: 7 });   // key 2.07 at Fa 1: where the two tables differ most
  const via = C.evaluate({ bearing: b, Fr: 0.125, n: 1000, Fa: 1 });
  const direct = C.calcPFag({ Fr: 0.125, Fa: 1, C0: 7, f0: 14.5 });
  const skfMix = C.calcP({ Fr: 0.125, Fa: 1, C0: 7, f0: 14.5 });   // what mixing would have produced
  ok(Math.abs(via.P.P - direct.P) < 1e-12 && /FAG Table 10/.test(via.P.table), 'evaluate on a FAG row uses FAG Table 10 (label + value)');
  ok(Math.abs(via.P.P - skfMix.P) > 0.01, `...and NOT SKF's table with the same f0 (FAG ${direct.P.toFixed(4)} vs mixed ${skfMix.P.toFixed(4)} kN)`);
  const ignored = C.evaluate({ bearing: b, Fr: 0.125, n: 1000, Fa: 1, f0: 99 });
  ok(Math.abs(ignored.P.P - via.P.P) < 1e-12, 'a caller-supplied f0 argument to evaluate is ignored');
  const rad = C.evaluate({ bearing: b, Fr: 2, n: 1000 });
  ok(rad.P.P === 2 && rad.Fa === 0, 'evaluate with no Fa is still radial only (P = Fr)');
}

// 8d. the data: f0 exists only where it should
{
  const withF0 = M.DB.filter(b => b.f0 !== undefined);
  ok(withF0.length > 0 && withF0.every(b => b.brand === 'FAG'), `f0 is present on FAG rows only (${withF0.length} rows)`);
  ok(withF0.every(b => typeof b.f0 === 'number' && b.f0 >= 11 && b.f0 <= 17), "every stored f0 is a number in FAG's deep groove range (11-17)");
  ok(withF0.every(b => !C.isFagDoubleRow(b)), 'no double row (42xx/43xx) row carries an f0');
  ok(fagCombined.length === 297, `combined loading is offered on exactly 297 FAG rows (got ${fagCombined.length})`);
  ok(fagCombined.every(b => C.supports(b) && b.type === 'Deep Groove Ball'), 'every combined-loading row also passes the radial gates');
}

console.log(`\n${complete.filter(b => C.supports(b)).length} of ${dg.length} DGBB rows calculable; ${rejected.length} rejected on speed, ${fam3.length} as mistyped 32xx/33xx, ${fam7.length} as mistyped 7x`);
console.log(failures ? failures + ' FAILED' : 'all passed');
process.exit(failures ? 1 : 0);
