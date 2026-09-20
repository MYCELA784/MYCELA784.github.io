/*
 * FAG (Schaeffler) factor table for deep groove ball bearings.
 * THIS TABLE IS FAG'S, AND IS ONLY EVER USED WITH FAG'S OWN f0.
 *
 * It is deliberately a separate file from data/dgbb_tables.js (which is
 * transcribed from the SKF catalogue) and is never merged into it. The two
 * tables trace back to the same ISO 281 curve but they are not the same
 * numbers: FAG prints six rows on a different key grid, and only for
 * normal operating clearance. Compared over the whole key range, using
 * SKF's table with FAG's f0 gives a life that differs from FAG's own table
 * by -9.6% to +5.1% (docs/bearing-calculations.md 9a-4). So js/dgbb_calc.js
 * uses this table for FAG rows and SKF's for nothing that has an f0, and a
 * test fails if that separation is broken.
 *
 * Source: FAG "Rolling Bearings" catalogue HR 1 (hr1_de_en.pdf), chapter
 * "Deep groove ball bearings", 1.14 Dimensioning, "Equivalent dynamic
 * bearing load", Table 10 "Factors e, X and Y", printed page 231 (PDF page
 * 233). Read off the rendered page, not from text extraction. The page says:
 * "The specified values are valid for normal operating clearance ... If the
 * calculation values lie between the stated values (such as 0,4), then read
 * off the table values for 0,3 and 0,5 and determine the intermediate values
 * using linear interpolation." Same equation shape as SKF's:
 *   Fa/Fr <= e  ->  P = Fr
 *   Fa/Fr >  e  ->  P = X.Fr + Y.Fa
 * with the key f0.Fa/C0r (f0 is the per-bearing factor in FAG's product
 * tables; C0r the static load rating).
 *
 * Scope limits, all from the catalogue:
 *  - normal operating clearance only: no C3 / C4 columns exist, so no
 *    clearance selector may be offered on FAG rows
 *  - the table starts at f0.Fa/C0r = 0.3 and ends at 6: outside that range
 *    the calculator uses the nearest row and says so
 *  - the chapter carries no separate table for the double row 42xx / 43xx
 *    series, so combined loading is restricted to single row bearings
 *
 * Pure data, no logic.
 */

const FAG_TABLE_10 = [
  { key: 0.3, e: 0.22, X: 0.56, Y: 2.0 },
  { key: 0.5, e: 0.24, X: 0.56, Y: 1.8 },
  { key: 0.9, e: 0.28, X: 0.56, Y: 1.58 },
  { key: 1.6, e: 0.32, X: 0.56, Y: 1.4 },
  { key: 3,   e: 0.36, X: 0.56, Y: 1.2 },
  { key: 6,   e: 0.43, X: 0.56, Y: 1.0 },
];

const FAG_TABLE_10_META = {
  brand: 'FAG',
  source: 'FAG Rolling Bearings catalogue HR 1, Table 10, printed p.231',
  clearance: 'normal operating clearance',
  label: 'FAG Table 10 (HR 1 p.231), normal operating clearance',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FAG_TABLE_10, FAG_TABLE_10_META };
} else {
  (window.MYCELA = window.MYCELA || {}).FAG_TABLES = { FAG_TABLE_10, FAG_TABLE_10_META };
}
