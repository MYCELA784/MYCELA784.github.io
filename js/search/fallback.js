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

  // The one place every stage turns its candidates into a result list. Rows
  // are ranked by dist (closest first, never traded for variety); rows with
  // the same dist form a tier, and inside a tier brands take turns in
  // alphabetical order, each brand keeping its DB order. Without this the
  // DB's brand order (NTN first) filled every slot with one brand.
  function pickMixed(rows, dist, max) {
    const out = [];
    const sorted = rows.slice().sort((a, b) => dist(a) - dist(b));
    for (let i = 0; i < sorted.length && out.length < max; ) {
      const d = dist(sorted[i]);
      const byBrand = {};
      for (; i < sorted.length && dist(sorted[i]) === d; i++) {
        (byBrand[sorted[i].brand] = byBrand[sorted[i].brand] || []).push(sorted[i]);
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
    const boreDist = b => Math.abs(b.bore - bore);
    const bore    = numVal(p.bore);
    const odMin   = p.od ? p.od.min : null;
    const odMax   = p.od ? p.od.max : null;
    const sealing = firstAccept(p.sealing);
    const type    = firstAccept(p.type);
    const hasBore = bore != null;
    const hasODR  = odMin != null || odMax != null;
    const hasSeal = !!sealing;
    const hasType = !!type;

    // Stage 1 — relax OD range, keep bore ± stage1BoreTol and sealing
    if (hasBore && hasODR) {
      const s1 = pickMixed(DB.filter(b => boreDist(b) <= CFG.stage1BoreTol &&
                                          (!hasSeal || b.sealing === sealing)),
                           boreDist, CFG.stage1MaxResults);
      if (s1.length > 0) return {
        results: s1, stage: 1,
        note: `No bearing found with ${dimText('bore', p.bore)} and ${dimText('OD', p.od)}. Showing closest bore matches; OD range constraint relaxed. Consider these and verify OD fits your housing.`,
      };
    }

    // Stage 2 — relax sealing, keep bore ± stage2BoreTol
    if (hasBore && hasSeal) {
      const s2 = pickMixed(DB.filter(b => boreDist(b) <= CFG.stage2BoreTol),
                           boreDist, CFG.stage2MaxResults);
      if (s2.length > 0) {
        const avail = [...new Set(s2.map(b => b.sealing))].join(', ');
        return {
          results: s2, stage: 2,
          note: `No ${sealing.toLowerCase()} bearing found with exact ${bore}mm bore. Available sealings for this size: ${avail}. Consider ordering the Open variant and fitting an external seal, or requesting sealed variants direct from the supplier.`,
        };
      }
    }

    // Stage 3 — bore only
    if (hasBore) {
      const s3 = pickMixed(DB.filter(b => boreDist(b) <= CFG.stage3BoreTol),
                           boreDist, CFG.stage3MaxResults);
      if (s3.length > 0) return {
        results: s3, stage: 3,
        note: `Exact specification not found in the current catalog (${MYCELA.DB.length} bearings). Showing available bearings near ${bore}mm bore. For your full requirements, contact a specialized industrial distributor.`,
      };
    }

    // Stage 4 — type only
    if (hasType) {
      const s4 = pickMixed(DB.filter(b => b.type === type), () => 0, CFG.stage4MaxResults);
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
