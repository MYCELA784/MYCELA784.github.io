/* PUBLIC API (consumed by engine.js)
 *   MYCELA.SearchEngine.fallback(q) → { results: bearing[], note: string|null, stage }
 *     stage: 1–4  the stage that supplied the results
 *            0    the query had a bore or a type, but nothing within tolerance
 *            null the query had no bore and no type: nothing to relax from
 *     app.js sends it with the zero-result telemetry as fallbackStage.
 *
 * Progressive relaxation when fast() returns zero results. Needs a bore
 * (stages 1–3) or a bearing type (stage 4); anything else returns no results.
 * Stage tolerances read from MYCELA.CONFIG.fallback.
 */
(function (ns) {
  ns.SearchEngine = ns.SearchEngine || {};

  // The parser's numeric fields are {prefer?, min?, max?}; choice fields are
  // {accept:[], exclude:[]}. Reduce them to the plain values this stage logic
  // was written against.
  function numVal(f) {
    if (!f) return null;
    if (f.prefer != null) return f.prefer;
    if (f.min != null && f.max != null) return (f.min + f.max) / 2;
    return f.min != null ? f.min : (f.max != null ? f.max : null);
  }
  function firstAccept(f) { return (f && f.accept && f.accept[0]) || null; }

  // Seal and shield suffixes, as the DB writes them: a separate token
  // (2RS, RS, 2RS5, 2RS5W, 2RSR, 2HRS, 2RZ, 2Z, Z, ZZ, LLU/LLB/LLH...) in
  // "6201-C-2HRS", "61809-2RSR-Y", "NA 4901 2RS", or glued to the end of an
  // NTN designation ("5201SCZZ", "6201LLU"). Every Sealed and Shielded row
  // matches one of these.
  const SEAL_TOKEN = /^(2?RS[0-9A-Z]*|2?HRS|2?RZ|2?Z|ZZ|LL[A-Z])$/;
  const SEAL_GLUED = /^(.*[0-9A-Z])(ZZ|LL[UBH])$/;
  function baseDesignation(pn) {
    return String(pn).toUpperCase().split(/[- ]+/)
      .filter(t => t && !SEAL_TOKEN.test(t))
      .map(t => t.replace(SEAL_GLUED, '$1'))
      .join('-');
  }
  ns.SearchEngine.baseDesignation = baseDesignation;

  // How far a row's dimension is from what the query asked: 0 inside the
  // asked range, else the distance to its nearest end (a single value is a
  // range of one). 0 for every row when the query did not ask.
  function rangeDist(v, f) {
    if (!f || (f.min == null && f.max == null)) return 0;
    if (v == null) return Infinity;
    if (f.min != null && v < f.min) return f.min - v;
    if (f.max != null && v > f.max) return v - f.max;
    return 0;
  }

  // The one place every stage turns its candidates into a result list.
  // 1. One card per bearing: seal/shield variants of a brand's designation
  //    collapse to one row, the query's sealing if it asked for one, else
  //    Open, else the first in DB order. (fast() still lists every variant.)
  // 2. Rank by keys(row), compared in order (bore distance, then OD, then
  //    width, then type, then sealing); a closer row is never traded for
  //    variety. Type and sealing put the query's own first when it named
  //    one (stages 1 to 3 do not filter by type), else Deep Groove Ball and
  //    Open first.
  // 3. Rows tied on every key form a tier, and inside a tier brands take
  //    turns in alphabetical order, each brand keeping its DB order. Without
  //    this the DB's brand order (NTN first) filled every slot with one brand.
  function pickMixed(rows, keys, max, wantSeal) {
    const rank = b => (b.sealing === wantSeal ? 0 : b.sealing === 'Open' ? 1 : 2);
    const groups = new Map();
    rows.forEach(b => {
      const k = b.brand + '|' + baseDesignation(b.pn);
      const cur = groups.get(k);
      if (!cur || rank(b) < rank(cur)) groups.set(k, b);
    });
    const firstIdx = new Map(rows.map((b, i) => [b, i]));
    const one = [...groups.values()].sort((a, b) => firstIdx.get(a) - firstIdx.get(b));

    const keyed = one.map(b => ({ b, k: keys(b) }));
    const cmp = (x, y) => { for (let i = 0; i < x.k.length; i++) if (x.k[i] !== y.k[i]) return x.k[i] - y.k[i]; return 0; };
    keyed.sort(cmp);

    const out = [];
    for (let i = 0; i < keyed.length && out.length < max; ) {
      const head = keyed[i];
      const byBrand = {};
      for (; i < keyed.length && cmp(keyed[i], head) === 0; i++) {
        (byBrand[keyed[i].b.brand] = byBrand[keyed[i].b.brand] || []).push(keyed[i].b);
      }
      const queues = Object.keys(byBrand).sort().map(k => byBrand[k]);
      while (queues.some(qu => qu.length)) queues.forEach(qu => { if (qu.length) out.push(qu.shift()); });
    }
    return out.slice(0, max);
  }

  // The one place a dimension goes into a note: "OD 90 mm" when the query
  // gave one value (prefer, or min equal to max), "OD 25–30 mm" for a real
  // range, "OD up to 90 mm" / "OD from 90 mm" for an open one.
  function dimText(label, f) {
    if (!f) return null;
    const n = v => +v.toFixed(2);
    const lo = f.min, hi = f.max;
    if (f.prefer != null) return `${label} ${n(f.prefer)} mm`;
    if (lo != null && hi != null) return lo === hi ? `${label} ${n(lo)} mm` : `${label} ${n(lo)}–${n(hi)} mm`;
    if (hi != null) return `${label} up to ${n(hi)} mm`;
    return lo != null ? `${label} from ${n(lo)} mm` : null;
  }

  ns.SearchEngine.fallback = function (q) {
    const p       = ns.SearchEngine.parse(q);
    const CFG     = MYCELA.CONFIG.fallback;
    // A brand the query named (or excluded) holds in every stage.
    const brandF  = p.brand;
    const DB      = MYCELA.DB.filter(b =>
      !brandF || ((!brandF.accept.length || brandF.accept.includes(b.brand)) &&
                  !(brandF.exclude || []).includes(b.brand)));
    const bore    = numVal(p.bore);
    const boreDist = b => Math.abs(b.bore - bore);
    const odMin   = p.od ? p.od.min : null;
    const odMax   = p.od ? p.od.max : null;
    const sealing = firstAccept(p.sealing);
    const type    = firstAccept(p.type);
    const hasBore = bore != null;
    const hasODR  = odMin != null || odMax != null;
    const hasSeal = !!sealing;
    const hasType = !!type;
    const keys    = b => [hasBore ? boreDist(b) : 0, rangeDist(b.od, p.od), rangeDist(b.w, p.width),
                          b.type === (hasType ? type : 'Deep Groove Ball') ? 0 : 1,
                          b.sealing === (hasSeal ? sealing : 'Open') ? 0 : 1];

    // Stage 1 — relax OD range, keep bore ± stage1BoreTol and sealing
    if (hasBore && hasODR) {
      const s1 = pickMixed(DB.filter(b => boreDist(b) <= CFG.stage1BoreTol &&
                                          (!hasSeal || b.sealing === sealing)),
                           keys, CFG.stage1MaxResults, sealing);
      if (s1.length > 0) return {
        results: s1, stage: 1,
        note: `No bearing found with ${dimText('bore', p.bore)} and ${dimText('OD', p.od)}. Showing closest bore matches; OD range constraint relaxed. Consider these and verify OD fits your housing.`,
      };
    }

    // Stage 2 — relax sealing, keep bore ± stage2BoreTol
    if (hasBore && hasSeal) {
      const pool2 = DB.filter(b => boreDist(b) <= CFG.stage2BoreTol);
      const s2 = pickMixed(pool2, keys, CFG.stage2MaxResults, sealing);
      if (s2.length > 0) {
        // From the pool, not s2: one card per bearing would hide the variants.
        const avail = [...new Set(pool2.map(b => b.sealing))].join(', ');
        return {
          results: s2, stage: 2,
          note: `No ${sealing.toLowerCase()} bearing found with exact ${bore}mm bore. Available sealings for this size: ${avail}. Consider ordering the Open variant and fitting an external seal, or requesting sealed variants direct from the supplier.`,
        };
      }
    }

    // Stage 3 — bore only
    if (hasBore) {
      const s3 = pickMixed(DB.filter(b => boreDist(b) <= CFG.stage3BoreTol),
                           keys, CFG.stage3MaxResults, sealing);
      if (s3.length > 0) return {
        results: s3, stage: 3,
        note: `Exact specification not found in the current catalog (${MYCELA.DB.length} bearings). Showing available bearings near ${bore}mm bore. For your full requirements, contact a specialized industrial distributor.`,
      };
    }

    // Stage 4 — type only
    if (hasType) {
      const s4 = pickMixed(DB.filter(b => b.type === type),
                           b => [0].concat(keys(b).slice(1)),  // no bore key: stage 4 never used one
                           CFG.stage4MaxResults, sealing);
      if (s4.length > 0) return {
        results: s4, stage: 4,
        note: `No bearing matched all your specifications. Showing all ${type} bearings in the catalog; check dimensions manually.`,
      };
    }

    // Nothing to relax from: no bore and no type (gibberish, a bare brand,
    // an application word, an unknown designation). Return nothing so the UI
    // shows its empty state. A generic "common bearings" stage used to fill
    // this in with the first deep groove rows in the DB, which served none of
    // these queries; removed 2026-09-27.
    return { results: [], note: null, stage: (hasBore || hasType) ? 0 : null };
  };
})(window.MYCELA = window.MYCELA || {});
