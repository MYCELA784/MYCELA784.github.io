/* PUBLIC API
 *   MYCELA.DGBBCalc.supports(b)              — is this DB record calculable?
 *   MYCELA.DGBBCalc.fromRecord(b)            — DB record -> calculator inputs
 *   MYCELA.DGBBCalc.evaluate({bearing,Fr,n}) — the whole radial-only chain
 *   plus the pure primitives: calcP, calcL10, calcL10h, calcS0,
 *   checkMinLoad, checkSpeed.
 *
 * Copied from the bearing_calc project (dgbb_calc.js), where it was
 * validated against the catalogue's worked examples. The formulas below
 * are unchanged; the additions are the browser export (MYCELA namespace
 * instead of a bare global), and supports/fromRecord/evaluate, which
 * read a bearing record out of MYCELA.DB_MAP — bearing_calc read a
 * hand-transcribed data/sample_bearings.js, which bearings_db.js
 * supersedes here. Keep the formulas byte-identical to the source
 * project so the two cannot drift.
 *
 * DGBB (deep groove ball bearing) load-based selection calculations.
 * Pure functions only -- no DOM, no I/O, no site dependency. Table data
 * lives in data/dgbb_tables.js, not inline here.
 *
 * Formulas and page citations: docs/bearing-calculations.md in the
 * bearing_calc project (not carried into this repo); the references to
 * it below are that document, not anything under docs/ here.
 *
 * NOT computed, by design (see docs section 4): a_SKF, kappa, eta_c.
 * calcL10/calcL10h accept a_SKF as an optional input (default 1) and the
 * caller supplies it (e.g. read off a chart, or omitted). When a_SKF is
 * left at its default, the result is labelled "basic rating life" rather
 * than "SKF rating life", because mathematically it IS the basic rating
 * life (times a1) when a_SKF=1 -- calling it "SKF rating life" in that
 * case would overstate what was actually computed.
 *
 * PRACTICAL SCOPE RIGHT NOW: radial-only (Fa=0). calcP's combined-load
 * branch (Fa>0) needs f0, which is not present anywhere in this
 * catalogue's DGBB tables and is not derivable from bore/OD/width -- it
 * needs ball diameter and ball count, which we don't have (see docs
 * section 8). calcP throws rather than guessing a default the moment
 * Fa>0 without an explicit f0. Do not add a default f0 to work around
 * that error -- see the docs note for why.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const calc = factory(require('../data/dgbb_tables.js'));
    module.exports = calc;
    // The node test harnesses load these files in index.html's order against
    // a window shim, so attach there too — MYCELA.DGBBCalc then resolves the
    // same way under node as it does in the browser.
    if (typeof global !== 'undefined' && global.window) {
      (global.window.MYCELA = global.window.MYCELA || {}).DGBBCalc = calc;
    }
  } else {
    const ns = root.MYCELA = root.MYCELA || {};
    ns.DGBBCalc = factory(ns.DGBB_TABLES);
  }
})(typeof self !== 'undefined' ? self : this, function (tables) {
  const { TABLE_9, TABLE_10_PAIRED, A1_TABLE, LIFE_EXPONENT } = tables;

  // Linear interpolation of e/X/Y (Table 9) or e/Y1/Y2 (Table 10) by a
  // lookup key (f0*Fa/C0), matching the catalogue's own instruction
  // ("intermediate values can be obtained by linear interpolation").
  // Below the first row or above the last row, the boundary row's value
  // is used (the table doesn't extrapolate beyond its printed range).
  function interpolateRow(table, key, pick) {
    const rows = table;
    if (key <= rows[0].key) return pick(rows[0]);
    if (key >= rows[rows.length - 1].key) return pick(rows[rows.length - 1]);
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (key >= a.key && key <= b.key) {
        const t = (key - a.key) / (b.key - a.key);
        const va = pick(a), vb = pick(b);
        const out = {};
        for (const k of Object.keys(va)) out[k] = va[k] + t * (vb[k] - va[k]);
        return out;
      }
    }
    throw new Error('interpolateRow: key not bracketed -- unreachable');
  }

  /**
   * Equivalent dynamic bearing load, P, for a single-row DGBB or a
   * matched pair. docs/bearing-calculations.md section 1a.
   *
   * @param {object} p
   * @param {number} p.Fr - actual radial load [kN]
   * @param {number} p.Fa - actual axial load [kN], 0 if none
   * @param {number} p.C0 - basic static load rating [kN] (c0r)
   * @param {number} [p.f0] - calculation factor. REQUIRED only if Fa>0.
   *   Not present in this catalogue's DGBB product tables (see docs
   *   section 8) -- the caller must supply it from elsewhere. If Fa=0,
   *   f0 is never consulted (Fa/Fr=0 <= e always holds, whatever e is).
   * @param {'Normal'|'C3'|'C4'} [p.clearance='Normal']
   * @param {'single'|'tandem'|'paired'} [p.arrangement='single'] -
   *   'single'/'tandem' use Table 9 (P=Fr or P=X.Fr+Y.Fa); 'paired'
   *   (back-to-back/face-to-face) uses Table 10 (no X; P=Fr+Y1.Fa or
   *   P=0.75Fr+Y2.Fa).
   * @returns {{P:number, branch:string, e:number|null, X:number|null,
   *   Y:number|null, ratio:number, key:number|null}}
   */
  function calcP({ Fr, Fa, C0, f0 = null, clearance = 'Normal', arrangement = 'single' }) {
    if (Fr == null || Fr < 0) throw new Error('calcP: Fr required and >= 0');
    if (Fa == null || Fa < 0) throw new Error('calcP: Fa required and >= 0 (use 0 for none)');

    const ratio = Fr === 0 ? Infinity : Fa / Fr;

    if (Fa === 0) {
      return { P: Fr, branch: 'Fa=0 -> Fa/Fr<=e trivially', e: null, X: null, Y: null, Y1: null, Y2: null, ratio: 0, key: null };
    }
    if (C0 == null || C0 <= 0) throw new Error('calcP: C0 (basic static load rating) required when Fa>0');
    if (f0 == null) {
      throw new Error(
        'calcP: f0 is required when Fa>0, but is not present in this catalogue\'s ' +
        'DGBB product tables (docs/bearing-calculations.md section 8) -- supply it explicitly.'
      );
    }
    const key = f0 * Fa / C0;

    if (arrangement === 'paired') {
      const { e, Y1, Y2 } = interpolateRow(TABLE_10_PAIRED, key, (r) => ({ e: r.e, Y1: r.Y1, Y2: r.Y2 }));
      if (ratio <= e) {
        return { P: Fr + Y1 * Fa, branch: 'paired, Fa/Fr<=e: P=Fr+Y1.Fa', e, X: null, Y: null, Y1, Y2, ratio, key };
      }
      return { P: 0.75 * Fr + Y2 * Fa, branch: 'paired, Fa/Fr>e: P=0.75Fr+Y2.Fa', e, X: null, Y: null, Y1, Y2, ratio, key };
    }

    const clearanceTable = TABLE_9.map((r) => ({ key: r.key, ...r[clearance] }));
    const { e, X, Y } = interpolateRow(clearanceTable, key, (r) => ({ e: r.e, X: r.X, Y: r.Y }));
    if (ratio <= e) {
      return { P: Fr, branch: 'single/tandem, Fa/Fr<=e: P=Fr', e, X, Y, Y1: null, Y2: null, ratio, key };
    }
    return { P: X * Fr + Y * Fa, branch: 'single/tandem, Fa/Fr>e: P=X.Fr+Y.Fa', e, X, Y, Y1: null, Y2: null, ratio, key };
  }

  /**
   * Basic rating life L10 (millions of revolutions), optionally adjusted
   * to SKF rating life L10m if the caller supplies a1 and/or a_SKF.
   * docs/bearing-calculations.md sections 3-4.
   *
   * a_SKF, kappa and eta_c are NOT computed by this function or anything
   * in this file -- they are chart/tool-only per the catalogue (section
   * 4). If you have a value (read off a diagram, or from the SKF Bearing
   * Calculator), pass it in; otherwise it defaults to 1 and the result
   * is labelled "basic rating life", not "SKF rating life".
   *
   * @param {object} p
   * @param {number} p.C - basic dynamic load rating [kN] (cr)
   * @param {number} p.P - equivalent dynamic bearing load [kN] (calcP)
   * @param {number} [p.p=3] - life exponent, 3 for ball bearings (DGBB)
   * @param {number} [p.a1=1] - reliability life adjustment factor (Table 3)
   * @param {number} [p.a_SKF=1] - life modification factor (chart-only, see above)
   * @returns {{L10:number, value:number, a1:number, a_SKF:number, label:string}}
   */
  function calcL10({ C, P, p = 3, a1 = 1, a_SKF = 1 }) {
    if (!(C > 0) || !(P > 0)) throw new Error('calcL10: C and P must be > 0');
    const L10 = Math.pow(C / P, p);
    const value = a1 * a_SKF * L10;
    const label = (a1 === 1 && a_SKF === 1) ? 'basic rating life (L10)' : 'SKF rating life (L10m)';
    return { L10, value, a1, a_SKF, p, label };
  }

  /**
   * Basic (or SKF) rating life in operating hours, given constant speed.
   * docs/bearing-calculations.md section 3.
   *
   * @param {object} p - same as calcL10, plus:
   * @param {number} p.n - rotational speed [r/min]
   * @returns {object} calcL10's result plus {n, value (hours), basicHours, label}
   */
  function calcL10h({ C, P, n, p = 3, a1 = 1, a_SKF = 1 }) {
    if (!(n > 0)) throw new Error('calcL10h: n must be > 0');
    const l10 = calcL10({ C, P, p, a1, a_SKF });
    const hoursFactor = 1e6 / (60 * n);
    const basicHours = hoursFactor * l10.L10;
    const value = hoursFactor * l10.value;
    const label = (a1 === 1 && a_SKF === 1) ? 'basic rating life (L10h)' : 'SKF rating life (L10mh)';
    return { ...l10, n, basicHours, value, label };
  }

  /**
   * Equivalent static bearing load P0 and static safety factor s0, for
   * single/tandem or paired (back-to-back/face-to-face) single-row DGBB.
   * docs/bearing-calculations.md section 2 and 5.
   *
   * @param {object} p
   * @param {number} p.C0 - basic static load rating [kN] (c0r)
   * @param {number} p.Fr - actual radial load [kN]
   * @param {number} p.Fa - actual axial load [kN]
   * @param {'single'|'tandem'|'paired'} [p.arrangement='single']
   * @returns {{P0:number, s0:number, formula:string}}
   */
  function calcS0({ C0, Fr, Fa, arrangement = 'single' }) {
    if (!(C0 > 0)) throw new Error('calcS0: C0 must be > 0');
    if (Fr == null || Fr < 0) throw new Error('calcS0: Fr required and >= 0');
    if (Fa == null || Fa < 0) throw new Error('calcS0: Fa required and >= 0');

    let P0, formula;
    if (arrangement === 'paired') {
      P0 = Fr + 1.7 * Fa;
      formula = 'P0 = Fr + 1.7*Fa (paired back-to-back/face-to-face, p.254)';
    } else {
      const raw = 0.6 * Fr + 0.5 * Fa;
      P0 = Math.max(raw, Fr);
      formula = raw < Fr
        ? 'P0 = Fr (0.6Fr+0.5Fa < Fr, p.254)'
        : 'P0 = 0.6*Fr + 0.5*Fa (single/tandem, p.254)';
    }
    const s0 = C0 / P0;
    return { P0, s0, formula };
  }

  /**
   * Minimum radial load check. Uses the precise DGBB formula
   * (Frm = kr.(v.n/1000)^(2/3).(dm/100)^2) only if kr is supplied --
   * kr is NOT present in this catalogue's DGBB product tables (see
   * docs section 6a), so the default is the general 0.01*C guideline,
   * which IS computable from data this catalogue provides.
   *
   * @param {object} p
   * @param {number} p.Fr - actual radial load on the bearing [kN]
   * @param {number} p.Cr - basic dynamic load rating [kN] (cr) - used by the fallback
   * @param {number} [p.dm] - bearing mean diameter [mm] = 0.5(bore+od); required for the precise formula
   * @param {number} [p.n] - rotational speed [r/min]; required for the precise formula
   * @param {number} [p.viscosity] - actual operating oil viscosity [mm^2/s]; required for the precise formula
   * @param {number} [p.kr] - minimum load factor; not extractable from this catalogue for DGBB, must be supplied explicitly
   * @returns {{Frm:number, method:string, pass:boolean}}
   */
  function checkMinLoad({ Fr, Cr, dm = null, n = null, viscosity = null, kr = null }) {
    if (Fr == null || Fr < 0) throw new Error('checkMinLoad: Fr required and >= 0');
    let Frm, method;
    if (kr != null && dm != null && n != null && viscosity != null) {
      Frm = kr * Math.pow((viscosity * n) / 1000, 2 / 3) * Math.pow(dm / 100, 2);
      method = 'precise: Frm = kr.(v.n/1000)^(2/3).(dm/100)^2 (p.254; kr supplied by caller, not from catalogue data)';
    } else {
      if (!(Cr > 0)) throw new Error('checkMinLoad: Cr required and > 0 for the guideline fallback');
      Frm = 0.01 * Cr;
      method = 'guideline fallback: Frm = 0.01*Cr (p.106; kr/viscosity not supplied or not available for DGBB from this catalogue, see docs section 6a)';
    }
    return { Frm, method, pass: Fr >= Frm };
  }

  /**
   * Speed check against the printed reference/limiting speed.
   * docs/bearing-calculations.md section 6b. No formula computes an
   * "adjusted reference speed" here -- the catalogue states that needs
   * the SKF Bearing Calculator, not a published equation.
   *
   * @param {object} p
   * @param {number} p.n - operating speed [r/min]
   * @param {number|null} p.speedRef - printed reference speed [r/min], null if the catalogue shows a dash (sealed bearing)
   * @param {number} p.speedLim - printed limiting speed [r/min]
   * @returns {{exceedsLimiting:boolean, exceedsReference:boolean|null, within50pctOfLimiting:boolean, pass:boolean}}
   */
  function checkSpeed({ n, speedRef = null, speedLim }) {
    if (!(n > 0)) throw new Error('checkSpeed: n must be > 0');
    if (!(speedLim > 0)) throw new Error('checkSpeed: speedLim must be > 0');
    const exceedsLimiting = n > speedLim;
    const exceedsReference = speedRef == null ? null : n > speedRef;
    const within50pctOfLimiting = n < 0.5 * speedLim;
    return {
      exceedsLimiting,
      exceedsReference,
      within50pctOfLimiting,
      pass: !exceedsLimiting,
      note: speedRef == null
        ? 'no reference speed printed (sealed bearing, p.135) -- limiting speed is the only cap'
        : (exceedsReference
          ? 'above reference speed: a detailed thermal analysis is recommended (p.131-133)'
          : 'within reference speed'),
    };
  }

  // ── Site adapters: MYCELA.DB_MAP record -> calculator ────────────────────

  // Fields a radial-only DGBB calculation cannot proceed without. bearings_db.js
  // carries nulls for load ratings and speeds it could not verify, so this is
  // a real gate, not a formality: 148 of the 932 Deep Groove Ball rows fail it.
  const REQUIRED = ['cr', 'c0r', 'bore', 'od', 'rpm'];

  // Plausibility floor on the stored limiting speed, as a speed factor
  // n * dm  [r/min * mm], dm = 0.5 * (bore + od).
  //
  // Why n*dm and not a rpm-per-bore table: limiting speed falls as the
  // bearing gets bigger, so a fixed rpm floor is wrong at one end or the
  // other (240 rpm is right for a 1500 mm bore, absurd for a 12 mm one).
  // n*dm is roughly size-independent for a given lubrication/seal class.
  //
  // Where 275 000 comes from: over the 784 rows that pass REQUIRED,
  // log10(n*dm) has Q1 = 5.716 (519 625), Q3 = 5.853 (712 500), so IQR =
  // 0.137. The lower Tukey fence at k = 2 is 10^(Q1 - 2*IQR) = 276 375.
  // The 29 rows below it sit apart: the next row up is 313 600 (a FAG
  // 4303 in a dense FAG run that carries on to ~400 000), and the
  // nearest below is 261 000. Any floor inside that 261 000..313 600 gap
  // rejects the same 29 rows, so 275 000 is the fence rounded down into
  // the gap, not a tuned value. (k = 1.5 gives 323 629 and would clip the
  // FAG 4303 row, which is why k = 2.) Quartiles are robust to the 29
  // themselves, so computing this over the 784 rather than the 755 that
  // survive does not move it.
  //
  // What it catches: rows whose rpm cannot be a limiting speed. 18 of the
  // 29 carry a value equal, to the digit, to Cr converted to kgf (NTN-6201:
  // rpm 620, Cr 6.1 kN = 622 kgf), i.e. the extractor read the wrong
  // column. See docs/data-quarantine.md Q9. What it does NOT catch: a
  // too-high rpm, or a wrong value that still lands above the floor.
  //
  // This is a gate, not a correction. The stored value is left alone; the
  // row simply gets no calculator until it is re-sourced.
  const MIN_N_DM = 275000;

  // Designation families that are typed 'Deep Groove Ball' in bearings_db.js
  // but are not deep groove bearings. Excluded by designation, not by the
  // stored type, because the type field is the thing that is wrong. All from
  // the SKF US Bearings Catalog (SKF Catalog_pdf_preview_medium.pdf), printed
  // page numbers; the source CSV the extractor wrote also types every one of
  // these Angular Contact Ball.
  //
  // 32xx / 33xx (26 rows): double row angular contact. p.81 "Double row, 40
  // deg contact angle", Series 3308 DNRCBM - 3313 DNRCBM; p.82 Series 3200 A
  // - 3220 A and p.83 Series 3302 A - 3322 A, "Double row, 30 deg contact
  // angle". At Fa = 0 calcP never reads the deep groove X/Y factors and p = 3
  // holds for any ball bearing, so the radial-only arithmetic is not itself
  // wrong here. Gated because this section is scoped to deep groove ball
  // bearings and the 0.01*C minimum load is a deep groove guideline (Q9b).
  //
  // 7x / 7xx slash series (38 rows, all SKF, bores 500-1250 mm): angular
  // contact. p.68 "Single row ... Angular contact ball bearings, Series 7024 B
  // - 70/1250 AMB"; p.72 "Single row", Series 71964 AC - 719/710 ACMB; p.73
  // Series 71872 AC - 718/1250 AMB. Here the calculator IS wrong, and in the
  // dangerous direction: a single row angular contact bearing under a radial
  // load develops an induced axial load, so P is greater than Fr and P = Fr
  // overstates the life. The output would look entirely plausible (Q9c).
  //
  // Both are matched on the whitespace-stripped designation. No genuine deep
  // groove designation starts with 7 or is 32xx/33xx (ISO 15: 60xx, 62xx,
  // 63xx, 64xx, 160xx, 618xx, 619xx, 67xx-69xx), and the slash-coded deep
  // groove sizes in the data (60/500, 618/560, 619/500) all start with 6.
  const NOT_DEEP_GROOVE = /^(3[23]\d{2}(?!\d)|7\d)/;

  function num(v) {
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  }

  /**
   * True only for a record this calculator can actually be run on: a deep
   * groove ball bearing carrying every field the chain consumes, with a
   * limiting speed that is physically plausible for its size (MIN_N_DM), and
   * a designation that is not a mistyped non-deep-groove family
   * (NOT_DEEP_GROOVE). Everything else (tapered roller, thrust, an unrated
   * or quarantined row, a row whose stored rpm is evidently another column)
   * is out of scope -- the caller must not render the calculator for it.
   *
   * @param {object} b - a MYCELA.DB_MAP record
   * @returns {boolean}
   */
  function supports(b) {
    if (!b || b.type !== 'Deep Groove Ball') return false;
    if (!REQUIRED.every((k) => num(b[k]) != null)) return false;
    if (NOT_DEEP_GROOVE.test(String(b.pn || '').toUpperCase().replace(/\s+/g, ''))) return false;
    return b.rpm * 0.5 * (b.bore + b.od) >= MIN_N_DM;
  }

  /**
   * Map a DB record onto the names the pure functions use. speed_ref is
   * optional and stays null when the catalogue printed a dash (sealed
   * bearings, see checkSpeed); b.rpm is the printed limiting speed.
   *
   * @param {object} b - a MYCELA.DB_MAP record
   * @returns {object|null} null if supports(b) is false
   */
  function fromRecord(b) {
    if (!supports(b)) return null;
    return {
      id: b.id,
      designation: b.pn,
      brand: b.brand,
      bore: b.bore,
      od: b.od,
      w: num(b.w),
      Cr: b.cr,
      C0: b.c0r,
      speedRef: num(b.speed_ref),
      speedLim: b.rpm,
      dm: 0.5 * (b.bore + b.od),
    };
  }

  /**
   * The whole radial-only chain for one bearing and one duty point.
   *
   * Fa defaults to 0 and is passed straight through to calcP, which throws
   * the f0 explanation if a caller ever supplies Fa>0 without an f0 -- that
   * refusal is deliberate (see the file header), so do not catch it and
   * substitute a default f0.
   *
   * a_SKF is not exposed and stays at 1, so life.label reads "basic rating
   * life (L10h)" and not "SKF rating life".
   *
   * @param {object} p
   * @param {object} p.bearing - a MYCELA.DB_MAP record
   * @param {number} p.Fr - radial load [kN]
   * @param {number} p.n - operating speed [r/min]
   * @param {number} [p.Fa=0] - axial load [kN]; anything > 0 needs f0
   * @param {number} [p.f0] - calculation factor; not in this catalogue
   * @returns {{bearing:object, Fr:number, n:number, P:object, life:object,
   *   minLoad:object, speed:object, CoverP:number}}
   */
  function evaluate({ bearing, Fr, n, Fa = 0, f0 = null }) {
    const bg = fromRecord(bearing);
    if (!bg) throw new Error('evaluate: this bearing is out of scope for the DGBB calculator');
    if (!(Fr > 0)) throw new Error('evaluate: Fr must be > 0 kN');
    if (!(n > 0)) throw new Error('evaluate: n must be > 0 r/min');

    const P = calcP({ Fr, Fa, C0: bg.C0, f0 });
    const life = calcL10h({ C: bg.Cr, P: P.P, n, p: LIFE_EXPONENT.ball });
    // kr and the operating viscosity are not available for DGBB from this
    // catalogue, so checkMinLoad takes its 0.01*Cr guideline branch. dm and n
    // are passed for the display only; without kr they are not consulted.
    const minLoad = checkMinLoad({ Fr, Cr: bg.Cr, dm: bg.dm, n });
    const speed = checkSpeed({ n, speedRef: bg.speedRef, speedLim: bg.speedLim });

    return { bearing: bg, Fr, Fa, n, P, life, minLoad, speed, CoverP: bg.Cr / P.P };
  }

  return {
    calcP, calcL10, calcL10h, calcS0, checkMinLoad, checkSpeed, interpolateRow,
    supports, fromRecord, evaluate, MIN_N_DM,
    A1_TABLE, LIFE_EXPONENT,
  };
});
