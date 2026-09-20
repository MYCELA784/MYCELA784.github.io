/*
 * Copied verbatim from the bearing_calc project (data/dgbb_tables.js);
 * the only edit is the browser export at the bottom, which attaches to
 * MYCELA.DGBB_TABLES instead of a bare window global. Keep the table
 * rows byte-identical to the source project so the two cannot drift.
 *
 * Table data for DGBB (deep groove ball bearing) calculations.
 * Transcribed from SKF Catalog_pdf_preview_medium.pdf, printed page numbers
 * (pdfplumber page index = printed + 2). See docs/bearing-calculations.md.
 *
 * No calculation logic here -- pure data, so dgbb_calc.js has nothing
 * inline to get out of sync with the source tables.
 */

// Table 9, page 257: "Calculation factors for deep groove ball bearings"
// (single row and double row bearings). Keyed by f0*Fa/C0. Three clearance
// classes, each with its own e/X/Y. Intermediate values: linear
// interpolation (stated explicitly in the catalogue text under the table).
const TABLE_9 = [
  { key: 0.172, Normal: { e: 0.19, X: 0.56, Y: 2.30 }, C3: { e: 0.29, X: 0.46, Y: 1.88 }, C4: { e: 0.38, X: 0.44, Y: 1.47 } },
  { key: 0.345, Normal: { e: 0.22, X: 0.56, Y: 1.99 }, C3: { e: 0.32, X: 0.46, Y: 1.71 }, C4: { e: 0.40, X: 0.44, Y: 1.40 } },
  { key: 0.689, Normal: { e: 0.26, X: 0.56, Y: 1.71 }, C3: { e: 0.36, X: 0.46, Y: 1.52 }, C4: { e: 0.43, X: 0.44, Y: 1.30 } },
  { key: 1.03,  Normal: { e: 0.28, X: 0.56, Y: 1.55 }, C3: { e: 0.38, X: 0.46, Y: 1.41 }, C4: { e: 0.46, X: 0.44, Y: 1.23 } },
  { key: 1.38,  Normal: { e: 0.30, X: 0.56, Y: 1.45 }, C3: { e: 0.40, X: 0.46, Y: 1.34 }, C4: { e: 0.47, X: 0.44, Y: 1.19 } },
  { key: 2.07,  Normal: { e: 0.34, X: 0.56, Y: 1.31 }, C3: { e: 0.44, X: 0.46, Y: 1.23 }, C4: { e: 0.50, X: 0.44, Y: 1.12 } },
  { key: 3.45,  Normal: { e: 0.38, X: 0.56, Y: 1.15 }, C3: { e: 0.49, X: 0.46, Y: 1.10 }, C4: { e: 0.55, X: 0.44, Y: 1.02 } },
  { key: 5.17,  Normal: { e: 0.42, X: 0.56, Y: 1.04 }, C3: { e: 0.54, X: 0.46, Y: 1.01 }, C4: { e: 0.56, X: 0.44, Y: 1.00 } },
  { key: 6.89,  Normal: { e: 0.44, X: 0.56, Y: 1.00 }, C3: { e: 0.54, X: 0.46, Y: 1.00 }, C4: { e: 0.56, X: 0.44, Y: 1.00 } },
];

// Table 10, page 257: "Calculation factors for paired single row deep
// groove ball bearings arranged back-to-back and face-to-face."
// Keyed by f0*Fa/C0. No X here -- the paired equivalent-load formula
// doesn't use X (see calcP in dgbb_calc.js).
const TABLE_10_PAIRED = [
  { key: 0.17, e: 0.23, Y1: 2.8,  Y2: 3.7 },
  { key: 0.69, e: 0.30, Y1: 2.1,  Y2: 2.8 },
  { key: 2.08, e: 0.40, Y1: 1.6,  Y2: 2.15 },
  { key: 3.46, e: 0.45, Y1: 1.4,  Y2: 1.85 },
  { key: 5.19, e: 0.50, Y1: 1.26, Y2: 1.7 },
];

// Table 3, page 90: life adjustment factor for reliability, a1.
// Keyed by required reliability percentage.
const A1_TABLE = {
  90: 1,
  95: 0.64,
  96: 0.55,
  97: 0.47,
  98: 0.37,
  99: 0.25,
};

// Table 7, page 106: guideline static safety factor s0 -- ball bearings.
// Column headers are the catalogue's own "permanent deformation
// acceptance" Yes/Some/No (Yes = deformation is acceptable -> lowest s0
// guideline; No = not acceptable -> highest). Reference data only (for
// the demo to display); calcS0 does not consult this to decide pass/fail,
// it just returns the computed s0 value.
const S0_GUIDELINE_BALL = {
  continuousMotion: {
    // exact values from the catalogue
    highCertainty: { deformationYes: 0.5, deformationSome: 1,   deformationNo: 2 },
    // catalogue prints these as ">=" minimums
    lowCertainty:   { deformationYes: 1.5, deformationSome: 1.5, deformationNo: 2, minimum: true },
  },
  infrequentMotion: {
    highCertainty: { deformationYes: 0.4 },
    lowCertainty:  { deformationYes: 1, minimum: true },
  },
};

// p.257 symbols: life exponent by bearing family (general ISO 281 rule,
// not DGBB-specific, but DGBB is always the "ball" case).
const LIFE_EXPONENT = { ball: 3, roller: 10 / 3 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TABLE_9, TABLE_10_PAIRED, A1_TABLE, S0_GUIDELINE_BALL, LIFE_EXPONENT };
} else {
  (window.MYCELA = window.MYCELA || {}).DGBB_TABLES =
    { TABLE_9, TABLE_10_PAIRED, A1_TABLE, S0_GUIDELINE_BALL, LIFE_EXPONENT };
}
